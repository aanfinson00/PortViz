import { z } from "zod";
import { codeSchema } from "@/lib/codes";
import { orgProcedure, router } from "../init";

const buildingInput = z.object({
  projectId: z.string().uuid(),
  code: codeSchema,
  name: z.string().max(200).optional(),
  heightFt: z.number().positive().optional(),
  numFloors: z.number().int().positive().default(1),
  clearHeightFt: z.number().positive().optional(),
  yearBuilt: z.number().int().min(1800).max(2100).optional(),
  constructionType: z.string().max(100).optional(),
  officeSf: z.number().int().min(0).default(0),
  warehouseSf: z.number().int().min(0).default(0),
});

export const buildingRouter = router({
  listByProject: orgProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("building")
        .select("*")
        .eq("org_id", ctx.orgId)
        .eq("project_id", input.projectId)
        .order("code");
      if (error) throw error;
      return data ?? [];
    }),

  create: orgProcedure
    .input(buildingInput)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("building")
        .insert({
          org_id: ctx.orgId,
          project_id: input.projectId,
          code: input.code,
          name: input.name ?? null,
          height_ft: input.heightFt ?? null,
          num_floors: input.numFloors,
          clear_height_ft: input.clearHeightFt ?? null,
          year_built: input.yearBuilt ?? null,
          construction_type: input.constructionType ?? null,
          office_sf: input.officeSf,
          warehouse_sf: input.warehouseSf,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    }),
});
