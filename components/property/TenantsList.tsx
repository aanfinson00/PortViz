"use client";

interface TenantRow {
  id: string;
  code: string;
  name: string;
  brandColor: string | null;
  totalSf: number;
  spaceCount: number;
}

interface Props {
  tenants: TenantRow[];
}

/**
 * Distinct tenants currently leasing space at this property, sorted by SF
 * descending. Powers the dashboard's Tenants tab; mirrors the rent roll
 * but rolled up one level.
 */
export function TenantsList({ tenants }: Props) {
  if (tenants.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        No active tenants at this property yet.
      </p>
    );
  }

  const sorted = [...tenants].sort((a, b) => b.totalSf - a.totalSf);
  return (
    <ul className="divide-y divide-neutral-100 rounded-md border border-neutral-200 bg-white">
      {sorted.map((t) => (
        <li
          key={t.id}
          className="flex items-center justify-between px-4 py-2 text-sm"
        >
          <span className="flex items-center gap-3">
            <span
              className="inline-block h-3 w-3 flex-shrink-0 rounded-sm"
              style={{ background: t.brandColor ?? "#9ca3af" }}
            />
            <span>
              <span className="font-medium">{t.name}</span>
              <span className="ml-2 font-mono text-xs text-neutral-500">
                {t.code}
              </span>
            </span>
          </span>
          <span className="flex items-center gap-4 text-xs text-neutral-600">
            <span className="tabular-nums">
              {t.totalSf.toLocaleString()} SF
            </span>
            <span className="text-neutral-500">
              {t.spaceCount} space{t.spaceCount === 1 ? "" : "s"}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
