"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AppNav } from "@/components/layout/AppNav";
import { spaceColor } from "@/components/demising/DemisingEditor";
import { BuildingPanel } from "@/components/map/BuildingPanel";
import {
  PortfolioMap,
  type PortfolioBuilding,
  type ProjectPinData,
} from "@/components/map/PortfolioMap";
import { NewProjectDrawer } from "@/components/map/NewProjectDrawer";
import type { Bay, FrontageSide } from "@/lib/demising";
import { splitFootprintIntoBays } from "@/lib/geometry";
import { api } from "@/lib/trpc/react";
import type { Polygon } from "geojson";

export default function PortfolioMapPage() {
  const router = useRouter();
  const me = api.auth.me.useQuery(undefined, { retry: false });
  const projectsQuery = api.project.list.useQuery(undefined, {
    retry: false,
    enabled: me.data?.signedIn === true && !!me.data?.orgId,
  });

  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [droppedPin, setDroppedPin] = useState<{ lng: number; lat: number } | null>(null);

  const allProjects = useMemo(
    () =>
      ((projectsQuery.data ?? []) as Array<{
        id: string;
        code: string;
        name: string;
        lat: number | null;
        lng: number | null;
      }>),
    [projectsQuery.data],
  );

  const pins = useMemo<ProjectPinData[]>(() => {
    return allProjects.flatMap((p) => {
      if (p.lat == null || p.lng == null) return [];
      return [
        { id: p.id, code: p.code, name: p.name, lng: p.lng, lat: p.lat },
      ];
    });
  }, [allProjects]);

  const selectedProject = useMemo(
    () => allProjects.find((p) => p.code === selectedCode) ?? null,
    [allProjects, selectedCode],
  );

  const buildingsQuery = api.building.listForMap.useQuery(
    { projectId: selectedProject?.id ?? "" },
    { enabled: Boolean(selectedProject?.id), retry: false },
  );

  type MapBuildingRow = {
    id: string;
    code: string;
    name: string | null;
    footprint_geojson: Polygon | null;
    height_ft: number | null;
    bay: Array<{
      id: string;
      ordinal: number;
      width_ft: number;
      depth_ft: number;
      dock_door_count: number;
      drive_in_count: number;
      has_yard_access: boolean;
      frontage_side: string;
    }>;
    space: Array<{
      id: string;
      code: string;
      status: string;
      space_bay: Array<{ bay_id: string }>;
    }>;
  };

  const buildingMetaById = useMemo(() => {
    const map = new Map<string, { code: string }>();
    for (const b of (buildingsQuery.data ?? []) as MapBuildingRow[]) {
      map.set(b.id, { code: b.code });
    }
    return map;
  }, [buildingsQuery.data]);

  const selectedBuildings = useMemo<PortfolioBuilding[]>(() => {
    if (!selectedProject) return [];
    const rows = (buildingsQuery.data ?? []) as MapBuildingRow[];
    return rows.flatMap((b) => {
      if (!b.footprint_geojson) return [];
      const heightFt = b.height_ft ? Number(b.height_ft) : null;

      const bays: Bay[] = (b.bay ?? []).map((x) => ({
        id: x.id,
        ordinal: x.ordinal,
        widthFt: Number(x.width_ft),
        depthFt: Number(x.depth_ft),
        dockDoorCount: x.dock_door_count,
        driveInCount: x.drive_in_count,
        hasYardAccess: x.has_yard_access,
        frontageSide: x.frontage_side as FrontageSide,
      }));

      // No demising info → render the whole building in one color.
      const hasDemising =
        bays.length > 0 &&
        (b.space ?? []).some((s) => (s.space_bay ?? []).length > 0);
      if (!hasDemising) {
        return [
          {
            id: b.id,
            code: b.code,
            footprint: b.footprint_geojson,
            heightFt,
          },
        ];
      }

      // Map each bay to its owning space's index (used for color).
      const sortedSpaces = [...(b.space ?? [])].sort((a, c) =>
        a.code.localeCompare(c.code),
      );
      const bayIdToSpaceIndex = new Map<string, number>();
      sortedSpaces.forEach((s, i) => {
        for (const sb of s.space_bay ?? []) {
          bayIdToSpaceIndex.set(sb.bay_id, i);
        }
      });

      const polysByBayId = splitFootprintIntoBays(
        b.footprint_geojson,
        bays,
        bays[0]?.frontageSide ?? "S",
      );

      return bays.flatMap((bay) => {
        const poly = polysByBayId[bay.id];
        if (!poly) return [];
        const spaceIndex = bayIdToSpaceIndex.get(bay.id) ?? 0;
        return [
          {
            // Keep the building id on each bay sub-feature so clicking still
            // opens the building's demising panel.
            id: b.id,
            code: `${b.code}-bay${bay.ordinal}`,
            footprint: poly,
            heightFt,
            color: spaceColor(spaceIndex),
          },
        ];
      });
    });
  }, [buildingsQuery.data, selectedProject]);

  const authStatus: "loading" | "signed_out" | "no_org" | "ready" =
    me.isLoading
      ? "loading"
      : me.data?.signedIn === false
        ? "signed_out"
        : !me.data?.orgId
          ? "no_org"
          : "ready";

  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-neutral-200 bg-white px-6 py-4">
        <div className="flex items-center gap-4">
          <AppNav />
          <div>
            <h1 className="text-lg font-semibold">Portfolio</h1>
            <p className="text-sm text-neutral-500">
              Map of all projects across your organization.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setDroppedPin(null);
              setDrawerOpen(true);
            }}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
          >
            New project
          </button>
        </div>
      </header>

      <section className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[360px_1fr]">
        <aside className="relative z-10 overflow-y-auto border-r border-neutral-200 bg-white">
          {authStatus === "loading" ? (
            <p className="p-4 text-sm text-neutral-500">Checking session…</p>
          ) : authStatus === "signed_out" ? (
            <SignedOutBanner />
          ) : authStatus === "no_org" ? (
            <NoOrgBanner />
          ) : projectsQuery.isError ? (
            <p className="p-4 text-sm text-red-600">{projectsQuery.error.message}</p>
          ) : projectsQuery.isLoading ? (
            <p className="p-4 text-sm text-neutral-500">Loading projects…</p>
          ) : allProjects.length === 0 ? (
            <p className="p-4 text-sm text-neutral-500">
              No projects yet. Click &ldquo;New project&rdquo; or click on the
              map to drop your first pin.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {allProjects.map((p) => {
                const hasPin = p.lat != null && p.lng != null;
                const projectUrl = `/app/projects/${p.code}`;
                const editUrl = `/app/projects/${p.code}/edit`;
                return (
                  <li
                    key={p.id}
                    className={`px-4 py-3 ${
                      selectedCode === p.code ? "bg-neutral-100" : ""
                    }`}
                  >
                    <a
                      href={projectUrl}
                      onClick={(e) => {
                        // Belt-and-suspenders: if anything intercepts the
                        // default anchor behavior, force the navigation
                        // explicitly via window.location.
                        if (e.button === 0 && !e.metaKey && !e.ctrlKey) {
                          e.preventDefault();
                          window.location.assign(projectUrl);
                        }
                      }}
                      className="block rounded-md p-2 hover:bg-neutral-50"
                    >
                      <p className="font-mono text-xs text-neutral-500">
                        {p.code}
                      </p>
                      <p className="text-sm font-medium text-neutral-900">
                        {p.name}
                      </p>
                      {!hasPin && (
                        <p className="text-xs text-amber-700">
                          No location yet
                        </p>
                      )}
                      <p className="mt-1 text-xs text-blue-600">
                        Open project →
                      </p>
                    </a>
                    <div className="mt-2 flex gap-2 text-xs">
                      {hasPin && (
                        <button
                          type="button"
                          onClick={() => setSelectedCode(p.code)}
                          className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-neutral-600 hover:bg-neutral-50"
                          title="Fly to on the map"
                        >
                          Locate on map
                        </button>
                      )}
                      <a
                        href={editUrl}
                        onClick={(e) => {
                          if (e.button === 0 && !e.metaKey && !e.ctrlKey) {
                            e.preventDefault();
                            window.location.assign(editUrl);
                          }
                        }}
                        className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-neutral-600 hover:bg-neutral-50"
                      >
                        {hasPin ? "Edit" : "Set location"}
                      </a>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <div className="relative">
          <PortfolioMap
            projects={pins}
            buildings={selectedBuildings}
            selectedCode={selectedCode}
            onSelect={setSelectedCode}
            onSelectBuilding={(id) => setSelectedBuildingId(id)}
            onMapClick={(lngLat) => {
              setDroppedPin(lngLat);
              setDrawerOpen(true);
            }}
            dropMode={drawerOpen}
          />

          {selectedBuildingId && selectedProject && (
            <BuildingPanel
              buildingId={selectedBuildingId}
              projectCode={selectedProject.code}
              buildingCode={
                buildingMetaById.get(selectedBuildingId)?.code ?? ""
              }
              onClose={() => setSelectedBuildingId(null)}
            />
          )}
        </div>
      </section>

      <NewProjectDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        droppedPin={droppedPin}
        onCreated={(code) => setSelectedCode(code)}
      />
    </main>
  );
}

function SignedOutBanner() {
  return (
    <div className="p-4">
      <p className="text-sm font-semibold text-amber-700">You&rsquo;re signed out.</p>
      <p className="mt-1 text-sm text-neutral-600">
        Sign in to view and manage your portfolio.
      </p>
      <div className="mt-4 flex gap-2">
        <Link
          href="/login"
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Sign in
        </Link>
        <Link
          href="/signup"
          className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Create account
        </Link>
      </div>
    </div>
  );
}

function NoOrgBanner() {
  return (
    <div className="p-4">
      <p className="text-sm font-semibold text-amber-700">
        Set up your organization to get started.
      </p>
      <p className="mt-1 text-sm text-neutral-600">
        You&rsquo;re signed in but don&rsquo;t belong to any organization yet.
      </p>
      <Link
        href="/onboarding"
        className="mt-4 inline-block rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
      >
        Continue onboarding
      </Link>
    </div>
  );
}
