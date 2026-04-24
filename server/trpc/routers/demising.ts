import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { validateDemisingScheme } from "@/lib/demising";
import { editorProcedure, orgProcedure, router } from "../init";

import { codeSchema } from "@/lib/codes";

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

const applyInput = z.object({
  buildingId: z.string().uuid(),
  groups: z
    .array(
      z.object({
        code: codeSchema,
        bayIds: z.array(z.string().uuid()).min(1),
      }),
    )
    .min(1),
  /** Optionally snapshot the resulting layout as a named demising_scheme. */
  snapshotName: z.string().min(1).max(100).optional(),
});

export const demisingRouter = router({
  /**
   * Apply the user's current demising choices to the building: upsert a space
   * per group, clear the bay→space assignments for this building, then
   * re-insert per the new groups. Existing space rows (and any leases on
   * them) are preserved across rewires — we only change which bays belong to
   * which space. Optionally snapshots the result as a named demising_scheme.
   */
  applyCurrent: editorProcedure
    .input(applyInput)
    .mutation(async ({ ctx, input }) => {
      // Validate bays belong to this building under the caller's org before
      // trusting any of the submitted IDs.
      const { data: bays, error: bayErr } = await ctx.supabase
        .from("bay")
        .select(
          "id, ordinal, width_ft, depth_ft, dock_door_count, drive_in_count, has_yard_access, frontage_side",
        )
        .eq("org_id", ctx.orgId)
        .eq("building_id", input.buildingId);
      if (bayErr) throw bayErr;

      const bayIdSet = new Set((bays ?? []).map((b) => b.id));
      for (const g of input.groups) {
        for (const id of g.bayIds) {
          if (!bayIdSet.has(id)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Bay ${id} does not belong to this building.`,
            });
          }
        }
      }

      // Structural validation (contiguity, coverage, unique codes).
      const check = validateDemisingScheme(
        input.groups.map((g, i) => ({
          id: `new-${i}`,
          code: g.code,
          bayIds: g.bayIds,
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
          message: `Invalid demising: ${check.errors.join(" ")}`,
        });
      }

      // Upsert a space row per group keyed on (building_id, code).
      const spaceUpserts = input.groups.map((g) => ({
        org_id: ctx.orgId,
        building_id: input.buildingId,
        code: g.code,
      }));
      const { data: spaces, error: upsertErr } = await ctx.supabase
        .from("space")
        .upsert(spaceUpserts, { onConflict: "building_id,code" })
        .select("id, code");
      if (upsertErr) throw upsertErr;

      const spaceIdByCode = new Map(
        (spaces ?? []).map((s) => [s.code, s.id]),
      );

      // Clear existing bay → space assignments for this building so we can
      // rewire them without violating the unique(bay_id) constraint.
      const buildingBayIds = (bays ?? []).map((b) => b.id);
      if (buildingBayIds.length > 0) {
        const { error: clearErr } = await ctx.supabase
          .from("space_bay")
          .delete()
          .in("bay_id", buildingBayIds);
        if (clearErr) throw clearErr;
      }

      // Insert new space_bay rows reflecting the current groups.
      const newAssignments = input.groups.flatMap((g) => {
        const spaceId = spaceIdByCode.get(g.code);
        if (!spaceId) return [];
        return g.bayIds.map((bayId) => ({ space_id: spaceId, bay_id: bayId }));
      });
      if (newAssignments.length > 0) {
        const { error: insertErr } = await ctx.supabase
          .from("space_bay")
          .insert(newAssignments);
        if (insertErr) throw insertErr;
      }

      // Optional snapshot into demising_scheme so the user can restore this
      // layout later.
      if (input.snapshotName) {
        const { data: scheme, error: schemeErr } = await ctx.supabase
          .from("demising_scheme")
          .insert({
            org_id: ctx.orgId,
            building_id: input.buildingId,
            name: input.snapshotName,
            is_active: true,
          })
          .select()
          .single();
        if (schemeErr) throw schemeErr;

        await ctx.supabase
          .from("demising_scheme")
          .update({ is_active: false })
          .eq("building_id", input.buildingId)
          .eq("org_id", ctx.orgId)
          .neq("id", scheme.id);

        const snapshotRows = input.groups.flatMap((g) => {
          const spaceId = spaceIdByCode.get(g.code);
          if (!spaceId) return [];
          return [
            {
              scheme_id: scheme.id,
              space_id: spaceId,
              bay_ids: g.bayIds,
            },
          ];
        });
        if (snapshotRows.length > 0) {
          await ctx.supabase.from("demising_scheme_space").insert(snapshotRows);
        }
      }

      return { spaceCount: spaceIdByCode.size };
    }),

  /**
   * Save a demising scheme snapshot. The caller supplies the full partition of
   * bays into spaces; we validate contiguity/coverage server-side before
   * persisting, then optionally mark the scheme active.
   */
  save: editorProcedure.input(schemeInput).mutation(async ({ ctx, input }) => {
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
