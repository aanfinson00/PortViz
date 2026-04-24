import { z } from "zod";
import { codeSchema } from "@/lib/codes";
import { orgProcedure, router } from "../init";

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
        .select("*")
        .eq("org_id", ctx.orgId)
        .eq("building_id", input.buildingId)
        .order("code");
      if (error) throw error;
      return data ?? [];
    }),

  create: orgProcedure.input(spaceInput).mutation(async ({ ctx, input }) => {
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
