/**
 * Self-contained module: turns a list of buildings into Mapbox overlay
 * layer specs for the property dashboard's site-amenities visualization.
 * Pure function; no React, no tRPC, no map instance — just GeoJSON math.
 *
 * The hero composes whichever subset of layers the user has toggled on.
 * Hiding a feature = pass an empty FeatureCollection so the layer stays
 * registered with the map but renders nothing (avoids add/remove churn).
 */

import type { Feature, FeatureCollection, Polygon } from "geojson";
import type { OverlayLayer } from "@/components/map/BuildingExtrusionMap";
import {
  dockMarkerPolygons,
  truckCourtPolygon,
} from "@/lib/amenities";
import type { Bay, FrontageSide } from "@/lib/demising";

export interface AmenityBuilding {
  id: string;
  footprint: Polygon | null;
  bays: Bay[];
  truckCourtDepthFt: number | null;
}

export interface AmenityToggles {
  docks: boolean;
  truckCourts: boolean;
}

const LAYER_IDS = {
  truckCourts: "portviz-amenity-truck-courts",
  docks: "portviz-amenity-docks",
  driveIns: "portviz-amenity-drive-ins",
} as const;

function emptyFC(): FeatureCollection<Polygon> {
  return { type: "FeatureCollection", features: [] };
}

function polygonsToFC(polys: Polygon[]): FeatureCollection<Polygon> {
  return {
    type: "FeatureCollection",
    features: polys.map<Feature<Polygon>>((geometry) => ({
      type: "Feature",
      geometry,
      properties: {},
    })),
  };
}

export function buildAmenityLayers(
  buildings: AmenityBuilding[],
  toggles: AmenityToggles,
): OverlayLayer[] {
  const truckCourts: Polygon[] = [];
  const docks: Polygon[] = [];
  const driveIns: Polygon[] = [];

  for (const b of buildings) {
    if (!b.footprint) continue;
    // All bays in a building share a frontage side; pick the first. When
    // a building has no bays yet (just created, demising not run), default
    // to "S" so a truck court depth set on the AmenitiesPanel still renders
    // somewhere visible. Once the user adds bays, the actual frontage_side
    // takes over. (Long-term: a building.frontage_side column would let
    // users pick explicitly without setting up bays first.)
    const side: FrontageSide = b.bays[0]?.frontageSide ?? "S";

    if (toggles.truckCourts) {
      const court = truckCourtPolygon({
        footprint: b.footprint,
        side,
        depthFt: b.truckCourtDepthFt,
      });
      if (court) truckCourts.push(court);
    }

    if (toggles.docks) {
      const out = dockMarkerPolygons({
        footprint: b.footprint,
        bays: b.bays,
        side,
      });
      docks.push(...out.docks);
      driveIns.push(...out.driveIns);
    }
  }

  return [
    {
      id: LAYER_IDS.truckCourts,
      type: "fill",
      placement: "below",
      data: toggles.truckCourts ? polygonsToFC(truckCourts) : emptyFC(),
      paint: {
        "fill-color": "#f59e0b",
        "fill-opacity": 0.18,
        "fill-outline-color": "#b45309",
      },
    },
    {
      id: LAYER_IDS.docks,
      type: "fill",
      placement: "above",
      data: toggles.docks ? polygonsToFC(docks) : emptyFC(),
      paint: {
        "fill-color": "#111827",
        "fill-opacity": 0.85,
      },
    },
    {
      id: LAYER_IDS.driveIns,
      type: "fill",
      placement: "above",
      data: toggles.docks ? polygonsToFC(driveIns) : emptyFC(),
      paint: {
        "fill-color": "#374151",
        "fill-opacity": 0.7,
        "fill-outline-color": "#fbbf24",
      },
    },
  ];
}
