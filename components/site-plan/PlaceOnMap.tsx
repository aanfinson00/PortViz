"use client";

import type { Polygon } from "geojson";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef, useState } from "react";
import { projectPolygonPixToLngLat } from "@/lib/projection";
import type { Point } from "@/lib/squareOff";

interface PlaceOnMapProps {
  /** Polygon in image-pixel coordinates (already calibrated). */
  polygonPx: ReadonlyArray<Point>;
  feetPerPixel: number;
  /** Initial map center (the project's lat/lng). */
  initialCenter: [number, number];
  /** Fired when the user moves or rotates the overlay. */
  onChange: (geojson: Polygon, center: [number, number], rotationDeg: number) => void;
}

const SOURCE_ID = "trace-overlay";
const FILL_LAYER = "trace-overlay-fill";
const OUTLINE_LAYER = "trace-overlay-outline";
const HANDLE_FILL_LAYER = "trace-overlay-handle";

/**
 * Mapbox satellite map with a draggable + rotatable polygon overlay.
 *
 * Two interactions:
 * - Drag the polygon body: translates the centroid to the new pointer
 *   location.
 * - Drag the small "rotation handle" north of the centroid: rotates the
 *   polygon around the centroid.
 *
 * Emits the resulting GeoJSON polygon in lng/lat to the parent on every
 * change so the parent can persist it.
 */
export function PlaceOnMap({
  polygonPx,
  feetPerPixel,
  initialCenter,
  onChange,
}: PlaceOnMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [center, setCenter] = useState<[number, number]>(initialCenter);
  const [rotationDeg, setRotationDeg] = useState(0);
  const draggingRef = useRef<"polygon" | "handle" | null>(null);
  const dragStartRef = useRef<{
    lng: number;
    lat: number;
    centerStart: [number, number];
    rotStart: number;
  } | null>(null);

  // Mount the map once.
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
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: initialCenter,
      zoom: 17,
    });
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");

    map.on("load", () => {
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: FILL_LAYER,
        type: "fill",
        source: SOURCE_ID,
        filter: ["==", ["get", "kind"], "polygon"],
        paint: { "fill-color": "#2563eb", "fill-opacity": 0.4 },
      });
      map.addLayer({
        id: OUTLINE_LAYER,
        type: "line",
        source: SOURCE_ID,
        filter: ["==", ["get", "kind"], "polygon"],
        paint: { "line-color": "#1d4ed8", "line-width": 2 },
      });
      map.addLayer({
        id: HANDLE_FILL_LAYER,
        type: "circle",
        source: SOURCE_ID,
        filter: ["==", ["get", "kind"], "handle"],
        paint: {
          "circle-radius": 8,
          "circle-color": "#f59e0b",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });

      // Drag handlers.
      map.on("mousedown", FILL_LAYER, (e) => {
        e.preventDefault();
        draggingRef.current = "polygon";
        dragStartRef.current = {
          lng: e.lngLat.lng,
          lat: e.lngLat.lat,
          centerStart: [center[0], center[1]],
          rotStart: rotationDeg,
        };
        map.getCanvas().style.cursor = "grabbing";
      });
      map.on("mousedown", HANDLE_FILL_LAYER, (e) => {
        e.preventDefault();
        draggingRef.current = "handle";
        dragStartRef.current = {
          lng: e.lngLat.lng,
          lat: e.lngLat.lat,
          centerStart: [center[0], center[1]],
          rotStart: rotationDeg,
        };
        map.getCanvas().style.cursor = "grabbing";
      });
      map.on("mousemove", (e) => {
        if (!draggingRef.current || !dragStartRef.current) return;
        const start = dragStartRef.current;
        if (draggingRef.current === "polygon") {
          const dLng = e.lngLat.lng - start.lng;
          const dLat = e.lngLat.lat - start.lat;
          setCenter([start.centerStart[0] + dLng, start.centerStart[1] + dLat]);
        } else {
          // Compute the bearing from current center to cursor; the rotation
          // is that bearing offset so 0° means handle points due north.
          const c = start.centerStart;
          const dx = e.lngLat.lng - c[0];
          const dy = e.lngLat.lat - c[1];
          const bearing = (Math.atan2(dx, dy) * 180) / Math.PI; // 0 = north
          setRotationDeg(bearing);
        }
      });
      map.on("mouseup", () => {
        draggingRef.current = null;
        dragStartRef.current = null;
        map.getCanvas().style.cursor = "";
      });
      map.on("mouseenter", FILL_LAYER, () => {
        if (!draggingRef.current) map.getCanvas().style.cursor = "grab";
      });
      map.on("mouseleave", FILL_LAYER, () => {
        if (!draggingRef.current) map.getCanvas().style.cursor = "";
      });
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // initialCenter is intentionally the only dep we honor for mount; later
    // updates flow through state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-project the polygon to lng/lat any time center, rotation, or scale
  // changes. Push the new GeoJSON into the source and notify the parent.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const projected = projectPolygonPixToLngLat(
        polygonPx,
        center,
        feetPerPixel,
        rotationDeg,
      );
      // Compute a handle position offset ~50 ft north of center to act as a
      // visual rotation grip.
      const FEET_PER_DEGREE_LAT = 364_000;
      const rotRad = (rotationDeg * Math.PI) / 180;
      const handleOffsetFt = 50;
      const handleDLat =
        (handleOffsetFt / FEET_PER_DEGREE_LAT) * Math.cos(rotRad);
      const cosLat = Math.cos((center[1] * Math.PI) / 180);
      const handleDLng =
        (handleOffsetFt / (FEET_PER_DEGREE_LAT * cosLat)) * Math.sin(rotRad);
      const handlePoint: [number, number] = [
        center[0] + handleDLng,
        center[1] + handleDLat,
      ];

      const source = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
      if (!source) return;
      source.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: projected,
            properties: { kind: "polygon" },
          },
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: handlePoint },
            properties: { kind: "handle" },
          },
        ],
      });
      onChange(projected, center, rotationDeg);
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [polygonPx, feetPerPixel, center, rotationDeg, onChange]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-white/90 px-2 py-1 text-xs text-neutral-700 shadow">
        Drag the blue polygon to reposition. Drag the orange dot to rotate.
        <br />
        Center: {center[1].toFixed(5)}, {center[0].toFixed(5)} · Rotation: {rotationDeg.toFixed(0)}°
      </div>
    </div>
  );
}
