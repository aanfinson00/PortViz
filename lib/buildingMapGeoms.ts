/**
 * Pure helper that turns one building's data into the BuildingGeom[]
 * the 3D map renders. Runs in two modes:
 *
 *  - **Slider mode** with at least one space → slice the footprint by
 *    space SF and split each slab into warehouse parts + an optional
 *    corner office at a lower clear height.
 *  - **Bay mode** (or anything else) → return one geom = the whole
 *    footprint at the building's height.
 *
 * Lives in lib/ so both the property hero (project-level) and the
 * building detail page can render demising the same way without
 * duplicating the orchestration logic. All of the geometry math lives
 * in the helpers this file calls; nothing new here.
 */

import type { Polygon } from "geojson";
import type { BuildingGeom } from "@/components/map/BuildingExtrusionMap";
import { spaceColor } from "@/components/demising/DemisingEditor";
import type { Bay, FrontageSide } from "@/lib/demising";
import {
  sliceFootprintByArea,
  type FrontageAxis,
} from "@/lib/footprintSlicer";
import {
  lightenColor,
  placeCornerOffice,
  type OfficeCorner,
} from "@/lib/officeBuildout";
import { polygonAreaSqFt } from "@/lib/polygonArea";
import {
  resolveSpaces,
  type SliderSpace,
} from "@/lib/sliderDemising";

/** Office clear height in feet — typical industrial offices have a
 *  suspended ceiling around 12–16 ft regardless of warehouse clear
 *  height. Hardcoded for v1; future polish: per-space override. */
const OFFICE_CLEAR_HEIGHT_FT = 14;

export interface BuildingForRendering {
  id: string;
  code: string;
  name: string | null;
  footprint: Polygon | null;
  heightFt: number | null;
  demisingMode: "bays" | "sliders";
  bays: Bay[];
  spaces: Array<
    SliderSpace & {
      /** Optional space code; used as a label suffix on the BuildingGeom.
       *  Missing on the building detail page's live-preview state for
       *  newly-added unsaved spaces — the helper falls back to the id. */
      code?: string;
      officeSf: number | null;
      officeCorner: OfficeCorner | null;
    }
  >;
}

export function buildBuildingMapGeoms(
  building: BuildingForRendering,
): BuildingGeom[] {
  if (!building.footprint) return [];
  const heightFt = building.heightFt ?? null;
  const officeHeight = Math.min(OFFICE_CLEAR_HEIGHT_FT, heightFt ?? OFFICE_CLEAR_HEIGHT_FT);
  const baseColor = "#2563eb";

  // Slider mode: slice the footprint by space SF and render warehouse
  // parts + corner offices. Falls through to bay mode when the building
  // has no positioned spaces yet (so a freshly-created slider building
  // still shows as a single extrusion until the demising editor adds
  // spaces).
  if (
    building.demisingMode === "sliders" &&
    building.spaces.length > 0 &&
    building.spaces.some((s) => s.positionOrder != null)
  ) {
    const frontage: FrontageAxis = (
      (building.bays[0]?.frontageSide as FrontageSide | undefined) ?? "S"
    );
    const resolved = resolveSpaces(building.spaces, totalSfFromFootprint(building.footprint));
    const slabs = sliceFootprintByArea(
      building.footprint,
      frontage,
      resolved.map((r) => r.sf),
    );
    const out: BuildingGeom[] = [];
    resolved.forEach((r, i) => {
      const slab = slabs[i] ?? building.footprint!;
      const split = placeCornerOffice({
        slab,
        side: frontage,
        officeSf: r.officeSf ?? null,
        corner: r.officeCorner ?? "front-left",
      });
      const slabColor = spaceColor(i);
      const codeForLabel = r.code ?? r.id;
      split.warehouseParts.forEach((part, partIdx) => {
        out.push({
          id: `${building.id}-slab-${r.id}-wh-${partIdx}`,
          code: `${building.code}-${codeForLabel}-wh-${partIdx}`,
          name: `${codeForLabel} (warehouse)`,
          footprint: part,
          heightFt,
          color: slabColor,
        });
      });
      if (split.office) {
        out.push({
          id: `${building.id}-slab-${r.id}-of`,
          code: `${building.code}-${codeForLabel}-of`,
          name: `${codeForLabel} (office)`,
          footprint: split.office,
          heightFt: officeHeight,
          color: lightenColor(slabColor, 0.5),
        });
      }
    });
    return out;
  }

  // Bay/unspecified: single monolithic extrusion.
  return [
    {
      id: building.id,
      code: building.code,
      name: building.name,
      footprint: building.footprint,
      heightFt,
      color: baseColor,
    },
  ];
}

/**
 * Compute the building's total SF directly from the footprint polygon.
 * Avoids depending on the building's stored total_sf (which may differ
 * from the polygon-derived value by a few %) so the slab SFs always
 * reconcile with the slabs' actual rendered areas.
 */
function totalSfFromFootprint(polygon: Polygon): number {
  return polygonAreaSqFt(polygon);
}
