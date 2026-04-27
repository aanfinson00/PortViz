import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { editorProcedure, orgProcedure, publicProcedure, router } from "../init";

export const shareRouter = router({
  listForProject: orgProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("project_share")
        .select("id, token, created_at, revoked_at")
        .eq("org_id", ctx.orgId)
        .eq("project_id", input.projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    }),

  create: editorProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("project_share")
        .insert({
          org_id: ctx.orgId,
          project_id: input.projectId,
          created_by: ctx.user.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    }),

  revoke: editorProcedure
    .input(z.object({ shareId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("project_share")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", input.shareId)
        .eq("org_id", ctx.orgId)
        .select()
        .single();
      if (error) throw error;
      return data;
    }),

  /**
   * Public read of a shared project. Uses the service-role client so the
   * anonymous caller bypasses RLS — the share token is the access control.
   * Requires SUPABASE_SERVICE_ROLE_KEY to be set on the server.
   */
  byToken: publicProcedure
    .input(z.object({ token: z.string().uuid() }))
    .query(async ({ input }) => {
      const svc = createServiceClient();
      if (!svc) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Public share is not configured. Set SUPABASE_SERVICE_ROLE_KEY.",
        });
      }

      const { data: share, error: shareErr } = await svc
        .from("project_share")
        .select("id, project_id, revoked_at")
        .eq("token", input.token)
        .maybeSingle();
      if (shareErr) throw shareErr;
      if (!share || share.revoked_at) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Share not found." });
      }

      const { data: project, error: projectErr } = await svc
        .from("project")
        .select("id, code, name, address, description, lat, lng")
        .eq("id", share.project_id)
        .maybeSingle();
      if (projectErr) throw projectErr;
      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
      }

      const { data: buildings, error: buildingErr } = await svc
        .from("building")
        .select(
          "id, code, name, footprint_geojson, height_ft, total_sf, office_sf, warehouse_sf",
        )
        .eq("project_id", project.id)
        .order("code");
      if (buildingErr) throw buildingErr;

      return { project, buildings: buildings ?? [] };
    }),
});
