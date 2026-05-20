"use client";

import { useMemo } from "react";
import { stageMeta } from "@/lib/prospectStages";
import {
  DEFAULT_TOLERANCE_PCT,
  fitProspectsToSpaces,
  type FittableProspect,
  type FittableSpace,
} from "@/lib/scenarioFit";
import { type ResolvedSnapshotSpace } from "@/lib/scenarioSnapshot";
import { api } from "@/lib/trpc/react";

interface Props {
  resolvedSpaces: ResolvedSnapshotSpace[];
  tolerancePct?: number;
}

/**
 * Per-space test-fit panel. For each space in the scenario, hits
 * `leasingProspect.fitCandidates` with a widened SF range (server-side
 * is loose; this component filters strictly with tolerancePct), then
 * runs scenarioFit#fitProspectsToSpaces locally.
 *
 * Server side returns all candidates whose requested_sf overlaps the
 * scenario's overall SF envelope; we re-bucket per space in JS so the
 * caller only pays for one query regardless of how many spaces the
 * scenario has.
 */
export function TestFitList({
  resolvedSpaces,
  tolerancePct = DEFAULT_TOLERANCE_PCT,
}: Props) {
  const sfBounds = useMemo(() => {
    const sfs = resolvedSpaces
      .map((s) => s.sf)
      .filter((sf) => sf > 0);
    if (sfs.length === 0) return null;
    const tol = tolerancePct / 100;
    return [
      Math.floor(Math.min(...sfs) * (1 - tol)),
      Math.ceil(Math.max(...sfs) * (1 + tol)),
    ] as [number, number];
  }, [resolvedSpaces, tolerancePct]);

  const candidates = api.leasingProspect.fitCandidates.useQuery(
    { sfRange: sfBounds ?? [0, 0], activeOnly: true },
    { enabled: !!sfBounds, retry: false },
  );

  const matches = useMemo(() => {
    if (!candidates.data || resolvedSpaces.length === 0) {
      return new Map<string, ReturnType<typeof fitProspectsToSpaces>>().get(
        "",
      );
    }
    const fittableSpaces: FittableSpace[] = resolvedSpaces.map((s) => ({
      id: s.id,
      code: s.code,
      sf: s.sf,
    }));
    const fittableProspects: FittableProspect[] = (
      candidates.data as Array<{
        id: string;
        name: string;
        stage: string;
        requested_sf: number | null;
        broker_company: string | null;
        probability_pct: number | null;
      }>
    ).map((p) => ({
      id: p.id,
      name: p.name,
      stage: p.stage,
      requestedSf: p.requested_sf,
      brokerCompany: p.broker_company,
      probabilityPct: p.probability_pct,
    }));
    return fitProspectsToSpaces(fittableSpaces, fittableProspects, {
      tolerancePct,
    });
  }, [candidates.data, resolvedSpaces, tolerancePct]);

  const totalMatches = useMemo(() => {
    if (!matches) return 0;
    let n = 0;
    matches.forEach((arr) => (n += arr.length));
    return n;
  }, [matches]);

  return (
    <section className="border-b border-neutral-200 px-6 py-3">
      <header className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Test fits — pipeline prospects
        </h3>
        <span className="text-[10px] text-neutral-500">
          ±{tolerancePct}% · {totalMatches} match{totalMatches === 1 ? "" : "es"}
        </span>
      </header>
      {candidates.isLoading && (
        <p className="mt-2 text-[11px] text-neutral-400">Searching pipeline…</p>
      )}
      {candidates.isError && (
        <p className="mt-2 text-[11px] text-rose-600">
          {candidates.error.message}
        </p>
      )}
      {candidates.data && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {resolvedSpaces.map((s) => {
            const list = matches?.get(s.id) ?? [];
            return (
              <li
                key={s.id}
                className="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1.5"
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-mono font-semibold">
                    {s.code} · {s.sf.toLocaleString()} sf
                  </span>
                  <span className="text-neutral-500">
                    {list.length} match{list.length === 1 ? "" : "es"}
                  </span>
                </div>
                {list.length === 0 ? (
                  <p className="mt-1 text-[10px] text-neutral-400">
                    No active prospects in this SF range.
                  </p>
                ) : (
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {list.slice(0, 5).map((m) => {
                      const meta = stageMeta(m.prospect.stage);
                      return (
                        <li
                          key={m.prospect.id}
                          className="flex items-center gap-2 text-[10px]"
                        >
                          <span
                            className={`rounded border px-1 py-0.5 font-medium ${meta.chipClass}`}
                          >
                            {meta.shortLabel}
                          </span>
                          <span className="flex-1 truncate text-neutral-800">
                            {m.prospect.name}
                          </span>
                          <span className="font-mono text-neutral-500">
                            {m.prospect.requestedSf?.toLocaleString()} sf
                          </span>
                          <span className="font-mono text-emerald-700">
                            {Math.round(m.score * 100)}%
                          </span>
                        </li>
                      );
                    })}
                    {list.length > 5 && (
                      <li className="text-[10px] text-neutral-400">
                        + {list.length - 5} more
                      </li>
                    )}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
