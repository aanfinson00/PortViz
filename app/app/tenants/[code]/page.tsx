"use client";

import Link from "next/link";
import { use, useMemo } from "react";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import {
  currentYearRent,
  LEASE_TYPE_LABELS,
  parseLeaseType,
  parseRentSchedule,
  type LeaseType,
} from "@/lib/leaseEconomics";
import { api } from "@/lib/trpc/react";

const LEASE_TYPE_SHORT: Record<LeaseType, string> = {
  nnn: "NNN",
  modified_gross: "MG",
  gross: "GROSS",
  absolute_net: "ABS NET",
  percentage: "%",
  other: "OTHER",
};

interface BuildingRel {
  id: string;
  code: string;
  name: string | null;
  project: { id: string; code: string; name: string } | { id: string; code: string; name: string }[] | null;
}
interface SpaceRel {
  id: string;
  code: string;
  status: string;
  target_sf: number | null;
  building: BuildingRel | BuildingRel[] | null;
}
interface LeaseRow {
  id: string;
  start_date: string;
  end_date: string;
  base_rent_psf: number | null;
  escalation_pct?: number | null;
  term_months: number | null;
  ti_allowance_psf: number | null;
  free_rent_months: number | null;
  commission_psf: number | null;
  security_deposit: number | null;
  notes?: string | null;
  lease_type?: string | null;
  rent_schedule?: unknown;
  options?: unknown;
  parent_lease_id?: string | null;
  space: SpaceRel | SpaceRel[] | null;
}

