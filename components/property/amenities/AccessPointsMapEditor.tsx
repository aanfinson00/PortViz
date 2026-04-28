"use client";

import type { Polygon } from "geojson";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef, useState } from "react";
import {
  ACCESS_ROLE_COLORS,
  type AccessPoint,
  type AccessRole,
} from "@/lib/projectAmenities";

const ROLE_OPTIONS: AccessRole[] = [
  "main",
  "truck",
  "service",
  "emergency",
  "other",
];

interface Props {
  center: [number, number];
  /** Optional parcel polygon shown as a non-interactive context outline. */
  parcel: Polygon | null;
  points: AccessPoint[];
  onChange: (next: AccessPoint[]) => void;
}

/**
 * Map-first access point editor. Inspired by Giraffe / typical GIS UX:
 *
 *   - Click anywhere on the map to drop a new access point at that
 *     location (auto-disables after one drop).
 *   - Each point renders as a draggable colored circle on the map; drag
 *     to reposition (lat/lng updates live).
 *   - The accompanying side list shows label + role + delete; selecting
 *     a row pulses the marker so it's findable on a busy map.
 *   - The parcel outline (if set) renders as a faint dashed line for
 *     spatial context — no interaction with it.
 *
 * Replaces the earlier table-form editor where users had to hand-type
 * lat/lng values, which most non-GIS users find unintuitive.
 */
