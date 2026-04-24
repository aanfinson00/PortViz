"use client";

import type { Polygon } from "geojson";
import Link from "next/link";
import { use, useMemo } from "react";
import {
  BuildingExtrusionMap,
  type BuildingGeom,
} from "@/components/map/BuildingExtrusionMap";
import { api } from "@/lib/trpc/react";

function centroid(polygon: Polygon): [number, number] | null {
  const ring = polygon.coordinates[0];
  if (!ring || ring.length === 0) return null;
  let sx = 0;
  let sy = 0;
  for (const [x, y] of ring) {
    sx += x;
    sy += y;
  }
  return [sx / ring.length, sy / ring.length];
}

export default function BuildingDetailPage({
  params,
}: {
  params: Promise<{ projectCode: string; buildingCode: string }>;
}) {
  const { projectCode, buildingCode } = use(params);
  const query = api.building.byCompositeId.useQuery(
    {
      projectCode: projectCode.toUpperCase(),
      buildingCode: buildingCode.toUpperCase(),
    },
    { retry: false },
  );

  const building = query.data?.building;
  const project = query.data?.project;

  const footprint: Polygon | null = useMemo(() => {
    const fp = building?.footprint_geojson;
    if (!fp) return null;
    // Stored as jsonb; asserts to Polygon shape validated server-side.
    return fp as Polygon;
  }, [building?.footprint_geojson]);

  const center = useMemo(() => {
    if (!footprint) return null;
    return centroid(footprint);
  }, [footprint]);

  const mapBuildings: BuildingGeom[] = useMemo(() => {
    if (!building || !footprint) return [];
    return [
      {
        id: building.id,
        code: building.code,
        name: building.name,
        footprint,
        heightFt: building.height_ft ? Number(building.height_ft) : null,
        color: "#2563eb",
      },
    ];
  }, [building, footprint]);

  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-4">
        <div>
          {project && (
            <Link
              href={`/app/projects/${project.code}`}
              className="text-sm text-blue-600 hover:underline"
            >
              ← {project.code}
            </Link>
          )}
          <h1 className="mt-1 text-lg font-semibold">
            {project?.code}
            {building?.code ? `-${building.code}` : ""}
            {building?.name ? ` · ${building.name}` : ""}
          </h1>
          {building && (
            <p className="text-sm text-neutral-500">
              {building.total_sf
                ? `${building.total_sf.toLocaleString()} SF`
                : "SF not set"}
              {building.height_ft ? ` · ${building.height_ft} ft tall` : ""}
              {building.clear_height_ft
                ? ` · ${building.clear_height_ft} ft clear`
                : ""}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            disabled
            className="rounded-md bg-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-500"
            title="Demising editor lands in Phase 4"
          >
            Demising editor
          </button>
        </div>
      </header>

      {query.isLoading && (
        <p className="p-6 text-sm text-neutral-500">Loading building…</p>
      )}
      {query.isError && (
        <p className="p-6 text-sm text-red-600">{query.error.message}</p>
      )}

      {building && (
        <section className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[360px_1fr]">
          <aside className="overflow-y-auto border-r border-neutral-200 bg-white p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
              Bays
            </h2>
            <p className="mt-2 text-sm text-neutral-500">
              Bays and the demising editor land in Phase 4. Once bays are
              defined you&rsquo;ll be able to group them into spaces and see
              how SF, frontage, dock doors, and parking redistribute live.
            </p>

            <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-neutral-500">
              Stats
            </h2>
            <dl className="mt-2 space-y-2 text-sm">
              <Stat label="Code" value={`${project?.code}-${building.code}`} />
              <Stat
                label="Office SF"
                value={
                  building.office_sf
                    ? Number(building.office_sf).toLocaleString()
                    : "—"
                }
              />
              <Stat
                label="Warehouse SF"
                value={
                  building.warehouse_sf
                    ? Number(building.warehouse_sf).toLocaleString()
                    : "—"
                }
              />
              <Stat
                label="Clear height"
                value={building.clear_height_ft ? `${building.clear_height_ft} ft` : "—"}
              />
              <Stat
                label="Year built"
                value={building.year_built ?? "—"}
              />
            </dl>
          </aside>

          <div className="relative">
            {center ? (
              <BuildingExtrusionMap
                center={center}
                buildings={mapBuildings}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-neutral-100 text-sm text-neutral-500">
                No footprint on file — draw one by creating a new building
                with the polygon tool.
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-neutral-100 py-1.5">
      <dt className="text-xs uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
