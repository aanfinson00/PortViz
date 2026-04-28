import { z } from "zod";
import { codeSchema } from "@/lib/codes";
import { editorProcedure, orgProcedure, router } from "../init";

const spaceInput = z.object({
  buildingId: z.string().uuid(),
  code: codeSchema,
  status: z.enum(["vacant", "available", "pending", "leased"]).default("vacant"),
  notes: z.string().max(2000).optional(),
});

export const spaceRouter = router({
  listByBuilding: orgProcedure
    .input(z.object({ buildingId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("space")
        .select("*, space_bay (bay_id)")
        .eq("org_id", ctx.orgId)
        .eq("building_id", input.buildingId)
        .order("code");
      if (error) throw error;
      return data ?? [];
    }),

  byCompositeId: orgProcedure
    .input(
      z.object({
        projectCode: codeSchema,
        buildingCode: codeSchema,
        spaceCode: codeSchema,
      }),
    )
    .query(async ({ ctx, input }) => {
      const { data: project, error: projectErr } = await ctx.supabase
        .from("project")
        .select("id, code, name")
        .eq("org_id", ctx.orgId)
        .eq("code", input.projectCode)
        .maybeSingle();
      if (projectErr) throw projectErr;
      if (!project) return null;

      const { data: building, error: buildingErr } = await ctx.supabase
        .from("building")
        .select("id, code, name")
        .eq("org_id", ctx.orgId)
        .eq("project_id", project.id)
        .eq("code", input.buildingCode)
        .maybeSingle();
      if (buildingErr) throw buildingErr;
      if (!building) return null;

      const { data: space, error: spaceErr } = await ctx.supabase
        .from("space")
        .select("*, space_bay (bay_id)")
        .eq("org_id", ctx.orgId)
        .eq("building_id", building.id)
        .eq("code", input.spaceCode)
        .maybeSingle();
      if (spaceErr) throw spaceErr;
      if (!space) return null;

      return { project, building, space };
    }),

  update: editorProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        code: codeSchema.optional(),
        status: z
          .enum(["vacant", "available", "pending", "leased"])
          .optional(),
        target_sf: z.number().int().min(0).nullable().optional(),
        notes: z.string().max(2000).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) {
        if (v !== undefined) patch[k] = v;
      }
      const { data, error } = await ctx.supabase
        .from("space")
        .update(patch)
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .select()
        .single();
      if (error) throw error;
      return data;
    }),

  create: editorProcedure.input(spaceInput).mutation(async ({ ctx, input }) => {
    const { data, error } = await ctx.supabase
      .from("space")
      .insert({
        org_id: ctx.orgId,
        building_id: input.buildingId,
        code: input.code,
        status: input.status,
        notes: input.notes ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }),

  /**
   * Bulk upsert for slider-based demising. The editor sends the full set
   * of spaces for a building on every save: existing ids are updated,
   * spaces with id starting with "new:" are inserted (the editor coins
   * temp ids client-side), and any space currently in the DB but missing
   * from the payload is deleted.
   *
   * Single transaction in spirit (sequential supabase calls; failures
   * propagate). We don't use the audit hook on these — they're high-
   * frequency edits and the per-mutation event would be noisy.
   */
  bulkUpsertSliders: editorProcedure
    .input(
      z.object({
        buildingId: z.string().uuid(),
        spaces: z.array(
          z.object({
            id: z.string(),
            code: codeSchema,
            positionOrder: z.number().int().min(0),
            targetSf: z.number().int().min(0).nullable(),
            isPinned: z.boolean(),
            officeSf: z.number().int().min(0).nullable(),
            officeCorner: z
              .enum(["front-left", "front-right", "rear-left", "rear-right"])
              .nullable(),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Existing rows for this building.
      const { data: existing, error: listErr } = await ctx.supabase
        .from("space")
        .select("id, code")
        .eq("org_id", ctx.orgId)
        .eq("building_id", input.buildingId);
      if (listErr) throw listErr;
      const keepIds = new Set(
        input.spaces.filter((s) => !s.id.startsWith("new:")).map((s) => s.id),
      );
      const toDelete = (existing ?? [])
        .map((r) => r.id)
        .filter((id) => !keepIds.has(id));

      // Apply updates first, then inserts, then deletes — mirrors the
      // mental model "tweak, add, prune".
      const idMap: Record<string, string> = {};
      for (const s of input.spaces) {
        if (s.id.startsWith("new:")) {
          const { data, error } = await ctx.supabase
            .from("space")
            .insert({
              org_id: ctx.orgId,
              building_id: input.buildingId,
              code: s.code,
              status: "vacant",
              position_order: s.positionOrder,
              target_sf: s.targetSf,
              is_pinned: s.isPinned,
              office_sf: s.officeSf,
              office_corner: s.officeCorner,
            })
            .select("id")
            .single();
          if (error) throw error;
          idMap[s.id] = data.id;
        } else {
          const { error } = await ctx.supabase
            .from("space")
            .update({
              code: s.code,
              position_order: s.positionOrder,
              target_sf: s.targetSf,
              is_pinned: s.isPinned,
              office_sf: s.officeSf,
              office_corner: s.officeCorner,
            })
            .eq("id", s.id)
            .eq("org_id", ctx.orgId);
          if (error) throw error;
        }
      }

      if (toDelete.length > 0) {
        const { error } = await ctx.supabase
          .from("space")
          .delete()
          .in("id", toDelete)
          .eq("org_id", ctx.orgId);
        if (error) throw error;
      }

      return { ok: true, idMap };
    }),
});
