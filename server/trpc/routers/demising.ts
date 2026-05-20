import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { validateDemisingScheme } from "@/lib/demising";
import { scenarioSnapshotSchema } from "@/lib/scenarioSnapshot";
import { logEvent } from "../audit";
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

  // ---------- Scenario / multi-layout planning (added in migration 0015) -----

  /**
   * List every scheme for a building — both historical snapshots
   * (is_scenario=false) and draft scenarios (is_scenario=true). The UI
   * filters client-side to show only one or the other.
   */
  /**
   * Portfolio-wide scheme list — used by the /app/leasing Test Fits
   * section. Returns every scheme (live + scenarios) across the
   * caller's org, scoped via RLS.
   */
  listAllForOrg: orgProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("demising_scheme")
      .select(
        "id, building_id, name, description, is_active, is_scenario, mode, snapshot_data, updated_at",
      )
      .eq("org_id", ctx.orgId);
    if (error) throw error;
    return data ?? [];
  }),

  listSchemes: orgProcedure
    .input(z.object({ buildingId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("demising_scheme")
        .select(
          "id, name, description, is_active, is_scenario, mode, snapshot_data, linked_prospect_ids, created_at, updated_at",
        )
        .eq("org_id", ctx.orgId)
        .eq("building_id", input.buildingId)
        .order("is_active", { ascending: false })
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    }),

  getScheme: orgProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("demising_scheme")
        .select("*, demising_scheme_space (space_id, bay_ids)")
        .eq("id", input.id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();
      if (error) throw error;
      return data;
    }),

  /**
   * Save a scenario (draft layout) without touching the live spaces.
   * Re-uploading the same name updates in place; otherwise creates new.
   * Scenarios are never `is_active` — the partial-unique constraint
   * (only one active per building) and the new check constraint
   * (is_scenario implies not is_active) keep that honest.
   */
  saveScenario: editorProcedure
    .input(
      z.object({
        buildingId: z.string().uuid(),
        /** When set, updates the existing scenario; otherwise inserts. */
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(100),
        description: z.string().max(2000).nullable().optional(),
        snapshotData: scenarioSnapshotSchema,
        linkedProspectIds: z.array(z.string().uuid()).max(50).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Guard: building must belong to caller's org.
      const { data: building, error: buildingErr } = await ctx.supabase
        .from("building")
        .select("id")
        .eq("org_id", ctx.orgId)
        .eq("id", input.buildingId)
        .maybeSingle();
      if (buildingErr) throw buildingErr;
      if (!building) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Building not found in your org.",
        });
      }

      const row = {
        org_id: ctx.orgId,
        building_id: input.buildingId,
        name: input.name,
        description: input.description ?? null,
        is_scenario: true,
        is_active: false,
        mode: input.snapshotData.mode,
        snapshot_data: input.snapshotData,
        linked_prospect_ids: input.linkedProspectIds ?? [],
      };

      if (input.id) {
        const { data, error } = await ctx.supabase
          .from("demising_scheme")
          .update(row)
          .eq("id", input.id)
          .eq("org_id", ctx.orgId)
          .select()
          .single();
        if (error) throw error;
        await logEvent(ctx.supabase, {
          orgId: ctx.orgId,
          actorId: ctx.user.id,
          entityType: "demising_scheme",
          entityId: input.id,
          kind: "scenario_updated",
        });
        return data;
      }

      const { data, error } = await ctx.supabase
        .from("demising_scheme")
        .insert(row)
        .select()
        .single();
      if (error) throw error;
      await logEvent(ctx.supabase, {
        orgId: ctx.orgId,
        actorId: ctx.user.id,
        entityType: "demising_scheme",
        entityId: data.id,
        kind: "scenario_created",
      });
      return data;
    }),

  duplicateScheme: editorProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        newName: z.string().min(1).max(100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data: src, error: srcErr } = await ctx.supabase
        .from("demising_scheme")
        .select(
          "building_id, snapshot_data, mode, description, linked_prospect_ids",
        )
        .eq("id", input.id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();
      if (srcErr) throw srcErr;
      if (!src) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Scheme not found.",
        });
      }
      const { data, error } = await ctx.supabase
        .from("demising_scheme")
        .insert({
          org_id: ctx.orgId,
          building_id: src.building_id,
          name: input.newName,
          description: src.description,
          is_scenario: true,
          is_active: false,
          mode: src.mode,
          snapshot_data: src.snapshot_data,
          linked_prospect_ids: src.linked_prospect_ids ?? [],
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    }),

  /**
   * Promote a scenario to live: write its snapshot to the actual space
   * rows for the building, mark it active, and flip is_scenario to false.
   * Bay-mode scenarios go through the same path as applyCurrent (upsert
   * spaces + rewire space_bay); slider-mode scenarios use the slider
   * bulk-upsert pattern from space.bulkUpsertSliders.
   *
   * NOT wrapped in a Postgres transaction — sibling deactivation and
   * snapshot write are sequential. Partial failure leaves the building
   * in an inconsistent state; user can re-apply to recover.
   */
  applyScheme: editorProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data: scheme, error: schemeErr } = await ctx.supabase
        .from("demising_scheme")
        .select("id, building_id, mode, snapshot_data, name")
        .eq("id", input.id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();
      if (schemeErr) throw schemeErr;
      if (!scheme) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Scheme not found.",
        });
      }
      const snapshot = scenarioSnapshotSchema.parse(scheme.snapshot_data);

      if (snapshot.mode === "sliders") {
        // Mirror space.bulkUpsertSliders: existing ids update, "new:" prefix
        // ids insert, missing ids delete. We do the inserts/updates in
        // order so we can capture the real ids returned for any new rows
        // (so the scheme can be re-saved with stable ids).
        const { data: existing, error: listErr } = await ctx.supabase
          .from("space")
          .select("id, code")
          .eq("org_id", ctx.orgId)
          .eq("building_id", scheme.building_id);
        if (listErr) throw listErr;

        const keepIds = new Set(
          snapshot.spaces.filter((s) => !s.id.startsWith("new:")).map((s) => s.id),
        );
        const toDelete = (existing ?? [])
          .map((r) => r.id)
          .filter((id) => !keepIds.has(id));

        const idMap: Record<string, string> = {};
        for (let i = 0; i < snapshot.spaces.length; i++) {
          const s = snapshot.spaces[i]!;
          if (s.id.startsWith("new:")) {
            const { data, error } = await ctx.supabase
              .from("space")
              .insert({
                org_id: ctx.orgId,
                building_id: scheme.building_id,
                code: s.code,
                status: "vacant",
                position_order: s.positionOrder,
                target_sf: s.targetSf,
                is_pinned: s.isPinned,
                office_sf: s.officeSf,
                office_corner: s.officeCorner,
              })
              .select("id")
              .single();
            if (error) throw error;
            idMap[s.id] = data.id;
          } else {
            const { error } = await ctx.supabase
              .from("space")
              .update({
                code: s.code,
                position_order: s.positionOrder,
                target_sf: s.targetSf,
                is_pinned: s.isPinned,
                office_sf: s.officeSf,
                office_corner: s.officeCorner,
              })
              .eq("id", s.id)
              .eq("org_id", ctx.orgId);
            if (error) throw error;
          }
        }
        if (toDelete.length > 0) {
          const { error } = await ctx.supabase
            .from("space")
            .delete()
            .in("id", toDelete)
            .eq("org_id", ctx.orgId);
          if (error) throw error;
        }

        // Rewrite the snapshot with the real ids so re-applying later
        // doesn't try to re-insert.
        const stableSpaces = snapshot.spaces.map((s) => ({
          ...s,
          id: idMap[s.id] ?? s.id,
        }));
        const stableSnapshot = { mode: "sliders" as const, spaces: stableSpaces };

        // Deactivate siblings, activate this one, flip out of scenario.
        await ctx.supabase
          .from("demising_scheme")
          .update({ is_active: false })
          .eq("building_id", scheme.building_id)
          .eq("org_id", ctx.orgId);
        const { data: activated, error: actErr } = await ctx.supabase
          .from("demising_scheme")
          .update({
            is_active: true,
            is_scenario: false,
            snapshot_data: stableSnapshot,
          })
          .eq("id", scheme.id)
          .eq("org_id", ctx.orgId)
          .select()
          .single();
        if (actErr) throw actErr;
        await logEvent(ctx.supabase, {
          orgId: ctx.orgId,
          actorId: ctx.user.id,
          entityType: "demising_scheme",
          entityId: scheme.id,
          kind: "scenario_applied",
          payload: { mode: "sliders", spaceCount: stableSpaces.length },
        });
        return { ok: true, scheme: activated, idMap };
      }

      // Bays mode — mirror applyCurrent. Validate against the live bays first.
      const { data: bays, error: bayErr } = await ctx.supabase
        .from("bay")
        .select(
          "id, ordinal, width_ft, depth_ft, dock_door_count, drive_in_count, has_yard_access, frontage_side",
        )
        .eq("org_id", ctx.orgId)
        .eq("building_id", scheme.building_id);
      if (bayErr) throw bayErr;

      const bayIdSet = new Set((bays ?? []).map((b) => b.id));
      for (const s of snapshot.spaces) {
        for (const id of s.bayIds) {
          if (!bayIdSet.has(id)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Bay ${id} from the snapshot no longer belongs to this building.`,
            });
          }
        }
      }
      const check = validateDemisingScheme(
        snapshot.spaces.map((s) => ({
          id: s.id,
          code: s.code,
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
          message: `Snapshot is no longer valid against the current bay grid: ${check.errors.join(" ")}`,
        });
      }

      // Upsert one space per snapshot entry, then rewire space_bay.
      const spaceUpserts = snapshot.spaces.map((s) => ({
        org_id: ctx.orgId,
        building_id: scheme.building_id,
        code: s.code,
      }));
      const { data: spaces, error: upsertErr } = await ctx.supabase
        .from("space")
        .upsert(spaceUpserts, { onConflict: "building_id,code" })
        .select("id, code");
      if (upsertErr) throw upsertErr;
      const spaceIdByCode = new Map(
        (spaces ?? []).map((s) => [s.code, s.id]),
      );

      const buildingBayIds = (bays ?? []).map((b) => b.id);
      if (buildingBayIds.length > 0) {
        const { error } = await ctx.supabase
          .from("space_bay")
          .delete()
          .in("bay_id", buildingBayIds);
        if (error) throw error;
      }
      const assignments = snapshot.spaces.flatMap((s) => {
        const sid = spaceIdByCode.get(s.code);
        if (!sid) return [];
        return s.bayIds.map((bid) => ({ space_id: sid, bay_id: bid }));
      });
      if (assignments.length > 0) {
        const { error } = await ctx.supabase
          .from("space_bay")
          .insert(assignments);
        if (error) throw error;
      }

      // Activate, flip out of scenario, rewrite snapshot with real space ids.
      const stableSpaces = snapshot.spaces.map((s) => ({
        ...s,
        id: spaceIdByCode.get(s.code) ?? s.id,
      }));
      const stableSnapshot = { mode: "bays" as const, spaces: stableSpaces };

      await ctx.supabase
        .from("demising_scheme")
        .update({ is_active: false })
        .eq("building_id", scheme.building_id)
        .eq("org_id", ctx.orgId);
      const { data: activated, error: actErr } = await ctx.supabase
        .from("demising_scheme")
        .update({
          is_active: true,
          is_scenario: false,
          snapshot_data: stableSnapshot,
        })
        .eq("id", scheme.id)
        .eq("org_id", ctx.orgId)
        .select()
        .single();
      if (actErr) throw actErr;
      await logEvent(ctx.supabase, {
        orgId: ctx.orgId,
        actorId: ctx.user.id,
        entityType: "demising_scheme",
        entityId: scheme.id,
        kind: "scenario_applied",
        payload: { mode: "bays", spaceCount: stableSpaces.length },
      });
      return { ok: true, scheme: activated };
    }),

  deleteScheme: editorProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data: scheme, error: lookupErr } = await ctx.supabase
        .from("demising_scheme")
        .select("id, is_active")
        .eq("id", input.id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();
      if (lookupErr) throw lookupErr;
      if (!scheme) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Scheme not found.",
        });
      }
      if (scheme.is_active) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Can't delete the active scheme. Activate a different scheme first or apply a scenario.",
        });
      }
      const { error } = await ctx.supabase
        .from("demising_scheme")
        .delete()
        .eq("id", input.id)
        .eq("org_id", ctx.orgId);
      if (error) throw error;
      return { ok: true };
    }),
});
