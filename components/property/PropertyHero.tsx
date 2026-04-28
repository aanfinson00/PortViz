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

  const center = useMemo<[number, number] | null>(() => {
    if (mapBuildings.length > 0) {
      const ring = mapBuildings[0]!.footprint!.coordinates[0]!;
      const sum = ring.reduce(
        (acc, [x, y]) => [acc[0] + x, acc[1] + y] as [number, number],
        [0, 0] as [number, number],
      );
      return [sum[0] / ring.length, sum[1] / ring.length];
    }
    return fallbackCenter ?? null;
  }, [mapBuildings, fallbackCenter]);

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
      <BuildingExtrusionMap center={center} buildings={mapBuildings} />
    </div>
  );
}
