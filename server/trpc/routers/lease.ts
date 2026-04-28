import { z } from "zod";
import { editorProcedure, orgProcedure, router } from "../init";

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
      const { data, error } = await ctx.supabase
        .from("space")
        .select(
          `id, code, status, notes,
           lease ( id, start_date, end_date, base_rent_psf, term_months, ti_allowance_psf, free_rent_months,
                   tenant:tenant_id ( id, code, name, brand_color ) )`,
        )
        .eq("org_id", ctx.orgId)
        .eq("building_id", input.buildingId);
      if (error) throw error;
      return data ?? [];
    }),

  create: editorProcedure.input(leaseInput).mutation(async ({ ctx, input }) => {
    const { data, error } = await ctx.supabase
      .from("lease")
      .insert({
        org_id: ctx.orgId,
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
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }),
});
