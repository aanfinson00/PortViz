"use client";

import { useState } from "react";
import {
  PROSPECT_STAGE_META,
  PROSPECT_SOURCE_LABELS,
  stageMeta,
} from "@/lib/prospectStages";
import {
  PROSPECT_STAGES,
  PROSPECT_SOURCES,
} from "@/server/trpc/routers/leasingProspect";

type ProspectStage = (typeof PROSPECT_STAGES)[number];
type ProspectSource = (typeof PROSPECT_SOURCES)[number];
import { toastError, toastSuccess } from "@/components/ui/Toaster";
import { api } from "@/lib/trpc/react";
import type { ProspectListItem } from "./types";

interface Props {
  open: boolean;
  onClose: () => void;
  initial?: ProspectListItem | null;
  onSaved?: (id: string) => void;
}

const STAGE_OPTIONS = PROSPECT_STAGE_META.map((s) => ({
  value: s.key,
  label: s.label,
}));

const SOURCE_OPTIONS = Object.entries(PROSPECT_SOURCE_LABELS).map(
  ([value, label]) => ({ value, label }),
);

/**
 * Add-or-edit drawer for a leasing prospect. Captures the full attribute
 * set in one form — split into "Deal", "Property", "Broker / contact",
 * "Economics", and "Notes" panels so the eye has somewhere to land.
 */
