import { z } from "zod";
import { logEvent } from "../audit";
import { editorProcedure, orgProcedure, router } from "../init";
import { nextSpaceStatusAfterLeaseChange } from "@/lib/spaceStatusPolicy";

type SupabaseClient = Parameters<typeof logEvent>[0];

/**
 * Recompute and persist a space's status from its current lease set.
 * Called after every lease.create / lease.update so the user never has
 * to manually toggle a space from vacant → leased on signing or back
 * again on expiry.
 *
 * Failures here are swallowed — auto-status is convenience plumbing,
 * not a transactional invariant. The lease itself is the source of
 * truth; if a status flip fails (e.g. RLS hiccup), the next mutation
 * picks it up.
 */
async function reconcileSpaceStatus(
  supabase: SupabaseClient,
  orgId: string,
  spaceId: string,
): Promise<void> {
  const { data: space } = await supabase
    .from("space")
    .select("id, status")
    .eq("id", spaceId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!space) return;

  const { data: leases } = await supabase
    .from("lease")
    .select("start_date, end_date")
    .eq("space_id", spaceId)
    .eq("org_id", orgId);

  const next = nextSpaceStatusAfterLeaseChange(
    String(space.status ?? ""),
    (leases ?? []) as Array<{ start_date: string; end_date: string }>,
  );
  if (!next) return;

  await supabase
    .from("space")
    .update({ status: next })
    .eq("id", spaceId)
    .eq("org_id", orgId);
}

const rentScheduleEntry = z.object({
  fromMonth: z.number().int().min(1),
  toMonth: z.number().int().min(1),
  baseRentPsf: z.number().min(0),
  notes: z.string().max(500).nullable().optional(),
});

