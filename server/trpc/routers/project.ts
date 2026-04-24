import { z } from "zod";
import { codeSchema } from "@/lib/codes";
import { orgProcedure, router } from "../init";

const projectInput = z.object({
  code: codeSchema,
  name: z.string().min(1).max(200),
  address: z.string().max(300).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  description: z.string().max(2000).optional(),
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

  create: orgProcedure
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
});
