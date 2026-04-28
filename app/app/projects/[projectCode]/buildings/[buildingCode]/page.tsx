"use client";

import type { Polygon } from "geojson";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useMemo, useState } from "react";
import {
  BayQuickSetup,
  DemisingEditor,
  spaceColor,
} from "@/components/demising/DemisingEditor";
import {
  SliderDemisingEditor,
  type EditableSpace,
} from "@/components/demising/SliderDemisingEditor";
import { RentRoll } from "@/components/lease/RentRoll";
import {
  BuildingExtrusionMap,
  type BuildingGeom,
  type OverlayLayer,
} from "@/components/map/BuildingExtrusionMap";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { AmenitiesPanel } from "@/components/property/amenities/AmenitiesPanel";
import { toastError, toastSuccess } from "@/components/ui/Toaster";
import type { Bay, FrontageSide, SpaceGroup } from "@/lib/demising";
import {
  sliceFootprintByArea,
  type FrontageAxis,
} from "@/lib/footprintSlicer";
import {
  lightenColor,
  placeCornerOffice,
  type OfficeCorner,
} from "@/lib/officeBuildout";
import { polygonAreaSqFt } from "@/lib/polygonArea";
import { resolveSpaces } from "@/lib/sliderDemising";
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
  const router = useRouter();
  const { projectCode, buildingCode } = use(params);
  const utils = api.useUtils();
  const remove = api.building.delete.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.building.listByProject.invalidate(),
        utils.building.listForMap.invalidate(),
      ]);
      toastSuccess("Building deleted");
      router.push(`/app/projects/${projectCode.toUpperCase()}`);
      router.refresh();
    },
    onError: (e) => toastError(e.message),
  });
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

  const spacesQuery = api.space.listByBuilding.useQuery(
    { buildingId: building?.id ?? "" },
    { enabled: Boolean(building?.id), retry: false },
  );

  const initialGroups: SpaceGroup[] = useMemo(() => {
    const rows = spacesQuery.data ?? [];
    return rows
      .map(
        (s: {
          id: string;
          code: string;
          space_bay: { bay_id: string }[] | null;
        }) => ({
          id: s.id,
          code: s.code,
          bayIds: (s.space_bay ?? []).map((sb) => sb.bay_id),
        }),
      )
      .filter((g) => g.bayIds.length > 0);
  }, [spacesQuery.data]);

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
  // Live slider-mode preview: SliderDemisingEditor publishes its current
  // space layout up to here so the building map can render slabs on the
  // fly while the user is dragging walls (before Save).
  const [sliderSpaces, setSliderSpaces] = useState<EditableSpace[]>([]);
  const handleSliderChange = useCallback((next: EditableSpace[]) => {
    setSliderSpaces(next);
  }, []);
  // Toggle for the structural column-grid overlay (bay outlines), shown
  // when the building has bays defined regardless of demising mode.
  const [showColumnGrid, setShowColumnGrid] = useState(true);

  const demisingMode: "bays" | "sliders" =
    ((building as { demising_mode?: string } | undefined)?.demising_mode ===
    "sliders"
      ? "sliders"
      : "bays") as "bays" | "sliders";

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

  const totalSfFromPolygon = useMemo(
    () => (footprint ? polygonAreaSqFt(footprint) : 0),
    [footprint],
  );

  const sliderFrontage: FrontageAxis = useMemo(
    () => (bays[0]?.frontageSide as FrontageAxis | undefined) ?? "S",
    [bays],
  );

  // Column-grid fractions for the slider bar's structural overlay. Cumulative
  // bay-width sums normalized to total width; first/last (0 and 1) are
  // dropped so the SliderBar renders only interior column boundaries.
  const columnGridFractions = useMemo<number[]>(() => {
    if (bays.length === 0) return [];
    const sorted = [...bays].sort((a, b) => a.ordinal - b.ordinal);
    const total = sorted.reduce((acc, b) => acc + b.widthFt, 0);
    if (total <= 0) return [];
    const out: number[] = [];
    let cum = 0;
    for (let i = 0; i < sorted.length - 1; i++) {
      cum += sorted[i]!.widthFt;
      out.push(cum / total);
    }
    return out;
  }, [bays]);

  // Slice each space's slab into office (front strip) + warehouse (rest)
  // based on the per-space office_depth_ft. This drives both the 3D map
  // (one extrusion per zone) and the editor's per-row SF readout.
  const sliderResolved = useMemo(
    () =>
      demisingMode === "sliders" && footprint && sliderSpaces.length > 0
        ? resolveSpaces(sliderSpaces, totalSfFromPolygon)
        : [],
    [demisingMode, footprint, sliderSpaces, totalSfFromPolygon],
  );

  const sliderSlabs = useMemo(() => {
    if (!footprint || sliderResolved.length === 0) return [];
    return sliceFootprintByArea(
      footprint,
      sliderFrontage,
      sliderResolved.map((r) => r.sf),
    );
  }, [footprint, sliderFrontage, sliderResolved]);

  const sliderOfficeBreakdown = useMemo(() => {
    const out: Record<string, { officeSf: number; warehouseSf: number }> = {};
    sliderResolved.forEach((r, i) => {
      const slab = sliderSlabs[i];
      if (!slab) return;
      const split = placeCornerOffice({
        slab,
        side: sliderFrontage,
        officeSf: r.officeSf ?? null,
        corner: r.officeCorner ?? "front-left",
      });
      out[r.id] = {
        officeSf: split.officeSf,
        warehouseSf: split.warehouseSf,
      };
    });
    return out;
  }, [sliderResolved, sliderSlabs, sliderFrontage]);

  const mapBuildings: BuildingGeom[] = useMemo(() => {
    if (!building || !footprint) return [];
    const heightFt = building.height_ft ? Number(building.height_ft) : null;

    // Slider mode: slice the footprint by the current resolved space SFs
    // (live, even before save). Each space splits into warehouse parts
    // (the L-shape complement of the office) plus an optional office
    // extrusion anchored to the chosen corner. When officeSf is null /
    // 0, the slab is rendered as a single warehouse extrusion.
    if (demisingMode === "sliders" && sliderResolved.length > 0) {
      const out: BuildingGeom[] = [];
      sliderResolved.forEach((r, i) => {
        const slab = sliderSlabs[i] ?? footprint;
        const split = placeCornerOffice({
          slab,
          side: sliderFrontage,
          officeSf: r.officeSf ?? null,
          corner: (r.officeCorner ?? "front-left") as OfficeCorner,
        });
        const baseColor = spaceColor(i);
        // Warehouse parts: 0..2 axis-aligned rectangles tiling the slab
        // minus the office bbox.
        split.warehouseParts.forEach((part, partIdx) => {
          out.push({
            id: `slab-${r.id}-wh-${partIdx}`,
            code: `${i}-wh-${partIdx}`,
            name: `Space ${i + 1} (warehouse)`,
            footprint: part,
            heightFt,
            color: baseColor,
          });
        });
        if (split.office) {
          // Offices typically have a suspended ceiling around 12-16 ft
          // even when the warehouse clear height is 30+ ft. Render the
          // office at a lower height to surface that distinction in 3D.
          // Floor at 14 ft so it reads as office regardless of building
          // height; falls back to the building height when smaller.
          const buildingHeight = building.height_ft
            ? Number(building.height_ft)
            : null;
          const officeHeight = Math.min(14, buildingHeight ?? 14);
          out.push({
            id: `slab-${r.id}-of`,
            code: `${i}-of`,
            name: `Space ${i + 1} (office)`,
            footprint: split.office,
            heightFt: officeHeight,
            color: lightenColor(baseColor, 0.5),
          });
        }
      });
      return out;
    }

    // Legacy bay mode: one extrusion per bay colored by its owning space.
    if (
      demisingMode === "bays" &&
      bays.length > 0 &&
      groups.length > 0 &&
      Object.keys(bayPolygons).length > 0
    ) {
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
        heightFt,
        color: "#2563eb",
      },
    ];
  }, [
    building,
    footprint,
    bays,
    groups,
    bayPolygons,
    demisingMode,
    sliderResolved,
    sliderSlabs,
    sliderFrontage,
  ]);

  // Column grid: render bay outlines as a line layer on top of whatever
  // the demising rendering is. Visible when the user has set up bays —
  // structural metadata, not tied to demising_mode.
  const overlayLayers: OverlayLayer[] | undefined = useMemo(() => {
    if (!showColumnGrid || Object.keys(bayPolygons).length === 0) return [];
    const features = Object.values(bayPolygons).map((geometry) => ({
      type: "Feature" as const,
      geometry,
      properties: {},
    }));
    return [
      {
        id: "portviz-column-grid",
        type: "line",
        placement: "above",
        data: { type: "FeatureCollection", features },
        paint: {
          "line-color": "#ffffff",
          "line-width": 1,
          "line-opacity": 0.6,
          "line-dasharray": [4, 3],
        },
      },
    ];
  }, [bayPolygons, showColumnGrid]);

  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-4">
        <div>
          <Breadcrumb
            crumbs={
              project
                ? [
                    {
                      label: project.code,
                      href: `/app/projects/${project.code}`,
                    },
                    {
                      label: building?.code ?? buildingCode.toUpperCase(),
                    },
                  ]
                : []
            }
          />
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
          {building && (
            <button
              type="button"
              onClick={() => {
                if (
                  confirm(
                    `Delete ${project?.code}-${building.code}? This removes its bays, spaces, leases, and document records. Cannot be undone.`,
                  )
                ) {
                  remove.mutate({ id: building.id });
                }
              }}
              disabled={remove.isPending}
              className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              {remove.isPending ? "Deleting…" : "Delete building"}
            </button>
          )}
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
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
                Demising
              </h2>
              <ModeToggle
                buildingId={building.id}
                mode={demisingMode}
              />
            </div>

            {demisingMode === "sliders" ? (
              <div className="mt-3 flex flex-col gap-4">
                <SliderDemisingEditor
                  buildingId={building.id}
                  totalSf={Math.round(totalSfFromPolygon)}
                  initialSpaces={(spacesQuery.data ?? []).map(
                    (s: {
                      id: string;
                      code: string;
                      position_order: number | null;
                      target_sf: number | null;
                      is_pinned: boolean | null;
                      office_sf: number | null;
                      office_corner: string | null;
                    }) => ({
                      id: s.id,
                      code: s.code,
                      position_order: s.position_order,
                      target_sf: s.target_sf,
                      is_pinned: s.is_pinned,
                      office_sf: s.office_sf,
                      office_corner: s.office_corner,
                    }),
                  )}
                  onChange={handleSliderChange}
                  officeBreakdown={sliderOfficeBreakdown}
                  columnGridFractions={columnGridFractions}
                />
                <details className="text-xs text-neutral-500">
                  <summary className="cursor-pointer">
                    Column grid{" "}
                    {bays.length > 0 ? `(${bays.length} bays)` : "(not set)"}
                  </summary>
                  <p className="mt-1.5 text-[11px] text-neutral-500">
                    Column spacing is structural metadata — it does not
                    affect demising in slider mode, but the grid renders as
                    a faint overlay on the 3D view.
                  </p>
                  <div className="mt-2">
                    <BayQuickSetup buildingId={building.id} />
                  </div>
                </details>
              </div>
            ) : bays.length === 0 ? (
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
                  initialGroups={initialGroups}
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

            <div className="mt-6">
              <AmenitiesPanel
                buildingId={building.id}
                initialTruckCourtDepthFt={
                  building.truck_court_depth_ft ?? null
                }
              />
            </div>
          </aside>

          <div className="flex flex-col overflow-hidden">
            <div className="relative min-h-[55%] flex-1">
              {center ? (
                <>
                  <BuildingExtrusionMap
                    center={center}
                    buildings={mapBuildings}
                    overlayLayers={overlayLayers}
                  />
                  {Object.keys(bayPolygons).length > 0 && (
                    <label className="absolute left-3 top-3 z-10 flex cursor-pointer items-center gap-2 rounded-md border border-neutral-200 bg-white/95 px-2 py-1 text-[11px] text-neutral-700 shadow-sm backdrop-blur">
                      <input
                        type="checkbox"
                        checked={showColumnGrid}
                        onChange={(e) => setShowColumnGrid(e.target.checked)}
                        className="h-3 w-3"
                      />
                      Column grid
                    </label>
                  )}
                </>
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-neutral-100 text-sm text-neutral-500">
                  No footprint on file — draw one by creating a new building
                  with the polygon tool.
                </div>
              )}
            </div>
            <div className="overflow-y-auto border-t border-neutral-200 bg-neutral-50 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
                Rent roll
              </h3>
              <div className="mt-3">
                <RentRoll
                  buildingId={building.id}
                  projectCode={project?.code ?? ""}
                  buildingCode={building.code}
                />
              </div>
            </div>
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

/**
 * Compact toggle that flips a building between bay-based and slider-based
 * demising. The mutation is best-effort; on success, the parent page
 * refetches via byCompositeId invalidation and re-renders the right
 * editor for the new mode.
 */
function ModeToggle({
  buildingId,
  mode,
}: {
  buildingId: string;
  mode: "bays" | "sliders";
}) {
  const utils = api.useUtils();
  const setMode = api.building.setDemisingMode.useMutation({
    onSuccess: async () => {
      await utils.building.byCompositeId.invalidate();
      toastSuccess(`Switched to ${mode === "bays" ? "slider" : "bay"} mode`);
    },
    onError: (e) => toastError(e.message),
  });
  const next = mode === "bays" ? "sliders" : "bays";
  return (
    <button
      type="button"
      onClick={() => setMode.mutate({ id: buildingId, mode: next })}
      disabled={setMode.isPending}
      className="rounded-md border border-neutral-300 bg-white px-2 py-0.5 text-[10px] font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
      title={`Switch to ${next} mode`}
    >
      {setMode.isPending
        ? "…"
        : mode === "sliders"
          ? "Sliders ▾"
          : "Bays ▾"}
    </button>
  );
}