const leaseOption = z.object({
  kind: z.enum([
    "renewal",
    "expansion",
    "rofr",
    "rofo",
    "termination",
  ]),
  noticeMonths: z.number().int().min(0).max(120).nullable().optional(),
  termMonths: z.number().int().min(0).max(600).nullable().optional(),
  rentBasis: z.string().max(200).nullable().optional(),
  feePsf: z.number().min(0).nullable().optional(),
  effectiveYear: z.number().int().min(0).max(99).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

const leaseTypeEnum = z.enum([
  "nnn",
  "modified_gross",
  "gross",
  "absolute_net",
  "percentage",
  "other",
]);

const leaseInput = z.object({
  spaceId: z.string().uuid(),
  tenantId: z.string().uuid(),
  startDate: z.string(), // ISO date
  endDate: z.string(),
  commencementDate: z.string().optional(),
  baseRentPsf: z.number().min(0).optional(),
  escalationPct: z.number().min(0).optional(),
  termMonths: z.number().int().min(0).optional(),
  tiAllowancePsf: z.number().min(0).optional(),
  freeRentMonths: z.number().min(0).optional(),
  commissionPsf: z.number().min(0).optional(),
  securityDeposit: z.number().min(0).optional(),
  notes: z.string().max(2000).optional(),
  // Tier 1 lease economics (migration 0014)
  leaseType: leaseTypeEnum.nullable().optional(),
  rentSchedule: z.array(rentScheduleEntry).max(60).nullable().optional(),
  options: z.array(leaseOption).max(20).nullable().optional(),
  parentLeaseId: z.string().uuid().nullable().optional(),
});

const leaseUpdateInput = leaseInput.partial().extend({
  id: z.string().uuid(),
});

export const leaseRouter = router({
  listBySpace: orgProcedure
    .input(z.object({ spaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("lease")
        .select("*, tenant:tenant_id (id, code, name, brand_color)")
        .eq("org_id", ctx.orgId)
        .eq("space_id", input.spaceId)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    }),

  /**
   * Active leases at a project: every lease whose date range covers today,
   * joined to its space (with bay assignments) and tenant. Used by the
   * property dashboard to compute occupancy and to render the rent roll +
   * expirations tabs in one round trip.
   */
  activeByProject: orgProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const today = new Date().toISOString().slice(0, 10);
      const { data: buildings, error: buildingsErr } = await ctx.supabase
        .from("building")
        .select("id")
        .eq("org_id", ctx.orgId)
        .eq("project_id", input.projectId);
      if (buildingsErr) throw buildingsErr;
      const buildingIds = (buildings ?? []).map((b) => b.id);
      if (buildingIds.length === 0) return [];

      const { data: spaces, error: spacesErr } = await ctx.supabase
        .from("space")
        .select("id")
        .eq("org_id", ctx.orgId)
        .in("building_id", buildingIds);
      if (spacesErr) throw spacesErr;
      const spaceIds = (spaces ?? []).map((s) => s.id);
      if (spaceIds.length === 0) return [];

      const { data, error } = await ctx.supabase
        .from("lease")
        .select(
          `id, space_id, start_date, end_date, base_rent_psf, term_months, ti_allowance_psf, free_rent_months,
           tenant:tenant_id (id, code, name, brand_color)`,
        )
        .eq("org_id", ctx.orgId)
        .in("space_id", spaceIds)
        .lte("start_date", today)
        .gte("end_date", today)
        .order("end_date");
      if (error) throw error;
      return data ?? [];
    }),


  rentRoll: orgProcedure
    .input(z.object({ buildingId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Augmented select includes the Tier 1 economics fields (migration
      // 0014). Falls back to the pre-migration shape if those columns
      // don't exist yet so the rent roll keeps loading on stale DBs.
      const augmented = `id, code, status, notes,
         lease ( id, start_date, end_date, base_rent_psf, escalation_pct, term_months, ti_allowance_psf, free_rent_months,
                 lease_type, rent_schedule, options, parent_lease_id,
                 tenant:tenant_id ( id, code, name, brand_color ) )`;
      const core = `id, code, status, notes,
         lease ( id, start_date, end_date, base_rent_psf, term_months, ti_allowance_psf, free_rent_months,
                 tenant:tenant_id ( id, code, name, brand_color ) )`;
      const tryQuery = (select: string) =>
        ctx.supabase
          .from("space")
          .select(select)
          .eq("org_id", ctx.orgId)
          .eq("building_id", input.buildingId);
      const first = await tryQuery(augmented);
      if (!first.error) return first.data ?? [];
      const msg = first.error.message ?? "";
      const looksLikeMissingColumn =
        first.error.code === "42703" ||
        first.error.code === "PGRST204" ||
        first.error.code === "PGRST116" ||
        /column .* does not exist/i.test(msg) ||
        /could not find .* column/i.test(msg) ||
        /schema cache/i.test(msg);
      if (!looksLikeMissingColumn) throw first.error;
      const fallback = await tryQuery(core);
      if (fallback.error) throw fallback.error;
      return fallback.data ?? [];
    }),

  /**
   * Full lease detail: the lease itself, the tenant, the space + building
   * + project for breadcrumbs and links, the parent lease (when this is a
   * renewal), and any child leases (renewals that point at this one).
   * Driven by /app/leases/[id]/page.tsx.
   */
  byId: orgProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const augmented = `id, start_date, end_date, commencement_date, base_rent_psf, escalation_pct, term_months,
         ti_allowance_psf, free_rent_months, commission_psf, security_deposit, notes,
         lease_type, rent_schedule, options, parent_lease_id,
         tenant:tenant_id ( id, code, name, brand_color, contact_name, contact_email, contact_phone ),
         space:space_id (
           id, code, status, target_sf,
           building:building_id (
             id, code, name,
             project:project_id ( id, code, name )
           )
         )`;
      const core = `id, start_date, end_date, commencement_date, base_rent_psf, escalation_pct, term_months,
         ti_allowance_psf, free_rent_months, commission_psf, security_deposit, notes,
         tenant:tenant_id ( id, code, name, brand_color, contact_name, contact_email, contact_phone ),
         space:space_id (
           id, code, status, target_sf,
           building:building_id (
             id, code, name,
             project:project_id ( id, code, name )
           )
         )`;
      const tryQuery = (select: string) =>
        ctx.supabase
          .from("lease")
          .select(select)
          .eq("org_id", ctx.orgId)
          .eq("id", input.id)
          .maybeSingle();

      const first = await tryQuery(augmented);
      let lease: Record<string, unknown> | null;
      if (!first.error) {
        lease = (first.data ?? null) as unknown as Record<string, unknown> | null;
      } else {
        const msg = first.error.message ?? "";
        const looksMissing =
          first.error.code === "42703" ||
          first.error.code === "PGRST204" ||
          /column .* does not exist/i.test(msg) ||
          /could not find .* column/i.test(msg) ||
          /schema cache/i.test(msg);
        if (!looksMissing) throw first.error;
        const fallback = await tryQuery(core);
        if (fallback.error) throw fallback.error;
        const data = (fallback.data ?? null) as unknown as Record<
          string,
          unknown
        > | null;
        lease = data
          ? {
              ...data,
              lease_type: null,
              rent_schedule: null,
              options: null,
              parent_lease_id: null,
            }
          : null;
      }
      if (!lease) return null;

      // Children: leases that have THIS one as parent. Cheap query; if 0014
      // isn't applied the parent_lease_id column doesn't exist and we
      // simply skip the lookup.
      let children: Array<{
        id: string;
        start_date: string;
        end_date: string;
      }> = [];
      const childrenRes = await ctx.supabase
        .from("lease")
        .select("id, start_date, end_date")
        .eq("org_id", ctx.orgId)
        .eq("parent_lease_id", input.id)
        .order("start_date");
      if (!childrenRes.error) {
        children = childrenRes.data ?? [];
      } else {
        // Likely missing column; ignore.
      }

      return { lease, children };
    }),

  create: editorProcedure.input(leaseInput).mutation(async ({ ctx, input }) => {
    const row = leaseInsertRow(ctx.orgId, input);
    const { data, error } = await ctx.supabase
      .from("lease")
      .insert(row)
      .select()
      .single();
    if (error) throw translateMissingMigration(error);
    await logEvent(ctx.supabase, {
      orgId: ctx.orgId,
      actorId: ctx.user.id,
      entityType: "lease",
      entityId: data.id,
      kind: "created",
      payload: { snapshot: data },
    });
    await reconcileSpaceStatus(ctx.supabase, ctx.orgId, input.spaceId);
    return data;
  }),

  /**
   * Update a lease in place. Used by the lease form's edit flow once a
   * lease has been created — lets users tweak rent schedule, options,
   * etc. without deleting + recreating the row.
   */
  update: editorProcedure
    .input(leaseUpdateInput)
    .mutation(async ({ ctx, input }) => {
      const patch = leasePatch(input);
      if (Object.keys(patch).length === 0) return { ok: true };

      // Capture the old space_id before the update so we can reconcile
      // both the source and destination spaces if the lease is being
      // moved between spaces (rare but possible via the form).
      const { data: existing } = await ctx.supabase
        .from("lease")
        .select("space_id")
        .eq("id", input.id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

      const { data, error } = await ctx.supabase
        .from("lease")
        .update(patch)
        .eq("id", input.id)
        .eq("org_id", ctx.orgId)
        .select()
        .single();
      if (error) throw translateMissingMigration(error);
      await logEvent(ctx.supabase, {
        orgId: ctx.orgId,
        actorId: ctx.user.id,
        entityType: "lease",
        entityId: input.id,
        kind: "updated",
        payload: { patch },
      });

      const affectedSpaces = new Set<string>();
      if (existing?.space_id) affectedSpaces.add(String(existing.space_id));
      if (data?.space_id) affectedSpaces.add(String(data.space_id));
      for (const sid of affectedSpaces) {
        await reconcileSpaceStatus(ctx.supabase, ctx.orgId, sid);
      }

      return data;
    }),
});

type LeaseCreate = z.infer<typeof leaseInput>;
type LeaseUpdate = z.infer<typeof leaseUpdateInput>;

function leaseInsertRow(orgId: string, input: LeaseCreate) {
  return {
    org_id: orgId,
    space_id: input.spaceId,
    tenant_id: input.tenantId,
    start_date: input.startDate,
    end_date: input.endDate,
    commencement_date: input.commencementDate ?? null,
    base_rent_psf: input.baseRentPsf ?? null,
    escalation_pct: input.escalationPct ?? null,
    term_months: input.termMonths ?? null,
    ti_allowance_psf: input.tiAllowancePsf ?? null,
    free_rent_months: input.freeRentMonths ?? null,
    commission_psf: input.commissionPsf ?? null,
    security_deposit: input.securityDeposit ?? null,
    notes: input.notes ?? null,
    lease_type: input.leaseType ?? null,
    rent_schedule: input.rentSchedule ?? null,
    options: input.options ?? null,
    parent_lease_id: input.parentLeaseId ?? null,
  };
}

function leasePatch(input: LeaseUpdate) {
  const patch: Record<string, unknown> = {};
  const map: Array<[keyof LeaseUpdate, string]> = [
    ["startDate", "start_date"],
    ["endDate", "end_date"],
    ["commencementDate", "commencement_date"],
    ["baseRentPsf", "base_rent_psf"],
    ["escalationPct", "escalation_pct"],
    ["termMonths", "term_months"],
    ["tiAllowancePsf", "ti_allowance_psf"],
    ["freeRentMonths", "free_rent_months"],
    ["commissionPsf", "commission_psf"],
    ["securityDeposit", "security_deposit"],
    ["notes", "notes"],
    ["tenantId", "tenant_id"],
    ["spaceId", "space_id"],
    ["leaseType", "lease_type"],
    ["rentSchedule", "rent_schedule"],
    ["options", "options"],
    ["parentLeaseId", "parent_lease_id"],
  ];
  for (const [key, col] of map) {
    if (input[key] !== undefined) {
      patch[col] = input[key] ?? null;
    }
  }
  return patch;
}

function translateMissingMigration(error: { message?: string; code?: string }) {
  const msg = error.message ?? "";
  const isMissingColumn =
    error.code === "42703" ||
    error.code === "PGRST204" ||
    error.code === "PGRST116" ||
    /column .* does not exist/i.test(msg) ||
    /could not find .* column/i.test(msg) ||
    /schema cache/i.test(msg);
  if (isMissingColumn) {
    return new Error(
      "Lease economics fields aren't in your database yet. Apply migration 0014 in the Supabase SQL editor, then try again. Original: " +
        msg,
    );
  }
  return error as Error;
}
