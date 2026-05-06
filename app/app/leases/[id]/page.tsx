"use client";

import Link from "next/link";
import { use, useMemo } from "react";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { DocumentUpload } from "@/components/docs/DocumentUpload";
import {
  currentYearRent,
  LEASE_OPTION_LABELS,
  LEASE_TYPE_LABELS,
  parseLeaseOptions,
  parseLeaseType,
  parseRentSchedule,
  type LeaseOptionKind,
  type LeaseType,
  type RentScheduleEntry,
} from "@/lib/leaseEconomics";
import { api } from "@/lib/trpc/react";

interface ProjectRel {
  id: string;
  code: string;
  name: string;
}
interface BuildingRel {
  id: string;
  code: string;
  name: string | null;
  project: ProjectRel | ProjectRel[] | null;
}
interface SpaceRel {
  id: string;
  code: string;
  status: string;
  target_sf: number | null;
  building: BuildingRel | BuildingRel[] | null;
}
interface TenantRel {
  id: string;
  code: string;
  name: string;
  brand_color: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
}
interface LeaseDetail {
  id: string;
  start_date: string;
  end_date: string;
  commencement_date: string | null;
  base_rent_psf: number | null;
  escalation_pct: number | null;
  term_months: number | null;
  ti_allowance_psf: number | null;
  free_rent_months: number | null;
  commission_psf: number | null;
  security_deposit: number | null;
  notes: string | null;
  lease_type?: string | null;
  rent_schedule?: unknown;
  options?: unknown;
  parent_lease_id?: string | null;
  tenant: TenantRel | TenantRel[] | null;
  space: SpaceRel | SpaceRel[] | null;
}

function unwrap<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

const LEASE_TYPE_SHORT: Record<LeaseType, string> = {
  nnn: "NNN",
  modified_gross: "MG",
  gross: "GROSS",
  absolute_net: "ABS NET",
  percentage: "%",
  other: "OTHER",
};

const OPTION_TONE: Record<LeaseOptionKind, string> = {
  renewal: "border-emerald-200 bg-emerald-50 text-emerald-800",
  expansion: "border-blue-200 bg-blue-50 text-blue-800",
  rofr: "border-violet-200 bg-violet-50 text-violet-800",
  rofo: "border-violet-200 bg-violet-50 text-violet-800",
  termination: "border-red-200 bg-red-50 text-red-800",
};

