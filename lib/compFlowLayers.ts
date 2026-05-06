import type { Feature, FeatureCollection } from "geojson";

export interface CompFlowInput {
  id: string;
  lng: number | null;
  lat: number | null;
  /** Used as the pin tooltip + label. */
  label: string;
  /** Hex color for the pin and the flow line. Defaults to neutral grey. */
  color?: string;
  /** $/SF on the deal. Drives the pin radius (bigger deal = bigger pin). */
  rentPsf?: number | null;
  sf?: number | null;
}

interface BuildCompFlowsArgs {
  comps: CompFlowInput[];
  /** [lng, lat] of the project the comps are assigned to. Pulled from
   *  project.lng/lat or, when missing, the building footprint centroid.
   *  Flow lines anchor here. */
  target: [number, number] | null;
  layerIdPrefix: string;
}

/**
 * Returns three GeoJSON feature collections — pin circles, flow LineStrings,
 * and label points — packaged into the OverlayLayer triplet the map
 * component already knows how to render. Comps without coordinates (or
 * without a target to flow into) are silently dropped from the geometry
 * outputs but the caller still gets the count via `usable`.
 *
 * Splitting line + circle into separate layers keeps Mapbox happy: each
 * layer renders one geometry type, and reusing the existing
 * `OverlayLayer` API means we don't have to teach the map component about
 * "comp" semantics.
 */
export function buildCompFlowLayers({
  comps,
  target,
  layerIdPrefix,
}: BuildCompFlowsArgs): {
  pins: FeatureCollection;
  lines: FeatureCollection;
  pinLayerId: string;
  lineLayerId: string;
  usable: number;
} {
  const pinFeatures: Feature[] = [];
  const lineFeatures: Feature[] = [];
  let usable = 0;

  for (const c of comps) {
    if (c.lng == null || c.lat == null) continue;
    if (!Number.isFinite(c.lng) || !Number.isFinite(c.lat)) continue;
    usable += 1;
    const color = c.color ?? "#0ea5e9";
    pinFeatures.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [c.lng, c.lat] },
      properties: {
        id: c.id,
        label: c.label,
        color,
        // Pin radius: log-scale on rent_psf so tiny deals don't disappear
        // and huge deals don't dominate. Falls back to a fixed size when
        // no rent is on the comp.
        radius:
          c.rentPsf != null && Number.isFinite(c.rentPsf) && c.rentPsf > 0
            ? Math.max(4, Math.min(12, 4 + Math.log10(c.rentPsf + 1) * 5))
            : 6,
      },
    });
    if (target) {
      lineFeatures.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [
            [c.lng, c.lat],
            target,
          ],
        },
        properties: {
          id: c.id,
          color,
        },
      });
    }
  }

  return {
    pins: { type: "FeatureCollection", features: pinFeatures },
    lines: { type: "FeatureCollection", features: lineFeatures },
    pinLayerId: `${layerIdPrefix}-pins`,
    lineLayerId: `${layerIdPrefix}-lines`,
    usable,
  };
}

/**
 * Mapbox circle paint that reads the per-feature `color` and `radius`
 * properties so we can mix differently-sized pins in one source.
 */
export const COMP_PIN_PAINT = {
  "circle-radius": ["coalesce", ["get", "radius"], 6],
  "circle-color": ["coalesce", ["get", "color"], "#0ea5e9"],
  "circle-stroke-color": "#ffffff",
  "circle-stroke-width": 1.5,
  "circle-opacity": 0.95,
} as const;

export const COMP_FLOW_LINE_PAINT = {
  "line-color": ["coalesce", ["get", "color"], "#0ea5e9"],
  "line-width": 1.5,
  "line-opacity": 0.65,
  "line-dasharray": [2, 2],
} as const;