export function ProspectForm({ open, onClose, initial, onSaved }: Props) {
  const utils = api.useUtils();
  const projectsQuery = api.project.list.useQuery(undefined, {
    enabled: open,
    retry: false,
  });

  const create = api.leasingProspect.create.useMutation({
    onSuccess: async (p) => {
      await utils.leasingProspect.list.invalidate();
      await utils.leasingProspect.summary.invalidate();
      toastSuccess(`Created prospect ${p.name}`);
      onSaved?.(p.id);
      onClose();
    },
    onError: (e) => toastError(e.message),
  });
  const update = api.leasingProspect.update.useMutation({
    onSuccess: async (p) => {
      await utils.leasingProspect.list.invalidate();
      await utils.leasingProspect.summary.invalidate();
      await utils.leasingProspect.byId.invalidate({ id: p.id });
      toastSuccess(`Updated prospect ${p.name}`);
      onSaved?.(p.id);
      onClose();
    },
    onError: (e) => toastError(e.message),
  });

  const [form, setForm] = useState(() => initialForm(initial));
  const [lastInitialId, setLastInitialId] = useState<string | null>(
    initial?.id ?? null,
  );

  // Reset the form when a different prospect is opened.
  if ((initial?.id ?? null) !== lastInitialId) {
    setForm(initialForm(initial));
    setLastInitialId(initial?.id ?? null);
  }

  if (!open) return null;

  const isEdit = Boolean(initial);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      code: form.code || undefined,
      name: form.name,
      stage: form.stage as ProspectStage,
      source: (form.source || null) as ProspectSource | null,
      projectId: form.projectId || null,
      buildingId: form.buildingId || null,
      spaceId: form.spaceId || null,
      brokerCompany: nullable(form.brokerCompany),
      brokerName: nullable(form.brokerName),
      brokerEmail: nullable(form.brokerEmail),
      brokerPhone: nullable(form.brokerPhone),
      contactName: nullable(form.contactName),
      contactEmail: nullable(form.contactEmail),
      contactPhone: nullable(form.contactPhone),
      requestedSf: numOrNull(form.requestedSf),
      targetCommencement: form.targetCommencement || null,
      termMonths: intOrNull(form.termMonths),
      askingRentPsf: numOrNull(form.askingRentPsf),
      proposedRentPsf: numOrNull(form.proposedRentPsf),
      tiAllowancePsf: numOrNull(form.tiAllowancePsf),
      freeRentMonths: numOrNull(form.freeRentMonths),
      probabilityPct: intOrNull(form.probabilityPct),
      lastActivityDate: form.lastActivityDate || null,
      nextAction: nullable(form.nextAction),
      nextActionDate: form.nextActionDate || null,
      lostReason: nullable(form.lostReason),
      notes: nullable(form.notes),
    };

    if (isEdit && initial) {
      update.mutate({ id: initial.id, ...payload });
    } else {
      // For create, strip nullable optional fields where the user left
      // them empty — the router accepts undefined fine.
      create.mutate({
        ...payload,
        // create.input requires `name` non-empty; trust browser-required.
      });
    }
  }

  const meta = stageMeta(form.stage);
  const pending = create.isPending || update.isPending;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="flex-1 bg-neutral-900/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-2xl flex-col gap-4 overflow-y-auto bg-white p-6 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {isEdit ? "Edit prospect" : "New prospect"}
          </h2>
          <span
            className={`rounded border px-2 py-0.5 text-xs font-medium ${meta.chipClass}`}
          >
            {meta.label}
          </span>
        </div>

        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Deal
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" required>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                maxLength={200}
                className={inputClass}
              />
            </Field>
            <Field label="Code" hint="Optional short ID">
              <input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                maxLength={40}
                className={inputClass}
              />
            </Field>
            <Field label="Stage">
              <select
                value={form.stage}
                onChange={(e) => setForm({ ...form, stage: e.target.value })}
                className={inputClass}
              >
                {STAGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Source">
              <select
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
                className={inputClass}
              >
                <option value="">—</option>
                {SOURCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Probability %"
              hint={`Default for ${meta.label}: ${meta.defaultProbability}%`}
            >
              <input
                type="number"
                min={0}
                max={100}
                value={form.probabilityPct}
                onChange={(e) =>
                  setForm({ ...form, probabilityPct: e.target.value })
                }
                className={inputClass}
              />
            </Field>
            <Field label="Last activity">
              <input
                type="date"
                value={form.lastActivityDate}
                onChange={(e) =>
                  setForm({ ...form, lastActivityDate: e.target.value })
                }
                className={inputClass}
              />
            </Field>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Property
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Project">
              <select
                value={form.projectId}
                onChange={(e) =>
                  setForm({
                    ...form,
                    projectId: e.target.value,
                    buildingId: "",
                    spaceId: "",
                  })
                }
                className={inputClass}
              >
                <option value="">—</option>
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
            </Field>
            <Field label="Building" hint="Optional">
              <input
                value={form.buildingId}
                onChange={(e) =>
                  setForm({ ...form, buildingId: e.target.value })
                }
                placeholder="Building UUID (advanced)"
                className={inputClass}
              />
            </Field>
            <Field label="Space" hint="Optional">
              <input
                value={form.spaceId}
                onChange={(e) => setForm({ ...form, spaceId: e.target.value })}
                placeholder="Space UUID (advanced)"
                className={inputClass}
              />
            </Field>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Broker / contact
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Broker company">
              <input
                value={form.brokerCompany}
                onChange={(e) =>
                  setForm({ ...form, brokerCompany: e.target.value })
                }
                className={inputClass}
              />
            </Field>
            <Field label="Broker name">
              <input
                value={form.brokerName}
                onChange={(e) =>
                  setForm({ ...form, brokerName: e.target.value })
                }
                className={inputClass}
              />
            </Field>
            <Field label="Broker email">
              <input
                type="email"
                value={form.brokerEmail}
                onChange={(e) =>
                  setForm({ ...form, brokerEmail: e.target.value })
                }
                className={inputClass}
              />
            </Field>
            <Field label="Broker phone">
              <input
                value={form.brokerPhone}
                onChange={(e) =>
                  setForm({ ...form, brokerPhone: e.target.value })
                }
                className={inputClass}
              />
            </Field>
            <Field label="Direct contact name">
              <input
                value={form.contactName}
                onChange={(e) =>
                  setForm({ ...form, contactName: e.target.value })
                }
                className={inputClass}
              />
            </Field>
            <Field label="Direct contact email">
              <input
                type="email"
                value={form.contactEmail}
                onChange={(e) =>
                  setForm({ ...form, contactEmail: e.target.value })
                }
                className={inputClass}
              />
            </Field>
            <Field label="Direct contact phone">
              <input
                value={form.contactPhone}
                onChange={(e) =>
                  setForm({ ...form, contactPhone: e.target.value })
                }
                className={inputClass}
              />
            </Field>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Economics
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Requested SF">
              <input
                type="number"
                min={0}
                value={form.requestedSf}
                onChange={(e) =>
                  setForm({ ...form, requestedSf: e.target.value })
                }
                className={inputClass}
              />
            </Field>
            <Field label="Target commencement">
              <input
                type="date"
                value={form.targetCommencement}
                onChange={(e) =>
                  setForm({ ...form, targetCommencement: e.target.value })
                }
                className={inputClass}
              />
            </Field>
            <Field label="Term (months)">
              <input
                type="number"
                min={0}
                value={form.termMonths}
                onChange={(e) =>
                  setForm({ ...form, termMonths: e.target.value })
                }
                className={inputClass}
              />
            </Field>
            <Field label="Asking rent ($/SF/yr)">
              <input
                type="number"
                min={0}
                step={0.01}
                value={form.askingRentPsf}
                onChange={(e) =>
                  setForm({ ...form, askingRentPsf: e.target.value })
                }
                className={inputClass}
              />
            </Field>
            <Field label="Proposed rent ($/SF/yr)">
              <input
                type="number"
                min={0}
                step={0.01}
                value={form.proposedRentPsf}
                onChange={(e) =>
                  setForm({ ...form, proposedRentPsf: e.target.value })
                }
                className={inputClass}
              />
            </Field>
            <Field label="TI allowance ($/SF)">
              <input
                type="number"
                min={0}
                step={0.01}
                value={form.tiAllowancePsf}
                onChange={(e) =>
                  setForm({ ...form, tiAllowancePsf: e.target.value })
                }
                className={inputClass}
              />
            </Field>
            <Field label="Free rent (months)">
              <input
                type="number"
                min={0}
                step={0.1}
                value={form.freeRentMonths}
                onChange={(e) =>
                  setForm({ ...form, freeRentMonths: e.target.value })
                }
                className={inputClass}
              />
            </Field>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Next steps & notes
          </h3>
          <Field label="Next action">
            <input
              value={form.nextAction}
              onChange={(e) =>
                setForm({ ...form, nextAction: e.target.value })
              }
              placeholder="e.g. Send revised proposal by 5/30"
              className={inputClass}
            />
          </Field>
          <Field label="Next action date">
            <input
              type="date"
              value={form.nextActionDate}
              onChange={(e) =>
                setForm({ ...form, nextActionDate: e.target.value })
              }
              className={inputClass}
            />
          </Field>
          {form.stage === "dead" && (
            <Field label="Lost reason">
              <input
                value={form.lostReason}
                onChange={(e) =>
                  setForm({ ...form, lostReason: e.target.value })
                }
                placeholder="e.g. went with competitor across town"
                className={inputClass}
              />
            </Field>
          )}
          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={4}
              className={`${inputClass} resize-y`}
            />
          </Field>
        </section>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {pending ? "Saving…" : isEdit ? "Save changes" : "Create prospect"}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        {label}
        {required && <span className="ml-1 text-rose-500">*</span>}
      </span>
      {children}
      {hint && <span className="text-xs text-neutral-400">{hint}</span>}
    </label>
  );
}

