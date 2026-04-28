/**
 * Slice a building footprint into ordered sub-polygons by area, perpendicular
 * to the frontage axis. Used by the slider demising editor to render each
 * space as a colored slab on the building's footprint, matching the user's
 * typed/derived SF rather than just splitting by linear width.
 *
 * Algorithm:
 *   1. Compute the AABB of the polygon and the total area in ft².
 *   2. For each cumulative area target, binary-search the linear position
 *      along the frontage axis that produces a left-half polygon with the
 *      target area.
 *   3. Sutherland-Hodgman clip the original polygon at each wall position
 *      to produce the sub-polygons.
 *
 * The output respects the input polygon's true area (sum of slice areas
 * equals the input area within float precision), so an L-shaped footprint
 * correctly produces non-rectangular slabs whose areas match the targets.
 */

import type { Polygon } from "geojson";
import { footprintBbox } from "./geometry";
import { polygonAreaSqFt } from "./polygonArea";

export type FrontageAxis = "N" | "S" | "E" | "W";

/**
 * Direction along which the slabs are ordered. For an N or S frontage,
 * walls run East-West (slabs are ordered along longitude); for E or W,
 * walls run North-South (slabs ordered along latitude).
 */
function axisIsHorizontal(side: FrontageAxis): boolean {
  return side === "N" || side === "S";
}

/**
 * "Order direction" — when reading slabs left-to-right (looking outward
 * from the dock face), which axis direction is "increasing"? S frontage:
 * looking south, west is left and east is right (lng increases).
 * N frontage: looking north, east is left and west is right (lng decreases).
 */
function orderIncreasing(side: FrontageAxis): boolean {
  // S: lng increases left→right (standard map orientation)
  // N: looking north, lng decreases left→right (mirror)
  // E: looking east, lat increases left→right
  // W: looking west, lat decreases left→right
  return side === "S" || side === "E";
}

/**
 * Slice a polygon into N sub-polygons whose areas equal the given targets.
 * Targets are absolute SF values; their sum should equal the polygon's
 * total SF (caller is responsible — the slicer just consumes targets in
 * order). Returns the slabs in left→right order along the frontage axis.
 *
 * For the user-facing slider editor we pass the already-resolved sf values
 * from `resolveSpaces`.
 */
export function sliceFootprintByArea(
  polygon: Polygon,
  side: FrontageAxis,
  targetsSqFt: number[],
): Polygon[] {
  if (targetsSqFt.length === 0) return [];
  if (targetsSqFt.length === 1) return [polygon];

  const totalSqFt = polygonAreaSqFt(polygon);
  if (totalSqFt <= 0) return targetsSqFt.map(() => polygon);

  const bbox = footprintBbox(polygon);
  const horizontal = axisIsHorizontal(side);
  const increasing = orderIncreasing(side);

  // Compute cumulative SF targets, in left→right order.
  const cumulative: number[] = [];
  let acc = 0;
  for (const t of targetsSqFt) {
    acc += t;
    cumulative.push(acc);
  }

  // Find each wall: the linear axis-position along the frontage axis at
  // which the left-half polygon's area equals the cumulative target.
  // First and last walls are the polygon's bbox edges; in between we
  // binary-search.
  const walls: number[] = [];
  for (let i = 0; i < cumulative.length - 1; i++) {
    walls.push(
      findAxisPositionForArea(
        polygon,
        bbox,
        horizontal,
        increasing,
        cumulative[i]!,
      ),
    );
  }

  // Build slabs by clipping the polygon at consecutive wall positions.
  const slabs: Polygon[] = [];
  let prev = increasing
    ? horizontal ? bbox.minLng : bbox.minLat
    : horizontal ? bbox.maxLng : bbox.maxLat;
  for (let i = 0; i <= walls.length; i++) {
    const next =
      i < walls.length
        ? walls[i]!
        : increasing
          ? horizontal ? bbox.maxLng : bbox.maxLat
          : horizontal ? bbox.minLng : bbox.minLat;
    const slab = clipPolygonAxisRange(
      polygon,
      horizontal,
      Math.min(prev, next),
      Math.max(prev, next),
    );
    slabs.push(slab);
    prev = next;
  }
  return slabs;
}

