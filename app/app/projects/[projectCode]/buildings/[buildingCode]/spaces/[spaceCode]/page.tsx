"use client";

import Link from "next/link";
import { use, useState } from "react";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { DocumentUpload } from "@/components/docs/DocumentUpload";
import { LeaseForm } from "@/components/lease/LeaseForm";
import { api } from "@/lib/trpc/react";

export default function SpaceDetailPage({
  params,
}: {
  params: Promise<{
    projectCode: string;
    buildingCode: string;
    spaceCode: string;
  }>;
}) {
  const { projectCode, buildingCode, spaceCode } = use(params);
  const query = api.space.byCompositeId.useQuery(
    {
      projectCode: projectCode.toUpperCase(),
      buildingCode: buildingCode.toUpperCase(),
      spaceCode: spaceCode.toUpperCase(),
    },
    { retry: false },
  );
  const leases = api.lease.listBySpace.useQuery(
    { spaceId: query.data?.space.id ?? "" },
    { enabled: Boolean(query.data?.space.id), retry: false },
  );

  const [showLeaseForm, setShowLeaseForm] = useState(false);

  const data = query.data;

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-8">
      <Breadcrumb
        crumbs={[
          {
            label: projectCode.toUpperCase(),
            href: `/app/projects/${projectCode.toUpperCase()}`,
          },
          {
            label: buildingCode.toUpperCase(),
            href: `/app/projects/${projectCode.toUpperCase()}/buildings/${buildingCode.toUpperCase()}`,
          },
          { label: spaceCode.toUpperCase() },
        ]}
      />

      {query.isLoading && (
        <p className="mt-8 text-sm text-neutral-500">Loading space…</p>
      )}

      {query.isError && (
        <p className="mt-8 text-sm text-red-600">{query.error.message}</p>
      )}

      {data === null && (
        <p className="mt-8 text-sm text-neutral-500">
          Space not found. Create spaces by saving a demising layout on the
          building page.
        </p>
      )}

      {data && (
        <>
          <header className="mt-4">
            <p className="font-mono text-xs text-neutral-500">
              {data.project.code}-{data.building.code}-{data.space.code}
            </p>
            <h1 className="text-3xl font-bold tracking-tight">
              Space {data.space.code}
            </h1>
            <p className="mt-1 text-sm text-neutral-600">
              {data.building.name ?? `Building ${data.building.code}`} ·
              status:{" "}
              <span className="font-medium">{data.space.status}</span>
            </p>
          </header>

          <section className="mt-10">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Leases</h2>
              {!showLeaseForm && (
                <button
                  onClick={() => setShowLeaseForm(true)}
                  className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
                >
                  Add lease
                </button>
              )}
            </div>

            {showLeaseForm && (
              <div className="mt-4 rounded-md border border-neutral-200 bg-white p-4">
                <LeaseForm
                  spaceId={data.space.id}
                  onCreated={() => setShowLeaseForm(false)}
                />
              </div>
            )}

            {leases.isLoading && (
              <p className="mt-4 text-sm text-neutral-500">Loading leases…</p>
            )}

            {leases.data && leases.data.length === 0 && !showLeaseForm && (
              <p className="mt-4 text-sm text-neutral-500">
                No leases on this space yet.
              </p>
            )}

            {leases.data && leases.data.length > 0 && (
              <ul className="mt-4 divide-y divide-neutral-100 rounded-md border border-neutral-200 bg-white">
                {leases.data.map(
                  (l: {
                    id: string;
                    start_date: string;
                    end_date: string;
                    base_rent_psf: number | null;
                    term_months: number | null;
                    ti_allowance_psf: number | null;
                    free_rent_months: number | null;
                    notes: string | null;
                  }) => (
                    <li key={l.id} className="px-4 py-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">
                          {l.start_date} → {l.end_date}
                        </span>
                        <span className="text-neutral-600">
                          {l.base_rent_psf ? `$${l.base_rent_psf}/SF` : "—"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-neutral-500">
                        {l.term_months ? `${l.term_months} mo` : ""}
                        {l.ti_allowance_psf
                          ? ` · $${l.ti_allowance_psf}/SF TI`
                          : ""}
                        {l.free_rent_months
                          ? ` · ${l.free_rent_months} mo free`
                          : ""}
                      </p>
                      {l.notes && (
                        <p className="mt-1 text-xs text-neutral-500">
                          {l.notes}
                        </p>
                      )}
                    </li>
                  ),
                )}
              </ul>
            )}
          </section>

          <section className="mt-10">
            <h2 className="text-lg font-semibold">Documents</h2>
            <div className="mt-4">
              <DocumentUpload
                entityType="space"
                entityId={data.space.id}
              />
            </div>
          </section>
        </>
      )}
    </main>
  );
}
