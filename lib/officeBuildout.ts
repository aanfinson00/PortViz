/**
 * Office buildout helpers. For each demised space (a "slab" sliced from the
 * building footprint), the office sits as a corner box anchored to one of
 * four corners (front-left / front-right / rear-left / rear-right relative
 * to the building's frontage). Sized from a target SF; the dimensions
 * default to the squarest rectangle that fits the SF inside the slab.
 *
 * Both regions are computed by axis-clipping the slab polygon, which means
 * non-rectangular slabs (e.g. an L-shape from an irregular building) still
 * produce correct polygons whose areas reflect the irregularity.
 *
 * The earlier strip-style splitOfficeWarehouse (migration 0011) is kept as
 * a deprecated export for any callers still on the old field shape.
 */

import type { Polygon } from "geojson";
import { ftToDegLat, ftToDegLng } from "./amenities";
import { clipPolygonAxisRange, type FrontageAxis } from "./footprintSlicer";
import { footprintBbox } from "./geometry";
import { polygonAreaSqFt } from "./polygonArea";

export type OfficeCorner =
  | "front-left"
  | "front-right"
  | "rear-left"
  | "rear-right";

const FT_PER_DEG_LAT = 364_000;

export interface OfficeWarehouseSplit {
  office: Polygon | null;
  warehouse: Polygon | null;
  officeSf: number;
  warehouseSf: number;
}

/**
 * Tolerant validator. Returns null when the input isn't a known corner so
 * malformed/legacy rows degrade to the default ('front-left').
 */
export function parseOfficeCorner(value: unknown): OfficeCorner | null {
  if (
    value === "front-left" ||
    value === "front-right" ||
    value === "rear-left" ||
    value === "rear-right"
  ) {
    return value;
  }
  return null;
}

/**
 * Squarest rectangle (width × depth) that fits a target office SF inside a
 * slab with the given frontage width and depth in feet. "Frontage width"
 * runs along the building's dock face; "depth" is perpendicular.
 *
 * Algorithm:
 *   1. Ideal: width = depth = sqrt(SF).
 *   2. If width > slab frontage, clamp; recompute depth.
 *   3. If depth > slab depth, clamp; recompute width.
 *   4. If width re-exceeds slab frontage after step 3, clamp again — caps
 *      at slab dims (whole slab becomes office).
 */
export function squarestOfficeDimensions(
  slabFrontageFt: number,
  slabDepthFt: number,
  officeSf: number,
): { widthFt: number; depthFt: number } {
  if (
    !officeSf ||
    officeSf <= 0 ||
    slabFrontageFt <= 0 ||
    slabDepthFt <= 0
  ) {
    return { widthFt: 0, depthFt: 0 };
  }
  let width = Math.sqrt(officeSf);
  let depth = officeSf / width;
  if (width > slabFrontageFt) {
    width = slabFrontageFt;
    depth = officeSf / width;
  }
  if (depth > slabDepthFt) {
    depth = slabDepthFt;
    width = officeSf / depth;
  }
  if (width > slabFrontageFt) width = slabFrontageFt;
  return { widthFt: width, depthFt: depth };
}

/**
 * Place a corner-anchored office inside a slab and return the office
 * polygon plus the warehouse parts (the L-shape complement, decomposed
 * into 0–2 axis-aligned rectangles for clean fill-extrusion rendering).
 *
 * Corner naming is frontage-relative: looking outward from the dock face,
 * "front-left" is the corner on the dock face to your left, "rear-right"
 * is the back corner to your right. For an S frontage, that's:
 *   front-left  = SW  (minLng, minLat)
 *   front-right = SE  (maxLng, minLat)
 *   rear-left   = NW  (minLng, maxLat)
 *   rear-right  = NE  (maxLng, maxLat)
 * Other frontages mirror this convention.
 */
