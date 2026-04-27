import { z } from "zod";
import { editorProcedure, orgProcedure, router } from "../init";

const entityType = z.enum(["project", "building", "space", "tenant"]);
const documentKind = z.enum([
  "lease",
  "site_plan",
  "floor_plan",
  "photo",
  "other",
]);

export const documentRouter = router({
  listByEntity: orgProcedure
    .input(
      z.object({
        entityType,
        entityId: z.string().uuid(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("document")
        .select("*")
        .eq("org_id", ctx.orgId)
        .eq("entity_type", input.entityType)
        .eq("entity_id", input.entityId)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    }),

  /**
   * Record a document after the client uploaded the file to Supabase Storage.
   * The file_path is relative to the "documents" bucket, e.g.
   * `ORG_ID/ENTITY_TYPE/ENTITY_ID/FILENAME`.
   */
  create: editorProcedure
    .input(
      z.object({
        entityType,
        entityId: z.string().uuid(),
        kind: documentKind.default("other"),
        filePath: z.string().min(1),
        fileName: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("document")
        .insert({
          org_id: ctx.orgId,
          entity_type: input.entityType,
          entity_id: input.entityId,
          kind: input.kind,
          file_path: input.filePath,
          file_name: input.fileName,
          uploaded_by: ctx.user.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    }),

  /**
   * Produce a short-lived signed URL for previewing or downloading a doc.
   * 5 minute expiry is plenty for a click-through; callers should re-request
   * if they need longer.
   */
  signedUrl: orgProcedure
    .input(z.object({ filePath: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase.storage
        .from("documents")
        .createSignedUrl(input.filePath, 60 * 5);
      if (error) throw error;
      return data;
    }),
});
