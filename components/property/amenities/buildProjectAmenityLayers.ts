/**
 * Project-level amenity layers (parcel boundary + access points). Lives
 * alongside buildAmenityLayers (building-level: docks, truck courts) so
 * each amenity stays modular: dropping a layer is a one-line change here
 * and adding a new one doesn't churn the building-side code.
 *
 * Like its sibling, this is a pure function — no React, no tRPC. The
 * hero composes its output alongside the building amenity layers.
 */

import type { Feature, FeatureCollection, Polygon } from "geojson";
import type { OverlayLayer } from "@/components/map/BuildingExtrusionMap";
import {
  ACCESS_ROLE_COLORS,
  accessPointMarker,
  type AccessPoint,
} from "@/lib/projectAmenities";

export interface ProjectAmenityToggles {
  parcel: boolean;
  accessPoints: boolean;
}

export interface ProjectAmenityInput {
  parcel: Polygon | null;
  accessPoints: AccessPoint[];
}

const LAYER_IDS = {
  parcel: "portviz-amenity-parcel",
  accessPoints: "portviz-amenity-access-points",
} as const;

function emptyFC<T extends "Polygon">(): FeatureCollection<Polygon> {
  return { type: "FeatureCollection", features: [] };
}

export function buildProjectAmenityLayers(
  input: ProjectAmenityInput,
  toggles: ProjectAmenityToggles,
): OverlayLayer[] {
  const parcelFC: FeatureCollection<Polygon> =
    toggles.parcel && input.parcel
      ? {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: input.parcel,
              properties: {},
            },
          ],
        }
      : emptyFC();

  const accessFC: FeatureCollection<Polygon> = toggles.accessPoints
    ? {
        type: "FeatureCollection",
        features: input.accessPoints.map<Feature<Polygon>>((pt) => ({
          type: "Feature",
          geometry: accessPointMarker(pt),
          properties: {
            role: pt.role ?? "other",
            color: ACCESS_ROLE_COLORS[pt.role ?? "other"],
            label: pt.label ?? "",
          },
        })),
      }
    : emptyFC();

  return [
    {
      // Parcel renders as a dashed outline only — no fill, so it doesn't
      // visually compete with the building extrusions or truck courts.
      // Drawn underneath buildings (placement: 'below') for layering.
      id: LAYER_IDS.parcel,
      type: "line",
      placement: "below",
      data: parcelFC,
      paint: {
        "line-color": "#0ea5e9",
        "line-width": 2,
        "line-dasharray": [3, 2],
        "line-opacity": 0.85,
      },
    },
    {
      // Access points render above everything as filled circles colored
      // by role. The polygon is a 24-segment circle in physical feet so
      // the marker scales with map zoom (vs a screen-pixel circle).
      id: LAYER_IDS.accessPoints,
      type: "fill",
      placement: "above",
      data: accessFC,
      paint: {
        "fill-color": ["coalesce", ["get", "color"], "#6b7280"],
        "fill-opacity": 0.95,
        "fill-outline-color": "#ffffff",
      },
    },
  ];
}
