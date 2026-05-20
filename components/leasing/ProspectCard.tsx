"use client";

import { useState } from "react";
import { stageMeta, formatSf, formatPsf, formatDate } from "@/lib/prospectStages";
import type { ProspectListItem } from "./types";

interface Props {
  prospect: ProspectListItem;
  onOpen: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
}

/**
 * Single prospect card used in the Kanban view. Compact summary with the
 * info a broker scans for at a glance: company, SF, rent, broker, next
 * action. Click to open the detail drawer for the full record.
 */
export function ProspectCard({ prospect, onOpen, onDragStart, onDragEnd }: Props) {
  const [dragging, setDragging] = useState(false);
  const meta = stageMeta(prospect.stage);
  const rent = prospect.proposed_rent_psf ?? prospect.asking_rent_psf;
  const propertyTag = buildPropertyTag(prospect);

  return (
    <button
      type="button"
      draggable={Boolean(onDragStart)}
      onDragStart={(e) => {
        setDragging(true);
        onDragStart?.(e);
      }}
      onDragEnd={(e) => {
        setDragging(false);
        onDragEnd?.(e);
      }}
      onClick={onOpen}
      className={`group w-full cursor-pointer rounded-md border border-neutral-200 bg-white p-3 text-left shadow-sm transition hover:shadow ${
        dragging ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-neutral-900">
            {prospect.name}
          </p>
          {prospect.code && (
            <p className="mt-0.5 font-mono text-[10px] text-neutral-400">
              {prospect.code}
            </p>
          )}
        </div>
        {prospect.probability_pct != null && (
          <span
            className={`flex-shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium ${meta.chipClass}`}
          >
            {prospect.probability_pct}%
          </span>
        )}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-neutral-600">
        <div className="flex items-center gap-1">
          <span className="text-neutral-400">SF</span>
          <span className="font-medium text-neutral-700">
            {formatSf(prospect.requested_sf)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-neutral-400">Rent</span>
          <span className="font-medium text-neutral-700">
            {formatPsf(rent)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-neutral-400">Term</span>
          <span className="font-medium text-neutral-700">
            {prospect.term_months ? `${prospect.term_months}mo` : "—"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-neutral-400">Comm.</span>
          <span className="font-medium text-neutral-700">
            {formatDate(prospect.target_commencement)}
          </span>
        </div>
      </div>

      {propertyTag && (
        <p className="mt-2 truncate font-mono text-[10px] text-neutral-500">
          {propertyTag}
        </p>
      )}

      {prospect.broker_company && (
        <p className="mt-1 truncate text-[11px] text-neutral-500">
          via {prospect.broker_company}
        </p>
      )}

      {prospect.next_action && (
        <p className="mt-2 line-clamp-2 rounded bg-amber-50 px-1.5 py-1 text-[10px] text-amber-900">
          → {prospect.next_action}
          {prospect.next_action_date && (
            <span className="ml-1 text-amber-700">
              · {formatDate(prospect.next_action_date)}
            </span>
          )}
        </p>
      )}
    </button>
  );
}

function buildPropertyTag(p: ProspectListItem): string | null {
  if (!p.project) return null;
  const parts = [p.project.code];
  if (p.building) parts.push(p.building.code);
  if (p.space) parts.push(p.space.code);
  return parts.join("-");
}
