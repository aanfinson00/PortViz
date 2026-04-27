"use client";

import type { Polygon } from "geojson";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef } from "react";

export interface ProjectPinData {
  id: string;
  code: string;
  name: string;
  lat: number;
  lng: number;
}

export interface PortfolioBuilding {
  id: string;
  code: string;
  footprint: Polygon;
  heightFt: number | null;
  /** Optional fill color override; defaults to portfolio blue. */
  color?: string;
}

interface PortfolioMapProps {
  projects: ProjectPinData[];
  buildings?: PortfolioBuilding[];
  selectedCode?: string | null;
  onSelect?: (code: string) => void;
  onSelectBuilding?: (id: string) => void;
  onMapClick?: (lngLat: { lng: number; lat: number }) => void;
  /** When set, clicking the map doesn't pan/select — used in pin-drop mode. */
  dropMode?: boolean;
}

const DEFAULT_CENTER: [number, number] = [-98.5795, 39.8283]; // continental US
const DEFAULT_ZOOM = 3.2;
const BUILDINGS_SOURCE = "portfolio-buildings";
const BUILDINGS_LAYER = "portfolio-buildings-extrusion";
const BUILDINGS_OUTLINE_LAYER = "portfolio-buildings-outline";

export function PortfolioMap({
  projects,
  buildings = [],
  selectedCode,
  onSelect,
  onSelectBuilding,
  onMapClick,
  dropMode = false,
}: PortfolioMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const onMapClickRef = useRef(onMapClick);
  const onSelectRef = useRef(onSelect);
  const onSelectBuildingRef = useRef(onSelectBuilding);

  // Keep the latest callbacks accessible from stable Mapbox handlers.
  useEffect(() => {
    onMapClickRef.current = onMapClick;
    onSelectRef.current = onSelect;
    onSelectBuildingRef.current = onSelectBuilding;
  }, [onMapClick, onSelect, onSelectBuilding]);

  // Mount the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      // Without a token, render a placeholder message in the container.
      containerRef.current.innerHTML =
        '<div class="flex h-full w-full items-center justify-center text-sm text-neutral-400">Set NEXT_PUBLIC_MAPBOX_TOKEN in .env.local to enable the map.</div>';
      return;
    }

    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      antialias: true,
    });

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");

    // Map-wide click. If a building extrusion was hit, fire the building
    // selector and stop. Otherwise treat it as a generic map click (used by
    // the New Project drawer's pin-drop flow).
    map.on("click", (e) => {
      const hit = map.queryRenderedFeatures(e.point, {
        layers: map.getLayer(BUILDINGS_LAYER) ? [BUILDINGS_LAYER] : [],
      });
      const id = hit?.[0]?.properties?.id as string | undefined;
      if (id) {
        onSelectBuildingRef.current?.(id);
        return;
      }
      onMapClickRef.current?.({ lng: e.lngLat.lng, lat: e.lngLat.lat });
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
  }, []);

  // Sync markers whenever projects change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const existing = markersRef.current;
    const seen = new Set<string>();

    for (const p of projects) {
      seen.add(p.id);
      let marker = existing.get(p.id);
      if (!marker) {
        const el = document.createElement("button");
        el.className =
          "flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-neutral-900 text-xs font-semibold text-white shadow-md transition hover:scale-110";
        el.textContent = p.code.slice(0, 3);
        el.title = `${p.code} — ${p.name}`;
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          onSelectRef.current?.(p.code);
        });
        marker = new mapboxgl.Marker({ element: el })
          .setLngLat([p.lng, p.lat])
          .addTo(map);
        existing.set(p.id, marker);
      } else {
        marker.setLngLat([p.lng, p.lat]);
      }
    }

    for (const [id, marker] of existing) {
      if (!seen.has(id)) {
        marker.remove();
        existing.delete(id);
      }
    }
  }, [projects]);

  // Sync the buildings extrusion source whenever the buildings prop changes.
  // The source + layer are created on first sync (idempotently) so we don't
  // race the map's "load" event.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      if (!map.getSource(BUILDINGS_SOURCE)) {
        map.addSource(BUILDINGS_SOURCE, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: BUILDINGS_LAYER,
          type: "fill-extrusion",
          source: BUILDINGS_SOURCE,
          paint: {
            "fill-extrusion-color": ["coalesce", ["get", "color"], "#2563eb"],
            "fill-extrusion-height": ["coalesce", ["get", "heightMeters"], 10],
            "fill-extrusion-base": 0,
            "fill-extrusion-opacity": 0.85,
          },
        });
        map.addLayer({
          id: BUILDINGS_OUTLINE_LAYER,
          type: "line",
          source: BUILDINGS_SOURCE,
          paint: {
            "line-color": "#111827",
            "line-width": 1.5,
          },
        });
        map.on("mouseenter", BUILDINGS_LAYER, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", BUILDINGS_LAYER, () => {
          map.getCanvas().style.cursor = "";
        });
      }

      const source = map.getSource(BUILDINGS_SOURCE) as
        | mapboxgl.GeoJSONSource
        | undefined;
      if (!source) return;
      source.setData({
        type: "FeatureCollection",
        features: buildings.map((b) => ({
          type: "Feature",
          geometry: b.footprint,
          properties: {
            id: b.id,
            code: b.code,
            heightMeters: (b.heightFt ?? 30) * 0.3048,
            ...(b.color ? { color: b.color } : {}),
          },
        })),
      });
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [buildings]);

  // Fly to the selected project when it changes. If we have buildings to
  // show, fit the camera to their bounds (with pitch) so even buildings
  // drawn far from the project pin stay framed. Without buildings, fall
  // back to a flyTo at the project's lat/lng.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedCode) return;
    const selected = projects.find((p) => p.code === selectedCode);
    if (!selected) return;

    if (buildings.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      for (const b of buildings) {
        for (const ring of b.footprint.coordinates) {
          for (const [lng, lat] of ring) {
            bounds.extend([lng, lat]);
          }
        }
      }
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, {
          padding: 80,
          pitch: 55,
          bearing: -20,
          maxZoom: 19,
          duration: 1500,
        });
        return;
      }
    }

    map.flyTo({
      center: [selected.lng, selected.lat],
      zoom: 14,
      pitch: 0,
      bearing: 0,
      essential: true,
      duration: 1200,
    });
  }, [selectedCode, projects, buildings]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ cursor: dropMode ? "crosshair" : undefined }}
    />
  );
}
