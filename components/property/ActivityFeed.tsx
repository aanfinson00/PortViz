"use client";

import { api } from "@/lib/trpc/react";

interface EventRow {
  id: string;
  entity_type: string;
  entity_id: string;
  kind: string;
  payload: unknown;
  actor_id: string | null;
  created_at: string;
}

const KIND_LABELS: Record<string, string> = {
  created: "Created",
  updated: "Updated",
  deleted: "Deleted",
  amenities_updated: "Amenities updated",
  demising_mode_changed: "Demising mode changed",
  bulk_import: "Bulk import",
};

const ENTITY_LABELS: Record<string, string> = {
  lease: "lease",
  building: "building",
  project: "property",
  space: "space",
  tenant: "tenant",
  org: "organization",
};

/**
 * Recent audit-log events surfaced from the public.event table (added
 * in migration 0008). Org-scoped, most-recent-first. Lease lifecycle
 * (create / update), building create+delete, project edits, and the
 * bulk import all show up here so users can trace what just happened.
 *
 * Per-project filtering is a deferred follow-up — for v1 we render
 * the most recent activity across the whole org. Each row resolves
 * to a relative time + a human-readable label.
 */
export function ActivityFeed({ limit = 50 }: { limit?: number }) {
  const query = api.event.recent.useQuery({ limit }, { retry: false });
  if (query.isLoading) {
    return <p className="text-sm text-neutral-500">Loading activity…</p>;
  }
  if (query.isError) {
    return <p className="text-sm text-red-600">{query.error.message}</p>;
  }
  const rows = (query.data ?? []) as EventRow[];
  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-500">
        No activity yet. Lease creates, building edits, and bulk imports will
        appear here once they happen.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-1.5 text-sm">
      {rows.map((row) => (
        <li
          key={row.id}
          className="flex items-baseline justify-between gap-3 rounded-md border border-neutral-100 bg-white px-3 py-2"
        >
          <span className="flex min-w-0 flex-1 items-baseline gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              {ENTITY_LABELS[row.entity_type] ?? row.entity_type}
            </span>
            <span className="text-neutral-800">
              {KIND_LABELS[row.kind] ?? row.kind}
            </span>
            {row.kind === "deleted" && (
              <span className="text-[11px] text-neutral-400">
                (id {row.entity_id.slice(0, 8)}…)
              </span>
            )}
          </span>
          <span
            className="flex-shrink-0 text-xs text-neutral-500"
            title={new Date(row.created_at).toLocaleString()}
          >
            {relativeTime(row.created_at)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  return d.toLocaleDateString();
}
