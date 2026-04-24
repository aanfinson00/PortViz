import { z } from "zod";
import { codeSchema } from "@/lib/codes";
import { orgProcedure, router } from "../init";

const tenantInput = z.object({
  code: codeSchema,
  name: z.string().min(1).max(200),
  contactName: z.string().max(200).optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().max(50).optional(),
  brandColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

export const tenantRouter = router({
  list: orgProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("tenant")
      .select("*")
      .eq("org_id", ctx.orgId)
      .order("name");
    if (error) throw error;
    return data ?? [];
  }),

  create: orgProcedure.input(tenantInput).mutation(async ({ ctx, input }) => {
    const { data, error } = await ctx.supabase
      .from("tenant")
      .insert({
        org_id: ctx.orgId,
        code: input.code,
        name: input.name,
        contact_name: input.contactName ?? null,
        contact_email: input.contactEmail ?? null,
        contact_phone: input.contactPhone ?? null,
        brand_color: input.brandColor ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }),
});
