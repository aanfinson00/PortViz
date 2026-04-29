import { z } from "zod";
import { codeSchema } from "@/lib/codes";
import { logEvent } from "../audit";
import { editorProcedure, orgProcedure, router } from "../init";

const projectInput = z.object({
  code: codeSchema,
  name: z.string().min(1).max(200),
  address: z.string().max(300).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  description: z.string().max(2000).optional(),
});

const projectUpdate = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  address: z.string().max(300).nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
});

/**
 * Site-amenity input. Kept loose (jsonb-shaped) since iteration is
 * frequent and the stored shape is validated permissively at read time
 * via lib/projectAmenities#parseAccessPoints / parseParcelPolygon.
 */
const polygonSchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z
    .array(z.array(z.array(z.number()).min(2).max(3)).min(4))
    .min(1),
});

const accessPointSchema = z.object({
  lng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
  label: z.string().max(80).optional(),
  role: z
    .enum(["main", "truck", "service", "emergency", "other"])
    .optional(),
});

export const projectRouter = router({
  list: orgProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("project")
      .select("*")
      .eq("org_id", ctx.orgId)
      .order("code");
    if (error) throw error;
    return data ?? [];
  }),

  byCode: orgProcedure
    .input(z.object({ code: codeSchema }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("project")
        .select("*")
        .eq("org_id", ctx.orgId)
        .eq("code", input.code)
        .maybeSingle();
      if (error) throw error;
      return data;
    }),

  create: editorProcedure
    .input(projectInput)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("project")
        .insert({
          org_id: ctx.orgId,
          code: input.code,
          name: input.name,
          address: input.address ?? null,
          description: input.description ?? null,
          lat: input.lat ?? null,
          lng: input.lng ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    }),

  update: editorProcedure
    .input(projectUpdate)
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) {
        if (v !== undefined) patch[k] = v;
      }
      const { data, error } = await ctx.supabase
        .from("project")
        .update(patch)
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .select()
        .single();
      if (error) throw error;
      await logEvent(ctx.supabase, {
        orgId: ctx.orgId,
        actorId: ctx.user.id,
        entityType: "project",
        entityId: id,
        kind: "updated",
        payload: { patch },
      });
      return data;
    }),

  /**
   * Narrowly scoped update for project-level site amenities. Kept
   * separate from `update` so callers (e.g. ProjectAmenitiesPanel) can't
   * accidentally clobber name/address/etc. Both fields are nullable —
   * passing null clears them.
   */
  updateAmenities: editorProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        parcelPolygon: polygonSchema.nullable().optional(),
        accessPoints: z.array(accessPointSchema).max(40).nullable().optional(),
        parkingAreas: z
          .array(
            z.object({
              polygon: polygonSchema,
              stalls: z.number().int().min(0).max(100_000).nullable(),
              kind: z.enum(["car", "trailer", "mixed"]).nullable(),
              label: z.string().max(80).nullable(),
            }),
          )
          .max(40)
          .nullable()
          .optional(),
        yardAreas: z
          .array(
            z.object({
              polygon: polygonSchema,
              label: z.string().max(80).nullable(),
            }),
          )
          .max(40)
          .nullable()
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const patch: Record<string, unknown> = {};
      if (input.parcelPolygon !== undefined) {
        patch.parcel_polygon = input.parcelPolygon;
      }
      if (input.accessPoints !== undefined) {
        patch.access_points = input.accessPoints;
      }
      if (input.parkingAreas !== undefined) {
        patch.parking_areas = input.parkingAreas;
      }
      if (input.yardAreas !== undefined) {
        patch.yard_areas = input.yardAreas;
      }
      if (Object.keys(patch).length === 0) return { ok: true };
      const { error } = await ctx.supabase
        .from("project")
        .update(patch)
        .eq("id", input.id)
        .eq("org_id", ctx.orgId);
      if (error) {
        // Translate "column does not exist" / schema-cache misses into a
        // human-actionable message so users see "apply migration X" instead
        // of raw Postgres jargon.
        const msg = error.message ?? "";
        const isMissingColumn =
          error.code === "42703" ||
          error.code === "PGRST204" ||
          error.code === "PGRST116" ||
          /column .* does not exist/i.test(msg) ||
          /could not find .* column/i.test(msg) ||
          /schema cache/i.test(msg);
        if (isMissingColumn) {
          throw new Error(
            "This site-amenity field isn't in your database yet. Apply migrations 0007 (parcel + access points), 0009 (parking + yard) and 0013 (multi-area parking + yard) in the Supabase SQL editor, then try again. Original: " +
              msg,
          );
        }
        throw error;
      }
      await logEvent(ctx.supabase, {
        orgId: ctx.orgId,
        actorId: ctx.user.id,
        entityType: "project",
        entityId: input.id,
        kind: "amenities_updated",
        payload: { patch },
      });
      return { ok: true };
    }),

  delete: editorProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("project")
        .delete()
        .eq("id", input.id)
        .eq("org_id", ctx.orgId);
      if (error) throw error;
      await logEvent(ctx.supabase, {
        orgId: ctx.orgId,
        actorId: ctx.user.id,
        entityType: "project",
        entityId: input.id,
        kind: "deleted",
      });
      return { ok: true };
    }),
});
