import { TRPCError } from "@trpc/server";
import type { Polygon } from "geojson";
import { z } from "zod";
import { codeSchema } from "@/lib/codes";
import { editorProcedure, orgProcedure, router } from "../init";

/** Row shape returned by listForMap — kept stable across the augmented and
 *  fallback selects so TS clients don't need to handle a union. */
type ListForMapRow = {
  id: string;
  code: string;
  name: string | null;
  footprint_geojson: Polygon | null;
  height_ft: number | null;
  truck_court_depth_ft: number | null;
  bay: Array<{
    id: string;
    ordinal: number;
    width_ft: number;
    depth_ft: number;
    dock_door_count: number;
    drive_in_count: number;
    has_yard_access: boolean;
    frontage_side: string;
  }>;
  space: Array<{
    id: string;
    code: string;
    status: string;
    target_sf: number | null;
    space_bay: Array<{ bay_id: string }>;
  }>;
};

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

  /**
   * Buildings with their bays + spaces (with bay assignments) embedded.
   * Used by the portfolio map view to render per-bay extrusions colored by
   * the owning space without needing per-building round trips.
   *
   * Defensive fallback: the select includes columns added by migrations
   * 0005 (space.target_sf) and 0006 (building.truck_court_depth_ft). If
   * either migration hasn't been applied yet, Postgres errors with code
   * 42703 ("column does not exist") and the dashboard would otherwise go
   * blank. We catch that specific case and retry with the pre-migration
   * select, then null-fill the missing fields so the client shape stays
   * consistent.
   */
  listForMap: orgProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }): Promise<ListForMapRow[]> => {
      const augmented = `id, code, name, footprint_geojson, height_ft, truck_court_depth_ft,
         bay (id, ordinal, width_ft, depth_ft, dock_door_count, drive_in_count, has_yard_access, frontage_side),
         space (id, code, status, target_sf, space_bay (bay_id))`;
      const core = `id, code, name, footprint_geojson, height_ft,
         bay (id, ordinal, width_ft, depth_ft, dock_door_count, drive_in_count, has_yard_access, frontage_side),
         space (id, code, status, space_bay (bay_id))`;

      const tryQuery = (select: string) =>
        ctx.supabase
          .from("building")
          .select(select)
          .eq("org_id", ctx.orgId)
          .eq("project_id", input.projectId)
          .order("code");

      const first = await tryQuery(augmented);
      if (!first.error) {
        return (first.data ?? []) as unknown as ListForMapRow[];
      }

      // PGRST204 = PostgREST "column does not exist" surface; 42703 is the
      // raw Postgres SQLSTATE. Treat both as "migration not applied yet"
      // and degrade gracefully rather than failing the whole dashboard.
      const looksLikeMissingColumn =
        first.error.code === "42703" ||
        first.error.code === "PGRST204" ||
        /column .* does not exist/i.test(first.error.message);
      if (!looksLikeMissingColumn) throw first.error;

      const fallback = await tryQuery(core);
      if (fallback.error) throw fallback.error;
      const rows = (fallback.data ?? []) as unknown as Array<
        Omit<ListForMapRow, "truck_court_depth_ft" | "space"> & {
          space: Array<Omit<ListForMapRow["space"][number], "target_sf">>;
        }
      >;
      return rows.map((b) => ({
        ...b,
        truck_court_depth_ft: null,
        space: b.space.map((s) => ({ ...s, target_sf: null })),
      }));
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

  create: editorProcedure
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

  /**
   * Narrowly scoped update for site-amenity fields. Kept separate from a
   * full building.update so callers (e.g. the inline amenities editor on
   * the building dashboard) can't accidentally clobber other fields.
   */
  updateAmenities: editorProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        truckCourtDepthFt: z
          .number()
          .int()
          .nonnegative()
          .max(2000)
          .nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("building")
        .update({ truck_court_depth_ft: input.truckCourtDepthFt })
        .eq("id", input.id)
        .eq("org_id", ctx.orgId);
      if (error) throw error;
      return { ok: true };
    }),

  delete: editorProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // The building's bays, spaces, leases, and demising schemes cascade
      // via foreign keys. Documents are polymorphic so they don't, so we
      // clear their metadata rows explicitly. Storage objects under
      // <org>/building/<id>/... are left in place (cheap to clean up later).
      const { error: docErr } = await ctx.supabase
        .from("document")
        .delete()
        .eq("org_id", ctx.orgId)
        .eq("entity_type", "building")
        .eq("entity_id", input.id);
      if (docErr) throw docErr;

      const { error } = await ctx.supabase
        .from("building")
        .delete()
        .eq("id", input.id)
        .eq("org_id", ctx.orgId);
      if (error) throw error;
      return { ok: true };
    }),
});
