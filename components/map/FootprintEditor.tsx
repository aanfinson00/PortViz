"use client";

import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import type { Polygon } from "geojson";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef } from "react";
import { toastInfo } from "@/components/ui/Toaster";
import { squareOffPolygonLngLat } from "@/lib/squareOffLngLat";

interface FootprintEditorProps {
  center: [number, number];
  value: Polygon | null;
  onChange: (polygon: Polygon | null) => void;
}

export function FootprintEditor({ center, value, onChange }: FootprintEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const onChangeRef = useRef(onChange);
  // Initial center + value captured into refs so the once-only mount effect
  // can read them without subscribing to prop changes (which would trigger
  // a full map remount on every parent re-render — the keystroke flicker).
  const centerRef = useRef(center);
  const valueRef = useRef(value);
  // Recursion guard: our snap path calls draw.delete + draw.add, both of
  // which fire mapbox-gl-draw events that are wired back to our handlers.
  const snappingRef = useRef(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      containerRef.current.innerHTML =
        '<div class="flex h-full w-full items-center justify-center text-sm text-neutral-400">Set NEXT_PUBLIC_MAPBOX_TOKEN in .env.local to enable drawing.</div>';
      return;
    }

    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: centerRef.current,
      zoom: 18,
    });

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: { polygon: true, trash: true },
      defaultMode: "draw_polygon",
    });
    map.addControl(draw, "top-left");

    map.on("load", () => {
      const initialValue = valueRef.current;
      if (initialValue) {
        draw.add({
          type: "Feature",
          geometry: initialValue,
          properties: {},
        });
      }
    });

    const emit = () => {
      if (snappingRef.current) return;
      const fc = draw.getAll();
      const polygon = fc.features.find(
        (f) => f.geometry.type === "Polygon",
      )?.geometry as Polygon | undefined;
      onChangeRef.current(polygon ?? null);
    };

    // On create only: snap near-90° corners (within ±10°) to true right
    // angles. Industrial buildings are overwhelmingly rectilinear, and
    // freehand satellite tracing produces wobbly outlines. Subsequent
    // user edits via draw.update are preserved as-is so manual tweaks
    // aren't clobbered.
    //
    // We use draw.delete([id]) + draw.add(newFeature) (rather than
    // draw.add with the same id) because mapbox-gl-draw's same-id replace
    // doesn't always refresh the visible polygon layer. The recursion
    // guard suppresses our own delete/create events from re-entering.
    const snapOnCreate = (e: {
      features: Array<{ id: string | number; geometry: { type: string } }>;
    }) => {
      if (snappingRef.current) return;
      const f = e.features?.[0];
      if (!f || f.geometry.type !== "Polygon") {
        emit();
        return;
      }
      const fc = draw.getAll();
      const feature = fc.features.find((x) => x.id === f.id);
      if (!feature || feature.geometry.type !== "Polygon") {
        emit();
        return;
      }
      const original = feature.geometry as Polygon;
      const snapped = squareOffPolygonLngLat(original, 10);
      const changed =
        JSON.stringify(snapped.coordinates) !==
        JSON.stringify(original.coordinates);
      if (!changed) {
        // Snap was a no-op (already within precision). Emit unchanged.
        onChangeRef.current(original);
        return;
      }
      snappingRef.current = true;
      try {
        draw.delete([String(f.id)]);
        draw.add({
          type: "Feature",
          geometry: snapped,
          properties: feature.properties ?? {},
        });
      } finally {
        snappingRef.current = false;
      }
      onChangeRef.current(snapped);
      toastInfo("Squared up to right angles");
    };

    map.on("draw.create", snapOnCreate);
    map.on("draw.update", emit);
    map.on("draw.delete", emit);

    mapRef.current = map;
    drawRef.current = draw;

    return () => {
      map.remove();
      mapRef.current = null;
      drawRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className="h-full w-full" />;
}
