"use client";

import { useState } from "react";
import { toastError, toastSuccess } from "@/components/ui/Toaster";
import { addMonthsMinusDay } from "@/lib/leaseDate";
import { api } from "@/lib/trpc/react";

interface LeaseFormProps {
  spaceId: string;
  onCreated?: () => void;
}

/**
 * Captures the core lease fields + economics (TI, free rent, commission) +
 * an optional note, then calls api.lease.create. Assumes the user has
 * already created at least one tenant; otherwise surfaces a helpful prompt.
 */
export function LeaseForm({ spaceId, onCreated }: LeaseFormProps) {
  const tenantsQuery = api.tenant.list.useQuery(undefined, { retry: false });
  const utils = api.useUtils();
  const create = api.lease.create.useMutation({
    onSuccess: async () => {
      await utils.lease.listBySpace.invalidate({ spaceId });
      toastSuccess("Lease saved");
      onCreated?.();
    },
    onError: (e) => toastError(e.message),
  });

  const [tenantId, setTenantId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [baseRentPsf, setBaseRentPsf] = useState("");
  // Industrial sweet-spot defaults; users override freely.
  const [escalationPct, setEscalationPct] = useState("3");
  const [termMonths, setTermMonths] = useState("60");
  const [tiAllowancePsf, setTiAllowancePsf] = useState("");
  const [freeRentMonths, setFreeRentMonths] = useState("");
  const [commissionPsf, setCommissionPsf] = useState("");
  const [securityDeposit, setSecurityDeposit] = useState("");
  const [notes, setNotes] = useState("");
  // Once the user manually edits the end date, stop auto-overwriting it on
  // start/term changes. Clearing the field re-arms the auto-compute.
  const [endDateDirty, setEndDateDirty] = useState(false);

  function syncEndDate(start: string, term: string) {
    if (endDateDirty) return;
    const next = addMonthsMinusDay(start, term);
    if (next) setEndDate(next);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantId || !startDate || !endDate) return;
    create.mutate({
      spaceId,
      tenantId,
      startDate,
      endDate,
      baseRentPsf: baseRentPsf ? Number(baseRentPsf) : undefined,
      escalationPct: escalationPct ? Number(escalationPct) : undefined,
      termMonths: termMonths ? Number(termMonths) : undefined,
      tiAllowancePsf: tiAllowancePsf ? Number(tiAllowancePsf) : undefined,
      freeRentMonths: freeRentMonths ? Number(freeRentMonths) : undefined,
      commissionPsf: commissionPsf ? Number(commissionPsf) : undefined,
      securityDeposit: securityDeposit ? Number(securityDeposit) : undefined,
      notes: notes || undefined,
    });
  }

  const tenantOptions =
    tenantsQuery.data?.map(
      (t: { id: string; code: string; name: string }) => ({
        value: t.id,
        label: `${t.code} — ${t.name}`,
      }),
    ) ?? [];

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field label="Tenant">
        <select
          value={tenantId}
          onChange={(e) => setTenantId(e.target.value)}
          required
          className={inputClass}
        >
          <option value="">Select a tenant…</option>
          {tenantOptions.map(
            (o: { value: string; label: string }) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ),
          )}
        </select>
        {tenantOptions.length === 0 && (
          <span className="text-xs text-neutral-500">
            No tenants yet. Add one from the Tenants page first.
          </span>
        )}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Start date">
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              syncEndDate(e.target.value, termMonths);
            }}
            required
            className={inputClass}
          />
        </Field>
        <Field label="End date">
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              // Cleared field re-arms auto-compute; any other edit "dirties"
              // the field so start/term changes won't clobber it.
              setEndDateDirty(e.target.value !== "");
            }}
            required
            className={inputClass}
          />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Term (mo)">
          <input
            value={termMonths}
            onChange={(e) => {
              setTermMonths(e.target.value);
              syncEndDate(startDate, e.target.value);
            }}
            inputMode="numeric"
            className={inputClass}
          />
        </Field>
        <Field label="Rent $/SF">
          <input
            value={baseRentPsf}
            onChange={(e) => setBaseRentPsf(e.target.value)}
            inputMode="decimal"
            className={inputClass}
          />
        </Field>
        <Field label="Escalation %">
          <input
            value={escalationPct}
            onChange={(e) => setEscalationPct(e.target.value)}
            inputMode="decimal"
            className={inputClass}
          />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label="TI $/SF">
          <input
            value={tiAllowancePsf}
            onChange={(e) => setTiAllowancePsf(e.target.value)}
            inputMode="decimal"
            className={inputClass}
          />
        </Field>
        <Field label="Free rent (mo)">
          <input
            value={freeRentMonths}
            onChange={(e) => setFreeRentMonths(e.target.value)}
            inputMode="decimal"
            className={inputClass}
          />
        </Field>
        <Field label="Commission $/SF">
          <input
            value={commissionPsf}
            onChange={(e) => setCommissionPsf(e.target.value)}
            inputMode="decimal"
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Security deposit">
        <input
          value={securityDeposit}
          onChange={(e) => setSecurityDeposit(e.target.value)}
          inputMode="decimal"
          className={inputClass}
        />
      </Field>

      <Field label="Notes">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className={inputClass}
        />
      </Field>

      {create.error && (
        <p className="text-sm text-red-600">{create.error.message}</p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={create.isPending}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {create.isPending ? "Saving…" : "Create lease"}
        </button>
      </div>
    </form>
  );
}

const inputClass =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </span>
      {children}
    </label>
  );
}
