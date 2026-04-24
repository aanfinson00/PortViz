import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { codeSchema } from "@/lib/codes";
import { orgProcedure, router } from "../init";

/**
 * Zod for a GeoJSON Polygon in WGS84. We don't enforce winding order here;
 * PostGIS/Mapbox both accept either. Rings are [lng, lat, …] arrays per spec.
 */
const polygonSchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z
    .array(
      z
        .array(
          z.array(z.number()).min(2).max(3),
        )
        .min(4),
    )
    .min(1),
});

const buildingInput = z.object({
  projectId: z.string().uuid(),
  code: codeSchema,
  name: z.string().max(200).optional(),
  footprint: polygonSchema.optional(),
  heightFt: z.number().positive().max(2000).optional(),
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
        .select(
          "id, code, name, footprint_geojson, height_ft, num_floors, total_sf, office_sf, warehouse_sf, year_built, clear_height_ft",
        )
        .eq("org_id", ctx.orgId)
        .eq("project_id", input.projectId)
        .order("code");
      if (error) throw error;
      return data ?? [];
    }),

  byCompositeId: orgProcedure
    .input(
      z.object({
        projectCode: codeSchema,
        buildingCode: codeSchema,
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
      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
      }

      const { data: building, error: buildingErr } = await ctx.supabase
        .from("building")
        .select("*")
        .eq("org_id", ctx.orgId)
        .eq("project_id", project.id)
        .eq("code", input.buildingCode)
        .maybeSingle();
      if (buildingErr) throw buildingErr;
      if (!building) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Building not found." });
      }

      return { project, building };
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
          footprint_geojson: input.footprint ?? null,
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