export function placeCornerOffice(args: {
  slab: Polygon;
  side: FrontageAxis;
  officeSf: number | null | undefined;
  corner: OfficeCorner;
}): {
  office: Polygon | null;
  warehouseParts: Polygon[];
  officeSf: number;
  warehouseSf: number;
} {
  const totalSf = polygonAreaSqFt(args.slab);
  if (!args.officeSf || args.officeSf <= 0) {
    return {
      office: null,
      warehouseParts: [args.slab],
      officeSf: 0,
      warehouseSf: totalSf,
    };
  }
  if (args.officeSf >= totalSf) {
    return {
      office: args.slab,
      warehouseParts: [],
      officeSf: totalSf,
      warehouseSf: 0,
    };
  }

  const bbox = footprintBbox(args.slab);
  const midLat = (bbox.minLat + bbox.maxLat) / 2;
  const slabLngFt = (bbox.maxLng - bbox.minLng) * FT_PER_DEG_LAT * Math.cos((midLat * Math.PI) / 180);
  const slabLatFt = (bbox.maxLat - bbox.minLat) * FT_PER_DEG_LAT;

  const horizontal = args.side === "N" || args.side === "S";
  const slabFrontageFt = horizontal ? slabLngFt : slabLatFt;
  const slabDepthFt = horizontal ? slabLatFt : slabLngFt;

  const { widthFt, depthFt } = squarestOfficeDimensions(
    slabFrontageFt,
    slabDepthFt,
    args.officeSf,
  );
  if (widthFt <= 0 || depthFt <= 0) {
    return {
      office: null,
      warehouseParts: [args.slab],
      officeSf: 0,
      warehouseSf: totalSf,
    };
  }

  // Convert dims to lng/lat deltas.
  const widthDeg = horizontal ? ftToDegLng(widthFt, midLat) : ftToDegLat(widthFt);
  const depthDeg = horizontal ? ftToDegLat(depthFt) : ftToDegLng(depthFt, midLat);

  // Anchor the office bbox at the requested corner.
  const corners = cornerAnchors(bbox, args.side);
  const anchor = corners[args.corner];
  const officeBbox = {
    minLng: Math.min(anchor.lng, anchor.lng + anchor.dxSign * widthDeg * (horizontal ? 1 : 0) + anchor.dxSign * depthDeg * (horizontal ? 0 : 1)),
    maxLng: Math.max(anchor.lng, anchor.lng + anchor.dxSign * widthDeg * (horizontal ? 1 : 0) + anchor.dxSign * depthDeg * (horizontal ? 0 : 1)),
    minLat: Math.min(anchor.lat, anchor.lat + anchor.dySign * widthDeg * (horizontal ? 0 : 1) + anchor.dySign * depthDeg * (horizontal ? 1 : 0)),
    maxLat: Math.max(anchor.lat, anchor.lat + anchor.dySign * widthDeg * (horizontal ? 0 : 1) + anchor.dySign * depthDeg * (horizontal ? 1 : 0)),
  };

  // Clip slab to the office bbox: clip lng range, then lat range.
  const office = clipPolygonAxisRange(
    clipPolygonAxisRange(args.slab, true, officeBbox.minLng, officeBbox.maxLng),
    false,
    officeBbox.minLat,
    officeBbox.maxLat,
  );

  // Warehouse parts: decompose slab \ office_bbox into up to 2 axis-aligned
  // rectangles. For a rectangular slab + corner office, the L-shaped
  // complement is exactly two rects: one along the office's "open"
  // frontage-axis side, one along the perpendicular side spanning the full
  // slab on that axis. For non-rectangular slabs, we still clip slab to
  // those two rects — the result may not perfectly tile but covers the
  // visible warehouse area correctly.
  const warehouseParts = warehouseRectsForCorner(args.slab, bbox, officeBbox);

  const officeSf = polygonAreaSqFt(office);
  const warehouseSf = Math.max(0, totalSf - officeSf);
  return {
    office: officeSf > 1 ? office : null,
    warehouseParts: warehouseParts.filter((p) => polygonAreaSqFt(p) > 1),
    officeSf,
    warehouseSf,
  };
}

interface CornerAnchor {
  lng: number;
  lat: number;
  /** Sign for moving "into the slab" along longitude from this corner. */
  dxSign: 1 | -1;
  /** Sign for moving "into the slab" along latitude from this corner. */
  dySign: 1 | -1;
}

