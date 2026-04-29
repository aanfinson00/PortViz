"use client";

import type { Feature, FeatureCollection, Polygon } from "geojson";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef, useState } from "react";

const SOURCE_ID = "portviz-buildings";
const LAYER_ID = "portviz-buildings-extrusion";
const OUTLINE_LAYER_ID = "portviz-buildings-outline";

const STYLES = {
  light: "mapbox://styles/mapbox/light-v11",
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
} as const;
export type MapStyleKey = keyof typeof STYLES;

export interface BuildingGeom {
  id: string;
  code: string;
  name: string | null;
  footprint: Polygon | null;
  heightFt: number | null;
  color?: string;
}

/**
 * A generic Mapbox overlay layer registered alongside the building
 * extrusion. Used by feature modules (e.g. site-amenities) to render extra
 * polygons without coupling them to this component's internals. Each layer
 * gets its own GeoJSON source; paint is passed straight through.
 */
export interface OverlayLayer {
  id: string;
  type: "fill" | "line";
  data: FeatureCollection<Polygon>;
  paint: Record<string, unknown>;
  /**
   * Render order relative to the building extrusion. "below" inserts under
   * the building (good for ground decals like truck courts); "above" stacks
   * on top (good for dock-door markers). Default "above".
   */
  placement?: "above" | "below";
}

interface BuildingExtrusionMapProps {
  center: [number, number];
  buildings: BuildingGeom[];
  selectedBuildingId?: string | null;
  onSelectBuilding?: (id: string) => void;
  /** Initial pitch in degrees for the 3D view. Default 55. */
  pitch?: number;
  /**
   * Optional [[w,s],[e,n]] bounds. When set, the map fitBounds()s on load
   * (and when the bounds change) so multiple buildings stay in frame.
   */
  bounds?: [[number, number], [number, number]] | null;
  /**
   * Extra polygon layers to render alongside the buildings. Passed-through
   * data is re-applied whenever the array changes; layers with the same
   * id are reused via setData() so rapent prop updates don't churn sources.
   */
  overlayLayers?: OverlayLayer[];
  /** Initial map style. The user can toggle between light and satellite via
   *  the small overlay button regardless of this initial choice. */
  initialStyle?: MapStyleKey;
}

export function BuildingExtrusionMap({
  center,
  buildings,
  selectedBuildingId,
  onSelectBuilding,
  pitch = 55,
  bounds = null,
  overlayLayers,
  initialStyle = "light",
}: BuildingExtrusionMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const onSelectRef = useRef(onSelectBuilding);
  const buildingsRef = useRef(buildings);
  const selectedRef = useRef(selectedBuildingId);
  const overlayLayersRef = useRef(overlayLayers);
  const boundsRef = useRef(bounds);
  const overlayIdsRef = useRef<Set<string>>(new Set());
  const [styleKey, setStyleKey] = useState<MapStyleKey>(initialStyle);

  useEffect(() => {
    onSelectRef.current = onSelectBuilding;
  }, [onSelectBuilding]);
  useEffect(() => {
    buildingsRef.current = buildings;
  }, [buildings]);
  useEffect(() => {
    selectedRef.current = selectedBuildingId;
  }, [selectedBuildingId]);
  useEffect(() => {
    overlayLayersRef.current = overlayLayers;
  }, [overlayLayers]);
  useEffect(() => {
    boundsRef.current = bounds;
  }, [bounds]);

  // Mount the map exactly once. Style swaps later via map.setStyle().
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      containerRef.current.innerHTML =
        '<div class="flex h-full w-full items-center justify-center text-sm text-neutral-400">Set NEXT_PUBLIC_MAPBOX_TOKEN in .env.local to enable the map.</div>';
      return;
    }

    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: STYLES[initialStyle],
      center,
      zoom: 17,
      pitch,
      bearing: -20,
      antialias: true,
    });

    map.addControl(
      new mapboxgl.NavigationControl({ visualizePitch: true }),
      "top-right",
    );

    // setupLayers re-installs all custom sources + layers. Runs on every
    // style.load (which fires both for the initial style and after each
    // map.setStyle() call), so layers persist across satellite toggles.
    const setupLayers = () => {
      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }
      if (!map.getLayer(LAYER_ID)) {
        map.addLayer({
          id: LAYER_ID,
          type: "fill-extrusion",
          source: SOURCE_ID,
          paint: {
            "fill-extrusion-color": ["coalesce", ["get", "color"], "#2563eb"],
            "fill-extrusion-height": ["coalesce", ["get", "heightMeters"], 10],
            "fill-extrusion-base": 0,
            "fill-extrusion-opacity": 0.85,
          },
        });
      }
      if (!map.getLayer(OUTLINE_LAYER_ID)) {
        map.addLayer({
          id: OUTLINE_LAYER_ID,
          type: "line",
          source: SOURCE_ID,
          paint: {
            "line-color": "#111827",
            "line-width": [
              "case",
              ["==", ["get", "selected"], true],
              3,
              1,
            ],
          },
        });
      }

      // Re-apply current building features into the source.
      applyBuildingFeatures(map, buildingsRef.current, selectedRef.current);

      // Re-add overlay layers (style.setStyle wipes all custom layers).
      overlayIdsRef.current.clear();
      for (const layer of overlayLayersRef.current ?? []) {
        applyOverlayLayer(map, layer, overlayIdsRef.current);
      }

      // Re-fit bounds if any.
      if (boundsRef.current) {
        map.fitBounds(boundsRef.current, {
          padding: 48,
          maxZoom: 18,
          duration: 0,
        });
      }
    };

    map.on("style.load", setupLayers);

    map.on("click", LAYER_ID, (e) => {
      const feat = e.features?.[0];
      const id = feat?.properties?.id as string | undefined;
      if (id) onSelectRef.current?.(id);
    });
    map.on("mouseenter", LAYER_ID, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", LAYER_ID, () => {
      map.getCanvas().style.cursor = "";
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch style when the toggle changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(STYLES[styleKey]);
    // setupLayers runs on the next style.load.
  }, [styleKey]);

  // Re-fit when bounds change after mount.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !bounds) return;
    const fit = () =>
      map.fitBounds(bounds, { padding: 48, maxZoom: 18, duration: 400 });
    if (map.isStyleLoaded()) fit();
    else map.once("style.load", fit);
  }, [bounds]);

  // Sync buildings into the source when the data changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => applyBuildingFeatures(map, buildings, selectedBuildingId);
    if (map.isStyleLoaded()) apply();
    else map.once("style.load", apply);
  }, [buildings, selectedBuildingId]);

  // Sync overlay layers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layers = overlayLayers ?? [];
    const apply = () => {
      const wantedIds = new Set(layers.map((l) => l.id));
      for (const id of Array.from(overlayIdsRef.current)) {
        if (!wantedIds.has(id)) {
          if (map.getLayer(id)) map.removeLayer(id);
          if (map.getSource(id)) map.removeSource(id);
          overlayIdsRef.current.delete(id);
        }
      }
      for (const layer of layers) {
        applyOverlayLayer(map, layer, overlayIdsRef.current);
      }
    };
    if (map.isStyleLoaded()) apply();
    else map.once("style.load", apply);
  }, [overlayLayers]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      <StyleToggle styleKey={styleKey} onChange={setStyleKey} />
    </div>
  );
}

