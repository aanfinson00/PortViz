/**
 * Project-level amenity layers (parcel boundary + access points + parking
 * lot + yard / outside storage). Lives alongside buildAmenityLayers
 * (building-level: docks, truck courts) so each amenity stays modular:
 * dropping a layer is a one-line change here and adding a new one doesn't
 * churn the building-side code.
 *
 * Like its sibling, this is a pure function — no React, no tRPC. The
 * hero composes its output alongside the building amenity layers.
 */

import type { Feature, FeatureCollection, Polygon } from "geojson";
import type { OverlayLayer } from "@/components/map/BuildingExtrusionMap";
import {
  ACCESS_ROLE_COLORS,
  accessPointMarker,
  PARKING_KIND_COLORS,
  type AccessPoint,
  type ParkingArea,
  type YardArea,
} from "@/lib/projectAmenities";

export interface ProjectAmenityToggles {
  parcel: boolean;
  accessPoints: boolean;
  parking: boolean;
  yard: boolean;
}

export interface ProjectAmenityInput {
  parcel: Polygon | null;
  accessPoints: AccessPoint[];
  parking: ParkingArea[];
  yard: YardArea[];
}

const LAYER_IDS = {
  parcel: "portviz-amenity-parcel",
  accessPoints: "portviz-amenity-access-points",
  parking: "portviz-amenity-parking",
  yard: "portviz-amenity-yard",
} as const;

function emptyFC(): FeatureCollection<Polygon> {
  return { type: "FeatureCollection", features: [] };
}

function singletonFC(
  geometry: Polygon,
  properties: Record<string, unknown> = {},
): FeatureCollection<Polygon> {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry,
        properties,
      },
    ],
  };
}

export function buildProjectAmenityLayers(
  input: ProjectAmenityInput,
  toggles: ProjectAmenityToggles,
): OverlayLayer[] {
  const parcelFC: FeatureCollection<Polygon> =
    toggles.parcel && input.parcel ? singletonFC(input.parcel) : emptyFC();

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

  const parkingFC: FeatureCollection<Polygon> =
    toggles.parking && input.parking.length > 0
      ? {
          type: "FeatureCollection",
          features: input.parking.map<Feature<Polygon>>((area) => ({
            type: "Feature",
            geometry: area.polygon,
            properties: {
              color: PARKING_KIND_COLORS[area.kind ?? "car"],
              stalls: area.stalls ?? 0,
              kind: area.kind ?? "car",
              label: area.label ?? "",
            },
          })),
        }
      : emptyFC();

  const yardFC: FeatureCollection<Polygon> =
    toggles.yard && input.yard.length > 0
      ? {
          type: "FeatureCollection",
          features: input.yard.map<Feature<Polygon>>((area) => ({
            type: "Feature",
            geometry: area.polygon,
            properties: { label: area.label ?? "" },
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
      // Parking lot: filled polygon under the buildings. Color comes from
      // the per-feature `color` property (driven by parking kind) so a
      // future multi-polygon setup with mixed kinds will Just Work.
      id: LAYER_IDS.parking,
      type: "fill",
      placement: "below",
      data: parkingFC,
      paint: {
        "fill-color": ["coalesce", ["get", "color"], "#94a3b8"],
        "fill-opacity": 0.35,
        "fill-outline-color": "#475569",
      },
    },
    {
      // Yard / outside storage: solid green-grey tint with a darker
      // outline. Cross-hatch is a v2 polish (Mapbox needs a sprite image).
      id: LAYER_IDS.yard,
      type: "fill",
      placement: "below",
      data: yardFC,
      paint: {
        "fill-color": "#65a30d",
        "fill-opacity": 0.18,
        "fill-outline-color": "#365314",
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
