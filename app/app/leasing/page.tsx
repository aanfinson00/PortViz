"use client";

import { useMemo, useState } from "react";
import { AppNav } from "@/components/layout/AppNav";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { PipelineSummary } from "@/components/leasing/PipelineSummary";
import { ProspectDetailDrawer } from "@/components/leasing/ProspectDetailDrawer";
import { ProspectForm } from "@/components/leasing/ProspectForm";
import { ProspectPipeline } from "@/components/leasing/ProspectPipeline";
import { ProspectTable } from "@/components/leasing/ProspectTable";
import { TestFitsSection } from "@/components/leasing/TestFitsSection";
import { UploadProspects } from "@/components/leasing/UploadProspects";
import type { ProspectListItem } from "@/components/leasing/types";
import { toastError, toastSuccess } from "@/components/ui/Toaster";
import { api } from "@/lib/trpc/react";

type View = "pipeline" | "table";

/**
 * Leasing tracker page. Replaces the manual spreadsheets brokerage teams
 * keep to track deals — see /api/leasing-prospects/import for the Excel
 * upload + the leasingProspect router for the data model.
 *
 * UI shape:
 *   - Header: nav, project filter, view toggle (pipeline | table),
 *             upload, new prospect.
 *   - PipelineSummary strip: counts + SF + weighted-revenue rollup.
 *   - Body: Kanban board (default) or table.
 *   - Drawers: detail view, add/edit form, upload modal.
 */
