import { z } from "zod";
import { codeSchema } from "@/lib/codes";
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
      return data;
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
      return { ok: true };
    }),
});
