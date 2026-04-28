"use client";

import type { Polygon } from "geojson";
import { useMemo } from "react";
import {
  BuildingExtrusionMap,
  type BuildingGeom,
} from "@/components/map/BuildingExtrusionMap";

interface PropertyHeroProps {
  buildings: Array<{
    id: string;
    code: string;
    name: string | null;
    footprint: Polygon | null;
    heightFt: number | null;
  }>;
  fallbackCenter?: [number, number] | null;
}

/**
 * Full-width 3D site view at the top of the property page. Renders all of
 * the project's buildings (with footprints) as fill-extrusions on Mapbox.
 * Falls back to a static placeholder when there are no footprints to show.
 */
export function PropertyHero({ buildings, fallbackCenter }: PropertyHeroProps) {
  const mapBuildings: BuildingGeom[] = useMemo(
    () =>
      buildings.flatMap((b) => {
        if (!b.footprint) return [];
        return [
          {
            id: b.id,
            code: b.code,
            name: b.name,
            footprint: b.footprint,
            heightFt: b.heightFt,
            color: "#2563eb",
          },
        ];
      }),
    [buildings],
  );

  // Union bbox across every building's footprint. Powers fitBounds so multi-
  // building properties don't hide buildings 2..N off-screen.
  const bounds = useMemo<[[number, number], [number, number]] | null>(() => {
    if (mapBuildings.length === 0) return null;
    let w = Infinity;
    let s = Infinity;
    let e = -Infinity;
    let n = -Infinity;
    for (const b of mapBuildings) {
      for (const ring of b.footprint!.coordinates) {
        for (const [x, y] of ring) {
          if (x < w) w = x;
          if (x > e) e = x;
          if (y < s) s = y;
          if (y > n) n = y;
        }
      }
    }
    return Number.isFinite(w) ? [[w, s], [e, n]] : null;
  }, [mapBuildings]);

  const center = useMemo<[number, number] | null>(() => {
    if (bounds) {
      return [
        (bounds[0][0] + bounds[1][0]) / 2,
        (bounds[0][1] + bounds[1][1]) / 2,
      ];
    }
    return fallbackCenter ?? null;
  }, [bounds, fallbackCenter]);

  if (!center) {
    return (
      <div className="flex h-72 w-full items-center justify-center rounded-md border border-dashed border-neutral-300 bg-neutral-50 text-sm text-neutral-500">
        No location or footprint to show. Set the property location, then add a
        building.
      </div>
    );
  }

  return (
    <div className="h-72 w-full overflow-hidden rounded-md border border-neutral-200">
      <BuildingExtrusionMap
        center={center}
        buildings={mapBuildings}
        bounds={bounds}
      />
    </div>
  );
}