/**
 * Map each frontage-relative corner name to a slab AABB corner with the
 * inward direction signs. Used by placeCornerOffice to know which way to
 * grow the office bbox from the chosen anchor.
 */
function cornerAnchors(
  bbox: ReturnType<typeof footprintBbox>,
  side: FrontageAxis,
): Record<OfficeCorner, CornerAnchor> {
  // For each frontage, define which corner is "front-left" etc. and the
  // "inward" direction signs (always growing toward the slab interior).
  switch (side) {
    case "S":
      return {
        // Looking south: west is left.
        "front-left": { lng: bbox.minLng, lat: bbox.minLat, dxSign: 1, dySign: 1 },
        "front-right": { lng: bbox.maxLng, lat: bbox.minLat, dxSign: -1, dySign: 1 },
        "rear-left": { lng: bbox.minLng, lat: bbox.maxLat, dxSign: 1, dySign: -1 },
        "rear-right": { lng: bbox.maxLng, lat: bbox.maxLat, dxSign: -1, dySign: -1 },
      };
    case "N":
      return {
        // Looking north: east is left.
        "front-left": { lng: bbox.maxLng, lat: bbox.maxLat, dxSign: -1, dySign: -1 },
        "front-right": { lng: bbox.minLng, lat: bbox.maxLat, dxSign: 1, dySign: -1 },
        "rear-left": { lng: bbox.maxLng, lat: bbox.minLat, dxSign: -1, dySign: 1 },
        "rear-right": { lng: bbox.minLng, lat: bbox.minLat, dxSign: 1, dySign: 1 },
      };
    case "E":
      return {
        // Looking east: south is left.
        "front-left": { lng: bbox.maxLng, lat: bbox.minLat, dxSign: -1, dySign: 1 },
        "front-right": { lng: bbox.maxLng, lat: bbox.maxLat, dxSign: -1, dySign: -1 },
        "rear-left": { lng: bbox.minLng, lat: bbox.minLat, dxSign: 1, dySign: 1 },
        "rear-right": { lng: bbox.minLng, lat: bbox.maxLat, dxSign: 1, dySign: -1 },
      };
    case "W":
      return {
        // Looking west: north is left.
        "front-left": { lng: bbox.minLng, lat: bbox.maxLat, dxSign: 1, dySign: -1 },
        "front-right": { lng: bbox.minLng, lat: bbox.minLat, dxSign: 1, dySign: 1 },
        "rear-left": { lng: bbox.maxLng, lat: bbox.maxLat, dxSign: -1, dySign: -1 },
        "rear-right": { lng: bbox.maxLng, lat: bbox.minLat, dxSign: -1, dySign: 1 },
      };
  }
}

/**
 * Decompose a rectangular slab minus an axis-aligned office bbox into
 * 0–2 axis-aligned rectangles covering the warehouse complement. The
 * decomposition picks two strips that share an edge with the slab so the
 * resulting rectangles are clean and tile the warehouse area exactly for
 * a rectangular slab (and approximately for non-rectangular slabs).
 *
 * Strategy: an L-shape complement of a corner-anchored rectangle is two
 * rectangles. Pick the "wider" decomposition (a long horizontal strip plus
 * a short vertical strip, or vice versa) — we pick the horizontal-then-
 * vertical decomposition uniformly so it's predictable.
 */
