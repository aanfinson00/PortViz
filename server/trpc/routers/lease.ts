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
   * Rent-roll query: one row per space in a building, with its current (or
   * most recent) lease and tenant joined in. Returned unordered by PostgREST;
   * the UI sorts by space code.
   */
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
