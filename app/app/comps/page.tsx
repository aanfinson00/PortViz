"use client";

import { useMemo, useRef, useState } from "react";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { CompAssignModal } from "@/components/comps/CompAssignModal";
import { CompLocateModal } from "@/components/comps/CompLocateModal";
import { toastError, toastInfo, toastSuccess } from "@/components/ui/Toaster";
import { parseCompsXlsx, type ParsedComp } from "@/lib/compImport";
import { geocodeBatch } from "@/lib/geocode";
import { api } from "@/lib/trpc/react";

type CompRow = {
  id: string;
  kind: string | null;
  tenant_name: string | null;
  building_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  lng: number | null;
  lat: number | null;
  sf: number | null;
  rent_psf: number | null;
  lease_type: string | null;
  term_months: number | null;
  deal_date: string | null;
  source: string | null;
  notes: string | null;
  comp_assignment: Array<{ project_id: string }> | null;
};

export default function CompsPage() {
  const utils = api.useUtils();
  const compsQuery = api.comp.list.useQuery(undefined, { retry: false });
  const projectsQuery = api.project.list.useQuery(undefined, { retry: false });

  const fileRef = useRef<HTMLInputElement | null>(null);
  const [assignTarget, setAssignTarget] = useState<CompRow | null>(null);
  const [locateTarget, setLocateTarget] = useState<CompRow | null>(null);
  const [geocoding, setGeocoding] = useState<{
    done: number;
    total: number;
  } | null>(null);

  const bulkInsert = api.comp.bulkInsert.useMutation({
    onSuccess: async (res) => {
      await utils.comp.list.invalidate();
      toastSuccess(`Imported ${res.inserted} comp${res.inserted === 1 ? "" : "s"}`);
    },
    onError: (err) => toastError(err.message),
  });

  const deleteMut = api.comp.delete.useMutation({
    onSuccess: async () => {
      await utils.comp.list.invalidate();
      toastSuccess("Comp deleted");
    },
    onError: (err) => toastError(err.message),
  });

  async function handleFile(file: File) {
    try {
      const buf = await file.arrayBuffer();
      const parsed = parseCompsXlsx(buf);
      if (parsed.errors.length > 0) {
        toastInfo(
          `${parsed.errors.length} row${parsed.errors.length === 1 ? "" : "s"} skipped (missing fields)`,
        );
      }
      if (parsed.comps.length === 0) {
        toastError("No usable rows in that file.");
        return;
      }

      // Geocode rows that have an address but no explicit lng/lat. We do
      // this client-side in parallel batches so the user sees a live
      // progress indicator and the resulting coords get inserted with
      // the row in a single bulkInsert call.
      const queries = parsed.comps.map((c) => {
        if (c.lng != null && c.lat != null) return null;
        const parts = [c.address, c.city, c.state].filter(Boolean);
        return parts.length > 0 ? parts.join(", ") : null;
      });
      const needsGeocode = queries.filter(Boolean).length;
      let geocodedCount = 0;
      let resolved: Array<{ lng: number; lat: number } | null> = [];
      if (needsGeocode > 0) {
        setGeocoding({ done: 0, total: needsGeocode });
        // Walk the queries through the batch helper; null entries (rows
        // already located) cost zero requests.
        resolved = await geocodeBatch(queries, {
          concurrency: 4,
          onProgress: (done, total) => {
            // The helper reports progress over every entry incl. nulls;
            // we only want to surface count over rows that actually
            // dispatched a request, so derive that from the non-null
            // count up to this point. Approximation is fine for UI.
            void total;
            geocodedCount = Math.min(done, needsGeocode);
            setGeocoding({ done: geocodedCount, total: needsGeocode });
          },
        });
        const located = resolved.filter(Boolean).length;
        setGeocoding(null);
        if (located > 0) {
          toastInfo(
            `Geocoded ${located} of ${needsGeocode} address${needsGeocode === 1 ? "" : "es"}`,
          );
        } else if (needsGeocode > 0) {
          toastInfo(
            "Couldn't geocode any addresses — drop pins manually via Locate.",
          );
        }
      }

      bulkInsert.mutate({
        comps: parsed.comps.map((c: ParsedComp, i) => {
          const fallback = resolved[i];
          return {
            kind: c.kind,
            tenantName: c.tenantName,
            buildingName: c.buildingName,
            address: c.address,
            city: c.city,
            state: c.state,
            lng: c.lng ?? fallback?.lng ?? null,
            lat: c.lat ?? fallback?.lat ?? null,
            sf: c.sf,
            rentPsf: c.rentPsf,
            leaseType: c.leaseType,
            termMonths: c.termMonths,
            dealDate: c.dealDate,
            source: c.source,
            notes: c.notes,
          };
        }),
      });
    } catch (err) {
      setGeocoding(null);
      toastError(
        err instanceof Error ? err.message : "Couldn't read that file.",
      );
    }
  }

  const rows = (compsQuery.data ?? []) as CompRow[];
  type ProjectRow = {
    id: string;
    code: string;
    name: string;
    lng?: number | null;
    lat?: number | null;
  };
  const projects = (projectsQuery.data ?? []) as ProjectRow[];
  const projectByID = useMemo(() => {
    const m = new Map<string, { code: string; name: string }>();
    for (const p of projects) m.set(p.id, { code: p.code, name: p.name });
    return m;
  }, [projects]);
  // Use the first geocoded project as the "center on this part of the
  // world" hint when a comp has no coords yet.
  const firstProjectCenter = useMemo<[number, number] | null>(() => {
    for (const p of projects) {
      if (p.lng != null && p.lat != null) return [p.lng, p.lat];
    }
    return null;
  }, [projects]);

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-8">
      <Breadcrumb crumbs={[{ label: "Comps" }]} />

      <header className="mt-4 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Lease comps</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Recent deals at competitor properties. Upload a CSV/XLSX, then
            assign each comp to the properties it informs &mdash; assigned
            comps appear on the property dashboard&rsquo;s flow map.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={bulkInsert.isPending || geocoding != null}
            className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          >
            {geocoding
              ? `Geocoding ${geocoding.done}/${geocoding.total}…`
              : bulkInsert.isPending
                ? "Importing…"
                : "Upload comps"}
          </button>
        </div>
      </header>

      <details className="mt-4 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
        <summary className="cursor-pointer font-medium text-neutral-700">
          Expected columns
        </summary>
        <p className="mt-2 leading-relaxed">
          Headers are matched loosely (case-insensitive, underscores and spaces
          OK). Use any subset of:{" "}
          <code className="rounded bg-white px-1">tenant_name</code>,{" "}
          <code className="rounded bg-white px-1">building_name</code>,{" "}
          <code className="rounded bg-white px-1">address</code>,{" "}
          <code className="rounded bg-white px-1">city</code>,{" "}
          <code className="rounded bg-white px-1">state</code>,{" "}
          <code className="rounded bg-white px-1">lng</code>,{" "}
          <code className="rounded bg-white px-1">lat</code>,{" "}
          <code className="rounded bg-white px-1">sf</code>,{" "}
          <code className="rounded bg-white px-1">rent_psf</code>,{" "}
          <code className="rounded bg-white px-1">lease_type</code>,{" "}
          <code className="rounded bg-white px-1">term_months</code>,{" "}
          <code className="rounded bg-white px-1">deal_date</code>,{" "}
          <code className="rounded bg-white px-1">source</code>,{" "}
          <code className="rounded bg-white px-1">notes</code>. A row needs at
          least one of (tenant_name / building_name / address) plus sf or
          rent_psf.
        </p>
        <p className="mt-2 leading-relaxed">
          Rows with an address but no <code className="rounded bg-white px-1">lng</code>/
          <code className="rounded bg-white px-1">lat</code> are auto-geocoded
          via Mapbox during upload. Anything that doesn&rsquo;t resolve gets
          a missing-coords flag &mdash; drop a pin manually via the row&rsquo;s
          Locate button.
        </p>
      </details>

      {compsQuery.isLoading && (
        <p className="mt-8 text-sm text-neutral-500">Loading comps&hellip;</p>
      )}
      {compsQuery.isError && (
        <p className="mt-8 text-sm text-red-600">{compsQuery.error.message}</p>
      )}

      {rows.length === 0 && compsQuery.data && (
        <p className="mt-8 rounded-md border border-dashed border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-500">
          No comps yet. Upload a file to start populating the flow map.
        </p>
      )}

      {rows.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-md border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2">Tenant / Building</th>
                <th className="px-3 py-2">Location</th>
                <th className="px-3 py-2">SF</th>
                <th className="px-3 py-2">$/SF</th>
                <th className="px-3 py-2">Term</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Assigned to</th>
                <th className="px-3 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((c) => {
                const assigned = c.comp_assignment ?? [];
                return (
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
                      {c.notes && (
                        <p className="mt-0.5 text-xs text-neutral-500">
                          {c.notes}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-neutral-600">
                      {c.address}
                      {c.address && (c.city || c.state) ? <br /> : null}
                      {[c.city, c.state].filter(Boolean).join(", ")}
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
                    <td className="px-3 py-2 tabular-nums text-xs">
                      {c.term_months ? `${c.term_months} mo` : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {c.deal_date ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {assigned.length === 0 ? (
                          <span className="text-xs text-neutral-400">—</span>
                        ) : (
                          assigned.map((a) => {
                            const proj = projectByID.get(a.project_id);
                            return (
                              <span
                                key={a.project_id}
                                className="rounded-full border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 font-mono text-[10px]"
                              >
                                {proj?.code ?? a.project_id.slice(0, 4)}
                              </span>
                            );
                          })
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right text-xs">
                      <div className="flex justify-end gap-3">
                        <button
                          onClick={() => setLocateTarget(c)}
                          className={
                            c.lng != null && c.lat != null
                              ? "text-neutral-500 hover:text-neutral-800 hover:underline"
                              : "font-medium text-amber-600 hover:underline"
                          }
                          title={
                            c.lng != null && c.lat != null
                              ? "Adjust pin location"
                              : "Drop a pin so this comp shows on the flow map"
                          }
                        >
                          {c.lng != null && c.lat != null
                            ? "Locate"
                            : "Locate ⚠"}
                        </button>
                        <button
                          onClick={() => setAssignTarget(c)}
                          className="text-blue-600 hover:underline"
                        >
                          Assign
                        </button>
                        <button
                          onClick={() => {
                            if (
                              confirm(
                                `Delete this comp? This can't be undone.`,
                              )
                            ) {
                              deleteMut.mutate({ id: c.id });
                            }
                          }}
                          className="text-red-600 hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {assignTarget && (
        <CompAssignModal
          comp={{
            id: assignTarget.id,
            label:
              assignTarget.tenant_name ??
              assignTarget.building_name ??
              "(unnamed)",
            currentProjectIds: (assignTarget.comp_assignment ?? []).map(
              (a) => a.project_id,
            ),
          }}
          projects={projects}
          onClose={() => setAssignTarget(null)}
        />
      )}

      {locateTarget && (
        <CompLocateModal
          comp={{
            id: locateTarget.id,
            label:
              locateTarget.tenant_name ??
              locateTarget.building_name ??
              "(unnamed)",
            addressLine: [
              locateTarget.address,
              locateTarget.city,
              locateTarget.state,
            ]
              .filter(Boolean)
              .join(", ") || null,
            initialLng: locateTarget.lng,
            initialLat: locateTarget.lat,
          }}
          fallbackCenter={firstProjectCenter}
          onClose={() => setLocateTarget(null)}
        />
      )}
    </main>
  );
}
