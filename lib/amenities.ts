/**
 * Pure geometry helpers for the property-dashboard "Site amenities" overlay.
 * Two outputs today:
 *
 *  - dockMarkerPolygons: small rectangles placed along each bay's frontage
 *    edge, one per dock door, plus larger boxes for drive-ins. Rendered as
 *    a fill layer on top of the building extrusion.
 *  - truckCourtPolygon: a buffer rectangle projected outward from the
 *    building's frontage face, depth feet deep. Rendered as a translucent
 *    fill layer behind the building.
 *
 * Both are computed in WGS84 lng/lat. Feet are converted to degrees using
 * a flat-earth approximation that's accurate to ~0.1% at building scale
 * (a few hundred feet) at any latitude outside the polar circles.
 */

import type { Polygon } from "geojson";
import type { Bay, FrontageSide } from "./demising";
import { footprintBbox, splitFootprintIntoBays } from "./geometry";

const FT_PER_DEG_LAT = 364_000; // 1° latitude ≈ 69 mi ≈ 364,000 ft

export function ftToDegLat(ft: number): number {
  return ft / FT_PER_DEG_LAT;
}

export function ftToDegLng(ft: number, atLatDeg: number): number {
  const cos = Math.cos((atLatDeg * Math.PI) / 180);
  return ft / (FT_PER_DEG_LAT * Math.max(cos, 1e-6));
}

/**
 * Given a building's footprint AABB and the frontage side, returns the
 * outward-facing edge of the AABB as two endpoints in lng/lat order:
 *   [leftCorner, rightCorner] when looking outward from the building.
 *
 * "Outward" for N is north; for S south; for E east; for W west. The
 * left/right convention matches a person standing on the dock face,
 * looking out into the truck court.
 */
export function frontageEdge(
  footprint: Polygon,
  side: FrontageSide,
): { a: [number, number]; b: [number, number]; outward: [number, number] } {
  const { minLng, maxLng, minLat, maxLat } = footprintBbox(footprint);
  switch (side) {
    case "N":
      return {
        a: [minLng, maxLat],
        b: [maxLng, maxLat],
        outward: [0, 1],
      };
    case "S":
      return {
        a: [maxLng, minLat],
        b: [minLng, minLat],
        outward: [0, -1],
      };
    case "E":
      return {
        a: [maxLng, maxLat],
        b: [maxLng, minLat],
        outward: [1, 0],
      };
    case "W":
      return {
        a: [minLng, minLat],
        b: [minLng, maxLat],
        outward: [-1, 0],
      };
  }
}

/**
 * Project a buffer rectangle outward from the frontage face by depthFt feet.
 * Returns null when depthFt is missing or non-positive.
 *
 * The polygon is in the order: front-left, front-right, back-right (out),
 * back-left (out), front-left — so callers can render it as a fill or
 * outline directly.
 */
export function truckCourtPolygon(args: {
  footprint: Polygon;
  side: FrontageSide;
  depthFt: number | null | undefined;
}): Polygon | null {
  if (!args.depthFt || args.depthFt <= 0) return null;
  const { a, b, outward } = frontageEdge(args.footprint, args.side);
  const { minLat, maxLat } = footprintBbox(args.footprint);
  const midLat = (minLat + maxLat) / 2;
  const dLat = ftToDegLat(args.depthFt) * outward[1];
  const dLng = ftToDegLng(args.depthFt, midLat) * outward[0];
  const a2: [number, number] = [a[0] + dLng, a[1] + dLat];
  const b2: [number, number] = [b[0] + dLng, b[1] + dLat];
  return {
    type: "Polygon",
    coordinates: [[a, b, b2, a2, a]],
  };
}

/**
 * Build small marker rectangles for each bay's dock doors and drive-ins.
 * Markers sit on the bay's frontage edge, evenly distributed; dock doors
 * span ~10 ft wide, drive-ins ~16 ft. Both project ~6 ft outward so they
 * read clearly on the 3D map without overlapping the building extrusion.
 */
export function dockMarkerPolygons(args: {
  footprint: Polygon;
  bays: Bay[];
  side: FrontageSide;
}): { docks: Polygon[]; driveIns: Polygon[] } {
  const result = { docks: [] as Polygon[], driveIns: [] as Polygon[] };
  if (args.bays.length === 0) return result;

  const bayPolys = splitFootprintIntoBays(args.footprint, args.bays, args.side);
  const { minLat, maxLat } = footprintBbox(args.footprint);
  const midLat = (minLat + maxLat) / 2;

  const dockWFt = 10;
  const dockDFt = 6;
  const driveInWFt = 16;
  const driveInDFt = 8;

  for (const bay of args.bays) {
    const poly = bayPolys[bay.id];
    if (!poly) continue;
    const { a, b, outward } = frontageEdge(poly, args.side);

    const totalMarkers = bay.dockDoorCount + bay.driveInCount;
    if (totalMarkers === 0) continue;

    // Distribute markers evenly along the frontage edge: positions at
    // i/(N+1) for i in 1..N, so they sit interior to the bay's corners.
    let cursor = 0;
    for (let i = 0; i < totalMarkers; i++) {
      const isDock = cursor < bay.dockDoorCount;
      const wFt = isDock ? dockWFt : driveInWFt;
      const dFt = isDock ? dockDFt : driveInDFt;
      const t = (i + 1) / (totalMarkers + 1);
      const cx = a[0] + (b[0] - a[0]) * t;
      const cy = a[1] + (b[1] - a[1]) * t;

      // Marker basis: along-edge axis × half-width, outward × full depth.
      const edgeDxFt = b[0] - a[0]; // in degrees
      const edgeDyFt = b[1] - a[1];
      const edgeLenDeg = Math.hypot(edgeDxFt, edgeDyFt);
      const ux = edgeDxFt / edgeLenDeg;
      const uy = edgeDyFt / edgeLenDeg;

      const halfWLng = ftToDegLng(wFt / 2, midLat);
      const halfWLat = ftToDegLat(wFt / 2);
      const halfWx = ux * (Math.abs(uy) > Math.abs(ux) ? halfWLng : halfWLng);
      const halfWy = uy * (Math.abs(uy) > Math.abs(ux) ? halfWLat : halfWLat);

      const outwardLng = ftToDegLng(dFt, midLat) * outward[0];
      const outwardLat = ftToDegLat(dFt) * outward[1];

      const p1: [number, number] = [cx - halfWx, cy - halfWy];
      const p2: [number, number] = [cx + halfWx, cy + halfWy];
      const p3: [number, number] = [p2[0] + outwardLng, p2[1] + outwardLat];
      const p4: [number, number] = [p1[0] + outwardLng, p1[1] + outwardLat];

      const marker: Polygon = {
        type: "Polygon",
        coordinates: [[p1, p2, p3, p4, p1]],
      };
      if (isDock) result.docks.push(marker);
      else result.driveIns.push(marker);
      cursor++;
    }
  }
  return result;
}
