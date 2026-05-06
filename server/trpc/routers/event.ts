import { z } from "zod";
import { orgProcedure, router } from "../init";

/**
 * Read access to the audit log added in migration 0008. The router exists
 * so the dashboard's Activity tab (and any future portfolio-level feed)
 * can surface lease/building/project lifecycle events captured by the
 * server-side mutation hooks (server/trpc/audit.ts).
 *
 * v1 returns the most recent N events org-wide. Per-project filtering is a
 * deferred follow-up — it requires resolving entity_id back through the
 * project hierarchy and isn't needed for the headline "what just happened"
 * surface.
 */
export const eventRouter = router({
  recent: orgProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(200).default(50),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 50;
      const { data, error } = await ctx.supabase
        .from("event")
        .select(
          "id, entity_type, entity_id, kind, payload, actor_id, created_at",
        )
        .eq("org_id", ctx.orgId)
        .order("created_at", { ascending: false })
        .limit(limit);
      // Migration 0008 may not be applied; degrade to empty list rather
      // than failing the dashboard.
      if (error) {
        const msg = error.message ?? "";
        const looksMissing =
          error.code === "42P01" || // relation does not exist
          /relation .* does not exist/i.test(msg) ||
          /could not find .* table/i.test(msg) ||
          /schema cache/i.test(msg);
        if (looksMissing) return [];
        throw error;
      }
      return data ?? [];
    }),
});
