import type { Polygon } from "geojson";
import { squareOffPolygon, type Point } from "./squareOff";

/**
 * Right-angle snapping for a GeoJSON Polygon in WGS84 lng/lat. Wraps
 * `squareOffPolygon` (which works in flat 2D coords) with a simple
 * equirectangular projection so a "right angle on the map" actually
 * lands at 90° in physical space, not 90° in raw lng/lat.
 *
 * Behavior:
 *   - Drops the closing-duplicate vertex, runs the snap, re-closes.
 *   - Default tolerance is ±10° (match anything from 80° to 100° to a
 *     true 90°), per the user-facing "right-angle theorem" rule. The
 *     site-plan tracer uses a wider ±15° via the underlying lib's
 *     default — this wrapper is the satellite-quick-draw entry point.
 *   - When the input has fewer than 4 corners (or no outer ring), the
 *     polygon is returned unchanged so callers don't need to guard.
 */
export function squareOffPolygonLngLat(
  polygon: Polygon,
  toleranceDeg = 10,
): Polygon {
  const ring = polygon.coordinates[0];
  if (!ring || ring.length < 5) return polygon;

  // Drop the closing duplicate. squareOffPolygon expects an open ring.
  // Coerce GeoJSON Position (number[]) into the [lng, lat] tuple we use
  // throughout — width has been validated upstream via the buildingInput
  // zod schema (min length 2).
  const open = ring
    .slice(0, -1)
    .map(([lng, lat]) => [lng, lat] as readonly [number, number]);

  // Project to a local equirectangular grid: scale longitude by cos(midLat)
  // so a 90° turn on the map is a 90° turn in our projected space.
  const midLat =
    open.reduce((sum, [, lat]) => sum + lat, 0) / open.length;
  const cosLat = Math.cos((midLat * Math.PI) / 180);
  const projected: Point[] = open.map(([lng, lat]) => [lng * cosLat, lat]);

  const snapped = squareOffPolygon(projected, { toleranceDeg });

  // Un-project and re-close.
  const lngLat: Array<[number, number]> = snapped.map(([x, y]) => [
    x / cosLat,
    y,
  ]);
  lngLat.push([lngLat[0]![0], lngLat[0]![1]]);

  return {
    type: "Polygon",
    coordinates: [lngLat],
  };
}
