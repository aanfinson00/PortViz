import { NextResponse } from "next/server";
import { logEvent } from "@/server/trpc/audit";
import { parseImportXlsx, type ParsedImport, type RowError } from "@/lib/importParser";
import { createClient } from "@/lib/supabase/server";

/**
 * Bulk import endpoint. Accepts a multipart upload with field "file"
 * containing the XLSX. Auth is required (org-scoped); the user must
 * have editor or owner role in their org.
 *
 * Strategy: parse → validate → if no errors, insert in dependency order
 * (Projects → Buildings → Bays → Spaces → Tenants → Leases) using batch
 * inserts per sheet. If any sheet's insert fails (e.g. unique-constraint
 * violation from a code that already existed in the org before the
 * import), we surface the failure and stop — partial state is left in
 * place. Users can clean up via the UI or re-upload after fixing.
 *
 * For full transactional rollback we'd wrap everything in a Postgres
 * function; deferred for v1 because validation already catches the
 * common failure modes (malformed inputs, intra-file duplicates).
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
      return NextResponse.json({ error: "Missing 'file' field" }, { status: 400 });
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

  let parsed: ParsedImport;
  try {
    parsed = parseImportXlsx(buf);
  } catch (e) {
    return NextResponse.json(
      {
        error: `Failed to parse XLSX: ${e instanceof Error ? e.message : String(e)}`,
      },
      { status: 400 },
    );
  }

  if (parsed.errors.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        stage: "validation",
        errors: parsed.errors,
        summary: summarize(parsed),
      },
      { status: 422 },
    );
  }

  // ---------- Commit ----------
  const projectIdsByCode: Record<string, string> = {};
  const buildingIdsByKey: Record<string, string> = {};
  const spaceIdsByKey: Record<string, string> = {};
  const tenantIdsByCode: Record<string, string> = {};

  // 1. Projects
  if (parsed.projects.length > 0) {
    const { data, error } = await supabase
      .from("project")
      .insert(
        parsed.projects.map((p) => ({
          org_id: orgId,
          code: p.code,
          name: p.name,
          address: p.address,
          lat: p.lat,
          lng: p.lng,
          description: p.description,
        })),
      )
      .select("id, code");
    if (error) {
      return commitFail("Projects", error.message, []);
    }
    for (const row of data ?? []) projectIdsByCode[row.code] = row.id;
  }

  // 2. Buildings
  if (parsed.buildings.length > 0) {
    const rows = parsed.buildings.map((b) => ({
      org_id: orgId,
      project_id: projectIdsByCode[b.projectCode] ?? null,
      code: b.code,
      name: b.name,
      height_ft: b.heightFt,
      num_floors: b.numFloors,
      clear_height_ft: b.clearHeightFt,
      year_built: b.yearBuilt,
      construction_type: b.constructionType,
      office_sf: b.officeSf,
      warehouse_sf: b.warehouseSf,
      truck_court_depth_ft: b.truckCourtDepthFt,
      demising_mode: b.demisingMode,
    }));
    const { data, error } = await supabase
      .from("building")
      .insert(rows)
      .select("id, code, project_id");
    if (error) {
      return commitFail("Buildings", error.message, parsed.buildings);
    }
    const projectCodeById = invert(projectIdsByCode);
    for (const row of data ?? []) {
      const pcode = projectCodeById[row.project_id as string];
      if (pcode) buildingIdsByKey[`${pcode}|${row.code}`] = row.id;
    }
  }

  // 3. Bays
  if (parsed.bays.length > 0) {
    const rows = parsed.bays.map((b) => ({
      org_id: orgId,
      building_id: buildingIdsByKey[`${b.projectCode}|${b.buildingCode}`] ?? null,
      ordinal: b.ordinal,
      width_ft: b.widthFt,
      depth_ft: b.depthFt,
      dock_door_count: b.dockDoorCount,
      drive_in_count: b.driveInCount,
      has_yard_access: b.hasYardAccess,
      frontage_side: b.frontageSide,
    }));
    const { error } = await supabase.from("bay").insert(rows);
    if (error) {
      return commitFail("Bays", error.message, parsed.bays);
    }
  }

  // 4. Spaces
  if (parsed.spaces.length > 0) {
    const rows = parsed.spaces.map((s) => ({
      org_id: orgId,
      building_id: buildingIdsByKey[`${s.projectCode}|${s.buildingCode}`] ?? null,
      code: s.code,
      status: s.status,
      target_sf: s.targetSf,
      is_pinned: s.isPinned,
      office_sf: s.officeSf,
      office_corner: s.officeCorner,
      floor: s.floor,
    }));
    const { data, error } = await supabase
      .from("space")
      .insert(rows)
      .select("id, code, building_id");
    if (error) {
      return commitFail("Spaces", error.message, parsed.spaces);
    }
    const buildingKeyById = invert(buildingIdsByKey);
    for (const row of data ?? []) {
      const bkey = buildingKeyById[row.building_id as string];
      if (bkey) spaceIdsByKey[`${bkey}|${row.code}`] = row.id;
    }
  }

  // 5. Tenants
  if (parsed.tenants.length > 0) {
    const rows = parsed.tenants.map((t) => ({
      org_id: orgId,
      code: t.code,
      name: t.name,
      brand_color: t.brandColor,
    }));
    const { data, error } = await supabase
      .from("tenant")
      .insert(rows)
      .select("id, code");
    if (error) {
      return commitFail("Tenants", error.message, parsed.tenants);
    }
    for (const row of data ?? []) tenantIdsByCode[row.code] = row.id;
  }

  // 6. Leases
  if (parsed.leases.length > 0) {
    const rows = parsed.leases.map((l) => ({
      org_id: orgId,
      space_id:
        spaceIdsByKey[
          `${l.projectCode}|${l.buildingCode}|${l.spaceCode}`
        ] ?? null,
      tenant_id: tenantIdsByCode[l.tenantCode] ?? null,
      start_date: l.startDate,
      end_date: l.endDate,
      commencement_date: l.commencementDate,
      base_rent_psf: l.baseRentPsf,
      escalation_pct: l.escalationPct,
      term_months: l.termMonths,
      ti_allowance_psf: l.tiAllowancePsf,
      free_rent_months: l.freeRentMonths,
      commission_psf: l.commissionPsf,
      security_deposit: l.securityDeposit,
      notes: l.notes,
    }));
    const { error } = await supabase.from("lease").insert(rows);
    if (error) {
      return commitFail("Leases", error.message, parsed.leases);
    }
  }

  await logEvent(supabase, {
    orgId,
    actorId: user.id,
    entityType: "org",
    entityId: orgId,
    kind: "bulk_import",
    payload: {
      summary: summarize(parsed),
    },
  });

  return NextResponse.json(
    { ok: true, stage: "committed", summary: summarize(parsed) },
    { status: 200 },
  );
}

function summarize(p: ParsedImport) {
  return {
    projects: p.projects.length,
    buildings: p.buildings.length,
    bays: p.bays.length,
    spaces: p.spaces.length,
    tenants: p.tenants.length,
    leases: p.leases.length,
  };
}

function invert(o: Record<string, string>): Record<string, string> {
  const r: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) r[v] = k;
  return r;
}

function commitFail(stage: string, message: string, _rows: unknown[]) {
  // Translate the most common Postgres error (unique-constraint violation
  // on code) into a clearer message. Other errors are passed through.
  const isUnique =
    /duplicate key value violates unique constraint/i.test(message) ||
    message.includes("23505");
  const friendly = isUnique
    ? `${stage}: a row's code already exists in your org. Remove it from the file or pick a different code, then re-upload. Detail: ${message}`
    : `${stage}: ${message}`;
  return NextResponse.json(
    {
      ok: false,
      stage: "commit",
      failedSheet: stage,
      errors: [{ sheet: stage, rowIndex: 0, message: friendly } as RowError],
    },
    { status: 500 },
  );
}
