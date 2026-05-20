"use client";

import { useMemo, useState } from "react";
import {
  formatDate,
  formatPsf,
  formatSf,
  PROSPECT_SOURCE_LABELS,
  stageMeta,
} from "@/lib/prospectStages";
import type { ProspectListItem } from "./types";

interface Props {
  prospects: ProspectListItem[];
  onOpen: (p: ProspectListItem) => void;
}

type SortKey =
  | "name"
  | "stage"
  | "requested_sf"
  | "asking_rent_psf"
  | "target_commencement"
  | "last_activity_date"
  | "probability_pct";

const STAGE_ORDER: Record<string, number> = {
  prospect: 1,
  tour: 2,
  rfp: 3,
  proposal: 4,
  loi: 5,
  lease_out: 6,
  executed: 7,
  on_hold: 8,
  dead: 9,
};

/**
 * Tabular view of the pipeline — full attribute coverage with sortable
 * columns. Designed for the screens brokers actually have to scan when
 * reporting to ownership.
 */
export function ProspectTable({ prospects, onOpen }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("last_activity_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const arr = [...prospects];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "stage":
          cmp = (STAGE_ORDER[a.stage] ?? 99) - (STAGE_ORDER[b.stage] ?? 99);
          break;
        case "requested_sf":
          cmp = (a.requested_sf ?? 0) - (b.requested_sf ?? 0);
          break;
        case "asking_rent_psf":
          cmp =
            (a.proposed_rent_psf ?? a.asking_rent_psf ?? 0) -
            (b.proposed_rent_psf ?? b.asking_rent_psf ?? 0);
          break;
        case "target_commencement":
          cmp = (a.target_commencement ?? "").localeCompare(
            b.target_commencement ?? "",
          );
          break;
        case "last_activity_date":
          cmp = (a.last_activity_date ?? a.updated_at).localeCompare(
            b.last_activity_date ?? b.updated_at,
          );
          break;
        case "probability_pct":
          cmp = (a.probability_pct ?? 0) - (b.probability_pct ?? 0);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [prospects, sortKey, sortDir]);

  function handleSort(k: SortKey) {
    if (sortKey === k) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir(k === "name" ? "asc" : "desc");
    }
  }

  return (
    <div className="overflow-x-auto rounded-md border border-neutral-200 bg-white">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <Th onClick={() => handleSort("name")} active={sortKey === "name"} dir={sortDir}>
              Prospect
            </Th>
            <Th onClick={() => handleSort("stage")} active={sortKey === "stage"} dir={sortDir}>
              Stage
            </Th>
            <th className="px-3 py-2">Property</th>
            <Th
              onClick={() => handleSort("requested_sf")}
              active={sortKey === "requested_sf"}
              dir={sortDir}
              align="right"
            >
              SF
            </Th>
            <Th
              onClick={() => handleSort("asking_rent_psf")}
              active={sortKey === "asking_rent_psf"}
              dir={sortDir}
              align="right"
            >
              Rent
            </Th>
            <th className="px-3 py-2 text-right">Term</th>
            <Th
              onClick={() => handleSort("target_commencement")}
              active={sortKey === "target_commencement"}
              dir={sortDir}
            >
              Target Comm.
            </Th>
            <Th
              onClick={() => handleSort("probability_pct")}
              active={sortKey === "probability_pct"}
              dir={sortDir}
              align="right"
            >
              Prob
            </Th>
            <th className="px-3 py-2">Broker</th>
            <th className="px-3 py-2">Source</th>
            <Th
              onClick={() => handleSort("last_activity_date")}
              active={sortKey === "last_activity_date"}
              dir={sortDir}
            >
              Last Activity
            </Th>
            <th className="px-3 py-2">Next Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {sorted.length === 0 && (
            <tr>
              <td colSpan={12} className="px-3 py-12 text-center text-sm text-neutral-400">
                No prospects yet. Add one with &ldquo;New prospect&rdquo; or upload an Excel file.
              </td>
            </tr>
          )}
          {sorted.map((p) => {
            const meta = stageMeta(p.stage);
            const rent = p.proposed_rent_psf ?? p.asking_rent_psf;
            return (
              <tr
                key={p.id}
                onClick={() => onOpen(p)}
                className="cursor-pointer hover:bg-neutral-50"
              >
                <td className="px-3 py-2">
                  <p className="font-medium text-neutral-900">{p.name}</p>
                  {p.code && (
                    <p className="font-mono text-[10px] text-neutral-400">
                      {p.code}
                    </p>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-block rounded border px-2 py-0.5 text-[11px] font-medium ${meta.chipClass}`}
                  >
                    {meta.label}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-neutral-600">
                  {p.project ? (
                    <>
                      {p.project.code}
                      {p.building && `-${p.building.code}`}
                      {p.space && `-${p.space.code}`}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs">
                  {formatSf(p.requested_sf)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs">
                  {formatPsf(rent)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs">
                  {p.term_months ? `${p.term_months}mo` : "—"}
                </td>
                <td className="px-3 py-2 text-xs text-neutral-600">
                  {formatDate(p.target_commencement)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs">
                  {p.probability_pct == null ? "—" : `${p.probability_pct}%`}
                </td>
                <td className="px-3 py-2 text-xs text-neutral-600">
                  {p.broker_company ? (
                    <>
                      <div>{p.broker_company}</div>
                      {p.broker_name && (
                        <div className="text-neutral-400">{p.broker_name}</div>
                      )}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-neutral-600">
                  {p.source ? PROSPECT_SOURCE_LABELS[p.source] ?? p.source : "—"}
                </td>
                <td className="px-3 py-2 text-xs text-neutral-600">
                  {formatDate(p.last_activity_date)}
                </td>
                <td className="px-3 py-2 text-xs text-neutral-600">
                  {p.next_action ? (
                    <>
                      <div className="line-clamp-2 max-w-[20rem]">{p.next_action}</div>
                      {p.next_action_date && (
                        <div className="text-amber-700">
                          {formatDate(p.next_action_date)}
                        </div>
                      )}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  onClick,
  active,
  dir,
  align = "left",
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  dir: "asc" | "desc";
  align?: "left" | "right";
}) {
  return (
    <th
      onClick={onClick}
      className={`cursor-pointer select-none px-3 py-2 hover:text-neutral-900 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
      {active && <span className="ml-1 text-[10px]">{dir === "asc" ? "▲" : "▼"}</span>}
    </th>
  );
}
