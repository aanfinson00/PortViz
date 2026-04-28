"use client";

import type { Polygon } from "geojson";
import { useMemo } from "react";
import { spaceColor } from "@/components/demising/DemisingEditor";
import type { Bay } from "@/lib/demising";
import { splitFootprintIntoBays } from "@/lib/geometry";
import { polygonsToSvgPaths } from "@/lib/svgPath";

interface ThumbnailProps {
  footprint: Polygon | null;
  bays: Bay[];
  /** Each entry is one space; ordered as space code asc. */
  spaceBayIds: string[][];
}

/**
 * Compact SVG render of a building's footprint with per-space coloring.
 * Used on building cards in the property dashboard so users can scan
 * demising at a glance without mounting a Mapbox map per row.
 */
export function BuildingThumbnail({
  footprint,
  bays,
  spaceBayIds,
}: ThumbnailProps) {
  const paths = useMemo(() => {
    if (!footprint) return [];

    if (bays.length === 0 || spaceBayIds.length === 0) {
      return polygonsToSvgPaths([{ polygon: footprint, color: "#2563eb" }]);
    }

    // Slice the footprint into bay polygons, color each by owning space.
    const bayPolys = splitFootprintIntoBays(
      footprint,
      bays,
      bays[0]?.frontageSide ?? "S",
    );
    const bayToSpaceIndex = new Map<string, number>();
    spaceBayIds.forEach((ids, i) => {
      for (const id of ids) bayToSpaceIndex.set(id, i);
    });

    const inputs = bays
      .map((bay) => {
        const polygon = bayPolys[bay.id];
        if (!polygon) return null;
        const idx = bayToSpaceIndex.get(bay.id) ?? 0;
        return { polygon, color: spaceColor(idx) };
      })
      .filter((x): x is { polygon: Polygon; color: string } => x !== null);

    return polygonsToSvgPaths(inputs, 120, 80, 6);
  }, [footprint, bays, spaceBayIds]);

  if (paths.length === 0) {
    return (
      <div className="flex h-20 w-30 items-center justify-center rounded-md bg-neutral-100 text-[10px] text-neutral-400">
        No footprint
      </div>
    );
  }

  return (
    <svg
      viewBox="0 0 120 80"
      className="h-20 w-30 rounded-md bg-neutral-50"
      role="img"
      aria-label="Building footprint with demising"
    >
      {paths.map((p, i) => (
        <path
          key={i}
          d={p.path}
          fill={p.color}
          fillOpacity={0.85}
          stroke="#111827"
          strokeWidth={0.5}
        />
      ))}
    </svg>
  );
}
