"use client";

import Link from "next/link";
import { downloadCsv, toCsv } from "@/lib/csv";
import { api } from "@/lib/trpc/react";

interface RentRollProps {
  buildingId: string;
  projectCode: string;
  buildingCode: string;
}

type Tenant = {
  id: string;
  code: string;
  name: string;
  brand_color: string | null;
};

type LeaseRow = {
  id: string;
  start_date: string;
  end_date: string;
  base_rent_psf: number | null;
  term_months: number | null;
  // PostgREST returns embedded relations as either an object or an array
  // depending on whether it can determine a to-one vs to-many cardinality.
  // Handle both shapes to keep the UI robust.
  tenant: Tenant | Tenant[] | null;
};

type RentRollRow = {
  id: string;
  code: string;
  status: string;
  lease: LeaseRow[];
};

function firstTenant(tenant: LeaseRow["tenant"]): Tenant | null {
  if (!tenant) return null;
  return Array.isArray(tenant) ? (tenant[0] ?? null) : tenant;
}

export function RentRoll({ buildingId, projectCode, buildingCode }: RentRollProps) {
  const query = api.lease.rentRoll.useQuery({ buildingId }, { retry: false });

  if (query.isLoading) {
    return <p className="text-sm text-neutral-500">Loading rent roll…</p>;
  }

  if (query.isError) {
    return <p className="text-sm text-red-600">{query.error.message}</p>;
  }

  const rows = (query.data ?? []) as unknown as RentRollRow[];
  if (rows.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        No spaces yet. Save a demising layout on the building page to create
        the first space.
      </p>
    );
  }

  const sorted = [...rows].sort((a, b) => a.code.localeCompare(b.code));

  function handleExport() {
    const csvRows = sorted.map((s) => {
      const lease = s.lease?.[0];
      const tenant = firstTenant(lease?.tenant ?? null);
      return {
        space_id: `${projectCode}-${buildingCode}-${s.code}`,
        tenant_code: tenant?.code ?? "",
        tenant_name: tenant?.name ?? "",
        start_date: lease?.start_date ?? "",
        end_date: lease?.end_date ?? "",
        base_rent_psf: lease?.base_rent_psf ?? "",
        term_months: lease?.term_months ?? "",
        status: s.status,
      };
    });
    const csv = toCsv(csvRows, [
      { key: "space_id", label: "Space ID" },
      { key: "tenant_code", label: "Tenant Code" },
      { key: "tenant_name", label: "Tenant" },
      { key: "start_date", label: "Start" },
      { key: "end_date", label: "End" },
      { key: "base_rent_psf", label: "Rent $/SF" },
      { key: "term_months", label: "Term (mo)" },
      { key: "status", label: "Status" },
    ]);
    downloadCsv(`rent-roll-${projectCode}-${buildingCode}.csv`, csv);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <button
          onClick={handleExport}
          className="rounded-md border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Export CSV
        </button>
      </div>
      <div className="overflow-hidden rounded-md border border-neutral-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="px-4 py-2">Space</th>
            <th className="px-4 py-2">Tenant</th>
            <th className="px-4 py-2">Term</th>
            <th className="px-4 py-2">Rent $/SF</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {sorted.map((s) => {
            const lease = s.lease?.[0];
            const tenant = firstTenant(lease?.tenant ?? null);
            return (
              <tr key={s.id} className="hover:bg-neutral-50">
                <td className="px-4 py-2 font-mono text-xs">
                  {projectCode}-{buildingCode}-{s.code}
                </td>
                <td className="px-4 py-2">
                  {tenant ? (
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-sm"
                        style={{ background: tenant.brand_color ?? "#9ca3af" }}
                      />
                      {tenant.name}
                    </span>
                  ) : (
                    <span className="text-neutral-400">—</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  {lease
                    ? `${lease.start_date} → ${lease.end_date}`
                    : <span className="text-neutral-400">—</span>}
                </td>
                <td className="px-4 py-2">
                  {lease?.base_rent_psf
                    ? `$${lease.base_rent_psf}`
                    : <span className="text-neutral-400">—</span>}
                </td>
                <td className="px-4 py-2 capitalize">{s.status}</td>
                <td className="px-4 py-2 text-right">
                  <Link
                    href={`/app/projects/${projectCode}/buildings/${buildingCode}/spaces/${s.code}`}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Open →
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