/**
 * Binary search for the axis position that produces a "left-half" polygon
 * with the target SF. Resolution: stop when the area is within 0.05% of
 * the target, or after 32 iterations.
 */
function findAxisPositionForArea(
  polygon: Polygon,
  bbox: { minLng: number; maxLng: number; minLat: number; maxLat: number },
  horizontal: boolean,
  increasing: boolean,
  targetSqFt: number,
): number {
  const lo0 = horizontal ? bbox.minLng : bbox.minLat;
  const hi0 = horizontal ? bbox.maxLng : bbox.maxLat;
  let lo = lo0;
  let hi = hi0;
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    const left = clipPolygonAxisRange(
      polygon,
      horizontal,
      increasing ? lo0 : mid,
      increasing ? mid : hi0,
    );
    const area = polygonAreaSqFt(left);
    if (Math.abs(area - targetSqFt) / Math.max(targetSqFt, 1) < 0.0005) {
      return mid;
    }
    if (area < targetSqFt) {
      if (increasing) lo = mid;
      else hi = mid;
    } else {
      if (increasing) hi = mid;
      else lo = mid;
    }
  }
  return (lo + hi) / 2;
}

/**
 * Clip a polygon to an axis-aligned slab [low, high] along the chosen
 * axis (longitude when horizontal, latitude when vertical). Uses a
 * Sutherland–Hodgman clip against two half-planes.
 */
export function clipPolygonAxisRange(
  polygon: Polygon,
  horizontal: boolean,
  low: number,
  high: number,
): Polygon {
  const ring = polygon.coordinates[0] ?? [];
  let clipped: Array<[number, number]> = ring.map(
    ([x, y]) => [x, y] as [number, number],
  );

  // Clip against low boundary (keep coords with axis >= low).
  clipped = clipAgainst(clipped, horizontal, low, true);
  // Clip against high boundary (keep coords with axis <= high).
  clipped = clipAgainst(clipped, horizontal, high, false);

  // Ensure ring closure.
  if (clipped.length > 0) {
    const [fx, fy] = clipped[0]!;
    const last = clipped[clipped.length - 1]!;
    if (last[0] !== fx || last[1] !== fy) clipped.push([fx, fy]);
  }
  return { type: "Polygon", coordinates: [clipped] };
}

function clipAgainst(
  ring: Array<[number, number]>,
  horizontal: boolean,
  bound: number,
  keepAbove: boolean,
): Array<[number, number]> {
  if (ring.length === 0) return ring;
  // Drop the closing duplicate if present; we'll re-add at the end.
  const open =
    ring.length > 1 &&
    ring[0]![0] === ring[ring.length - 1]![0] &&
    ring[0]![1] === ring[ring.length - 1]![1]
      ? ring.slice(0, -1)
      : ring;

  const out: Array<[number, number]> = [];
  for (let i = 0; i < open.length; i++) {
    const a = open[i]!;
    const b = open[(i + 1) % open.length]!;
    const aIn = inside(a, horizontal, bound, keepAbove);
    const bIn = inside(b, horizontal, bound, keepAbove);
    if (aIn) out.push(a);
    if (aIn !== bIn) {
      out.push(intersect(a, b, horizontal, bound));
    }
  }
  return out;
}

function inside(
  p: [number, number],
  horizontal: boolean,
  bound: number,
  keepAbove: boolean,
): boolean {
  const v = horizontal ? p[0] : p[1];
  return keepAbove ? v >= bound : v <= bound;
}

function intersect(
  a: [number, number],
  b: [number, number],
  horizontal: boolean,
  bound: number,
): [number, number] {
  if (horizontal) {
    const t = (bound - a[0]) / (b[0] - a[0]);
    return [bound, a[1] + (b[1] - a[1]) * t];
  }
  const t = (bound - a[1]) / (b[1] - a[1]);
  return [a[0] + (b[0] - a[0]) * t, bound];
}
