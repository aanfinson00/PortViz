"use client";

import { useMemo, useState } from "react";
import { stageMeta } from "@/lib/prospectStages";
import {
  fitSpacesToProspect,
  type FittableSpace,
} from "@/lib/scenarioFit";
import {
  resolveSnapshotSpaces,
  scenarioSnapshotSchema,
  type ScenarioSnapshot,
} from "@/lib/scenarioSnapshot";
import { api } from "@/lib/trpc/react";
import type { ProspectListItem } from "./types";

interface Props {
  prospects: ProspectListItem[];
}

/**
 * Portfolio-wide "Test Fits" panel for /app/leasing. For each active
 * prospect (with a requested_sf set), shows which spaces — drawn from
 * every scenario across every building in the org — fit within ±20%.
 *
 * Implementation: pulls every project's buildings, every building's
 * scenarios, resolves snapshot SFs once, then scans per-prospect via
 * scenarioFit#fitSpacesToProspect. Cost is O(prospects × spaces) in
 * memory after a small number of network calls; fine for portfolios
 * up to mid-hundreds of scenarios.
 */
export function TestFitsSection({ prospects }: Props) {
  const projects = api.project.list.useQuery(undefined, { retry: false });
  const allBuildings = api.building.listAll.useQuery(undefined, {
    retry: false,
    enabled: Boolean(projects.data?.length),
  });
  const allSchemes = api.demising.listAllForOrg.useQuery(undefined, {
    retry: false,
    enabled: Boolean(allBuildings.data?.length),
  });

  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const buildingById = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        code: string;
        project_id: string;
        total_sf: number | null;
        footprint_area_sf: number | null;
        project_code: string;
      }
    >();
    const projectCodeById = new Map<string, string>(
      (projects.data ?? []).map(
        (p: { id: string; code: string }) => [p.id, p.code],
      ),
    );
    for (const b of (allBuildings.data ?? []) as Array<{
      id: string;
      code: string;
      project_id: string;
      total_sf: number | null;
      footprint_area_sf: number | null;
    }>) {
      map.set(b.id, {
        ...b,
        project_code: projectCodeById.get(b.project_id) ?? "—",
      });
    }
    return map;
  }, [allBuildings.data, projects.data]);

  /**
   * Flat list of every (scenario or live) space across the portfolio,
   * each annotated with its parent scenario + building. Spaces from the
   * active scheme are tagged "Live", others as "Scenario".
   */
  const allSpaces: FittableSpace[] = useMemo(() => {
    const out: FittableSpace[] = [];
    for (const scheme of (allSchemes.data ?? []) as Array<{
      id: string;
      name: string;
      is_active: boolean;
      is_scenario: boolean;
      mode: string | null;
      snapshot_data: ScenarioSnapshot | null;
      building_id: string;
    }>) {
      if (!scheme.snapshot_data) continue;
      const parsed = scenarioSnapshotSchema.safeParse(scheme.snapshot_data);
      if (!parsed.success) continue;
      const building = buildingById.get(scheme.building_id);
      if (!building) continue;
      // Slider mode: needs total SF; fall back to building.total_sf.
      const totalSf =
        building.footprint_area_sf ?? building.total_sf ?? 0;
      const resolved = resolveSnapshotSpaces(parsed.data, {
        totalSf,
        bayAreaById: new Map(), // bay-mode skips (most planning is slider).
      });
      for (const r of resolved) {
        if (r.sf <= 0) continue;
        out.push({
          id: `${scheme.id}:${r.id}`,
          code: r.code,
          sf: r.sf,
          buildingId: building.id,
          buildingCode: building.code,
          projectCode: building.project_code,
          scenarioId: scheme.id,
          scenarioName: scheme.name,
        });
      }
    }
    return out;
  }, [allSchemes.data, buildingById]);

  const activeProspects = useMemo(
    () =>
      prospects.filter(
        (p) =>
          p.requested_sf != null &&
          p.requested_sf > 0 &&
          ["prospect", "tour", "rfp", "proposal", "loi", "lease_out"].includes(
            p.stage,
          ),
      ),
    [prospects],
  );

  const matchesByProspect = useMemo(() => {
    const m = new Map<string, ReturnType<typeof fitSpacesToProspect>>();
    for (const p of activeProspects) {
      const fits = fitSpacesToProspect(
        {
          id: p.id,
          name: p.name,
          stage: p.stage,
          requestedSf: p.requested_sf,
          brokerCompany: p.broker_company,
          probabilityPct: p.probability_pct,
        },
        allSpaces,
      );
      m.set(p.id, fits);
    }
    return m;
  }, [activeProspects, allSpaces]);

  if (
    projects.isLoading ||
    allBuildings.isLoading ||
    allSchemes.isLoading
  ) {
    return (
      <section className="rounded-md border border-neutral-200 bg-white p-4 text-sm text-neutral-500">
        Loading portfolio scenarios…
      </section>
    );
  }
  if (allSchemes.isError) {
    return (
      <section className="rounded-md border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700">
        {allSchemes.error.message}
        <br />
        <span className="text-[10px]">
          If &ldquo;column does not exist,&rdquo; apply migration 0015 in Supabase.
        </span>
      </section>
    );
  }

  if (activeProspects.length === 0) {
    return null;
  }

  return (
    <section className="rounded-md border border-neutral-200 bg-white">
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-2">
        <div>
          <h2 className="text-sm font-semibold">Test fits — portfolio</h2>
          <p className="text-[11px] text-neutral-500">
            For each active prospect, scenario spaces across your portfolio
            that match within ±20%.
          </p>
        </div>
        <span className="text-[11px] text-neutral-500">
          {allSpaces.length} space{allSpaces.length === 1 ? "" : "s"} ·{" "}
          {(allSchemes.data ?? []).length} scenario
          {(allSchemes.data ?? []).length === 1 ? "" : "s"}
        </span>
      </header>
      <ul className="divide-y divide-neutral-100">
        {activeProspects.map((p) => {
          const list = matchesByProspect.get(p.id) ?? [];
          const isOpen = expanded.has(p.id);
          const meta = stageMeta(p.stage);
          return (
            <li key={p.id} className="px-4 py-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    if (next.has(p.id)) next.delete(p.id);
                    else next.add(p.id);
                    return next;
                  });
                }}
                className="flex w-full items-center gap-2 text-left"
              >
                <span
                  className={`flex-shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium ${meta.chipClass}`}
                >
                  {meta.shortLabel}
                </span>
                <span className="flex-1 truncate font-medium text-neutral-800">
                  {p.name}
                </span>
                <span className="font-mono text-neutral-500">
                  {p.requested_sf?.toLocaleString()} sf
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    list.length === 0
                      ? "bg-neutral-100 text-neutral-500"
                      : "bg-emerald-100 text-emerald-800"
                  }`}
                >
                  {list.length} fit{list.length === 1 ? "" : "s"}
                </span>
                <span className="text-neutral-400">{isOpen ? "▾" : "▸"}</span>
              </button>
              {isOpen && (
                <ul className="mt-2 flex flex-col gap-1 pl-6">
                  {list.length === 0 && (
                    <li className="text-[10px] text-neutral-400">
                      No portfolio spaces match within ±20%.
                    </li>
                  )}
                  {list.slice(0, 8).map((m) => (
                    <li
                      key={`${p.id}-${m.space.id}`}
                      className="flex items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 text-[10px]"
                    >
                      <span className="font-mono text-neutral-700">
                        {m.space.projectCode}-{m.space.buildingCode}-{m.space.code}
                      </span>
                      <span className="text-neutral-500">
                        in &ldquo;{m.space.scenarioName}&rdquo;
                      </span>
                      <span className="ml-auto font-mono text-neutral-700">
                        {m.space.sf.toLocaleString()} sf
                      </span>
                      <span className="font-mono text-emerald-700">
                        {Math.round(m.score * 100)}%
                      </span>
                      <a
                        href={`/app/projects/${m.space.projectCode}/buildings/${m.space.buildingCode}`}
                        className="text-blue-600 hover:underline"
                      >
                        Open →
                      </a>
                    </li>
                  ))}
                  {list.length > 8 && (
                    <li className="text-[10px] text-neutral-400 pl-2">
                      + {list.length - 8} more
                    </li>
                  )}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
