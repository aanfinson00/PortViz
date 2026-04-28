import type { Polygon } from "geojson";

const EARTH_RADIUS_M = 6_378_137;
const SQM_PER_SQFT = 0.092903;

/**
 * Geodesic area of a GeoJSON Polygon in square meters.
 * Ported from the spherical-excess algorithm used by turf-area, with the
 * outer ring's area added and inner-ring (hole) areas subtracted. Accurate
 * to within 0.1% for footprints up to a few km on a side.
 */
export function polygonAreaSqM(polygon: Polygon): number {
  const rings = polygon.coordinates;
  if (!rings.length) return 0;
  let total = Math.abs(ringArea(rings[0]!));
  for (let i = 1; i < rings.length; i++) {
    total -= Math.abs(ringArea(rings[i]!));
  }
  return total;
}

/** Geodesic area of a GeoJSON Polygon in square feet. */
export function polygonAreaSqFt(polygon: Polygon): number {
  return polygonAreaSqM(polygon) / SQM_PER_SQFT;
}

/** Pixel-space planar area via the shoelace formula. */
export function pixelPolygonArea(
  points: ReadonlyArray<readonly [number, number]>,
): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]!;
    const [x2, y2] = points[(i + 1) % points.length]!;
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

function ringArea(ring: number[][]): number {
  if (ring.length < 4) return 0;
  let total = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const p1 = ring[i]!;
    const p2 = ring[(i + 1) % ring.length]!;
    const lng1 = toRad(p1[0]!);
    const lng2 = toRad(p2[0]!);
    const lat1 = toRad(p1[1]!);
    const lat2 = toRad(p2[1]!);
    total += (lng2 - lng1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  return (total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
