import { z } from "zod";
import { orgProcedure, router } from "../init";

const bayFields = {
  ordinal: z.number().int().min(1),
  widthFt: z.number().positive(),
  depthFt: z.number().positive(),
  dockDoorCount: z.number().int().min(0).default(0),
  driveInCount: z.number().int().min(0).default(0),
  hasYardAccess: z.boolean().default(false),
  frontageSide: z.enum(["N", "S", "E", "W"]).default("S"),
};

const bayInput = z.object({
  buildingId: z.string().uuid(),
  ...bayFields,
});

const bulkInput = z.object({
  buildingId: z.string().uuid(),
  bays: z.array(z.object(bayFields)).min(1).max(200),
});

export const bayRouter = router({
  listByBuilding: orgProcedure
    .input(z.object({ buildingId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("bay")
        .select("*")
        .eq("org_id", ctx.orgId)
        .eq("building_id", input.buildingId)
        .order("ordinal");
      if (error) throw error;
      return data ?? [];
    }),

  create: orgProcedure.input(bayInput).mutation(async ({ ctx, input }) => {
    const { data, error } = await ctx.supabase
      .from("bay")
      .insert({
        org_id: ctx.orgId,
        building_id: input.buildingId,
        ordinal: input.ordinal,
        width_ft: input.widthFt,
        depth_ft: input.depthFt,
        dock_door_count: input.dockDoorCount,
        drive_in_count: input.driveInCount,
        has_yard_access: input.hasYardAccess,
        frontage_side: input.frontageSide,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }),

  /**
   * Replace a building's bays in one shot. Deletes existing bays and inserts
   * the new set. Used by the quick setup flow in the demising editor so users
   * can adjust the bay grid without hand-creating each one. All inserts are
   * scoped to the caller's org; RLS enforces the same.
   */
  replaceAll: orgProcedure
    .input(bulkInput)
    .mutation(async ({ ctx, input }) => {
      const { error: deleteErr } = await ctx.supabase
        .from("bay")
        .delete()
        .eq("org_id", ctx.orgId)
        .eq("building_id", input.buildingId);
      if (deleteErr) throw deleteErr;

      const rows = input.bays.map((b) => ({
        org_id: ctx.orgId,
        building_id: input.buildingId,
        ordinal: b.ordinal,
        width_ft: b.widthFt,
        depth_ft: b.depthFt,
        dock_door_count: b.dockDoorCount,
        drive_in_count: b.driveInCount,
        has_yard_access: b.hasYardAccess,
        frontage_side: b.frontageSide,
      }));

      const { data, error } = await ctx.supabase
        .from("bay")
        .insert(rows)
        .select();
      if (error) throw error;
      return data ?? [];
    }),
});
