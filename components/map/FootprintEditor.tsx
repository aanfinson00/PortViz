"use client";

import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import type { Polygon } from "geojson";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef } from "react";

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
      center,
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
      if (value) {
        draw.add({
          type: "Feature",
          geometry: value,
          properties: {},
        });
      }
    });

    const emit = () => {
      const fc = draw.getAll();
      const polygon = fc.features.find(
        (f) => f.geometry.type === "Polygon",
      )?.geometry as Polygon | undefined;
      onChangeRef.current(polygon ?? null);
    };

    map.on("draw.create", emit);
    map.on("draw.update", emit);
    map.on("draw.delete", emit);

    mapRef.current = map;
    drawRef.current = draw;

    return () => {
      map.remove();
      mapRef.current = null;
      drawRef.current = null;
    };
  }, [center, value]);

  return <div ref={containerRef} className="h-full w-full" />;
}
