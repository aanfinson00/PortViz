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
}

export function BuildingExtrusionMap({
  center,
  buildings,
  selectedBuildingId,
  onSelectBuilding,
  pitch = 55,
  bounds = null,
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

  return <div ref={containerRef} className="h-full w-full" />;
}