export default function LeaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const query = api.lease.byId.useQuery({ id }, { retry: false });

  const lease = (query.data?.lease ?? null) as unknown as LeaseDetail | null;
  const children = query.data?.children ?? [];

  // When this lease is a renewal, fetch the parent lease's basic info so we
  // can show the chain (start/end + tenant). Single sequential query is
  // fine — chains are typically shallow (1–3 deep) and rarely traversed.
  const parentQuery = api.lease.byId.useQuery(
    { id: lease?.parent_lease_id ?? "" },
    { enabled: !!lease?.parent_lease_id, retry: false },
  );
  const parent = (parentQuery.data?.lease ?? null) as unknown as
    | LeaseDetail
    | null;

  const space = unwrap(lease?.space ?? null);
  const building = unwrap(space?.building ?? null);
  const project = unwrap(building?.project ?? null);
  const tenant = unwrap(lease?.tenant ?? null);

  const status = useMemo<"active" | "upcoming" | "expired">(() => {
    if (!lease) return "expired";
    const today = new Date();
    const s = new Date(lease.start_date);
    const e = new Date(lease.end_date);
    if (today < s) return "upcoming";
    if (today >= e) return "expired";
    return "active";
  }, [lease]);

  const rentSchedule = useMemo<RentScheduleEntry[]>(() => {
    if (!lease) return [];
    const explicit = parseRentSchedule(lease.rent_schedule);
    if (explicit.length > 0) return explicit;
    // Synthesize annual steps from base rent + escalation when no explicit
    // schedule is stored. Caps at term_months or 1 year minimum.
    if (lease.base_rent_psf == null) return [];
    const totalMonths = lease.term_months ?? monthsBetween(lease.start_date, lease.end_date);
    const years = Math.max(1, Math.ceil(totalMonths / 12));
    const esc = (lease.escalation_pct ?? 0) / 100;
    const out: RentScheduleEntry[] = [];
    for (let y = 0; y < years; y++) {
      const fromMonth = y * 12 + 1;
      const toMonth = Math.min(totalMonths, (y + 1) * 12);
      out.push({
        fromMonth,
        toMonth,
        baseRentPsf: lease.base_rent_psf * Math.pow(1 + esc, y),
        notes: y === 0 ? "base" : esc > 0 ? `+${(esc * 100).toFixed(1)}%` : null,
      });
    }
    return out;
  }, [lease]);

  const options = useMemo(
    () => (lease ? parseLeaseOptions(lease.options) : []),
    [lease],
  );

  const currentRent = useMemo(() => {
    if (!lease) return null;
    return currentYearRent({
      startDate: lease.start_date,
      endDate: lease.end_date,
      baseRentPsf: lease.base_rent_psf,
      escalationPct: lease.escalation_pct ?? null,
      rentSchedule: parseRentSchedule(lease.rent_schedule),
    });
  }, [lease]);

  const leaseType = lease ? parseLeaseType(lease.lease_type) : null;
  const totalSf = space?.target_sf ?? 0;

  const breadcrumbs = useMemo(() => {
    if (!project || !building || !space) return [{ label: "Lease" }];
    return [
      { label: project.code, href: `/app/projects/${project.code}` },
      {
        label: `${project.code}-${building.code}`,
        href: `/app/projects/${project.code}/buildings/${building.code}`,
      },
      {
        label: `${space.code}`,
        href: `/app/projects/${project.code}/buildings/${building.code}/spaces/${space.code}`,
      },
      { label: "Lease" },
    ];
  }, [project, building, space]);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-8">
      <Breadcrumb crumbs={breadcrumbs} />
      {query.isLoading && (
        <p className="text-sm text-neutral-500">Loading lease…</p>
      )}
      {query.isError && (
        <p className="text-sm text-red-600">{query.error.message}</p>
      )}
      {query.data === null && (
        <p className="text-sm text-neutral-500">Lease not found.</p>
      )}
      {lease && (
        <>
          <header className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-xs text-neutral-500">
                {project && building && space
                  ? `${project.code}-${building.code}-${space.code}`
                  : "Space"}
              </p>
              <h1 className="mt-1 flex items-center gap-3 text-3xl font-bold tracking-tight">
                {tenant ? (
                  <>
                    <span
                      aria-hidden
                      className="inline-block h-4 w-4 flex-shrink-0 rounded-sm"
                      style={{
                        background: tenant.brand_color ?? "#9ca3af",
                      }}
                    />
                    <Link
                      href={`/app/tenants/${tenant.code}`}
                      className="hover:underline"
                    >
                      {tenant.name}
                    </Link>
                  </>
                ) : (
                  "—"
                )}
              </h1>
              <p className="mt-1 text-sm text-neutral-600">
                {lease.start_date} → {lease.end_date}
                {lease.term_months ? ` · ${lease.term_months} months` : ""}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <StatusChip status={status} />
              {leaseType && (
                <span
                  className="rounded border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-600"
                  title={LEASE_TYPE_LABELS[leaseType]}
                >
                  {LEASE_TYPE_SHORT[leaseType]}
                </span>
              )}
            </div>
          </header>

          {/* Headline economics */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="Current rent"
              value={currentRent != null ? `$${currentRent.toFixed(2)}/SF` : "—"}
              sub={
                totalSf > 0 && currentRent != null
                  ? `~$${Math.round((currentRent * totalSf) / 12).toLocaleString()}/mo`
                  : undefined
              }
            />
            <Stat
              label="SF"
              value={totalSf > 0 ? totalSf.toLocaleString() : "—"}
            />
            <Stat
              label="Escalation"
              value={
                lease.escalation_pct != null
                  ? `${lease.escalation_pct}%`
                  : "—"
              }
            />
            <Stat
              label="TI allowance"
              value={
                lease.ti_allowance_psf != null
                  ? `$${lease.ti_allowance_psf}/SF`
                  : "—"
              }
            />
            <Stat
              label="Free rent"
              value={
                lease.free_rent_months != null
                  ? `${lease.free_rent_months} mo`
                  : "—"
              }
            />
            <Stat
              label="Commission"
              value={
                lease.commission_psf != null
                  ? `$${lease.commission_psf}/SF`
                  : "—"
              }
            />
            <Stat
              label="Security deposit"
              value={
                lease.security_deposit != null
                  ? `$${lease.security_deposit.toLocaleString()}`
                  : "—"
              }
            />
            <Stat
              label="Commencement"
              value={lease.commencement_date ?? lease.start_date}
            />
          </section>

          {/* Renewal chain */}
          {(lease.parent_lease_id || children.length > 0) && (
            <section className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs">
              <p className="font-semibold uppercase tracking-wide text-neutral-500">
                Lease chain
              </p>
              <ul className="mt-1 flex flex-col gap-0.5 text-neutral-700">
                {lease.parent_lease_id && (
                  <li>
                    Renewal of{" "}
                    <Link
                      href={`/app/leases/${lease.parent_lease_id}`}
                      className="text-blue-600 hover:underline"
                    >
                      {parent
                        ? `${parent.start_date} → ${parent.end_date}`
                        : "previous lease"}
                    </Link>
                  </li>
                )}
                {children.map((c) => (
                  <li key={c.id}>
                    Renewed by{" "}
                    <Link
                      href={`/app/leases/${c.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      {c.start_date} → {c.end_date}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Rent schedule */}
          <section>
            <h2 className="mb-2 text-lg font-semibold">Rent schedule</h2>
            {rentSchedule.length === 0 ? (
              <p className="text-sm text-neutral-500">
                No rent set on this lease.
              </p>
            ) : (
              <RentScheduleTable
                schedule={rentSchedule}
                totalSf={totalSf}
              />
            )}
          </section>

          {/* Options */}
          <section>
            <h2 className="mb-2 text-lg font-semibold">Options & rights</h2>
            {options.length === 0 ? (
              <p className="text-sm text-neutral-500">
                No options on this lease.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {options.map((o, i) => (
                  <li
                    key={i}
                    className="flex flex-wrap items-center gap-3 rounded-md border border-neutral-200 bg-white p-3 text-sm"
                  >
                    <span
                      className={`rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${OPTION_TONE[o.kind]}`}
                    >
                      {LEASE_OPTION_LABELS[o.kind]}
                    </span>
                    {o.noticeMonths != null && (
                      <span className="text-xs text-neutral-700">
                        Notice:{" "}
                        <span className="font-mono">{o.noticeMonths} mo</span>
                      </span>
                    )}
                    {o.kind !== "termination" && o.termMonths != null && (
                      <span className="text-xs text-neutral-700">
                        Term: <span className="font-mono">{o.termMonths} mo</span>
                      </span>
                    )}
                    {o.kind === "termination" && o.feePsf != null && (
                      <span className="text-xs text-neutral-700">
                        Fee: <span className="font-mono">${o.feePsf}/SF</span>
                      </span>
                    )}
                    {o.rentBasis && (
                      <span className="text-xs text-neutral-700">
                        Rent basis: <em>{o.rentBasis}</em>
                      </span>
                    )}
                    {o.notes && (
                      <span className="ml-auto text-xs text-neutral-500">
                        {o.notes}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Notes */}
          {lease.notes && (
            <section>
              <h2 className="mb-2 text-lg font-semibold">Notes</h2>
              <p className="whitespace-pre-line rounded-md border border-neutral-200 bg-white p-3 text-sm">
                {lease.notes}
              </p>
            </section>
          )}

          {/* Documents */}
          <section>
            <h2 className="mb-2 text-lg font-semibold">Documents</h2>
            <p className="mb-2 text-xs text-neutral-500">
              Signed lease PDFs, addendums, exhibits, etc. Files attach to
              the lease via the polymorphic documents table.
            </p>
            <DocumentUpload entityType="lease" entityId={lease.id} />
          </section>
        </>
      )}
    </main>
  );
}

function StatusChip({ status }: { status: "active" | "upcoming" | "expired" }) {
  const tone =
    status === "active"
      ? "bg-emerald-100 text-emerald-800"
      : status === "upcoming"
        ? "bg-amber-100 text-amber-800"
        : "bg-neutral-100 text-neutral-700";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${tone}`}
    >
      {status}
    </span>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-md border border-neutral-200 bg-white px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
        {label}
      </p>
      <p className="mt-0.5 text-base font-semibold tabular-nums text-neutral-900">
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[10px] text-neutral-500">{sub}</p>}
    </div>
  );
}

function RentScheduleTable({
  schedule,
  totalSf,
}: {
  schedule: RentScheduleEntry[];
  totalSf: number;
}) {
  const maxRate = Math.max(...schedule.map((e) => e.baseRentPsf));
  return (
    <div className="overflow-hidden rounded-md border border-neutral-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="px-3 py-2">Months</th>
            <th className="px-3 py-2">$/SF</th>
            <th className="w-1/3 px-3 py-2">Rate</th>
            {totalSf > 0 && <th className="px-3 py-2">Annual</th>}
            <th className="px-3 py-2">Notes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {schedule.map((e, i) => {
            const widthPct = maxRate > 0 ? (e.baseRentPsf / maxRate) * 100 : 0;
            return (
              <tr key={i}>
                <td className="px-3 py-2 font-mono text-xs">
                  {e.fromMonth}
                  {e.toMonth !== e.fromMonth ? ` – ${e.toMonth}` : ""}
                </td>
                <td className="px-3 py-2 font-mono tabular-nums">
                  ${e.baseRentPsf.toFixed(2)}
                </td>
                <td className="px-3 py-2">
                  <div className="h-2 w-full rounded-full bg-neutral-100">
                    <div
                      className="h-2 rounded-full bg-blue-500"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </td>
                {totalSf > 0 && (
                  <td className="px-3 py-2 font-mono text-xs tabular-nums text-neutral-600">
                    $
                    {Math.round(e.baseRentPsf * totalSf).toLocaleString()}
                  </td>
                )}
                <td className="px-3 py-2 text-xs text-neutral-500">
                  {e.notes ?? ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function monthsBetween(startISO: string, endISO: string): number {
  const s = new Date(startISO);
  const e = new Date(endISO);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
  return Math.max(
    1,
    (e.getUTCFullYear() - s.getUTCFullYear()) * 12 +
      (e.getUTCMonth() - s.getUTCMonth()),
  );
}
