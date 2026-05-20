"use client";

import { useMemo } from "react";
import {
  computePropertyMetrics,
  type BuildingForMetrics,
} from "@/lib/propertyMetrics";
import {
  resolveSnapshotSpaces,
  type ScenarioSnapshot,
} from "@/lib/scenarioSnapshot";
import { api } from "@/lib/trpc/react";

interface Props {
  buildingId: string;
  totalSf: number;
  bayAreaById: Map<string, number>;
  snapshot: ScenarioSnapshot;
}

/**
 * Side-by-side "Scenario vs Live" metric strip. Live metrics come from
 * the building's current spaces + active leases; scenario metrics from
 * the in-progress snapshot. Reuses computePropertyMetrics so the
 * computation is byte-identical to the property dashboard's KPI strip.
 *
 * Lease assumption: any space whose code exists in BOTH live and scenario
 * is considered "would-be-leased" in the scenario (tenant stays put).
 * New space codes are assumed vacant. Brokers can override mentally; we
 * don't try to predict tenant rollover.
 */
export function ScenarioCompare({
  buildingId,
  totalSf,
  bayAreaById,
  snapshot,
}: Props) {
  const liveSpaces = api.space.listByBuilding.useQuery(
    { buildingId },
    { retry: false },
  );
  const leases = api.lease.rentRoll.useQuery(
    { buildingId },
    { retry: false },
  );

  const live = useMemo(() => {
    const spaces = (liveSpaces.data ?? []) as Array<{
      id: string;
      code: string;
      target_sf: number | null;
      space_bay: { bay_id: string }[] | null;
    }>;
    const bays = Array.from(bayAreaById.entries()).map(([id, area]) => ({
      id,
      // Stored as a single number; expose as widthFt with depthFt=1 so
      // spaceSf() multiplies to the same area.
      widthFt: area,
      depthFt: 1,
    }));
    const building: BuildingForMetrics = {
      id: buildingId,
      totalSf,
      bays,
      spaces: spaces.map((s) => ({
        id: s.id,
        targetSf: s.target_sf,
        bayIds: (s.space_bay ?? []).map((sb) => sb.bay_id),
      })),
    };
    const activeSpaceIds = new Set<string>();
    const today = new Date().toISOString().slice(0, 10);
    for (const sp of (leases.data ?? []) as Array<{
      id: string;
      lease: Array<{ start_date: string; end_date: string }> | null;
    }>) {
      const hasActive = (sp.lease ?? []).some(
        (l) => l.start_date <= today && l.end_date >= today,
      );
      if (hasActive) activeSpaceIds.add(sp.id);
    }
    return {
      metrics: computePropertyMetrics([building], activeSpaceIds),
      leasedCodes: new Set(
        spaces
          .filter((s) => activeSpaceIds.has(s.id))
          .map((s) => s.code.toUpperCase()),
      ),
    };
  }, [liveSpaces.data, leases.data, buildingId, totalSf, bayAreaById]);

  const scenarioMetrics = useMemo(() => {
    const resolved = resolveSnapshotSpaces(snapshot, {
      totalSf,
      bayAreaById,
    });
    const scenarioBuilding: BuildingForMetrics = {
      id: buildingId,
      totalSf,
      bays: [],
      spaces: resolved.map((r) => ({
        id: r.id,
        targetSf: r.sf,
        bayIds: [],
      })),
    };
    const leasedScenarioSpaceIds = new Set(
      resolved
        .filter((r) => live.leasedCodes.has(r.code.toUpperCase()))
        .map((r) => r.id),
    );
    return computePropertyMetrics([scenarioBuilding], leasedScenarioSpaceIds);
  }, [snapshot, totalSf, bayAreaById, buildingId, live.leasedCodes]);

  return (
    <section className="border-b border-neutral-200 px-6 py-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Scenario vs live
      </h3>
      <p className="mt-0.5 text-[10px] text-neutral-500">
        Spaces with matching codes are assumed leased to the same tenant in the
        scenario. New codes count as vacant.
      </p>
      <div className="mt-2 grid grid-cols-4 gap-2 text-xs">
        <CompareTile
          label="Total SF"
          live={live.metrics.totalSf}
          scenario={scenarioMetrics.totalSf}
          format="sf"
        />
        <CompareTile
          label="Spaces"
          live={live.metrics.spaceCount}
          scenario={scenarioMetrics.spaceCount}
          format="count"
        />
        <CompareTile
          label="Leased SF"
          live={live.metrics.leasedSf}
          scenario={scenarioMetrics.leasedSf}
          format="sf"
        />
        <CompareTile
          label="Occupancy"
          live={live.metrics.occupancyPct}
          scenario={scenarioMetrics.occupancyPct}
          format="pct"
        />
      </div>
    </section>
  );
}

function CompareTile({
  label,
  live,
  scenario,
  format,
}: {
  label: string;
  live: number;
  scenario: number;
  format: "sf" | "pct" | "count";
}) {
  const delta = scenario - live;
  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1.5">
      <p className="text-[9px] uppercase tracking-wide text-neutral-500">
        {label}
      </p>
      <p className="font-mono text-sm text-neutral-900">
        {fmt(scenario, format)}
      </p>
      <p className="text-[10px] text-neutral-500">
        live {fmt(live, format)}
      </p>
      <p
        className={`text-[10px] font-medium ${
          Math.abs(delta) < 1
            ? "text-neutral-400"
            : delta > 0
              ? "text-emerald-700"
              : "text-rose-700"
        }`}
      >
        {Math.abs(delta) < 1 ? "—" : `${delta > 0 ? "+" : ""}${fmt(delta, format)}`}
      </p>
    </div>
  );
}

function fmt(n: number, kind: "sf" | "pct" | "count"): string {
  if (kind === "pct") return `${n.toFixed(1)}%`;
  if (kind === "count") return Math.round(n).toString();
  return Math.round(n).toLocaleString();
}