function unwrap<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export default function TenantDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const upper = code.toUpperCase();
  const query = api.tenant.byCode.useQuery({ code: upper }, { retry: false });

  const data = query.data;

  const stats = useMemo(() => {
    if (!data) {
      return {
        totalSf: 0,
        leaseCount: 0,
        buildingCount: 0,
        projectCount: 0,
        weightedAvgTermMonths: 0,
        expiringIn12mo: 0,
      };
    }
    const today = new Date();
    const cutoff = new Date(today);
    cutoff.setMonth(cutoff.getMonth() + 12);

    const buildingIds = new Set<string>();
    const projectIds = new Set<string>();
    let totalSf = 0;
    let weightedTermSum = 0;
    let weightingTotal = 0;
    let expiringIn12mo = 0;

    for (const l of data.leases as unknown as LeaseRow[]) {
      const sp = unwrap(l.space);
      const bldg = unwrap(sp?.building ?? null);
      if (bldg) buildingIds.add(bldg.id);
      const proj = unwrap(bldg?.project ?? null);
      if (proj) projectIds.add(proj.id);
      const sf = sp?.target_sf ?? 0;
      totalSf += sf;
      const term = l.term_months ?? null;
      if (term && sf > 0) {
        weightedTermSum += term * sf;
        weightingTotal += sf;
      }
      const end = new Date(l.end_date);
      if (end >= today && end <= cutoff) expiringIn12mo += 1;
    }

    return {
      totalSf,
      leaseCount: data.leases.length,
      buildingCount: buildingIds.size,
      projectCount: projectIds.size,
      weightedAvgTermMonths:
        weightingTotal > 0 ? Math.round(weightedTermSum / weightingTotal) : 0,
      expiringIn12mo,
    };
  }, [data]);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-8">
      <Breadcrumb
        crumbs={[{ label: "Tenants", href: "/app/tenants" }, { label: upper }]}
      />
      {query.isLoading && (
        <p className="text-sm text-neutral-500">Loading tenant…</p>
      )}
      {query.isError && (
        <p className="text-sm text-red-600">{query.error.message}</p>
      )}
      {data === null && (
        <p className="text-sm text-neutral-500">
          No tenant with code{" "}
          <code className="rounded bg-neutral-100 px-1 py-0.5 text-xs">
            {upper}
          </code>
          .
        </p>
      )}
      {data && (
        <>
          <header className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-xs text-neutral-500">{data.tenant.code}</p>
              <div className="mt-1 flex items-center gap-3">
                <span
                  aria-hidden
                  className="inline-block h-4 w-4 flex-shrink-0 rounded-sm"
                  style={{
                    background: data.tenant.brand_color ?? "#9ca3af",
                  }}
                />
                <h1 className="text-3xl font-bold tracking-tight">
                  {data.tenant.name}
                </h1>
              </div>
              {data.tenant.contact_email && (
                <p className="mt-2 text-sm text-neutral-600">
                  {data.tenant.contact_name
                    ? `${data.tenant.contact_name} · `
                    : ""}
                  <a
                    href={`mailto:${data.tenant.contact_email}`}
                    className="text-blue-600 hover:underline"
                  >
                    {data.tenant.contact_email}
                  </a>
                  {data.tenant.contact_phone
                    ? ` · ${data.tenant.contact_phone}`
                    : ""}
                </p>
              )}
            </div>
          </header>

          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            <Stat label="Leased SF" value={stats.totalSf.toLocaleString()} />
            <Stat label="Leases" value={String(stats.leaseCount)} />
            <Stat label="Buildings" value={String(stats.buildingCount)} />
            <Stat label="Properties" value={String(stats.projectCount)} />
            <Stat
              label="WALT (mo)"
              value={String(stats.weightedAvgTermMonths)}
              sub="weighted by SF"
            />
            <Stat
              label="Expiring 12mo"
              value={String(stats.expiringIn12mo)}
              tone={stats.expiringIn12mo > 0 ? "warn" : "neutral"}
            />
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold">Leases</h2>
            {data.leases.length === 0 ? (
              <p className="rounded-md border border-dashed border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-500">
                No leases on file for this tenant yet.
              </p>
            ) : (
              <div className="overflow-hidden rounded-md border border-neutral-200 bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                    <tr>
                      <th className="px-3 py-2">Space</th>
                      <th className="px-3 py-2">SF</th>
                      <th className="px-3 py-2">Term</th>
                      <th className="px-3 py-2">Rent (now)</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {(data.leases as unknown as LeaseRow[]).map((l) => {
                      const sp = unwrap(l.space);
                      const bldg = unwrap(sp?.building ?? null);
                      const proj = unwrap(bldg?.project ?? null);
                      const rate = currentYearRent({
                        startDate: l.start_date,
                        endDate: l.end_date,
                        baseRentPsf: l.base_rent_psf,
                        escalationPct: l.escalation_pct ?? null,
                        rentSchedule: parseRentSchedule(l.rent_schedule),
                      });
                      const type = parseLeaseType(l.lease_type);
                      const url =
                        proj && bldg && sp
                          ? `/app/projects/${proj.code}/buildings/${bldg.code}/spaces/${sp.code}`
                          : null;
                      return (
                        <tr key={l.id} className="hover:bg-neutral-50">
                          <td className="px-3 py-2 font-mono text-xs">
                            {proj && bldg && sp
                              ? `${proj.code}-${bldg.code}-${sp.code}`
                              : "—"}
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {sp?.target_sf
                              ? sp.target_sf.toLocaleString()
                              : "—"}
                          </td>
                          <td className="px-3 py-2 text-xs">
                            {l.start_date} → {l.end_date}
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {rate != null ? `$${rate.toFixed(2)}` : "—"}
                          </td>
                          <td className="px-3 py-2">
                            {type ? (
                              <span
                                className="rounded border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-600"
                                title={LEASE_TYPE_LABELS[type]}
                              >
                                {LEASE_TYPE_SHORT[type]}
                              </span>
                            ) : (
                              <span className="text-neutral-400">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {url && (
                              <Link
                                href={url}
                                className="text-xs text-blue-600 hover:underline"
                              >
                                Open →
                              </Link>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function Stat({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "warn" | "neutral";
}) {
  const toneClass =
    tone === "good"
      ? "border-emerald-200 bg-emerald-50"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50"
        : "border-neutral-200 bg-white";
  return (
    <div className={`rounded-md border px-3 py-2 ${toneClass}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
        {label}
      </p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-neutral-900">
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[10px] text-neutral-500">{sub}</p>}
    </div>
  );
}
