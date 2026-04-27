import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Context is built per-request. `orgId` is read from the Supabase JWT's custom
 * `app_metadata.org_id` claim, which is set when a user is assigned to an org
 * on first login. Every router that touches tenant-scoped data should read
 * from ctx.orgId rather than trusting client input.
 */
export async function createTRPCContext(opts: { headers: Headers }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const orgId =
    (user?.app_metadata as { org_id?: string } | undefined)?.org_id ?? null;

  return {
    headers: opts.headers,
    supabase,
    user,
    orgId,
  };
}

export type Context = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zod:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const orgProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.orgId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "User is not a member of any organization.",
    });
  }
  return next({ ctx: { ...ctx, orgId: ctx.orgId } });
});

/**
 * Editor-level procedure: rejects viewers. Looks up the caller's role in
 * org_member. Owner and editor may mutate; viewer may only read.
 */
export const editorProcedure = orgProcedure.use(async ({ ctx, next }) => {
  const { data, error } = await ctx.supabase
    .from("org_member")
    .select("role")
    .eq("org_id", ctx.orgId)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.role === "viewer") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Your role does not permit write access.",
    });
  }
  return next({ ctx: { ...ctx, role: data.role as "owner" | "editor" } });
});
