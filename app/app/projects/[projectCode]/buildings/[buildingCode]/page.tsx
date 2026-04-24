"use client";

import type { Polygon } from "geojson";
import Link from "next/link";
import { use, useCallback, useMemo, useState } from "react";
import {
  BayQuickSetup,
  DemisingEditor,
  spaceColor,
} from "@/components/demising/DemisingEditor";
import {
  BuildingExtrusionMap,
  type BuildingGeom,
} from "@/components/map/BuildingExtrusionMap";
import type { Bay, FrontageSide, SpaceGroup } from "@/lib/demising";
import { splitFootprintIntoBays } from "@/lib/geometry";
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

  const baysQuery = api.bay.listByBuilding.useQuery(
    { buildingId: building?.id ?? "" },
    { enabled: Boolean(building?.id), retry: false },
  );

  const bays: Bay[] = useMemo(
    () =>
      (baysQuery.data ?? []).map(
        (b: {
          id: string;
          ordinal: number;
          width_ft: number;
          depth_ft: number;
          dock_door_count: number;
          drive_in_count: number;
          has_yard_access: boolean;
          frontage_side: string;
        }) => ({
          id: b.id,
          ordinal: b.ordinal,
          widthFt: Number(b.width_ft),
          depthFt: Number(b.depth_ft),
          dockDoorCount: b.dock_door_count,
          driveInCount: b.drive_in_count,
          hasYardAccess: b.has_yard_access,
          frontageSide: b.frontage_side as FrontageSide,
        }),
      ),
    [baysQuery.data],
  );

  const [groups, setGroups] = useState<SpaceGroup[]>([]);
  const handleGroupsChange = useCallback((next: SpaceGroup[]) => {
    setGroups(next);
  }, []);

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

  const bayPolygons = useMemo(() => {
    if (!footprint || bays.length === 0) return {};
    const frontage = bays[0]?.frontageSide ?? "S";
    return splitFootprintIntoBays(footprint, bays, frontage);
  }, [footprint, bays]);

  const mapBuildings: BuildingGeom[] = useMemo(() => {
    if (!building || !footprint) return [];

    // If we have bays and demising groups, render one extrusion per bay
    // colored by its owning space. Otherwise fall back to the single
    // footprint extrusion.
    if (bays.length > 0 && groups.length > 0 && Object.keys(bayPolygons).length > 0) {
      const heightFt = building.height_ft ? Number(building.height_ft) : null;
      const bayIdToGroupIndex = new Map<string, number>();
      groups.forEach((g, i) => {
        for (const id of g.bayIds) bayIdToGroupIndex.set(id, i);
      });
      return bays.flatMap((bay) => {
        const poly = bayPolygons[bay.id];
        if (!poly) return [];
        const idx = bayIdToGroupIndex.get(bay.id) ?? 0;
        return [
          {
            id: bay.id,
            code: `bay-${bay.ordinal}`,
            name: `Bay ${bay.ordinal}`,
            footprint: poly,
            heightFt,
            color: spaceColor(idx),
          },
        ];
      });
    }

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
  }, [building, footprint, bays, groups, bayPolygons]);

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
              Demising
            </h2>

            {bays.length === 0 ? (
              <div className="mt-3">
                <BayQuickSetup buildingId={building.id} />
              </div>
            ) : (
              <div className="mt-3 flex flex-col gap-4">
                <DemisingEditor
                  buildingId={building.id}
                  bays={bays}
                  totalCarParking={0}
                  totalTrailerParking={0}
                  onChange={handleGroupsChange}
                />
                <details className="text-xs text-neutral-500">
                  <summary className="cursor-pointer">Reset bay grid</summary>
                  <div className="mt-2">
                    <BayQuickSetup buildingId={building.id} />
                  </div>
                </details>
              </div>
            )}

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
