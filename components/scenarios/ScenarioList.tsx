"use client";

import { useState } from "react";
import { toastError, toastSuccess } from "@/components/ui/Toaster";
import { api } from "@/lib/trpc/react";
import { resolveSnapshotSpaces } from "@/lib/scenarioSnapshot";
import type { SchemeRow } from "./types";

interface Props {
  buildingId: string;
  /** Polygon-derived total SF; used for slider snapshot resolution. */
  totalSf: number;
  /** Bay id → area lookup; used for bay snapshot resolution. */
  bayAreaById: Map<string, number>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onNew: () => void;
}

/**
 * Scenarios panel — lists the active layout + draft scenarios for a
 * building. Click a row to open it in the editor. Active row is pinned
 * at the top with a green badge; everything else is a draft scenario.
 */
export function ScenarioList({
  buildingId,
  totalSf,
  bayAreaById,
  selectedId,
  onSelect,
  onNew,
}: Props) {
  const utils = api.useUtils();
  const schemes = api.demising.listSchemes.useQuery(
    { buildingId },
    { retry: false },
  );

  const applyScheme = api.demising.applyScheme.useMutation({
    onSuccess: async () => {
      toastSuccess("Scenario applied to live spaces");
      await Promise.all([
        utils.demising.listSchemes.invalidate({ buildingId }),
        utils.space.listByBuilding.invalidate({ buildingId }),
        utils.building.listForMap.invalidate(),
      ]);
    },
    onError: (e) => toastError(e.message),
  });
  const duplicate = api.demising.duplicateScheme.useMutation({
    onSuccess: async (data) => {
      toastSuccess(`Duplicated as "${data.name}"`);
      await utils.demising.listSchemes.invalidate({ buildingId });
      onSelect(data.id);
    },
    onError: (e) => toastError(e.message),
  });
  const remove = api.demising.deleteScheme.useMutation({
    onSuccess: async () => {
      toastSuccess("Scenario deleted");
      await utils.demising.listSchemes.invalidate({ buildingId });
      onSelect(null);
    },
    onError: (e) => toastError(e.message),
  });

  const rows = (schemes.data ?? []) as SchemeRow[];

  return (
    <div className="flex flex-col gap-2">
      <header className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Scenarios
        </h3>
        <button
          type="button"
          onClick={onNew}
          className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-[11px] font-medium hover:bg-neutral-50"
        >
          + New scenario
        </button>
      </header>

      {schemes.isLoading && (
        <p className="text-xs text-neutral-400">Loading…</p>
      )}
      {schemes.isError && (
        <p className="text-xs text-rose-600">
          {schemes.error.message}
          <br />
          <span className="text-[10px]">
            If you see &ldquo;column does not exist,&rdquo; apply migration
            0015 in Supabase.
          </span>
        </p>
      )}
      {schemes.data && rows.length === 0 && (
        <p className="text-xs text-neutral-400">
          No scenarios yet. Click &ldquo;New scenario&rdquo; to sketch an
          alternate layout without touching the live spaces.
        </p>
      )}

      <ul className="flex flex-col gap-1">
        {rows.map((row) => {
          const isSelected = row.id === selectedId;
          const resolved = row.snapshot_data
            ? resolveSnapshotSpaces(row.snapshot_data, { totalSf, bayAreaById })
            : [];
          const sumSf = resolved.reduce((acc, r) => acc + r.sf, 0);
          return (
            <li
              key={row.id}
              className={`rounded-md border px-2 py-1.5 text-xs ${
                isSelected
                  ? "border-neutral-900 bg-neutral-50"
                  : "border-neutral-200 bg-white"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(row.id)}
                className="flex w-full items-center justify-between text-left"
              >
                <span className="flex-1 truncate font-medium text-neutral-800">
                  {row.name}
                </span>
                {row.is_active && (
                  <span className="ml-2 flex-shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-800">
                    Live
                  </span>
                )}
                {row.is_scenario && (
                  <span className="ml-2 flex-shrink-0 rounded bg-sky-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-sky-800">
                    Draft
                  </span>
                )}
              </button>
              <div className="mt-1 flex items-center justify-between text-[10px] text-neutral-500">
                <span>
                  {resolved.length} space{resolved.length === 1 ? "" : "s"}
                  {sumSf > 0 ? ` · ${sumSf.toLocaleString()} sf` : ""}
                </span>
                <span className="font-mono">
                  {row.mode ?? "—"}
                </span>
              </div>
              {row.description && (
                <p className="mt-1 line-clamp-2 text-[10px] text-neutral-500">
                  {row.description}
                </p>
              )}
              {isSelected && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {!row.is_active && row.is_scenario && (
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Apply "${row.name}" to live spaces? This will overwrite the current demising for this building.`,
                          )
                        ) {
                          applyScheme.mutate({ id: row.id });
                        }
                      }}
                      disabled={applyScheme.isPending}
                      className="rounded-md bg-neutral-900 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
                    >
                      Apply to live
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const newName = window.prompt(
                        "New scenario name:",
                        `${row.name} copy`,
                      );
                      if (newName) {
                        duplicate.mutate({ id: row.id, newName });
                      }
                    }}
                    disabled={duplicate.isPending}
                    className="rounded-md border border-neutral-300 bg-white px-2 py-0.5 text-[10px] font-medium hover:bg-neutral-50 disabled:opacity-50"
                  >
                    Duplicate
                  </button>
                  {!row.is_active && (
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Delete "${row.name}"? This cannot be undone.`,
                          )
                        ) {
                          remove.mutate({ id: row.id });
                        }
                      }}
                      disabled={remove.isPending}
                      className="rounded-md border border-rose-200 bg-white px-2 py-0.5 text-[10px] font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
