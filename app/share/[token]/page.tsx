"use client";

import type { Polygon } from "geojson";
import { use, useMemo } from "react";
import {
  BuildingExtrusionMap,
  type BuildingGeom,
} from "@/components/map/BuildingExtrusionMap";
import { api } from "@/lib/trpc/react";

/**
 * Public, token-gated read-only view of a project. Anyone with the URL sees
 * the project's buildings in 3D; no auth required. Powered by
 * share.byToken which uses the service-role client under the hood, so
 * SUPABASE_SERVICE_ROLE_KEY must be set.
 */
export default function SharedProjectPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const query = api.share.byToken.useQuery({ token }, { retry: false });

  const data = query.data;

  const mapBuildings: BuildingGeom[] = useMemo(() => {
    if (!data) return [];
    return (data.buildings ?? []).flatMap(
      (b: {
        id: string;
        code: string;
        name: string | null;
        footprint_geojson: Polygon | null;
        height_ft: number | null;
      }) => {
        if (!b.footprint_geojson) return [];
        return [
          {
            id: b.id,
            code: b.code,
            name: b.name,
            footprint: b.footprint_geojson,
            heightFt: b.height_ft ? Number(b.height_ft) : null,
            color: "#2563eb",
          },
        ];
      },
    );
  }, [data]);

  const center = useMemo((): [number, number] | null => {
    if (data?.project.lng != null && data.project.lat != null) {
      return [data.project.lng, data.project.lat];
    }
    const fp = mapBuildings[0]?.footprint;
    if (fp) {
      const ring = fp.coordinates[0]!;
      const sum = ring.reduce(
        (acc, [x, y]) => [acc[0] + x, acc[1] + y] as [number, number],
        [0, 0] as [number, number],
      );
      return [sum[0] / ring.length, sum[1] / ring.length];
    }
    return null;
  }, [data, mapBuildings]);

  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-4">
        {data ? (
          <div>
            <p className="font-mono text-xs text-neutral-500">
              {data.project.code}
            </p>
            <h1 className="text-lg font-semibold">{data.project.name}</h1>
            {data.project.address && (
              <p className="text-sm text-neutral-500">{data.project.address}</p>
            )}
          </div>
        ) : (
          <h1 className="text-lg font-semibold">Shared project</h1>
        )}
        <span className="rounded-full border border-neutral-200 px-3 py-1 text-xs text-neutral-500">
          Read-only share
        </span>
      </header>

      <section className="relative flex-1">
        {query.isLoading && (
          <p className="p-6 text-sm text-neutral-500">Loading shared project…</p>
        )}
        {query.isError && (
          <p className="p-6 text-sm text-red-600">{query.error.message}</p>
        )}
        {data && center ? (
          <BuildingExtrusionMap center={center} buildings={mapBuildings} />
        ) : (
          data && (
            <div className="flex h-full w-full items-center justify-center text-sm text-neutral-500">
              No footprints to display yet.
            </div>
          )
        )}
      </section>
    </main>
  );
}