function warehouseRectsForCorner(
  slab: Polygon,
  slabBbox: ReturnType<typeof footprintBbox>,
  officeBbox: { minLng: number; maxLng: number; minLat: number; maxLat: number },
): Polygon[] {
  const out: Polygon[] = [];

  // Strip 1: above OR below the office along the latitude axis, spanning
  // the slab's full longitude range.
  const officeOnSouthOfSlab =
    Math.abs(officeBbox.minLat - slabBbox.minLat) <
    Math.abs(officeBbox.maxLat - slabBbox.maxLat);
  const latStripBounds = officeOnSouthOfSlab
    ? { low: officeBbox.maxLat, high: slabBbox.maxLat }
    : { low: slabBbox.minLat, high: officeBbox.minLat };
  if (latStripBounds.high > latStripBounds.low) {
    out.push(
      clipPolygonAxisRange(slab, false, latStripBounds.low, latStripBounds.high),
    );
  }

  // Strip 2: the other lat range (the "office-row") minus the office
  // longitudes — i.e., spans only the longitude where the office isn't.
  const lat2Bounds = officeOnSouthOfSlab
    ? { low: slabBbox.minLat, high: officeBbox.maxLat }
    : { low: officeBbox.minLat, high: slabBbox.maxLat };

  const officeOnWestOfSlab =
    Math.abs(officeBbox.minLng - slabBbox.minLng) <
    Math.abs(officeBbox.maxLng - slabBbox.maxLng);
  const lngStripBounds = officeOnWestOfSlab
    ? { low: officeBbox.maxLng, high: slabBbox.maxLng }
    : { low: slabBbox.minLng, high: officeBbox.minLng };
  if (
    lngStripBounds.high > lngStripBounds.low &&
    lat2Bounds.high > lat2Bounds.low
  ) {
    out.push(
      clipPolygonAxisRange(
        clipPolygonAxisRange(slab, false, lat2Bounds.low, lat2Bounds.high),
        true,
        lngStripBounds.low,
        lngStripBounds.high,
      ),
    );
  }
  return out;
}

/**
 * @deprecated Use placeCornerOffice. Kept temporarily for any code paths
 * still on the office-strip model from migration 0011.
 */
export function splitOfficeWarehouse(
  slab: Polygon,
  side: FrontageAxis,
  depthFt: number | null | undefined,
): OfficeWarehouseSplit {
  const totalSf = polygonAreaSqFt(slab);
  if (!depthFt || depthFt <= 0) {
    return {
      office: null,
      warehouse: slab,
      officeSf: 0,
      warehouseSf: totalSf,
    };
  }

  const bbox = footprintBbox(slab);
  let office: Polygon;
  let warehouse: Polygon;

  switch (side) {
    case "S": {
      const dDeg = ftToDegLat(depthFt);
      const cut = bbox.minLat + dDeg;
      office = clipPolygonAxisRange(slab, false, bbox.minLat, cut);
      warehouse = clipPolygonAxisRange(slab, false, cut, bbox.maxLat);
      break;
    }
    case "N": {
      const dDeg = ftToDegLat(depthFt);
      const cut = bbox.maxLat - dDeg;
      office = clipPolygonAxisRange(slab, false, cut, bbox.maxLat);
      warehouse = clipPolygonAxisRange(slab, false, bbox.minLat, cut);
      break;
    }
    case "E": {
      const midLat = (bbox.minLat + bbox.maxLat) / 2;
      const dDeg = ftToDegLng(depthFt, midLat);
      const cut = bbox.maxLng - dDeg;
      office = clipPolygonAxisRange(slab, true, cut, bbox.maxLng);
      warehouse = clipPolygonAxisRange(slab, true, bbox.minLng, cut);
      break;
    }
    case "W": {
      const midLat = (bbox.minLat + bbox.maxLat) / 2;
      const dDeg = ftToDegLng(depthFt, midLat);
      const cut = bbox.minLng + dDeg;
      office = clipPolygonAxisRange(slab, true, bbox.minLng, cut);
      warehouse = clipPolygonAxisRange(slab, true, cut, bbox.maxLng);
      break;
    }
  }

  const officeSf = polygonAreaSqFt(office);
  const warehouseSf = Math.max(0, totalSf - officeSf);

  if (warehouseSf < 1) {
    return { office: slab, warehouse: null, officeSf: totalSf, warehouseSf: 0 };
  }
  return { office, warehouse, officeSf, warehouseSf };
}

/**
 * Lighter shade of a space color, used to render the office front strip.
 * Mixes the input hex with white at 0.45 — desaturated enough to read as
 * "different zone within the same space" without picking a separate hue.
 */
export function lightenColor(hex: string, mix = 0.45): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  const out = [
    Math.round(r + (255 - r) * mix),
    Math.round(g + (255 - g) * mix),
    Math.round(b + (255 - b) * mix),
  ];
  return `#${out.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}
