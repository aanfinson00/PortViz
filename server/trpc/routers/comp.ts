import { z } from "zod";
import { logEvent } from "../audit";
import { editorProcedure, orgProcedure, router } from "../init";

const compInput = z.object({
  kind: z.enum(["lease", "sale"]).default("lease"),
  tenantName: z.string().max(200).nullable().optional(),
  buildingName: z.string().max(200).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  city: z.string().max(120).nullable().optional(),
  state: z.string().max(40).nullable().optional(),
  lng: z.number().nullable().optional(),
  lat: z.number().nullable().optional(),
  sf: z.number().int().min(0).nullable().optional(),
  rentPsf: z.number().min(0).nullable().optional(),
  leaseType: z
    .enum(["nnn", "modified_gross", "gross", "absolute_net", "percentage", "other"])
    .nullable()
    .optional(),
  termMonths: z.number().int().min(0).nullable().optional(),
  dealDate: z.string().nullable().optional(),
  source: z.string().max(200).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

function rowToInsert(orgId: string, userId: string, c: z.infer<typeof compInput>) {
  return {
    org_id: orgId,
    created_by: userId,
    kind: c.kind,
    tenant_name: c.tenantName ?? null,
    building_name: c.buildingName ?? null,
    address: c.address ?? null,
    city: c.city ?? null,
    state: c.state ?? null,
    lng: c.lng ?? null,
    lat: c.lat ?? null,
    sf: c.sf ?? null,
    rent_psf: c.rentPsf ?? null,
    lease_type: c.leaseType ?? null,
    term_months: c.termMonths ?? null,
    deal_date: c.dealDate ?? null,
    source: c.source ?? null,
    notes: c.notes ?? null,
  };
}

const MIGRATION_HINT =
  "Comps require migration 0016 in your Supabase. Apply supabase/migrations/0016_comps.sql in the SQL editor, then try again. Original: ";

function isMissingTableErr(err: { code?: string; message?: string }): boolean {
  const msg = err.message ?? "";
  return (
    err.code === "42P01" || // undefined_table
    err.code === "42703" ||
    err.code === "PGRST204" ||
    err.code === "PGRST205" ||
    err.code === "PGRST116" ||
    /relation .* does not exist/i.test(msg) ||
    /could not find .* table/i.test(msg) ||
    /could not find .* column/i.test(msg) ||
    /schema cache/i.test(msg)
  );
}

export const compRouter = router({
  /**
   * Every comp in the caller's org, with the projects each is assigned to.
   * Used by `/app/comps` and (for filtering) the project's Comps tab.
   */
  list: orgProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("comp")
      .select("*, comp_assignment (project_id)")
      .eq("org_id", ctx.orgId)
      .order("deal_date", { ascending: false, nullsFirst: false });
    if (error) {
      if (isMissingTableErr(error)) {
        throw new Error(MIGRATION_HINT + (error.message ?? ""));
      }
      throw error;
    }
    return data ?? [];
  }),

  /**
   * Comps assigned to a specific project. Driven by the property
   * dashboard's Comps tab + the flow-map overlay on the hero.
   */
  listForProject: orgProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("comp_assignment")
        .select("comp:comp_id (*)")
        .eq("org_id", ctx.orgId)
        .eq("project_id", input.projectId);
      if (error) {
        if (isMissingTableErr(error)) {
          throw new Error(MIGRATION_HINT + (error.message ?? ""));
        }
        throw error;
      }
      type Row = { comp: unknown };
      return ((data ?? []) as Row[])
        .map((r) => r.comp)
        .filter((c): c is Record<string, unknown> => Boolean(c));
    }),

  create: editorProcedure.input(compInput).mutation(async ({ ctx, input }) => {
    const { data, error } = await ctx.supabase
      .from("comp")
      .insert(rowToInsert(ctx.orgId, ctx.user.id, input))
      .select()
      .single();
    if (error) {
      if (isMissingTableErr(error)) {
        throw new Error(MIGRATION_HINT + (error.message ?? ""));
      }
      throw error;
    }
    await logEvent(ctx.supabase, {
      orgId: ctx.orgId,
      actorId: ctx.user.id,
      entityType: "comp",
      entityId: data.id,
      kind: "created",
      payload: {
        tenant_name: data.tenant_name,
        building_name: data.building_name,
        sf: data.sf,
        rent_psf: data.rent_psf,
      },
    });
    return data;
  }),

  /**
   * Bulk insert a batch of parsed rows from the xlsx upload. We don't
   * try to dedupe — the user can review the resulting list and delete
   * duplicates manually. Each row gets a fresh id so re-uploads stack
   * rather than overwrite (safer default).
   */
  bulkInsert: editorProcedure
    .input(z.object({ comps: z.array(compInput) }))
    .mutation(async ({ ctx, input }) => {
      if (input.comps.length === 0) return { inserted: 0 };
      const rows = input.comps.map((c) => rowToInsert(ctx.orgId, ctx.user.id, c));
      const { data, error } = await ctx.supabase
        .from("comp")
        .insert(rows)
        .select("id");
      if (error) {
        if (isMissingTableErr(error)) {
          throw new Error(MIGRATION_HINT + (error.message ?? ""));
        }
        throw error;
      }
      // Use the first inserted comp's id as the audit entity so the event
      // table's not-null constraint is satisfied; the count + kind tell
      // the activity feed it was a bulk import.
      const firstId = data?.[0]?.id;
      if (firstId) {
        await logEvent(ctx.supabase, {
          orgId: ctx.orgId,
          actorId: ctx.user.id,
          entityType: "comp",
          entityId: firstId,
          kind: "imported",
          payload: { count: data?.length ?? 0 },
        });
      }
      return { inserted: data?.length ?? 0 };
    }),

  update: editorProcedure
    .input(compInput.extend({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const patch = rowToInsert(ctx.orgId, ctx.user.id, rest);
      // Don't overwrite created_by / org_id on update.
      const { org_id, created_by, ...updateFields } = patch;
      void org_id;
      void created_by;
      const { data, error } = await ctx.supabase
        .from("comp")
        .update({ ...updateFields, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .select()
        .single();
      if (error) {
        if (isMissingTableErr(error)) {
          throw new Error(MIGRATION_HINT + (error.message ?? ""));
        }
        throw error;
      }
      return data;
    }),

  delete: editorProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("comp")
        .delete()
        .eq("id", input.id)
        .eq("org_id", ctx.orgId);
      if (error) throw error;
      await logEvent(ctx.supabase, {
        orgId: ctx.orgId,
        actorId: ctx.user.id,
        entityType: "comp",
        entityId: input.id,
        kind: "deleted",
      });
      return { ok: true };
    }),

  /**
   * Replace the set of projects a comp is assigned to. Simpler than
   * juggling individual assign/unassign mutations from the UI: the
   * picker hands over the full list and we diff server-side.
   */
  setAssignments: editorProcedure
    .input(
      z.object({
        compId: z.string().uuid(),
        projectIds: z.array(z.string().uuid()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data: existing, error: listErr } = await ctx.supabase
        .from("comp_assignment")
        .select("project_id")
        .eq("org_id", ctx.orgId)
        .eq("comp_id", input.compId);
      if (listErr) {
        if (isMissingTableErr(listErr)) {
          throw new Error(MIGRATION_HINT + (listErr.message ?? ""));
        }
        throw listErr;
      }
      const have = new Set((existing ?? []).map((r) => r.project_id as string));
      const want = new Set(input.projectIds);
      const toInsert = [...want].filter((id) => !have.has(id));
      const toDelete = [...have].filter((id) => !want.has(id));

      if (toInsert.length > 0) {
        const { error } = await ctx.supabase.from("comp_assignment").insert(
          toInsert.map((projectId) => ({
            comp_id: input.compId,
            project_id: projectId,
            org_id: ctx.orgId,
          })),
        );
        if (error) throw error;
      }
      if (toDelete.length > 0) {
        const { error } = await ctx.supabase
          .from("comp_assignment")
          .delete()
          .eq("comp_id", input.compId)
          .eq("org_id", ctx.orgId)
          .in("project_id", toDelete);
        if (error) throw error;
      }
      return { ok: true, inserted: toInsert.length, deleted: toDelete.length };
    }),
});
