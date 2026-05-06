import { z } from "zod";
import { codeSchema } from "@/lib/codes";
import { editorProcedure, orgProcedure, router } from "../init";

const tenantInput = z.object({
  code: codeSchema,
  name: z.string().min(1).max(200),
  contactName: z.string().max(200).optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().max(50).optional(),
  brandColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

export const tenantRouter = router({
  list: orgProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("tenant")
      .select("*")
      .eq("org_id", ctx.orgId)
      .order("name");
    if (error) throw error;
    return data ?? [];
  }),

  /**
   * Tenant detail + every lease this tenant holds across the portfolio.
   * Joined down to project + building + space codes so the detail page
   * can build "ACME-A-101" links to drill back into individual spaces.
   */
  byCode: orgProcedure
    .input(z.object({ code: codeSchema }))
    .query(async ({ ctx, input }) => {
      const { data: tenant, error: tErr } = await ctx.supabase
        .from("tenant")
        .select("*")
        .eq("org_id", ctx.orgId)
        .eq("code", input.code)
        .maybeSingle();
      if (tErr) throw tErr;
      if (!tenant) return null;

      const { data: leases, error: lErr } = await ctx.supabase
        .from("lease")
        .select(
          `id, start_date, end_date, base_rent_psf, escalation_pct, term_months,
           ti_allowance_psf, free_rent_months, commission_psf, security_deposit, notes,
           lease_type, rent_schedule, options, parent_lease_id,
           space:space_id (
             id, code, status, target_sf,
             building:building_id (
               id, code, name,
               project:project_id ( id, code, name )
             )
           )`,
        )
        .eq("org_id", ctx.orgId)
        .eq("tenant_id", tenant.id)
        .order("end_date", { ascending: false });
      // Defensive fallback for environments that haven't applied migration
      // 0014 yet — drop the new columns and retry the bare select.
      let resolvedLeases = leases ?? [];
      if (lErr) {
        const msg = lErr.message ?? "";
        const looksMissing =
          lErr.code === "42703" ||
          lErr.code === "PGRST204" ||
          /column .* does not exist/i.test(msg) ||
          /could not find .* column/i.test(msg) ||
          /schema cache/i.test(msg);
        if (!looksMissing) throw lErr;
        const fallback = await ctx.supabase
          .from("lease")
          .select(
            `id, start_date, end_date, base_rent_psf, term_months, ti_allowance_psf, free_rent_months,
             space:space_id (
               id, code, status, target_sf,
               building:building_id (
                 id, code, name,
                 project:project_id ( id, code, name )
               )
             )`,
          )
          .eq("org_id", ctx.orgId)
          .eq("tenant_id", tenant.id)
          .order("end_date", { ascending: false });
        if (fallback.error) throw fallback.error;
        // Pre-migration shape lacks the 0014 fields; null-fill so the
        // client TS shape is uniform regardless of which path ran.
        resolvedLeases = (fallback.data ?? []).map((row) => ({
          ...row,
          escalation_pct: null,
          commission_psf: null,
          security_deposit: null,
          notes: null,
          lease_type: null,
          rent_schedule: null,
          options: null,
          parent_lease_id: null,
        })) as unknown as typeof resolvedLeases;
      }

      return { tenant, leases: resolvedLeases };
    }),

  create: editorProcedure.input(tenantInput).mutation(async ({ ctx, input }) => {
    const { data, error } = await ctx.supabase
      .from("tenant")
      .insert({
        org_id: ctx.orgId,
        code: input.code,
        name: input.name,
        contact_name: input.contactName ?? null,
        contact_email: input.contactEmail ?? null,
        contact_phone: input.contactPhone ?? null,
        brand_color: input.brandColor ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }),
});
