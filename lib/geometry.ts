import type { Polygon } from "geojson";
import type { Bay, FrontageSide } from "./demising";

/**
 * Compute the axis-aligned bounding box of a polygon's outer ring.
 */
export function footprintBbox(polygon: Polygon): {
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
} {
  const ring = polygon.coordinates[0] ?? [];
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of ring) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return { minLng, maxLng, minLat, maxLat };
}

/**
 * Split a footprint polygon's AABB into one rectangular sub-polygon per bay,
 * proportional to each bay's widthFt, perpendicular to the frontage side.
 *
 * This is deliberately simple: it slices the axis-aligned bounding box rather
 * than the true polygon edges. For the rectangular footprints typical of
 * industrial buildings this matches the real demising lines well enough for
 * visualization. Non-rectangular shapes render as AABB slices, which is
 * acceptable for Phase 4's signature "what-if" UX.
 */
export function splitFootprintIntoBays(
  footprint: Polygon,
  bays: Bay[],
  frontageSide: FrontageSide,
): Record<string, Polygon> {
  if (bays.length === 0) return {};
  const { minLng, maxLng, minLat, maxLat } = footprintBbox(footprint);

  const ordered = [...bays].sort((a, b) => a.ordinal - b.ordinal);
  const totalWidth = ordered.reduce((acc, b) => acc + b.widthFt, 0);
  if (totalWidth <= 0) return {};

  const result: Record<string, Polygon> = {};
  let cumulative = 0;

  for (const bay of ordered) {
    const start = cumulative / totalWidth;
    cumulative += bay.widthFt;
    const end = cumulative / totalWidth;

    // Slice perpendicular to the frontage side. For N/S frontages we slice
    // along longitude; for E/W along latitude.
    let ring: [number, number][];
    if (frontageSide === "N" || frontageSide === "S") {
      const lng0 = minLng + (maxLng - minLng) * start;
      const lng1 = minLng + (maxLng - minLng) * end;
      ring = [
        [lng0, minLat],
        [lng1, minLat],
        [lng1, maxLat],
        [lng0, maxLat],
        [lng0, minLat],
      ];
    } else {
      const lat0 = minLat + (maxLat - minLat) * start;
      const lat1 = minLat + (maxLat - minLat) * end;
      ring = [
        [minLng, lat0],
        [maxLng, lat0],
        [maxLng, lat1],
        [minLng, lat1],
        [minLng, lat0],
      ];
    }

    result[bay.id] = {
      type: "Polygon",
      coordinates: [ring],
    };
  }
  return result;
}
