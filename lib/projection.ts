import type { Polygon } from "geojson";

const FEET_PER_DEGREE_LAT = 364_000; // ~111.32 km / 365 ft per arc-min approximation
const FEET_PER_METER = 3.28084;
const EARTH_RADIUS_FT = 20_902_231; // ≈ 6,378,137 m * 3.28084

/**
 * Project an image-pixel polygon onto WGS84 lng/lat by:
 * 1) translating each pixel point so the polygon's centroid sits at the origin,
 * 2) rotating around that origin by `rotationDeg` (clockwise, north-up),
 * 3) scaling pixels → feet using `feetPerPixel`,
 * 4) converting feet offsets to lng/lat offsets at the anchor latitude
 *    (small-area equirectangular approximation; accurate to <0.1% for
 *    sub-km buildings).
 *
 * The anchor lng/lat is where the polygon's centroid will be placed.
 */
export function projectPolygonPixToLngLat(
  polygonPx: ReadonlyArray<readonly [number, number]>,
  anchorLngLat: [number, number],
  feetPerPixel: number,
  rotationDeg: number,
): Polygon {
  if (polygonPx.length < 3) {
    return { type: "Polygon", coordinates: [[]] };
  }

  const cx = polygonPx.reduce((s, p) => s + p[0], 0) / polygonPx.length;
  const cy = polygonPx.reduce((s, p) => s + p[1], 0) / polygonPx.length;

  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const [anchorLng, anchorLat] = anchorLngLat;
  const cosLat = Math.cos((anchorLat * Math.PI) / 180);
  const feetPerDegLng = FEET_PER_DEGREE_LAT * cosLat;

  const ring: [number, number][] = polygonPx.map(([x, y]) => {
    // Center on origin; flip Y so north is up (canvas Y grows downward).
    const dxPx = x - cx;
    const dyPx = -(y - cy);
    // Rotate clockwise by rotationDeg → standard math convention is
    // counter-clockwise, so we use (cos, sin) then (-sin, cos) for CW.
    const rxPx = dxPx * cos + dyPx * sin;
    const ryPx = -dxPx * sin + dyPx * cos;
    const dxFt = rxPx * feetPerPixel;
    const dyFt = ryPx * feetPerPixel;
    const dLng = dxFt / feetPerDegLng;
    const dLat = dyFt / FEET_PER_DEGREE_LAT;
    return [anchorLng + dLng, anchorLat + dLat];
  });

  // Close the ring.
  if (ring.length > 0 && (ring[0]![0] !== ring.at(-1)![0] || ring[0]![1] !== ring.at(-1)![1])) {
    ring.push([ring[0]![0], ring[0]![1]]);
  }

  return { type: "Polygon", coordinates: [ring] };
}

/** Approximate ground distance in feet between two lng/lat points (haversine). */
export function distanceFt(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_FT * c;
}

export const _internals = { FEET_PER_DEGREE_LAT, FEET_PER_METER };
