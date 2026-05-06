"use client";

import Link from "next/link";

export interface AvailableSpaceRow {
  id: string;
  spaceCode: string;
  buildingCode: string;
  projectCode: string;
  status: "vacant" | "available" | "pending";
  sf: number;
  askingRentPsf: number | null;
  availableDate: string | null;
  minDivisibilitySf: number | null;
  maxDivisibilitySf: number | null;
}

interface Props {
  rows: AvailableSpaceRow[];
}

const STATUS_LABEL: Record<AvailableSpaceRow["status"], string> = {
  vacant: "Vacant",
  available: "Available",
  pending: "Pending",
};

const STATUS_TONE: Record<AvailableSpaceRow["status"], string> = {
  vacant: "bg-neutral-100 text-neutral-700",
  available: "bg-emerald-50 text-emerald-700",
  pending: "bg-amber-50 text-amber-700",
};

function formatDivisibility(min: number | null, max: number | null): string {
  if (min == null && max == null) return "—";
  if (min != null && max != null) {
    if (min === max) return min.toLocaleString();
    return `${min.toLocaleString()}–${max.toLocaleString()}`;
  }
  if (min != null) return `≥ ${min.toLocaleString()}`;
  return `≤ ${(max as number).toLocaleString()}`;
}

/**
 * Lists every space at the property whose status is vacant / available /
 * pending. Sorted by SF descending — biggest blocks float to the top so
 * a broker scanning for a 200k-SF tenant sees their candidates first.
 */
export function AvailableSpacesList({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-500">
        Nothing currently vacant or available at this property.
      </p>
    );
  }
  const sorted = [...rows].sort((a, b) => b.sf - a.sf);
  const totalSf = sorted.reduce((acc, r) => acc + r.sf, 0);
  return (
    <div className="overflow-hidden rounded-md border border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-100 bg-neutral-50 px-3 py-1.5 text-xs text-neutral-600">
        <span>
          {sorted.length} space{sorted.length === 1 ? "" : "s"} ·{" "}
          <span className="font-medium tabular-nums">
            {totalSf.toLocaleString()} SF
          </span>{" "}
          available
        </span>
      </div>
      <table className="w-full text-left text-sm">
        <thead className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="px-3 py-2">Space</th>
            <th className="px-3 py-2">SF</th>
            <th className="px-3 py-2">Asking</th>
            <th className="px-3 py-2">Avail.</th>
            <th className="px-3 py-2">Divisibility</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2 text-right"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {sorted.map((r) => (
            <tr key={r.id} className="hover:bg-neutral-50">
              <td className="px-3 py-2 font-mono text-xs">
                {r.projectCode}-{r.buildingCode}-{r.spaceCode}
              </td>
              <td className="px-3 py-2 tabular-nums">
                {r.sf > 0 ? r.sf.toLocaleString() : "—"}
              </td>
              <td className="px-3 py-2 tabular-nums">
                {r.askingRentPsf != null
                  ? `$${r.askingRentPsf.toFixed(2)}`
                  : <span className="text-neutral-400">—</span>}
              </td>
              <td className="px-3 py-2 text-xs">
                {r.availableDate ?? <span className="text-neutral-400">—</span>}
              </td>
              <td className="px-3 py-2 tabular-nums text-xs">
                {formatDivisibility(r.minDivisibilitySf, r.maxDivisibilitySf)}
              </td>
              <td className="px-3 py-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_TONE[r.status]}`}
                >
                  {STATUS_LABEL[r.status]}
                </span>
              </td>
              <td className="px-3 py-2 text-right">
                <Link
                  href={`/app/projects/${r.projectCode}/buildings/${r.buildingCode}/spaces/${r.spaceCode}`}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Open →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
