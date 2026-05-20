"use client";

import { useMemo, useState } from "react";
import { PROSPECT_STAGE_META, stageMeta } from "@/lib/prospectStages";
import { ProspectCard } from "./ProspectCard";
import type { ProspectListItem } from "./types";

interface Props {
  prospects: ProspectListItem[];
  onOpen: (p: ProspectListItem) => void;
  onMove: (p: ProspectListItem, toStage: string) => void;
  hideTerminal: boolean;
}

/**
 * Kanban-style pipeline view. One column per stage; cards are draggable
 * between columns to drive stage transitions. Standard interaction model
 * for VTS-style deal boards.
 *
 * Terminal columns (dead / on_hold) are hidden by default to keep the
 * board focused on active deals — toggle in the page header.
 */
export function ProspectPipeline({
  prospects,
  onOpen,
  onMove,
  hideTerminal,
}: Props) {
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  const byStage = useMemo(() => {
    const m: Record<string, ProspectListItem[]> = {};
    for (const meta of PROSPECT_STAGE_META) m[meta.key] = [];
    for (const p of prospects) {
      (m[p.stage] ??= []).push(p);
    }
    // Within a column, sort by last_activity_date desc, falling back to
    // updated_at — most-recently-touched on top.
    for (const list of Object.values(m)) {
      list.sort((a, b) => {
        const da = a.last_activity_date ?? a.updated_at;
        const db = b.last_activity_date ?? b.updated_at;
        return db.localeCompare(da);
      });
    }
    return m;
  }, [prospects]);

  const visibleStages = useMemo(
    () =>
      hideTerminal
        ? PROSPECT_STAGE_META.filter(
            (m) => m.key !== "dead" && m.key !== "on_hold",
          )
        : PROSPECT_STAGE_META,
    [hideTerminal],
  );

  function handleDragStart(e: React.DragEvent, prospect: ProspectListItem) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("application/x-portviz-prospect", prospect.id);
  }

  function handleDrop(e: React.DragEvent, toStage: string) {
    e.preventDefault();
    setDragOverStage(null);
    const id = e.dataTransfer.getData("application/x-portviz-prospect");
    const prospect = prospects.find((p) => p.id === id);
    if (prospect && prospect.stage !== toStage) {
      onMove(prospect, toStage);
    }
  }

  return (
    <div className="flex h-full gap-3 overflow-x-auto pb-4">
      {visibleStages.map((meta) => {
        const list = byStage[meta.key] ?? [];
        const totalSf = list.reduce((sum, p) => sum + (p.requested_sf ?? 0), 0);
        const isDragOver = dragOverStage === meta.key;
        return (
          <div
            key={meta.key}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (dragOverStage !== meta.key) setDragOverStage(meta.key);
            }}
            onDragLeave={(e) => {
              // Only clear if leaving this column for real (not a child node).
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                if (dragOverStage === meta.key) setDragOverStage(null);
              }
            }}
            onDrop={(e) => handleDrop(e, meta.key)}
            className={`flex w-72 flex-shrink-0 flex-col rounded-lg border ${
              isDragOver
                ? "border-neutral-900 bg-neutral-100"
                : "border-neutral-200 bg-neutral-50"
            }`}
          >
            <header
              className={`flex items-center justify-between rounded-t-lg px-3 py-2 ${meta.headerClass}`}
            >
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide">
                  {meta.label}
                </p>
                <p className="text-[10px] opacity-70">{meta.description}</p>
              </div>
              <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-semibold">
                {list.length}
              </span>
            </header>
            <div className="border-b border-neutral-200 px-3 py-1.5 text-[10px] text-neutral-500">
              {totalSf > 0 ? `${totalSf.toLocaleString()} SF total` : "—"}
            </div>
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
              {list.length === 0 ? (
                <p className="px-1 py-4 text-center text-xs text-neutral-400">
                  Drop deals here
                </p>
              ) : (
                list.map((p) => (
                  <ProspectCard
                    key={p.id}
                    prospect={p}
                    onOpen={() => onOpen(p)}
                    onDragStart={(e) => handleDragStart(e, p)}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Re-export for callers that want stage colors without importing the lib.
export { stageMeta };