function applyBuildingFeatures(
  map: mapboxgl.Map,
  buildings: BuildingGeom[],
  selectedBuildingId: string | null | undefined,
) {
  const source = map.getSource(SOURCE_ID) as
    | mapboxgl.GeoJSONSource
    | undefined;
  if (!source) return;
  const features: Feature<Polygon>[] = buildings
    .filter((b): b is BuildingGeom & { footprint: Polygon } =>
      Boolean(b.footprint),
    )
    .map((b) => ({
      type: "Feature",
      geometry: b.footprint,
      properties: {
        id: b.id,
        code: b.code,
        name: b.name,
        heightMeters: (b.heightFt ?? 30) * 0.3048,
        color: b.color ?? "#2563eb",
        selected: selectedBuildingId === b.id,
      },
    }));
  source.setData({ type: "FeatureCollection", features });
}

function applyOverlayLayer(
  map: mapboxgl.Map,
  layer: OverlayLayer,
  knownIds: Set<string>,
) {
  const existing = map.getSource(layer.id) as
    | mapboxgl.GeoJSONSource
    | undefined;
  if (existing) {
    existing.setData(layer.data);
    return;
  }
  map.addSource(layer.id, { type: "geojson", data: layer.data });
  const beforeId =
    layer.placement === "below" && map.getLayer(LAYER_ID)
      ? LAYER_ID
      : undefined;
  map.addLayer(
    {
      id: layer.id,
      type: layer.type,
      source: layer.id,
      paint: layer.paint as never,
    },
    beforeId,
  );
  knownIds.add(layer.id);
}

/**
 * Two-state toggle in the top-left: Map (light) / Satellite. Mirrors the
 * standard Google Maps affordance so users find it intuitively.
 */
function StyleToggle({
  styleKey,
  onChange,
}: {
  styleKey: MapStyleKey;
  onChange: (next: MapStyleKey) => void;
}) {
  return (
    <div className="absolute left-2 top-2 z-10 inline-flex overflow-hidden rounded-md border border-neutral-200 bg-white/95 text-[11px] shadow-sm backdrop-blur">
      <button
        type="button"
        onClick={() => onChange("light")}
        className={`px-2 py-1 font-medium ${
          styleKey === "light"
            ? "bg-neutral-900 text-white"
            : "text-neutral-700 hover:bg-neutral-100"
        }`}
        aria-pressed={styleKey === "light"}
      >
        Map
      </button>
      <button
        type="button"
        onClick={() => onChange("satellite")}
        className={`border-l border-neutral-200 px-2 py-1 font-medium ${
          styleKey === "satellite"
            ? "bg-neutral-900 text-white"
            : "text-neutral-700 hover:bg-neutral-100"
        }`}
        aria-pressed={styleKey === "satellite"}
      >
        Satellite
      </button>
    </div>
  );
}
