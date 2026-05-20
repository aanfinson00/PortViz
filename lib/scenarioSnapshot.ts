/**
 * Serialize / deserialize a space-planning scenario's layout snapshot.
 *
 * A scenario is a draft demising layout stored on the demising_scheme
 * table (column `snapshot_data`, jsonb). The same JSON envelope handles
 * both demising modes so one tRPC procedure can hydrate either:
 *
 *   - 'sliders' mode: matches the SliderDemisingEditor + bulkUpsertSliders
 *     contract — position_order, target_sf, is_pinned, office_sf, office_corner.
 *   - 'bays' mode: matches the legacy demising_scheme_space contract —
 *     each space owns a contiguous set of bay_ids.
 *
 * Validation is Zod-driven at read/write boundaries; the DB itself is
 * forgiving (jsonb). Callers in tRPC procedures should parse() before
 * persisting and parse() again when hydrating so corrupt snapshots
 * surface as 400s instead of runtime crashes downstream.
 */

import { z } from "zod";

const officeCornerSchema = z.enum([
  "front-left",
  "front-right",
  "rear-left",
  "rear-right",
]);

export const sliderSnapshotSpaceSchema = z.object({
  /**
   * Stable id for the space within this scenario. Persistent ids from
   * existing space rows are reused so promote-to-live can match them up;
   * new spaces use `new:<n>` placeholders, mirroring the editor's convention.
   */
  id: z.string().min(1).max(80),
  code: z
    .string()
    .trim()
    .min(1)
    .max(10)
    .transform((s) => s.toUpperCase()),
  positionOrder: z.number().int().min(0).max(10_000),
  isPinned: z.boolean(),
  targetSf: z.number().int().min(0).max(50_000_000).nullable(),
  officeSf: z.number().int().min(0).max(50_000_000).nullable(),
  officeCorner: officeCornerSchema.nullable(),
});

export const baySnapshotSpaceSchema = z.object({
  id: z.string().min(1).max(80),
  code: z
    .string()
    .trim()
    .min(1)
    .max(10)
    .transform((s) => s.toUpperCase()),
  bayIds: z.array(z.string().uuid()).min(1).max(500),
});

export const sliderSnapshotSchema = z.object({
  mode: z.literal("sliders"),
  spaces: z.array(sliderSnapshotSpaceSchema).max(200),
});

export const baySnapshotSchema = z.object({
  mode: z.literal("bays"),
  spaces: z.array(baySnapshotSpaceSchema).max(200),
});

export const scenarioSnapshotSchema = z.discriminatedUnion("mode", [
  sliderSnapshotSchema,
  baySnapshotSchema,
]);

export type SliderSnapshotSpace = z.infer<typeof sliderSnapshotSpaceSchema>;
export type BaySnapshotSpace = z.infer<typeof baySnapshotSpaceSchema>;
export type ScenarioSnapshot = z.infer<typeof scenarioSnapshotSchema>;

/**
 * Resolve the SF for each space in a snapshot — needed for both the
 * compare view (occupancy / vacant SF rollup) and the test-fit matcher
 * (which prospects fit which space). For sliders, mirrors
 * lib/sliderDemising#resolveSpaces; for bays, sums bay area.
 */
export interface ResolvedSnapshotSpace {
  id: string;
  code: string;
  sf: number;
}

export function resolveSnapshotSpaces(
  snapshot: ScenarioSnapshot,
  ctx: {
    /** Total polygon SF — required for slider mode. */
    totalSf: number;
    /** Bay id → width_ft × depth_ft — required for bay mode. */
    bayAreaById?: Map<string, number>;
  },
): ResolvedSnapshotSpace[] {
  if (snapshot.mode === "sliders") {
    return resolveSliderSnapshot(snapshot.spaces, ctx.totalSf);
  }
  const areaById = ctx.bayAreaById ?? new Map();
  return snapshot.spaces.map((s) => ({
    id: s.id,
    code: s.code,
    sf: s.bayIds.reduce((acc, bid) => acc + (areaById.get(bid) ?? 0), 0),
  }));
}

/**
 * Slim port of lib/sliderDemising#resolveSpaces — kept here so the
 * snapshot helper doesn't pull in the editor's richer EditableSpace
 * shape. Logic identical: pinned spaces honored, leftover distributed
 * by soft target or equal share.
 */
function resolveSliderSnapshot(
  spaces: SliderSnapshotSpace[],
  totalSf: number,
): ResolvedSnapshotSpace[] {
  if (totalSf <= 0 || spaces.length === 0) {
    return spaces
      .slice()
      .sort((a, b) => a.positionOrder - b.positionOrder)
      .map((s) => ({ id: s.id, code: s.code, sf: 0 }));
  }
  const sorted = [...spaces].sort(
    (a, b) => a.positionOrder - b.positionOrder,
  );
  const pinnedTotal = sorted.reduce(
    (acc, s) =>
      s.isPinned ? acc + Math.max(0, s.targetSf ?? 0) : acc,
    0,
  );
  const overAllocated = pinnedTotal > totalSf;
  const pinScale =
    overAllocated && pinnedTotal > 0 ? totalSf / pinnedTotal : 1;
  const remaining = Math.max(0, totalSf - pinnedTotal * pinScale);
  const unpinned = sorted.filter((s) => !s.isPinned);
  const totalSoftTarget = unpinned.reduce(
    (acc, s) => acc + Math.max(0, s.targetSf ?? 0),
    0,
  );
  const useSoftTargets = totalSoftTarget > 0;
  const sfById = new Map<string, number>();
  for (const s of sorted) {
    if (s.isPinned) {
      sfById.set(s.id, Math.max(0, (s.targetSf ?? 0) * pinScale));
    }
  }
  if (unpinned.length > 0) {
    if (useSoftTargets) {
      for (const s of unpinned) {
        const w = Math.max(0, s.targetSf ?? 0);
        sfById.set(s.id, (w / totalSoftTarget) * remaining);
      }
    } else {
      const each = remaining / unpinned.length;
      for (const s of unpinned) sfById.set(s.id, each);
    }
  }
  return sorted.map((s) => ({
    id: s.id,
    code: s.code,
    sf: Math.round(sfById.get(s.id) ?? 0),
  }));
}
