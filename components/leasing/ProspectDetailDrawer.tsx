"use client";

import { useState } from "react";
import {
  formatDate,
  formatPsf,
  formatSf,
  PROSPECT_SOURCE_LABELS,
  PROSPECT_STAGE_META,
  stageMeta,
} from "@/lib/prospectStages";
import { toastError, toastSuccess } from "@/components/ui/Toaster";
import { api } from "@/lib/trpc/react";
import type { ProspectListItem } from "./types";

interface Props {
  prospect: ProspectListItem | null;
  onClose: () => void;
  onEdit: (p: ProspectListItem) => void;
}

/**
 * Read-only detail drawer. Shows the full record plus the chronological
 * activity log (stage transitions + free-form notes). Quick-action footer
 * lets the broker advance the stage or jot a note without opening the
 * full edit form.
 */
export function ProspectDetailDrawer({ prospect, onClose, onEdit }: Props) {
  const utils = api.useUtils();
  const activityQuery = api.leasingProspect.activity.useQuery(
    { prospectId: prospect?.id ?? "" },
    { enabled: Boolean(prospect?.id), retry: false },
  );

  const setStage = api.leasingProspect.setStage.useMutation({
    onSuccess: async () => {
      await utils.leasingProspect.list.invalidate();
      await utils.leasingProspect.summary.invalidate();
      if (prospect?.id) {
        await utils.leasingProspect.activity.invalidate({
          prospectId: prospect.id,
        });
      }
      toastSuccess("Stage updated");
    },
    onError: (e) => toastError(e.message),
  });

  const addNote = api.leasingProspect.addNote.useMutation({
    onSuccess: async () => {
      if (prospect?.id) {
        await utils.leasingProspect.activity.invalidate({
          prospectId: prospect.id,
        });
      }
      setNote("");
      toastSuccess("Note added");
    },
    onError: (e) => toastError(e.message),
  });

  const deleteProspect = api.leasingProspect.delete.useMutation({
    onSuccess: async () => {
      await utils.leasingProspect.list.invalidate();
      await utils.leasingProspect.summary.invalidate();
      toastSuccess("Prospect deleted");
      onClose();
    },
    onError: (e) => toastError(e.message),
  });

  const [note, setNote] = useState("");

  if (!prospect) return null;
  const meta = stageMeta(prospect.stage);
  const rent = prospect.proposed_rent_psf ?? prospect.asking_rent_psf;

  function handleDelete() {
    if (!prospect) return;
    if (
      window.confirm(
        `Delete prospect "${prospect.name}"? This cannot be undone.`,
      )
    ) {
      deleteProspect.mutate({ id: prospect.id });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="flex-1 bg-neutral-900/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="flex w-full max-w-xl flex-col overflow-y-auto bg-white shadow-xl">
        <header className="border-b border-neutral-200 px-6 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-semibold text-neutral-900">
                {prospect.name}
              </h2>
              {prospect.code && (
                <p className="font-mono text-xs text-neutral-500">
                  {prospect.code}
                </p>
              )}
            </div>
            <span
              className={`flex-shrink-0 rounded-md border px-2 py-1 text-xs font-medium ${meta.chipClass}`}
            >
              {meta.label}
            </span>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => onEdit(prospect)}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Edit
            </button>
            <button
              onClick={handleDelete}
              className="rounded-md border border-rose-200 bg-white px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50"
            >
              Delete
            </button>
            <button
              onClick={onClose}
              className="ml-auto rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-50"
            >
              Close
            </button>
          </div>
        </header>

        <section className="border-b border-neutral-200 px-6 py-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Quick stage change
          </h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {PROSPECT_STAGE_META.map((m) => (
              <button
                key={m.key}
                disabled={setStage.isPending || m.key === prospect.stage}
                onClick={() =>
                  setStage.mutate({ id: prospect.id, stage: m.key as never })
                }
                className={`rounded-md border px-2 py-1 text-xs font-medium ${
                  m.key === prospect.stage
                    ? `${m.chipClass} ring-1 ring-neutral-400`
                    : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-neutral-200 px-6 py-4 text-sm">
          <Stat label="Requested SF" value={formatSf(prospect.requested_sf)} />
          <Stat label="Term" value={prospect.term_months ? `${prospect.term_months} months` : "—"} />
          <Stat label="Asking rent" value={formatPsf(prospect.asking_rent_psf)} />
          <Stat label="Proposed rent" value={formatPsf(prospect.proposed_rent_psf)} />
          <Stat label="TI allowance" value={formatPsf(prospect.ti_allowance_psf)} />
          <Stat label="Free rent" value={prospect.free_rent_months ? `${prospect.free_rent_months} months` : "—"} />
          <Stat label="Target commencement" value={formatDate(prospect.target_commencement)} />
          <Stat label="Probability" value={prospect.probability_pct == null ? "—" : `${prospect.probability_pct}%`} />
          {rent != null && prospect.requested_sf != null && prospect.term_months != null && (
            <Stat
              label="Term value"
              value={
                "$" +
                (
                  rent *
                  prospect.requested_sf *
                  (prospect.term_months / 12)
                ).toLocaleString(undefined, { maximumFractionDigits: 0 })
              }
            />
          )}
          <Stat label="Source" value={prospect.source ? PROSPECT_SOURCE_LABELS[prospect.source] ?? prospect.source : "—"} />
        </section>

        <section className="border-b border-neutral-200 px-6 py-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Property
          </h3>
          <p className="mt-1 text-sm text-neutral-700">
            {prospect.project ? (
              <>
                <span className="font-mono">
                  {prospect.project.code}
                  {prospect.building && `-${prospect.building.code}`}
                  {prospect.space && `-${prospect.space.code}`}
                </span>{" "}
                — {prospect.project.name}
              </>
            ) : (
              <span className="text-neutral-400">No property linked yet</span>
            )}
          </p>
        </section>

        <section className="border-b border-neutral-200 px-6 py-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Broker / contact
          </h3>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <p className="text-neutral-700">
              <span className="text-neutral-400">Brokerage</span>{" "}
              {prospect.broker_company ?? "—"}
            </p>
            <p className="text-neutral-700">
              <span className="text-neutral-400">Broker</span>{" "}
              {prospect.broker_name ?? "—"}
            </p>
            {prospect.broker_email && (
              <p className="text-neutral-700">
                <a
                  href={`mailto:${prospect.broker_email}`}
                  className="text-blue-600 hover:underline"
                >
                  {prospect.broker_email}
                </a>
              </p>
            )}
            {prospect.broker_phone && (
              <p className="text-neutral-700">{prospect.broker_phone}</p>
            )}
            {prospect.contact_name && (
              <p className="text-neutral-700">
                <span className="text-neutral-400">Direct contact</span>{" "}
                {prospect.contact_name}
              </p>
            )}
            {prospect.contact_email && (
              <p className="text-neutral-700">
                <a
                  href={`mailto:${prospect.contact_email}`}
                  className="text-blue-600 hover:underline"
                >
                  {prospect.contact_email}
                </a>
              </p>
            )}
          </div>
        </section>

        {(prospect.next_action || prospect.next_action_date) && (
          <section className="border-b border-neutral-200 bg-amber-50 px-6 py-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-900">
              Next action
            </h3>
            <p className="mt-1 text-sm text-amber-900">
              {prospect.next_action ?? "—"}
            </p>
            {prospect.next_action_date && (
              <p className="text-xs text-amber-700">
                Due {formatDate(prospect.next_action_date)}
              </p>
            )}
          </section>
        )}

        {prospect.lost_reason && (
          <section className="border-b border-neutral-200 bg-rose-50 px-6 py-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-rose-900">
              Lost reason
            </h3>
            <p className="mt-1 text-sm text-rose-900">{prospect.lost_reason}</p>
          </section>
        )}

        {prospect.notes && (
          <section className="border-b border-neutral-200 px-6 py-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Notes
            </h3>
            <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-700">
              {prospect.notes}
            </p>
          </section>
        )}

        <section className="border-b border-neutral-200 px-6 py-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Add a note
          </h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!note.trim() || !prospect) return;
              addNote.mutate({ prospectId: prospect.id, note: note.trim() });
            }}
            className="mt-2 flex flex-col gap-2"
          >
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Quick activity note — tour feedback, call summary, etc."
              className="w-full resize-y rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
            />
            <button
              type="submit"
              disabled={!note.trim() || addNote.isPending}
              className="self-end rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {addNote.isPending ? "Saving…" : "Add note"}
            </button>
          </form>
        </section>

        <section className="px-6 py-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Activity log
          </h3>
          {activityQuery.isLoading && (
            <p className="mt-2 text-sm text-neutral-400">Loading…</p>
          )}
          {activityQuery.data && activityQuery.data.length === 0 && (
            <p className="mt-2 text-sm text-neutral-400">No activity yet.</p>
          )}
          {activityQuery.data && activityQuery.data.length > 0 && (
            <ol className="mt-2 space-y-2 border-l border-neutral-200 pl-4">
              {activityQuery.data.map(
                (a: {
                  id: string;
                  kind: string;
                  from_stage: string | null;
                  to_stage: string | null;
                  note: string | null;
                  occurred_at: string;
                }) => (
                  <li key={a.id} className="relative">
                    <span className="absolute -left-[1.275rem] top-1 inline-block h-2 w-2 rounded-full bg-neutral-300" />
                    <p className="text-xs text-neutral-500">
                      {new Date(a.occurred_at).toLocaleString()} ·{" "}
                      <span className="font-medium uppercase tracking-wide">
                        {a.kind.replace(/_/g, " ")}
                      </span>
                    </p>
                    {a.note && (
                      <p className="text-sm text-neutral-700">{a.note}</p>
                    )}
                  </li>
                ),
              )}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-neutral-400">{label}</p>
      <p className="text-sm font-medium text-neutral-800">{value}</p>
    </div>
  );
}