export function AccessPointsMapEditor({
  center,
  parcel,
  points,
  onChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const onChangeRef = useRef(onChange);
  const pointsRef = useRef(points);
  const addModeRef = useRef(false);
  const centerRef = useRef(center);
  const parcelRef = useRef(parcel);
  const [addMode, setAddMode] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    pointsRef.current = points;
  }, [points]);
  useEffect(() => {
    addModeRef.current = addMode;
  }, [addMode]);

  // Mount map exactly once.
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
      center: centerRef.current,
      zoom: 17,
    });
    map.addControl(
      new mapboxgl.NavigationControl({ visualizePitch: true }),
      "top-right",
    );

    map.on("load", () => {
      // Parcel context outline. Source kept around even if no parcel — we
      // setData([]) when absent to avoid layer add/remove churn.
      map.addSource("portviz-access-parcel", {
        type: "geojson",
        data: parcelRef.current
          ? {
              type: "Feature",
              geometry: parcelRef.current,
              properties: {},
            }
          : { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "portviz-access-parcel-line",
        type: "line",
        source: "portviz-access-parcel",
        paint: {
          "line-color": "#0ea5e9",
          "line-width": 2,
          "line-dasharray": [3, 2],
          "line-opacity": 0.8,
        },
      });
    });

    // Click-to-drop. Suppressed when a marker is dragging or being clicked
    // (the marker captures its own click before this fires).
    map.on("click", (e) => {
      if (!addModeRef.current) return;
      const { lng, lat } = e.lngLat;
      const next: AccessPoint[] = [
        ...pointsRef.current,
        { lng, lat, label: "", role: "main" },
      ];
      onChangeRef.current(next);
      setAddMode(false);
      setSelected(next.length - 1);
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the parcel outline in sync when the prop changes.
  useEffect(() => {
    parcelRef.current = parcel;
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const src = map.getSource("portviz-access-parcel") as
        | mapboxgl.GeoJSONSource
        | undefined;
      if (!src) return;
      src.setData(
        parcel
          ? { type: "Feature", geometry: parcel, properties: {} }
          : { type: "FeatureCollection", features: [] },
      );
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [parcel]);

  // Sync the marker set: tear down and rebuild when the points change. The
  // count is small (single digits typically) so cost is negligible.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      // Remove old markers.
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      points.forEach((pt, idx) => {
        const el = document.createElement("div");
        const isSelected = selected === idx;
        el.style.background = ACCESS_ROLE_COLORS[pt.role ?? "other"];
        el.style.width = "18px";
        el.style.height = "18px";
        el.style.borderRadius = "50%";
        el.style.border = `2px solid ${isSelected ? "#0ea5e9" : "white"}`;
        el.style.boxShadow = isSelected
          ? "0 0 0 4px rgba(14,165,233,0.35)"
          : "0 1px 4px rgba(0,0,0,0.4)";
        el.style.cursor = "grab";
        el.title = pt.label || `${pt.role ?? "other"}`;

        const marker = new mapboxgl.Marker({ element: el, draggable: true })
          .setLngLat([pt.lng, pt.lat])
          .addTo(map);

        marker.on("dragstart", () => {
          el.style.cursor = "grabbing";
        });
        marker.on("dragend", () => {
          el.style.cursor = "grab";
          const { lng, lat } = marker.getLngLat();
          const next = pointsRef.current.map((x, i) =>
            i === idx ? { ...x, lng, lat } : x,
          );
          onChangeRef.current(next);
        });

        // Click marker → select (fires before the map click, so addMode
        // stays disabled when the user is just selecting an existing pin).
        el.addEventListener("click", (event) => {
          event.stopPropagation();
          setSelected(idx);
        });

        markersRef.current.push(marker);
      });
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [points, selected]);

  function updatePoint(idx: number, patch: Partial<AccessPoint>) {
    onChangeRef.current(
      pointsRef.current.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    );
  }

  function removePoint(idx: number) {
    onChangeRef.current(pointsRef.current.filter((_, i) => i !== idx));
    setSelected(null);
  }

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[2fr_1fr]">
      <div className="relative h-72 w-full overflow-hidden rounded-md border border-neutral-200">
        <div ref={containerRef} className="h-full w-full" />
        <div className="absolute right-2 top-2 z-10 flex gap-1">
          <button
            type="button"
            onClick={() => setAddMode((v) => !v)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium shadow-sm ${
              addMode
                ? "bg-blue-600 text-white"
                : "border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
            }`}
          >
            {addMode ? "Click on map…" : "+ Add point"}
          </button>
        </div>
        <p className="absolute bottom-2 left-2 z-10 rounded-md bg-white/90 px-2 py-0.5 text-[10px] text-neutral-600 shadow-sm backdrop-blur">
          Click + Add, then click the map to drop. Drag a pin to move.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
          Access points ({points.length})
        </p>
        {points.length === 0 ? (
          <p className="rounded-md border border-dashed border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-500">
            No access points yet. Click <strong>+ Add point</strong>, then
            click on the map to drop one.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {points.map((p, i) => {
              const isSelected = selected === i;
              return (
                <li
                  key={i}
                  className={`flex flex-wrap items-center gap-1.5 rounded-md border p-1.5 text-xs ${
                    isSelected
                      ? "border-blue-300 bg-blue-50"
                      : "border-neutral-200 bg-white"
                  }`}
                  onMouseEnter={() => setSelected(i)}
                  onMouseLeave={() =>
                    setSelected((prev) => (prev === i ? null : prev))
                  }
                >
                  <span
                    aria-hidden
                    className="inline-block h-3 w-3 flex-shrink-0 rounded-full"
                    style={{
                      background: ACCESS_ROLE_COLORS[p.role ?? "other"],
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Label"
                    value={p.label ?? ""}
                    onChange={(e) =>
                      updatePoint(i, { label: e.target.value })
                    }
                    className="min-w-0 flex-1 rounded border border-neutral-200 px-1.5 py-0.5"
                  />
                  <select
                    value={p.role ?? "other"}
                    onChange={(e) =>
                      updatePoint(i, {
                        role: e.target.value as AccessRole,
                      })
                    }
                    className="rounded border border-neutral-200 px-1 py-0.5 capitalize"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r} className="capitalize">
                        {r}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removePoint(i)}
                    className="rounded border border-red-200 bg-white px-1.5 py-0.5 text-red-700 hover:bg-red-50"
                    aria-label="Remove access point"
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
