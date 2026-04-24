import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { validateDemisingScheme } from "@/lib/demising";
import { orgProcedure, router } from "../init";

const schemeInput = z.object({
  buildingId: z.string().uuid(),
  name: z.string().min(1).max(100),
  setActive: z.boolean().default(false),
  spaces: z
    .array(
      z.object({
        spaceId: z.string().uuid(),
        bayIds: z.array(z.string().uuid()).min(1),
      }),
    )
    .min(1),
});

export const demisingRouter = router({
  /**
   * Save a demising scheme snapshot. The caller supplies the full partition of
   * bays into spaces; we validate contiguity/coverage server-side before
   * persisting, then optionally mark the scheme active.
   */
  save: orgProcedure.input(schemeInput).mutation(async ({ ctx, input }) => {
    // Load bays + spaces to validate the partition before we write anything.
    const [{ data: bays, error: bayErr }, { data: spaces, error: spaceErr }] =
      await Promise.all([
        ctx.supabase
          .from("bay")
          .select("id, ordinal, width_ft, depth_ft, dock_door_count, drive_in_count, has_yard_access, frontage_side")
          .eq("org_id", ctx.orgId)
          .eq("building_id", input.buildingId),
        ctx.supabase
          .from("space")
          .select("id, code")
          .eq("org_id", ctx.orgId)
          .eq("building_id", input.buildingId),
      ]);
    if (bayErr) throw bayErr;
    if (spaceErr) throw spaceErr;

    const spaceCodeById = new Map((spaces ?? []).map((s) => [s.id, s.code]));
    const check = validateDemisingScheme(
      input.spaces.map((s) => ({
        id: s.spaceId,
        code: spaceCodeById.get(s.spaceId) ?? s.spaceId,
        bayIds: s.bayIds,
      })),
      (bays ?? []).map((b) => ({
        id: b.id,
        ordinal: b.ordinal,
        widthFt: Number(b.width_ft),
        depthFt: Number(b.depth_ft),
        dockDoorCount: b.dock_door_count,
        driveInCount: b.drive_in_count,
        hasYardAccess: b.has_yard_access,
        frontageSide: b.frontage_side,
      })),
    );
    if (!check.ok) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Invalid demising scheme: ${check.errors.join(" ")}`,
      });
    }

    const { data: scheme, error: schemeErr } = await ctx.supabase
      .from("demising_scheme")
      .insert({
        org_id: ctx.orgId,
        building_id: input.buildingId,
        name: input.name,
        is_active: false,
      })
      .select()
      .single();
    if (schemeErr) throw schemeErr;

    const { error: rowsErr } = await ctx.supabase
      .from("demising_scheme_space")
      .insert(
        input.spaces.map((s) => ({
          scheme_id: scheme.id,
          space_id: s.spaceId,
          bay_ids: s.bayIds,
        })),
      );
    if (rowsErr) throw rowsErr;

    if (input.setActive) {
      // Clear existing active flag, then set this one.
      await ctx.supabase
        .from("demising_scheme")
        .update({ is_active: false })
        .eq("building_id", input.buildingId)
        .eq("org_id", ctx.orgId);
      await ctx.supabase
        .from("demising_scheme")
        .update({ is_active: true })
        .eq("id", scheme.id);
    }

    return scheme;
  }),
});
