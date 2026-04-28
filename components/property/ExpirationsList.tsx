"use client";

import Link from "next/link";

interface ExpirationLease {
  id: string;
  endDate: string;
  spaceCode: string;
  buildingCode: string;
  projectCode: string;
  tenantName: string;
  tenantColor: string | null;
  baseRentPsf: number | null;
}

interface Props {
  leases: ExpirationLease[];
  /** How many months out to include. Defaults to 18. */
  windowMonths?: number;
}

/**
 * Sortable list of leases ending soon. Grouped by month, ordered ascending.
 * "Soon" = within `windowMonths` of today; older expirations would land in a
 * separate Expired panel which we don't need yet.
 */
export function ExpirationsList({ leases, windowMonths = 18 }: Props) {
  const today = new Date();
  const cutoff = new Date(today);
  cutoff.setMonth(cutoff.getMonth() + windowMonths);

  const upcoming = leases
    .filter((l) => {
      const end = new Date(l.endDate);
      return end >= today && end <= cutoff;
    })
    .sort((a, b) => a.endDate.localeCompare(b.endDate));

  if (upcoming.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        No leases expiring in the next {windowMonths} months.
      </p>
    );
  }

  // Group by YYYY-MM.
  const groups = new Map<string, ExpirationLease[]>();
  for (const l of upcoming) {
    const key = l.endDate.slice(0, 7);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(l);
  }

  return (
    <ul className="flex flex-col gap-3">
      {Array.from(groups.entries()).map(([monthKey, group]) => (
        <li key={monthKey}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
            {formatMonth(monthKey)}
          </p>
          <ul className="mt-1 divide-y divide-neutral-100 rounded-md border border-neutral-200 bg-white">
            {group.map((l) => (
              <li key={l.id}>
                <Link
                  href={`/app/projects/${l.projectCode}/buildings/${l.buildingCode}/spaces/${l.spaceCode}`}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-neutral-50"
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-sm"
                      style={{ background: l.tenantColor ?? "#9ca3af" }}
                    />
                    <span className="truncate">
                      <span className="font-medium">{l.tenantName}</span>
                      <span className="ml-2 font-mono text-[11px] text-neutral-500">
                        {l.projectCode}-{l.buildingCode}-{l.spaceCode}
                      </span>
                    </span>
                  </span>
                  <span className="flex flex-col items-end text-xs text-neutral-600">
                    <span>{l.endDate}</span>
                    {l.baseRentPsf != null && (
                      <span className="text-[11px] text-neutral-500">
                        ${l.baseRentPsf}/SF
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function formatMonth(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  if (!y || !m) return yyyymm;
  return new Date(y, m - 1, 1).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });
}
