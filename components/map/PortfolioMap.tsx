"use client";

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

interface PortfolioMapProps {
  projects: ProjectPinData[];
  selectedCode?: string | null;
  onSelect?: (code: string) => void;
  onMapClick?: (lngLat: { lng: number; lat: number }) => void;
  /** When set, clicking the map doesn't pan/select — used in pin-drop mode. */
  dropMode?: boolean;
}

const DEFAULT_CENTER: [number, number] = [-98.5795, 39.8283]; // continental US
const DEFAULT_ZOOM = 3.2;

export function PortfolioMap({
  projects,
  selectedCode,
  onSelect,
  onMapClick,
  dropMode = false,
}: PortfolioMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const onMapClickRef = useRef(onMapClick);
  const onSelectRef = useRef(onSelect);

  // Keep the latest callbacks accessible from stable Mapbox handlers.
  useEffect(() => {
    onMapClickRef.current = onMapClick;
    onSelectRef.current = onSelect;
  }, [onMapClick, onSelect]);

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
    });

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");

    map.on("click", (e) => {
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

  // Fly to the selected project when it changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedCode) return;
    const selected = projects.find((p) => p.code === selectedCode);
    if (!selected) return;
    map.flyTo({
      center: [selected.lng, selected.lat],
      zoom: 14,
      essential: true,
      duration: 1200,
    });
  }, [selectedCode, projects]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ cursor: dropMode ? "crosshair" : undefined }}
    />
  );
}
