"use client";

import Link from "next/link";

interface CompRow {
  id: string;
  tenant_name: string | null;
  building_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  sf: number | null;
  rent_psf: number | string | null;
  lease_type: string | null;
  term_months: number | null;
  deal_date: string | null;
  lng: number | null;
  lat: number | null;
}

interface Props {
  comps: CompRow[];
  isLoading: boolean;
}

/**
 * Lists the comps assigned to this property. Sister surface to the
 * flow-map overlay on the hero — same data, just legible in table form
 * for brokers who want the underlying numbers. Sorted by deal date desc
 * so the freshest deals lead.
 */
export function ProjectComps({ comps, isLoading }: Props) {
  if (isLoading) {
    return <p className="text-sm text-neutral-500">Loading comps&hellip;</p>;
  }
  if (comps.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-500">
        No comps assigned to this property yet.{" "}
        <Link href="/app/comps" className="text-blue-600 hover:underline">
          Manage comps →
        </Link>
      </div>
    );
  }
  const sorted = [...comps].sort((a, b) => {
    const ad = a.deal_date ?? "";
    const bd = b.deal_date ?? "";
    return bd.localeCompare(ad);
  });

  // Aggregate metrics: weighted avg rent, total SF.
  let totalSf = 0;
  let weighted = 0;
  let weighting = 0;
  for (const c of sorted) {
    const sf = c.sf ?? 0;
    const rent = c.rent_psf == null ? null : Number(c.rent_psf);
    totalSf += sf;
    if (rent != null && Number.isFinite(rent) && sf > 0) {
      weighted += rent * sf;
      weighting += sf;
    }
  }
  const wAvg = weighting > 0 ? weighted / weighting : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2 text-xs">
        <Stat label="Comps" value={String(sorted.length)} />
        <Stat label="Total SF" value={totalSf.toLocaleString()} />
        <Stat
          label="Wtd avg $/SF"
          value={wAvg != null ? `$${wAvg.toFixed(2)}` : "—"}
        />
      </div>
      <div className="overflow-hidden rounded-md border border-neutral-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-3 py-2">Tenant / Building</th>
              <th className="px-3 py-2">SF</th>
              <th className="px-3 py-2">$/SF</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Where</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {sorted.map((c) => (
              <tr key={c.id} className="hover:bg-neutral-50 align-top">
                <td className="px-3 py-2">
                  <p className="font-medium">
                    {c.tenant_name ?? c.building_name ?? "(unnamed)"}
                  </p>
                  {c.tenant_name && c.building_name && (
                    <p className="text-xs text-neutral-500">
                      {c.building_name}
                    </p>
                  )}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {c.sf ? c.sf.toLocaleString() : "—"}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {c.rent_psf != null
                    ? `$${Number(c.rent_psf).toFixed(2)}`
                    : "—"}
                  {c.lease_type && (
                    <span className="ml-1 text-[10px] uppercase tracking-wide text-neutral-500">
                      {c.lease_type.replace(/_/g, " ")}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs">{c.deal_date ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-neutral-600">
                  {c.address}
                  {c.address && (c.city || c.state) ? <br /> : null}
                  {[c.city, c.state].filter(Boolean).join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-neutral-200 bg-white px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
        {label}
      </p>
      <p className="mt-0.5 text-base font-semibold tabular-nums">{value}</p>
    </div>
  );
}
