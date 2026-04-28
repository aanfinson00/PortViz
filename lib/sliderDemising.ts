/**
 * Pure math for slider-based demising. Given a building's total SF and
 * an ordered list of spaces (each either pinned to an exact SF or a
 * proportional share), resolve the actual SF for each space and the
 * fractional wall positions between them.
 *
 * Walls aren't stored — they're computed from spaces. Dragging a wall
 * is an operation that adjusts the SFs of the two adjacent unpinned
 * spaces and re-derives the wall position.
 *
 * Conventions:
 *   - Spaces are ordered left → right along the building's frontage.
 *     position_order is the ordering field; we don't require contiguous
 *     values, just a consistent sort.
 *   - A space is "pinned" when is_pinned = true, in which case its
 *     target_sf is honored exactly. Other spaces share the leftover SF.
 *   - When the sum of pinned target_sfs exceeds the building total, the
 *     pinned values are honored and unpinned spaces collapse to 0 (the
 *     UI surfaces this as an over-allocated warning).
 */

export interface SliderSpace {
  id: string;
  positionOrder: number;
  isPinned: boolean;
  /** Pinned SF when isPinned, soft target otherwise. Null = no preference. */
  targetSf: number | null;
}

export interface ResolvedSpace extends SliderSpace {
  /** Resolved SF for this space (after pin enforcement + leftover share). */
  sf: number;
  /** Fraction of the building's total SF (sum across all spaces = 1.0). */
  share: number;
  /** Cumulative wall position to the LEFT of this space (0 for first). */
  leftWall: number;
  /** Cumulative wall position to the RIGHT of this space (1 for last). */
  rightWall: number;
}

/**
 * Resolve final SF for each space given the building total. Sum of
 * resolved SFs always equals totalSf (constraint enforced by collapsing
 * unpinned spaces or by trimming pins when over-allocated).
 */
export function resolveSpaces(
  spaces: SliderSpace[],
  totalSf: number,
): ResolvedSpace[] {
  if (totalSf <= 0 || spaces.length === 0) {
    return spaces
      .slice()
      .sort((a, b) => a.positionOrder - b.positionOrder)
      .map((s) => ({
        ...s,
        sf: 0,
        share: 0,
        leftWall: 0,
        rightWall: 0,
      }));
  }

  const sorted = [...spaces].sort(
    (a, b) => a.positionOrder - b.positionOrder,
  );

  // Step 1: tally pinned SFs (clamped to non-negative).
  const pinnedTotal = sorted.reduce(
    (acc, s) =>
      s.isPinned ? acc + Math.max(0, s.targetSf ?? 0) : acc,
    0,
  );

  // Step 2: when pinned sum exceeds total, scale pinned values down
  // proportionally so they fit and unpinned spaces get 0.
  const overAllocated = pinnedTotal > totalSf;
  const pinScale = overAllocated && pinnedTotal > 0 ? totalSf / pinnedTotal : 1;

  // Step 3: compute remaining SF for unpinned spaces.
  const pinnedAfterScale = pinnedTotal * pinScale;
  const remaining = Math.max(0, totalSf - pinnedAfterScale);

  // Step 4: split remaining among unpinned spaces. Soft targets (target_sf
  // set but not pinned) contribute to the proportional weight; spaces with
  // no target share equally as a fallback.
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

  // Step 5: assemble walls cumulatively.
  let cumulative = 0;
  return sorted.map((s) => {
    const sf = sfById.get(s.id) ?? 0;
    const leftWall = totalSf > 0 ? cumulative / totalSf : 0;
    cumulative += sf;
    const rightWall = totalSf > 0 ? cumulative / totalSf : 0;
    return {
      ...s,
      sf,
      share: totalSf > 0 ? sf / totalSf : 0,
      leftWall,
      rightWall,
    };
  });
}

