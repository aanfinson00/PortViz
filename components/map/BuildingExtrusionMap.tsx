"use client";

import type { Feature, FeatureCollection, Polygon } from "geojson";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef } from "react";

const SOURCE_ID = "portviz-buildings";
const LAYER_ID = "portviz-buildings-extrusion";
const OUTLINE_LAYER_ID = "portviz-buildings-outline";

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
   * id are reused via setData() so rapid prop updates don't churn sources.
   */
  overlayLayers?: OverlayLayer[];
}

export function BuildingExtrusionMap({
  center,
  buildings,
  selectedBuildingId,
  onSelectBuilding,
  pitch = 55,
  bounds = null,
  overlayLayers,
}: BuildingExtrusionMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const onSelectRef = useRef(onSelectBuilding);

  useEffect(() => {
    onSelectRef.current = onSelectBuilding;
  }, [onSelectBuilding]);

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
      style: "mapbox://styles/mapbox/light-v11",
      center,
      zoom: 17,
      pitch,
      bearing: -20,
      antialias: true,
    });

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");

    map.on("load", () => {
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

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

      if (bounds) {
        map.fitBounds(bounds, { padding: 48, maxZoom: 18, duration: 0 });
      }
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [center, pitch, bounds]);

  // Re-fit when bounds change after mount (e.g. a building is added).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !bounds) return;
    const fit = () =>
      map.fitBounds(bounds, { padding: 48, maxZoom: 18, duration: 400 });
    if (map.isStyleLoaded()) fit();
    else map.once("load", fit);
  }, [bounds]);

  // Sync buildings into the source when the data changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const source = map.getSource(SOURCE_ID) as
        | mapboxgl.GeoJSONSource
        | undefined;
      if (!source) return;

      const features: Feature<Polygon>[] = buildings
        .filter((b): b is BuildingGeom & { footprint: Polygon } => Boolean(b.footprint))
        .map((b) => ({
          type: "Feature",
          geometry: b.footprint,
          properties: {
            id: b.id,
            code: b.code,
            name: b.name,
            // Mapbox fill-extrusion heights are in meters.
            heightMeters: (b.heightFt ?? 30) * 0.3048,
            color: b.color ?? "#2563eb",
            selected: selectedBuildingId === b.id,
          },
        }));

      const fc: FeatureCollection<Polygon> = {
        type: "FeatureCollection",
        features,
      };
      source.setData(fc);
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [buildings, selectedBuildingId]);

  // Sync overlay layers (separate from building extrusion). Each overlay
  // gets its own source; existing sources are re-used via setData() on
  // subsequent prop updates so we don't add+remove layers on every render.
  const overlayIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layers = overlayLayers ?? [];

    const apply = () => {
      const wantedIds = new Set(layers.map((l) => l.id));

      // Remove layers that disappeared from props.
      for (const id of Array.from(overlayIdsRef.current)) {
        if (!wantedIds.has(id)) {
          if (map.getLayer(id)) map.removeLayer(id);
          if (map.getSource(id)) map.removeSource(id);
          overlayIdsRef.current.delete(id);
        }
      }

      for (const layer of layers) {
        const existing = map.getSource(layer.id) as
          | mapboxgl.GeoJSONSource
          | undefined;
        if (existing) {
          existing.setData(layer.data);
          continue;
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
        overlayIdsRef.current.add(layer.id);
      }
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [overlayLayers]);

  return <div ref={containerRef} className="h-full w-full" />;
}
