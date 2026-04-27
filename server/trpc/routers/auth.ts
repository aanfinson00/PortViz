import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { codeSchema } from "@/lib/codes";
import { createServiceClient } from "@/lib/supabase/service";
import { protectedProcedure, publicProcedure, router } from "../init";

export const authRouter = router({
  /**
   * Returns the calling user's session details and whether they already have
   * an org. Used by the layout to decide whether to route to /onboarding or
   * straight into /app.
   */
  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user) return { signedIn: false as const };
    return {
      signedIn: true as const,
      userId: ctx.user.id,
      email: ctx.user.email,
      orgId: ctx.orgId,
    };
  }),

  /**
   * First-run org bootstrap. Creates an org, makes the caller its owner, and
   * writes app_metadata.org_id so subsequent JWTs carry the claim used by
   * orgProcedure. Requires SUPABASE_SERVICE_ROLE_KEY because we need to
   * mutate auth.users.app_metadata.
   */
  bootstrapOrg: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        slug: codeSchema.transform((s) => s.toLowerCase()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const svc = createServiceClient();
      if (!svc) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Onboarding requires SUPABASE_SERVICE_ROLE_KEY on the server.",
        });
      }

      // Reject if user already has an org_id claim — bootstrap is one-shot.
      if (ctx.orgId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You already belong to an organization.",
        });
      }

      const { data: org, error: orgErr } = await svc
        .from("org")
        .insert({ name: input.name, slug: input.slug })
        .select()
        .single();
      if (orgErr) throw orgErr;

      const { error: memberErr } = await svc.from("org_member").insert({
        org_id: org.id,
        user_id: ctx.user.id,
        role: "owner",
      });
      if (memberErr) throw memberErr;

      // Persist org_id on the user's app_metadata so future JWTs include it.
      const { error: metaErr } = await svc.auth.admin.updateUserById(
        ctx.user.id,
        {
          app_metadata: {
            ...(ctx.user.app_metadata ?? {}),
            org_id: org.id,
          },
        },
      );
      if (metaErr) throw metaErr;

      return { orgId: org.id };
    }),
});
