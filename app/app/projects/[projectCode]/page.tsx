"use client";

import type { Polygon } from "geojson";
import Link from "next/link";
import { use, useMemo, useState } from "react";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { DocumentUpload } from "@/components/docs/DocumentUpload";
import { RentRoll } from "@/components/lease/RentRoll";
import { BuildingCard } from "@/components/property/BuildingCard";
import { ExpirationsList } from "@/components/property/ExpirationsList";
import { KPIStrip } from "@/components/property/KPIStrip";
import { PropertyHero } from "@/components/property/PropertyHero";
import { PropertyTabs } from "@/components/property/PropertyTabs";
import { TenantsList } from "@/components/property/TenantsList";
import { toastError, toastSuccess } from "@/components/ui/Toaster";
import type { Bay, FrontageSide } from "@/lib/demising";
import {
  computePropertyMetrics,
  spaceSf,
  type BuildingForMetrics,
} from "@/lib/propertyMetrics";
import { api } from "@/lib/trpc/react";

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
    target_sf: number | null;
    space_bay: Array<{ bay_id: string }>;
  }>;
};

type LeaseRow = {
  id: string;
  space_id: string;
  start_date: string;
  end_date: string;
  base_rent_psf: number | null;
  tenant: {
    id: string;
    code: string;
    name: string;
    brand_color: string | null;
  } | { id: string; code: string; name: string; brand_color: string | null }[] | null;
};

