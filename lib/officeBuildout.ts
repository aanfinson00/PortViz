/**
 * Office buildout helpers. For each demised space (a "slab" sliced from the
 * building footprint), the office sits as a strip along the frontage with a
 * user-set depth. Warehouse is the rest of the slab.
 *
 * v1 assumes the office spans the slab's full frontage edge. Partial-width
 * corner offices are deferred — they need both depth and width inputs plus
 * an alignment ("left" / "center" / "right" of the frontage).
 *
 * Both regions are computed by axis-clipping the slab polygon, which means
 * non-rectangular slabs (e.g. an L-shape from an irregular building) still
 * produce correct polygons whose areas reflect the irregularity.
 */

import type { Polygon } from "geojson";
import { ftToDegLat, ftToDegLng } from "./amenities";
import { clipPolygonAxisRange, type FrontageAxis } from "./footprintSlicer";
import { footprintBbox } from "./geometry";
import { polygonAreaSqFt } from "./polygonArea";

export interface OfficeWarehouseSplit {
  office: Polygon | null;
  warehouse: Polygon | null;
  officeSf: number;
  warehouseSf: number;
}

/**
 * Compute the office + warehouse sub-polygons of a slab given the building's
 * frontage axis and a desired office depth in feet. Returns nulls when the
 * depth is missing/zero (the entire slab is warehouse) or when the depth
 * meets/exceeds the slab's depth (the entire slab is office).
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

  // When the requested depth meets/exceeds the slab depth, treat the whole
  // slab as office (warehouse polygon may be empty / degenerate).
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