export default function LeasingPage() {
  const me = api.auth.me.useQuery(undefined, { retry: false });
  const projectsQuery = api.project.list.useQuery(undefined, {
    retry: false,
    enabled: me.data?.signedIn === true && !!me.data?.orgId,
  });
  const prospectsQuery = api.leasingProspect.list.useQuery(undefined, {
    retry: false,
    enabled: me.data?.signedIn === true && !!me.data?.orgId,
  });
  const summaryQuery = api.leasingProspect.summary.useQuery(undefined, {
    retry: false,
    enabled: me.data?.signedIn === true && !!me.data?.orgId,
  });
  const utils = api.useUtils();
  const setStage = api.leasingProspect.setStage.useMutation({
    onSuccess: async () => {
      await utils.leasingProspect.list.invalidate();
      await utils.leasingProspect.summary.invalidate();
      toastSuccess("Stage updated");
    },
    onError: (e) => toastError(e.message),
  });

  const [view, setView] = useState<View>("pipeline");
  const [hideTerminal, setHideTerminal] = useState(true);
  const [projectFilter, setProjectFilter] = useState<string>("");
  const [stageFilter, setStageFilter] = useState<string>("");
  const [search, setSearch] = useState("");

  const [uploadOpen, setUploadOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProspectListItem | null>(null);
  const [detail, setDetail] = useState<ProspectListItem | null>(null);

  const all = (prospectsQuery.data ?? []) as unknown as ProspectListItem[];

  const filtered = useMemo(() => {
    let list = all;
    if (projectFilter) {
      list = list.filter((p) => p.project_id === projectFilter);
    }
    if (stageFilter) {
      list = list.filter((p) => p.stage === stageFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.code ?? "").toLowerCase().includes(q) ||
          (p.broker_company ?? "").toLowerCase().includes(q) ||
          (p.broker_name ?? "").toLowerCase().includes(q) ||
          (p.contact_name ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [all, projectFilter, stageFilter, search]);

  function handleNew() {
    setEditing(null);
    setFormOpen(true);
  }

  function handleEdit(p: ProspectListItem) {
    setEditing(p);
    setDetail(null);
    setFormOpen(true);
  }

  function handleMove(p: ProspectListItem, toStage: string) {
    setStage.mutate({ id: p.id, stage: toStage as never });
  }

  const authStatus =
    me.isLoading
      ? "loading"
      : me.data?.signedIn === false
        ? "signed_out"
        : !me.data?.orgId
          ? "no_org"
          : "ready";

  return (
    <main className="flex h-screen flex-col bg-neutral-100">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 bg-white px-6 py-3">
        <div className="flex items-center gap-4">
          <AppNav />
          <div>
            <h1 className="text-lg font-semibold">Leasing pipeline</h1>
            <p className="text-xs text-neutral-500">
              Track prospects from cold lead through executed lease.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-neutral-200 bg-neutral-50 p-0.5 text-xs">
            <button
              onClick={() => setView("pipeline")}
              className={`rounded px-2 py-1 ${
                view === "pipeline"
                  ? "bg-white text-neutral-900 shadow-sm"
                  : "text-neutral-500 hover:text-neutral-900"
              }`}
            >
              Pipeline
            </button>
            <button
              onClick={() => setView("table")}
              className={`rounded px-2 py-1 ${
                view === "table"
                  ? "bg-white text-neutral-900 shadow-sm"
                  : "text-neutral-500 hover:text-neutral-900"
              }`}
            >
              Table
            </button>
          </div>
          <button
            onClick={() => setUploadOpen(true)}
            className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Upload Excel
          </button>
          <button
            onClick={handleNew}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
          >
            New prospect
          </button>
        </div>
      </header>

      <div className="border-b border-neutral-200 bg-white px-6 py-2">
        <Breadcrumb crumbs={[{ label: "Leasing" }]} />
      </div>

      {authStatus === "loading" && (
        <p className="p-6 text-sm text-neutral-500">Checking session…</p>
      )}
      {authStatus === "signed_out" && (
        <p className="p-6 text-sm text-amber-700">
          You&rsquo;re signed out. Sign in to view your leasing pipeline.
        </p>
      )}
      {authStatus === "no_org" && (
        <p className="p-6 text-sm text-amber-700">
          You&rsquo;re signed in but don&rsquo;t belong to any organization yet.
        </p>
      )}

      {authStatus === "ready" && (
        <>
          <div className="border-b border-neutral-200 bg-white px-6 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search prospects, brokers, contacts…"
                className="w-64 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              />
              <select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              >
                <option value="">All projects</option>
                {(
                  (projectsQuery.data ?? []) as Array<{
                    id: string;
                    code: string;
                    name: string;
                  }>
                ).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.name}
                  </option>
                ))}
              </select>
              {view === "table" && (
                <select
                  value={stageFilter}
                  onChange={(e) => setStageFilter(e.target.value)}
                  className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                >
                  <option value="">All stages</option>
                  <option value="prospect">Prospect</option>
                  <option value="tour">Tour</option>
                  <option value="rfp">RFP</option>
                  <option value="proposal">Proposal</option>
                  <option value="loi">LOI</option>
                  <option value="lease_out">Lease Out</option>
                  <option value="executed">Executed</option>
                  <option value="dead">Dead</option>
                  <option value="on_hold">On Hold</option>
                </select>
              )}
              {view === "pipeline" && (
                <label className="flex items-center gap-1.5 text-xs text-neutral-600">
                  <input
                    type="checkbox"
                    checked={hideTerminal}
                    onChange={(e) => setHideTerminal(e.target.checked)}
                  />
                  Hide dead / on-hold columns
                </label>
              )}
              <span className="ml-auto text-xs text-neutral-500">
                {filtered.length} of {all.length} prospects
              </span>
            </div>
          </div>

          <div className="border-b border-neutral-200 bg-neutral-100 px-6 py-3">
            <PipelineSummary summary={summaryQuery.data ?? undefined} />
          </div>

          {view === "pipeline" && all.length > 0 && (
            <div className="border-b border-neutral-200 bg-neutral-100 px-6 py-3">
              <TestFitsSection prospects={filtered} />
            </div>
          )}

          <section className="flex-1 overflow-hidden px-6 py-4">
            {prospectsQuery.isLoading && (
              <p className="text-sm text-neutral-500">Loading prospects…</p>
            )}
            {prospectsQuery.isError && (
              <p className="text-sm text-red-600">
                Couldn&rsquo;t load prospects. {prospectsQuery.error.message}
                <br />
                <span className="text-xs text-red-500">
                  If you see &ldquo;relation does not exist,&rdquo; apply
                  migration 0014_leasing_tracker.sql to your Supabase project.
                </span>
              </p>
            )}
            {prospectsQuery.data && all.length === 0 && (
              <EmptyState
                onNew={handleNew}
                onUpload={() => setUploadOpen(true)}
              />
            )}
            {prospectsQuery.data &&
              all.length > 0 &&
              (view === "pipeline" ? (
                <ProspectPipeline
                  prospects={filtered}
                  onOpen={(p) => setDetail(p)}
                  onMove={handleMove}
                  hideTerminal={hideTerminal}
                />
              ) : (
                <ProspectTable
                  prospects={filtered}
                  onOpen={(p) => setDetail(p)}
                />
              ))}
          </section>
        </>
      )}

      <UploadProspects open={uploadOpen} onClose={() => setUploadOpen(false)} />
      <ProspectForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        initial={editing}
      />
      <ProspectDetailDrawer
        prospect={detail}
        onClose={() => setDetail(null)}
        onEdit={(p) => handleEdit(p)}
      />
    </main>
  );
}

function EmptyState({
  onNew,
  onUpload,
}: {
  onNew: () => void;
  onUpload: () => void;
}) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h2 className="text-xl font-semibold text-neutral-800">
        Your pipeline is empty
      </h2>
      <p className="mt-2 text-sm text-neutral-600">
        Track leasing prospects from cold lead through executed lease — tours,
        RFPs, proposals, LOIs, and the deals you lose. Start by uploading the
        spreadsheet your brokers already keep, or add prospects one at a time.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <button
          onClick={onUpload}
          className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Upload Excel
        </button>
        <button
          onClick={onNew}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
        >
          New prospect
        </button>
      </div>
    </div>
  );
}
