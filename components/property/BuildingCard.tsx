"use client";

import type { Polygon } from "geojson";
import Link from "next/link";
import { spaceColor } from "@/components/demising/DemisingEditor";
import { BuildingThumbnail } from "@/components/property/BuildingThumbnail";
import { toastError, toastSuccess } from "@/components/ui/Toaster";
import type { Bay } from "@/lib/demising";
import { spaceSf, type SpaceForMetrics } from "@/lib/propertyMetrics";
import { api } from "@/lib/trpc/react";

interface BuildingCardProps {
  projectCode: string;
  projectId: string;
  building: {
    id: string;
    code: string;
    name: string | null;
    totalSf: number;
    footprint: Polygon | null;
    bays: Bay[];
    spaces: Array<
      SpaceForMetrics & {
        code: string;
        status: string;
        tenantColor: string | null;
        tenantName: string | null;
      }
    >;
  };
  /** Spaces in this building that have an active lease today. */
  activeSpaceIds: Set<string>;
}

/**
 * One row of the property dashboard's buildings grid. Shows an SVG thumbnail
 * with per-space coloring (when demised), key stats, and a tenant ribbon
 * underneath that visualizes how the building is currently demised + who
 * each space belongs to.
 */
export function BuildingCard({
  projectCode,
  projectId,
  building,
  activeSpaceIds,
}: BuildingCardProps) {
  const utils = api.useUtils();
  const remove = api.building.delete.useMutation({
    onSuccess: () => {
      utils.building.listByProject.invalidate({ projectId });
      utils.building.listForMap.invalidate({ projectId });
      toastSuccess(`Deleted ${projectCode}-${building.code}`);
    },
    onError: (e) => toastError(e.message),
  });

  const sortedSpaces = [...building.spaces].sort((a, b) =>
    a.code.localeCompare(b.code),
  );
  const totalDemisedSf = sortedSpaces.reduce(
    (acc, s) => acc + spaceSf(s, building.bays),
    0,
  );
  const leasedSf = sortedSpaces
    .filter((s) => activeSpaceIds.has(s.id))
    .reduce((acc, s) => acc + spaceSf(s, building.bays), 0);
  const occupancyPct =
    building.totalSf > 0
      ? Math.round((leasedSf / building.totalSf) * 100)
      : 0;

  function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (
      !confirm(
        `Delete ${projectCode}-${building.code}? This removes its bays, spaces, leases, and document records. Cannot be undone.`,
      )
    ) {
      return;
    }
    remove.mutate({ id: building.id });
  }

  return (
    <Link
      href={`/app/projects/${projectCode}/buildings/${building.code}`}
      className="flex flex-col gap-3 rounded-md border border-neutral-200 bg-white p-4 hover:border-neutral-300 hover:shadow-sm"
    >
      <div className="flex items-start gap-4">
        <BuildingThumbnail
          footprint={building.footprint}
          bays={building.bays}
          spaceBayIds={sortedSpaces.map((s) => s.bayIds)}
        />
        <div className="flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-mono text-xs text-neutral-500">
                {projectCode}-{building.code}
              </p>
              <p className="text-sm font-semibold text-neutral-900">
                {building.name ?? `Building ${building.code}`}
              </p>
            </div>
            <button
              type="button"
              onClick={handleDelete}
              disabled={remove.isPending}
              className="rounded-md border border-red-200 bg-white px-2 py-0.5 text-[11px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              {remove.isPending ? "…" : "Delete"}
            </button>
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <Stat label="Total SF" value={building.totalSf.toLocaleString()} />
            <Stat label="Spaces" value={String(sortedSpaces.length)} />
            <Stat label="Occupancy" value={`${occupancyPct}%`} />
            <Stat
              label="Demised SF"
              value={totalDemisedSf.toLocaleString()}
            />
          </dl>
        </div>
      </div>

      {sortedSpaces.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-neutral-100">
            {sortedSpaces.map((s, i) => {
              const sf = spaceSf(s, building.bays);
              const widthPct =
                totalDemisedSf > 0 ? (sf / totalDemisedSf) * 100 : 0;
              return (
                <span
                  key={s.id}
                  title={`${s.code} — ${sf.toLocaleString()} SF${
                    s.tenantName ? ` · ${s.tenantName}` : ""
                  }`}
                  style={{
                    width: `${widthPct}%`,
                    background: s.tenantColor ?? spaceColor(i),
                  }}
                />
              );
            })}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-neutral-500">
            {sortedSpaces.map((s, i) => (
              <span key={s.id} className="flex items-center gap-1">
                <span
                  className="inline-block h-2 w-2 rounded-sm"
                  style={{
                    background: s.tenantColor ?? spaceColor(i),
                  }}
                />
                {s.code}
                {s.tenantName ? ` · ${s.tenantName}` : ""}
              </span>
            ))}
          </div>
        </div>
      )}
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
