"use client";

import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef, useState } from "react";
import { toastError, toastSuccess } from "@/components/ui/Toaster";
import { api } from "@/lib/trpc/react";

interface Props {
  comp: {
    id: string;
    label: string;
    addressLine: string | null;
    initialLng: number | null;
    initialLat: number | null;
  };
  /** Center to use when the comp has no coords yet — typically the
   *  first project's lng/lat so the user starts in their territory. */
  fallbackCenter: [number, number] | null;
  onClose: () => void;
}

const US_CENTER: [number, number] = [-96.7, 33.0];

/**
 * Click-to-drop pin editor for a comp's lng/lat. Tiny single-marker
 * Mapbox map inside a modal — drop a pin (or drag the existing one),
 * then save. On save we call comp.update with just the coords; all
 * other fields are left untouched.
 */
export function CompLocateModal({ comp, fallbackCenter, onClose }: Props) {
  const utils = api.useUtils();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);

  const [coords, setCoords] = useState<[number, number] | null>(
    comp.initialLng != null && comp.initialLat != null
      ? [comp.initialLng, comp.initialLat]
      : null,
  );

  const initialCenter: [number, number] =
    coords ?? fallbackCenter ?? US_CENTER;

  // Esc to dismiss.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Mount map once. Click anywhere to (re)drop the pin; drag the pin to
  // fine-tune.
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
      zoom: coords ? 16 : fallbackCenter ? 11 : 4,
    });
    map.addControl(
      new mapboxgl.NavigationControl({ visualizePitch: false }),
      "top-right",
    );

    function placePin(lng: number, lat: number) {
      if (markerRef.current) {
        markerRef.current.setLngLat([lng, lat]);
      } else {
        const m = new mapboxgl.Marker({ color: "#0ea5e9", draggable: true })
          .setLngLat([lng, lat])
          .addTo(map);
        m.on("dragend", () => {
          const ll = m.getLngLat();
          setCoords([ll.lng, ll.lat]);
        });
        markerRef.current = m;
      }
      setCoords([lng, lat]);
    }

    if (coords) placePin(coords[0], coords[1]);

    map.on("click", (e) => {
      placePin(e.lngLat.lng, e.lngLat.lat);
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = api.comp.update.useMutation({
    onSuccess: async () => {
      await utils.comp.list.invalidate();
      await utils.comp.listForProject.invalidate();
      toastSuccess("Location saved");
      onClose();
    },
    onError: (err) => toastError(err.message),
  });

  function handleSave() {
    if (!coords) return;
    update.mutate({
      id: comp.id,
      lng: coords[0],
      lat: coords[1],
    });
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-900/40 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-neutral-200 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            Locate comp
          </p>
          <p className="text-sm font-medium">{comp.label}</p>
          {comp.addressLine && (
            <p className="text-xs text-neutral-500">{comp.addressLine}</p>
          )}
        </div>
        <div ref={containerRef} className="h-[420px] w-full" />
        <div className="flex items-center justify-between gap-3 border-t border-neutral-200 bg-neutral-50 px-3 py-2">
          <p className="font-mono text-[11px] text-neutral-600">
            {coords ? (
              <>
                <span className="font-semibold text-neutral-700">
                  {coords[1].toFixed(6)}, {coords[0].toFixed(6)}
                </span>{" "}
                <span className="text-neutral-500">(lat, lng)</span>
              </>
            ) : (
              <span className="text-neutral-500">
                Click on the map to drop a pin.
              </span>
            )}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!coords || update.isPending}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {update.isPending ? "Saving…" : "Save location"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
