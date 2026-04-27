import { z } from "zod";
import { orgProcedure, protectedProcedure, router } from "../init";

export const orgRouter = router({
  current: orgProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("org")
      .select("*")
      .eq("id", ctx.orgId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }),

  members: orgProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("org_member")
      .select("user_id, role, created_at")
      .eq("org_id", ctx.orgId)
      .order("created_at");
    if (error) throw error;
    return data ?? [];
  }),

  /**
   * Returns the signed-in user's membership across orgs. Useful for an org
   * switcher later; keeps /app/settings from needing special-case logic when
   * the user hasn't selected an org yet.
   */
  myMemberships: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("org_member")
      .select("role, org:org_id (id, name, slug)")
      .eq("user_id", ctx.user.id);
    if (error) throw error;
    return data ?? [];
  }),

  /**
   * Generate an invite token for a given email + role. Email delivery is
   * left to the integrator; the UI surfaces the generated join URL directly.
   */
  createInvite: orgProcedure
    .input(
      z.object({
        email: z.string().email(),
        role: z.enum(["editor", "viewer"]).default("editor"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("org_invite")
        .insert({
          org_id: ctx.orgId,
          email: input.email,
          role: input.role,
          invited_by: ctx.user.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    }),

  listInvites: orgProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("org_invite")
      .select("id, email, role, created_at, accepted_at")
      .eq("org_id", ctx.orgId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  }),
});
