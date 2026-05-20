import { NextResponse } from "next/server";
import { logEvent } from "@/server/trpc/audit";
import {
  parseLeasingProspectXlsx,
  type ParsedLeasingProspectImport,
  type RowError,
} from "@/lib/leasingProspectImport";
import { createClient } from "@/lib/supabase/server";

/**
 * Bulk import / refresh leasing prospects from an XLSX file.
 *
 * Strategy:
 *   1. Parse + validate. Errors → 422 with per-row report, no writes.
 *   2. Resolve project_code / building_code / space_code references to UUIDs
 *      by looking up the caller's org (a code that doesn't exist is reported
 *      as a row error, not silently skipped).
 *   3. Split rows into upserts (have a `code`) and inserts (no `code`).
 *   4. Apply via Supabase upsert + insert.
 *
 * Upsert key is (org_id, code) — same as the unique constraint on the
 * leasing_prospect table. Brokers can re-upload their pipeline weekly
 * without dup'ing rows.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const orgId = (user.app_metadata as { org_id?: string } | undefined)?.org_id;
  if (!orgId) {
    return NextResponse.json(
      { error: "User is not a member of any organization" },
      { status: 403 },
    );
  }
  const { data: member, error: memberErr } = await supabase
    .from("org_member")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (memberErr) {
    return NextResponse.json({ error: memberErr.message }, { status: 500 });
  }
  if (!member || member.role === "viewer") {
    return NextResponse.json(
      { error: "Your role does not permit bulk imports" },
      { status: 403 },
    );
  }

  let buf: ArrayBuffer;
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json(
        { error: "Missing 'file' field" },
        { status: 400 },
      );
    }
    buf = await (file as File).arrayBuffer();
  } catch (e) {
    return NextResponse.json(
      {
        error: `Failed to read upload: ${e instanceof Error ? e.message : String(e)}`,
      },
      { status: 400 },
    );
  }

  let parsed: ParsedLeasingProspectImport;
  try {
    parsed = parseLeasingProspectXlsx(buf);
  } catch (e) {
    return NextResponse.json(
      {
        error: `Failed to parse XLSX: ${e instanceof Error ? e.message : String(e)}`,
      },
      { status: 400 },
    );
  }

  // Resolve project/building/space codes → UUIDs for rows that reference them.
  const projectCodes = uniq(
    parsed.prospects.flatMap((p) => (p.projectCode ? [p.projectCode] : [])),
  );
  const projectByCode: Record<string, { id: string }> = {};
  if (projectCodes.length > 0) {
    const { data, error } = await supabase
      .from("project")
      .select("id, code")
      .eq("org_id", orgId)
      .in("code", projectCodes);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    for (const row of data ?? []) projectByCode[row.code] = { id: row.id };
  }

  // Buildings + spaces are scoped by (project, building) and
  // (project, building, space), so we run scoped queries per project.
  const buildingByKey: Record<string, { id: string; project_id: string }> = {};
  const spaceByKey: Record<string, { id: string; building_id: string }> = {};
  for (const pcode of projectCodes) {
    const pid = projectByCode[pcode]?.id;
    if (!pid) continue;
    const bldCodes = uniq(
      parsed.prospects
        .filter((p) => p.projectCode === pcode && p.buildingCode)
        .map((p) => p.buildingCode as string),
    );
    if (bldCodes.length === 0) continue;
    const { data: bldRows, error: bldErr } = await supabase
      .from("building")
      .select("id, code, project_id")
      .eq("org_id", orgId)
      .eq("project_id", pid)
      .in("code", bldCodes);
    if (bldErr) {
      return NextResponse.json({ error: bldErr.message }, { status: 500 });
    }
    const bldIdByCode: Record<string, string> = {};
    for (const b of bldRows ?? []) {
      buildingByKey[`${pcode}|${b.code}`] = { id: b.id, project_id: pid };
      bldIdByCode[b.code] = b.id;
    }

    const spaceCodesByBuilding = new Map<string, string[]>();
    for (const p of parsed.prospects) {
      if (p.projectCode === pcode && p.buildingCode && p.spaceCode) {
        const list = spaceCodesByBuilding.get(p.buildingCode) ?? [];
        if (!list.includes(p.spaceCode)) list.push(p.spaceCode);
        spaceCodesByBuilding.set(p.buildingCode, list);
      }
    }
    for (const [bldCode, spaceCodes] of spaceCodesByBuilding) {
      const bid = bldIdByCode[bldCode];
      if (!bid) continue;
      const { data: spRows, error: spErr } = await supabase
        .from("space")
        .select("id, code, building_id")
        .eq("org_id", orgId)
        .eq("building_id", bid)
        .in("code", spaceCodes);
      if (spErr) {
        return NextResponse.json({ error: spErr.message }, { status: 500 });
      }
      for (const s of spRows ?? []) {
        spaceByKey[`${pcode}|${bldCode}|${s.code}`] = {
          id: s.id,
          building_id: bid,
        };
      }
    }
  }

  // Report unresolved references as row errors.
  const refErrors: RowError[] = [];
  for (const p of parsed.prospects) {
    if (p.projectCode && !projectByCode[p.projectCode]) {
      refErrors.push({
        sheet: "Prospects",
        rowIndex: p.rowIndex,
        message: `project_code '${p.projectCode}' is not a project in your org`,
      });
    }
    if (
      p.projectCode &&
      p.buildingCode &&
      projectByCode[p.projectCode] &&
      !buildingByKey[`${p.projectCode}|${p.buildingCode}`]
    ) {
      refErrors.push({
        sheet: "Prospects",
        rowIndex: p.rowIndex,
        message: `building_code '${p.buildingCode}' is not in project '${p.projectCode}'`,
      });
    }
    if (
      p.projectCode &&
      p.buildingCode &&
      p.spaceCode &&
      buildingByKey[`${p.projectCode}|${p.buildingCode}`] &&
      !spaceByKey[`${p.projectCode}|${p.buildingCode}|${p.spaceCode}`]
    ) {
      refErrors.push({
        sheet: "Prospects",
        rowIndex: p.rowIndex,
        message: `space_code '${p.spaceCode}' is not in building '${p.projectCode}-${p.buildingCode}'`,
      });
    }
  }

  const allErrors = [...parsed.errors, ...refErrors];
  if (allErrors.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        stage: "validation",
        errors: allErrors,
        summary: { prospects: parsed.prospects.length },
      },
      { status: 422 },
    );
  }

  if (parsed.prospects.length === 0) {
    return NextResponse.json(
      {
        ok: true,
        stage: "committed",
        summary: { upserted: 0, inserted: 0 },
      },
      { status: 200 },
    );
  }

  const rows = parsed.prospects.map((p) => {
    const pid = p.projectCode ? projectByCode[p.projectCode]?.id ?? null : null;
    const bid =
      p.projectCode && p.buildingCode
        ? buildingByKey[`${p.projectCode}|${p.buildingCode}`]?.id ?? null
        : null;
    const sid =
      p.projectCode && p.buildingCode && p.spaceCode
        ? spaceByKey[`${p.projectCode}|${p.buildingCode}|${p.spaceCode}`]?.id ??
          null
        : null;
    return {
      org_id: orgId,
      code: p.code,
      name: p.name,
      stage: p.stage,
      source: p.source,
      project_id: pid,
      building_id: bid,
      space_id: sid,
      broker_company: p.brokerCompany,
      broker_name: p.brokerName,
      broker_email: p.brokerEmail,
      broker_phone: p.brokerPhone,
      contact_name: p.contactName,
      contact_email: p.contactEmail,
      contact_phone: p.contactPhone,
      requested_sf: p.requestedSf,
      target_commencement: p.targetCommencement,
      term_months: p.termMonths,
      asking_rent_psf: p.askingRentPsf,
      proposed_rent_psf: p.proposedRentPsf,
      ti_allowance_psf: p.tiAllowancePsf,
      free_rent_months: p.freeRentMonths,
      probability_pct: p.probabilityPct,
      last_activity_date: p.lastActivityDate,
      next_action: p.nextAction,
      next_action_date: p.nextActionDate,
      lost_reason: p.lostReason,
      notes: p.notes,
    };
  });

  // Split: rows with a code → upsert; rows without → insert.
  const withCode = rows.filter((r) => r.code != null);
  const withoutCode = rows.filter((r) => r.code == null);

  let upserted = 0;
  let inserted = 0;

  if (withCode.length > 0) {
    const { data, error } = await supabase
      .from("leasing_prospect")
      .upsert(withCode, { onConflict: "org_id,code" })
      .select("id");
    if (error) {
      return NextResponse.json(
        {
          ok: false,
          stage: "commit",
          failedSheet: "Prospects",
          errors: [
            { sheet: "Prospects", rowIndex: 0, message: error.message },
          ],
        },
        { status: 500 },
      );
    }
    upserted = data?.length ?? 0;
  }

  if (withoutCode.length > 0) {
    const { data, error } = await supabase
      .from("leasing_prospect")
      .insert(withoutCode)
      .select("id");
    if (error) {
      return NextResponse.json(
        {
          ok: false,
          stage: "commit",
          failedSheet: "Prospects",
          errors: [
            { sheet: "Prospects", rowIndex: 0, message: error.message },
          ],
        },
        { status: 500 },
      );
    }
    inserted = data?.length ?? 0;
  }

  // Single "imported" audit row per upload — finer-grained activity is on
  // the individual prospects (we don't backfill per-row activity rows on
  // upserts because we don't know if it was a stage change from the file).
  await logEvent(supabase, {
    orgId,
    actorId: user.id,
    entityType: "org",
    entityId: orgId,
    kind: "leasing_prospect_bulk_import",
    payload: { upserted, inserted, total: parsed.prospects.length },
  });

  return NextResponse.json(
    {
      ok: true,
      stage: "committed",
      summary: {
        upserted,
        inserted,
        total: parsed.prospects.length,
      },
    },
    { status: 200 },
  );
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}
