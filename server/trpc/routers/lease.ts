import { z } from "zod";
import { logEvent } from "../audit";
import { editorProcedure, orgProcedure, router } from "../init";

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