function firstTenant(t: LeaseRow["tenant"]) {
  if (!t) return null;
  return Array.isArray(t) ? (t[0] ?? null) : t;
}

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectCode: string }>;
}) {
  const { projectCode } = use(params);
  const project = api.project.byCode.useQuery(
    { code: projectCode.toUpperCase() },
    { retry: false },
  );

  const projectId = project.data?.id ?? "";
  const enabled = Boolean(project.data?.id);

  const buildingsQuery = api.building.listForMap.useQuery(
    { projectId },
    { enabled, retry: false },
  );
  const buildingsListQuery = api.building.listByProject.useQuery(
    { projectId },
    { enabled, retry: false },
  );
  const leasesQuery = api.lease.activeByProject.useQuery(
    { projectId },
    { enabled, retry: false },
  );

  // Total SF from the listByProject query (has the generated total_sf column);
  // structure + bays from listForMap. Merge by id.
  const totalSfById = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of buildingsListQuery.data ?? []) {
      m.set(
        (b as { id: string }).id,
        Number((b as { total_sf: number | null }).total_sf ?? 0),
      );
    }
    return m;
  }, [buildingsListQuery.data]);

  const heroBuildings = useMemo(() => {
    return ((buildingsQuery.data ?? []) as MapBuildingRow[]).map((b) => ({
      id: b.id,
      code: b.code,
      name: b.name,
      footprint: b.footprint_geojson,
      heightFt: b.height_ft ? Number(b.height_ft) : null,
    }));
  }, [buildingsQuery.data]);

  const activeLeases = (leasesQuery.data ?? []) as LeaseRow[];
  const activeSpaceIds = useMemo(
    () => new Set(activeLeases.map((l) => l.space_id)),
    [activeLeases],
  );

  const buildingsForMetrics: BuildingForMetrics[] = useMemo(() => {
    return ((buildingsQuery.data ?? []) as MapBuildingRow[]).map((b) => ({
      id: b.id,
      totalSf: totalSfById.get(b.id) ?? 0,
      bays: b.bay.map((x) => ({
        id: x.id,
        widthFt: Number(x.width_ft),
        depthFt: Number(x.depth_ft),
      })),
      spaces: b.space.map((s) => ({
        id: s.id,
        targetSf: s.target_sf,
        bayIds: s.space_bay.map((sb) => sb.bay_id),
      })),
    }));
  }, [buildingsQuery.data, totalSfById]);

  const metrics = useMemo(
    () => computePropertyMetrics(buildingsForMetrics, activeSpaceIds),
    [buildingsForMetrics, activeSpaceIds],
  );

  // Build the per-card data: bays + spaces with their tenant info merged in.
  type SpaceWithTenant = {
    id: string;
    code: string;
    status: string;
    targetSf: number | null;
    bayIds: string[];
    tenantColor: string | null;
    tenantName: string | null;
  };
  const cards = useMemo(() => {
    return ((buildingsQuery.data ?? []) as MapBuildingRow[]).map((b) => {
      const bays: Bay[] = b.bay.map((x) => ({
        id: x.id,
        ordinal: x.ordinal,
        widthFt: Number(x.width_ft),
        depthFt: Number(x.depth_ft),
        dockDoorCount: x.dock_door_count,
        driveInCount: x.drive_in_count,
        hasYardAccess: x.has_yard_access,
        frontageSide: x.frontage_side as FrontageSide,
      }));
      const spaces: SpaceWithTenant[] = b.space.map((s) => {
        const lease = activeLeases.find((l) => l.space_id === s.id);
        const tenant = lease ? firstTenant(lease.tenant) : null;
        return {
          id: s.id,
          code: s.code,
          status: s.status,
          targetSf: s.target_sf,
          bayIds: s.space_bay.map((sb) => sb.bay_id),
          tenantColor: tenant?.brand_color ?? null,
          tenantName: tenant?.name ?? null,
        };
      });
      return {
        id: b.id,
        code: b.code,
        name: b.name,
        totalSf: totalSfById.get(b.id) ?? 0,
        footprint: b.footprint_geojson,
        bays,
        spaces,
      };
    });
  }, [buildingsQuery.data, activeLeases, totalSfById]);

  const tenantsRollup = useMemo(() => {
    const acc = new Map<
      string,
      {
        id: string;
        code: string;
        name: string;
        brandColor: string | null;
        totalSf: number;
        spaceCount: number;
      }
    >();
    for (const card of cards) {
      for (const s of card.spaces) {
        if (!s.tenantName) continue;
        const sf = spaceSf(s, card.bays);
        const lease = activeLeases.find((l) => l.space_id === s.id);
        const tenant = lease ? firstTenant(lease.tenant) : null;
        if (!tenant) continue;
        const existing = acc.get(tenant.id) ?? {
          id: tenant.id,
          code: tenant.code,
          name: tenant.name,
          brandColor: tenant.brand_color,
          totalSf: 0,
          spaceCount: 0,
        };
        existing.totalSf += sf;
        existing.spaceCount += 1;
        acc.set(tenant.id, existing);
      }
    }
    return Array.from(acc.values());
  }, [cards, activeLeases]);

  const expirationLeases = useMemo(() => {
    const buildingByIdToCode = new Map<string, string>();
    const spaceById = new Map<string, { code: string; buildingId: string }>();
    for (const b of (buildingsQuery.data ?? []) as MapBuildingRow[]) {
      buildingByIdToCode.set(b.id, b.code);
      for (const s of b.space) {
        spaceById.set(s.id, { code: s.code, buildingId: b.id });
      }
    }
    return activeLeases.flatMap((l) => {
      const sp = spaceById.get(l.space_id);
      if (!sp) return [];
      const buildingCode = buildingByIdToCode.get(sp.buildingId);
      const tenant = firstTenant(l.tenant);
      if (!tenant || !buildingCode) return [];
      return [
        {
          id: l.id,
          endDate: l.end_date,
          spaceCode: sp.code,
          buildingCode,
          projectCode: project.data?.code ?? "",
          tenantName: tenant.name,
          tenantColor: tenant.brand_color,
          baseRentPsf: l.base_rent_psf,
        },
      ];
    });
  }, [activeLeases, buildingsQuery.data, project.data?.code]);

  const expiringIn12moCount = useMemo(() => {
    const today = new Date();
    const cutoff = new Date(today);
    cutoff.setMonth(cutoff.getMonth() + 12);
    return expirationLeases.filter((l) => {
      const end = new Date(l.endDate);
      return end >= today && end <= cutoff;
    }).length;
  }, [expirationLeases]);

  const fallbackCenter: [number, number] | null =
    project.data?.lng != null && project.data?.lat != null
      ? [project.data.lng, project.data.lat]
      : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-8">
      <Breadcrumb
        crumbs={[
          {
            label: projectCode.toUpperCase(),
            href: `/app/projects/${projectCode.toUpperCase()}`,
          },
        ]}
      />

      {project.isLoading && (
        <p className="text-sm text-neutral-500">Loading property…</p>
      )}

      {project.isError && (
        <p className="text-sm text-red-600">
          Couldn&rsquo;t load property. {project.error.message}
        </p>
      )}

      {project.data === null && (
        <p className="text-sm text-neutral-500">
          No project with code{" "}
          <code className="rounded bg-neutral-100 px-1 py-0.5 text-xs">
            {projectCode.toUpperCase()}
          </code>
          .
        </p>
      )}

      {project.data && (
        <>
          {/* Identity + actions */}
          <header className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-xs text-neutral-500">
                {project.data.code}
              </p>
              <h1 className="text-3xl font-bold tracking-tight">
                {project.data.name}
              </h1>
              {project.data.address && (
                <p className="mt-1 text-sm text-neutral-600">
                  {project.data.address}
                </p>
              )}
              {project.data.lat == null && (
                <p className="mt-2 text-xs text-amber-700">
                  No location pin set yet — open Edit to drop one on the map.
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/app/projects/${project.data.code}/buildings/from-plan`}
                className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Trace from site plan
              </Link>
              <Link
                href={`/app/projects/${project.data.code}/buildings/new`}
                className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
              >
                Add building
              </Link>
              <Link
                href={`/app/projects/${project.data.code}/edit`}
                className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Edit
              </Link>
            </div>
          </header>

          {project.data.description && (
            <p className="max-w-3xl text-sm text-neutral-700">
              {project.data.description}
            </p>
          )}

          {/* Hero 3D site view */}
          <PropertyHero
            buildings={heroBuildings}
            fallbackCenter={fallbackCenter}
          />

          {/* Headline KPIs */}
          <KPIStrip metrics={metrics} />

          {/* Buildings grid + tabs */}
          <section className="grid grid-cols-1 gap-6 lg:grid-cols-[3fr_2fr]">
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Buildings</h2>
                {cards.length > 0 && (
                  <p className="text-xs text-neutral-500">
                    Click a card for the full demising editor
                  </p>
                )}
              </div>
              {buildingsQuery.isLoading ? (
                <p className="text-sm text-neutral-500">Loading buildings…</p>
              ) : cards.length === 0 ? (
                <div className="rounded-md border border-dashed border-neutral-300 bg-neutral-50 p-6 text-center text-sm text-neutral-500">
                  No buildings yet. Use{" "}
                  <Link
                    href={`/app/projects/${project.data.code}/buildings/new`}
                    className="text-blue-600 hover:underline"
                  >
                    Add building
                  </Link>{" "}
                  or{" "}
                  <Link
                    href={`/app/projects/${project.data.code}/buildings/from-plan`}
                    className="text-blue-600 hover:underline"
                  >
                    Trace from site plan
                  </Link>{" "}
                  to populate this property.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {cards.map((c) => (
                    <BuildingCard
                      key={c.id}
                      projectCode={project.data!.code}
                      projectId={project.data!.id}
                      building={c}
                      activeSpaceIds={activeSpaceIds}
                    />
                  ))}
                </div>
              )}
            </div>

            <div>
              <PropertyTabs
                badges={{
                  expirations: expiringIn12moCount
                    ? String(expiringIn12moCount)
                    : undefined,
                  tenants: tenantsRollup.length
                    ? String(tenantsRollup.length)
                    : undefined,
                }}
              >
                {{
                  rent_roll: (
                    <ProjectRentRoll
                      projectCode={project.data.code}
                      buildings={
                        ((buildingsQuery.data ?? []) as MapBuildingRow[]).map(
                          (b) => ({ id: b.id, code: b.code }),
                        )
                      }
                    />
                  ),
                  expirations: <ExpirationsList leases={expirationLeases} />,
                  tenants: <TenantsList tenants={tenantsRollup} />,
                  documents: (
                    <DocumentUpload
                      entityType="project"
                      entityId={project.data.id}
                    />
                  ),
                }}
              </PropertyTabs>
            </div>
          </section>

          <ShareLinks projectId={project.data.id} />
        </>
      )}
    </main>
  );
}

/**
 * Stack a RentRoll per building so the tab shows the whole property in
 * order. Lighter than building a new server-side rollup; reuses the existing
 * RentRoll component as-is.
 */
function ProjectRentRoll({
  projectCode,
  buildings,
}: {
  projectCode: string;
  buildings: { id: string; code: string }[];
}) {
  if (buildings.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        No buildings yet — add one to start populating the rent roll.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {buildings.map((b) => (
        <div key={b.id}>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
            {projectCode}-{b.code}
          </p>
          <RentRoll
            buildingId={b.id}
            projectCode={projectCode}
            buildingCode={b.code}
          />
        </div>
      ))}
    </div>
  );
}

function ShareLinks({ projectId }: { projectId: string }) {
  const utils = api.useUtils();
  const list = api.share.listForProject.useQuery(
    { projectId },
    { retry: false },
  );
  const create = api.share.create.useMutation({
    onSuccess: () => {
      utils.share.listForProject.invalidate({ projectId });
      toastSuccess("Share link created");
    },
    onError: (e) => toastError(e.message),
  });
  const revoke = api.share.revoke.useMutation({
    onSuccess: () => {
      utils.share.listForProject.invalidate({ projectId });
      toastSuccess("Share link revoked");
    },
    onError: (e) => toastError(e.message),
  });
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(url: string) {
    await navigator.clipboard.writeText(url);
    setCopied(url);
    setTimeout(() => setCopied(null), 1500);
  }

  const origin =
    typeof window !== "undefined" ? window.location.origin : "";

  return (
    <section className="rounded-md border border-neutral-200 bg-neutral-50 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Public share links</h2>
          <p className="text-xs text-neutral-500">
            Anyone with one of these URLs can view this project&rsquo;s
            buildings in 3D, read-only.
          </p>
        </div>
        <button
          onClick={() => create.mutate({ projectId })}
          disabled={create.isPending}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {create.isPending ? "Generating…" : "New share link"}
        </button>
      </div>

      {list.data && list.data.length > 0 && (
        <ul className="mt-3 divide-y divide-neutral-100 rounded-md border border-neutral-200 bg-white">
          {list.data.map(
            (s: {
              id: string;
              token: string;
              created_at: string;
              revoked_at: string | null;
            }) => {
              const url = `${origin}/share/${s.token}`;
              return (
                <li
                  key={s.id}
                  className="flex items-center gap-3 px-3 py-2 text-xs"
                >
                  <code className="flex-1 truncate rounded bg-neutral-100 px-2 py-1">
                    {url}
                  </code>
                  {s.revoked_at ? (
                    <span className="text-red-600">revoked</span>
                  ) : (
                    <>
                      <button
                        onClick={() => copy(url)}
                        className="text-blue-600 hover:underline"
                      >
                        {copied === url ? "Copied" : "Copy"}
                      </button>
                      <button
                        onClick={() => revoke.mutate({ shareId: s.id })}
                        className="text-red-600 hover:underline"
                      >
                        Revoke
                      </button>
                    </>
                  )}
                </li>
              );
            },
          )}
        </ul>
      )}
    </section>
  );
}
