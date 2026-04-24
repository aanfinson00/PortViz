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
});