/**
 * Drag a wall by deltaSf — moves the wall between space at index `wallIndex`
 * (0-based, where wallIndex 0 is the wall between spaces[0] and spaces[1])
 * to the right by deltaSf. Negative deltaSf moves it left.
 *
 * Only the two adjacent unpinned spaces' targetSfs are adjusted. If either
 * adjacent space is pinned, the wall doesn't move (returns the input).
 *
 * Returns a new SliderSpace[] with adjusted targetSfs and is_pinned set
 * true for both adjusted spaces (the drag implicitly pins them — if the
 * user wants the wall to slide further, they can drag again; pin status
 * gives them an exact SF readout).
 */
export function dragWall(
  spaces: SliderSpace[],
  wallIndex: number,
  deltaSf: number,
  totalSf: number,
): SliderSpace[] {
  const sorted = [...spaces].sort(
    (a, b) => a.positionOrder - b.positionOrder,
  );
  const left = sorted[wallIndex];
  const right = sorted[wallIndex + 1];
  if (!left || !right) return spaces;
  if (left.isPinned || right.isPinned) return spaces;

  const resolved = resolveSpaces(sorted, totalSf);
  const leftCurrent = resolved[wallIndex]!.sf;
  const rightCurrent = resolved[wallIndex + 1]!.sf;

  // Clamp the drag so neither side goes negative.
  const clampedDelta = Math.max(
    -leftCurrent,
    Math.min(rightCurrent, deltaSf),
  );

  const newLeftSf = leftCurrent + clampedDelta;
  const newRightSf = rightCurrent - clampedDelta;

  return sorted.map((s) => {
    if (s.id === left.id) {
      return { ...s, isPinned: true, targetSf: Math.round(newLeftSf) };
    }
    if (s.id === right.id) {
      return { ...s, isPinned: true, targetSf: Math.round(newRightSf) };
    }
    return s;
  });
}

/**
 * Insert a new space by splitting the largest unpinned space (or the
 * largest space if all are pinned) into two equal halves. Returns the
 * new array; the new space gets a temporary id from `newId`.
 */
export function splitLargest(
  spaces: SliderSpace[],
  totalSf: number,
  newId: string,
): SliderSpace[] {
  if (spaces.length === 0) {
    return [
      {
        id: newId,
        positionOrder: 0,
        isPinned: false,
        targetSf: null,
      },
    ];
  }
  const resolved = resolveSpaces(spaces, totalSf);
  const target = pickLargestSplittable(resolved);
  if (!target) return spaces;

  const sorted = [...spaces].sort(
    (a, b) => a.positionOrder - b.positionOrder,
  );
  const idx = sorted.findIndex((s) => s.id === target.id);
  const half = Math.round(target.sf / 2);

  // Re-number positions: shift everything to the right of the split.
  const newSpace: SliderSpace = {
    id: newId,
    positionOrder: target.positionOrder + 1,
    isPinned: target.isPinned,
    targetSf: target.isPinned ? half : null,
  };

  const out: SliderSpace[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i]!;
    if (i === idx) {
      out.push({
        ...s,
        // Halve the source space's target_sf when pinned; otherwise leave
        // soft target null and let resolveSpaces redistribute.
        targetSf: s.isPinned ? half : s.targetSf,
        positionOrder: s.positionOrder,
      });
      out.push(newSpace);
    } else if (i > idx) {
      out.push({ ...s, positionOrder: s.positionOrder + 1 });
    } else {
      out.push(s);
    }
  }
  return out;
}

function pickLargestSplittable(resolved: ResolvedSpace[]): ResolvedSpace | null {
  const unpinned = resolved.filter((s) => !s.isPinned);
  const pool = unpinned.length > 0 ? unpinned : resolved;
  if (pool.length === 0) return null;
  return pool.reduce((best, s) => (s.sf > best.sf ? s : best));
}

/** Remove a space; its SF flows to its neighbors (or just disappears if
 *  pinned siblings already account for the total). Returns the new array. */
export function removeSpace(
  spaces: SliderSpace[],
  id: string,
): SliderSpace[] {
  const sorted = [...spaces].sort(
    (a, b) => a.positionOrder - b.positionOrder,
  );
  const idx = sorted.findIndex((s) => s.id === id);
  if (idx < 0) return spaces;
  return sorted
    .filter((_, i) => i !== idx)
    .map((s, i) => ({ ...s, positionOrder: i }));
}