interface FormState {
  code: string;
  name: string;
  stage: string;
  source: string;
  projectId: string;
  buildingId: string;
  spaceId: string;
  brokerCompany: string;
  brokerName: string;
  brokerEmail: string;
  brokerPhone: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  requestedSf: string;
  targetCommencement: string;
  termMonths: string;
  askingRentPsf: string;
  proposedRentPsf: string;
  tiAllowancePsf: string;
  freeRentMonths: string;
  probabilityPct: string;
  lastActivityDate: string;
  nextAction: string;
  nextActionDate: string;
  lostReason: string;
  notes: string;
}

function initialForm(p: ProspectListItem | null | undefined): FormState {
  return {
    code: p?.code ?? "",
    name: p?.name ?? "",
    stage: p?.stage ?? "prospect",
    source: p?.source ?? "",
    projectId: p?.project_id ?? "",
    buildingId: p?.building_id ?? "",
    spaceId: p?.space_id ?? "",
    brokerCompany: p?.broker_company ?? "",
    brokerName: p?.broker_name ?? "",
    brokerEmail: p?.broker_email ?? "",
    brokerPhone: p?.broker_phone ?? "",
    contactName: p?.contact_name ?? "",
    contactEmail: p?.contact_email ?? "",
    contactPhone: p?.contact_phone ?? "",
    requestedSf: p?.requested_sf?.toString() ?? "",
    targetCommencement: p?.target_commencement ?? "",
    termMonths: p?.term_months?.toString() ?? "",
    askingRentPsf: p?.asking_rent_psf?.toString() ?? "",
    proposedRentPsf: p?.proposed_rent_psf?.toString() ?? "",
    tiAllowancePsf: p?.ti_allowance_psf?.toString() ?? "",
    freeRentMonths: p?.free_rent_months?.toString() ?? "",
    probabilityPct: p?.probability_pct?.toString() ?? "",
    lastActivityDate: p?.last_activity_date ?? "",
    nextAction: p?.next_action ?? "",
    nextActionDate: p?.next_action_date ?? "",
    lostReason: p?.lost_reason ?? "",
    notes: p?.notes ?? "",
  };
}

function nullable(s: string): string | null {
  return s.trim() ? s.trim() : null;
}

function numOrNull(s: string): number | null {
  if (!s.trim()) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function intOrNull(s: string): number | null {
  const n = numOrNull(s);
  return n == null ? null : Math.round(n);
}
