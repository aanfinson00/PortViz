import { z } from "zod";
import { orgProcedure, router } from "../init";

const bayInput = z.object({
  buildingId: z.string().uuid(),
  ordinal: z.number().int().min(1),
  widthFt: z.number().positive(),
  depthFt: z.number().positive(),
  dockDoorCount: z.number().int().min(0).default(0),
  driveInCount: z.number().int().min(0).default(0),
  hasYardAccess: z.boolean().default(false),
  frontageSide: z.enum(["N", "S", "E", "W"]).default("S"),
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
});
