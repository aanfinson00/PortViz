"use client";

import { useState } from "react";
import { toastError, toastSuccess } from "@/components/ui/Toaster";
import { addMonthsMinusDay } from "@/lib/leaseDate";
import {
  LEASE_OPTION_LABELS,
  LEASE_TYPE_LABELS,
  type LeaseOption,
  type LeaseOptionKind,
  type LeaseType,
  type RentScheduleEntry,
} from "@/lib/leaseEconomics";
import { api } from "@/lib/trpc/react";

const LEASE_TYPE_OPTIONS: LeaseType[] = [
  "nnn",
  "modified_gross",
  "gross",
  "absolute_net",
  "percentage",
  "other",
];

const OPTION_KIND_OPTIONS: LeaseOptionKind[] = [
  "renewal",
  "expansion",
  "rofr",
  "rofo",
  "termination",
];

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
  // Tier 1 economics
  const [leaseType, setLeaseType] = useState<LeaseType | "">("");
  const [rentSchedule, setRentSchedule] = useState<RentScheduleEntry[]>([]);
  const [options, setOptions] = useState<LeaseOption[]>([]);

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
      leaseType: leaseType || null,
      rentSchedule: rentSchedule.length > 0 ? rentSchedule : null,
      options: options.length > 0 ? options : null,
    });
  }

  function addRentScheduleRow() {
    // Default the new row's fromMonth to the next free month so a quick
    // sequence "year 1, year 2, year 3" is one click each.
    const lastTo = rentSchedule.reduce(
      (acc, e) => Math.max(acc, e.toMonth),
      0,
    );
    setRentSchedule((prev) => [
      ...prev,
      {
        fromMonth: lastTo + 1,
        toMonth: lastTo + 12,
        baseRentPsf: 0,
        notes: null,
      },
    ]);
  }

  function updateRentScheduleRow(
    idx: number,
    patch: Partial<RentScheduleEntry>,
  ) {
    setRentSchedule((prev) =>
      prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)),
    );
  }

  function removeRentScheduleRow(idx: number) {
    setRentSchedule((prev) => prev.filter((_, i) => i !== idx));
  }

  function addOption() {
    setOptions((prev) => [
      ...prev,
      {
        kind: "renewal",
        noticeMonths: null,
        termMonths: null,
        rentBasis: null,
        feePsf: null,
        effectiveYear: null,
        notes: null,
      },
    ]);
  }

  function updateOption(idx: number, patch: Partial<LeaseOption>) {
    setOptions((prev) =>
      prev.map((o, i) => (i === idx ? { ...o, ...patch } : o)),
    );
  }

  function removeOption(idx: number) {
    setOptions((prev) => prev.filter((_, i) => i !== idx));
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

      <div className="grid grid-cols-2 gap-3">
        <Field label="Security deposit">
          <input
            value={securityDeposit}
            onChange={(e) => setSecurityDeposit(e.target.value)}
            inputMode="decimal"
            className={inputClass}
          />
        </Field>
        <Field label="Lease type">
          <select
            value={leaseType}
            onChange={(e) => setLeaseType(e.target.value as LeaseType | "")}
            className={inputClass}
          >
            <option value="">—</option>
            {LEASE_TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {LEASE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <details className="rounded-md border border-neutral-200 bg-neutral-50">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
          Rent schedule
          {rentSchedule.length > 0 && (
            <span className="ml-2 text-[11px] font-normal text-neutral-500">
              · {rentSchedule.length} step
              {rentSchedule.length === 1 ? "" : "s"}
            </span>
          )}
        </summary>
        <div className="border-t border-neutral-200 p-3">
          <p className="mb-2 text-[11px] text-neutral-500">
            Stepped base rent in $/SF/yr. Months are 1-based from the lease
            start. When set, this overrides the simple base rent +
            escalation %. Leave empty to use those instead.
          </p>
          {rentSchedule.length === 0 ? (
            <p className="text-xs text-neutral-500">No steps yet.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {rentSchedule.map((e, i) => (
                <li
                  key={i}
                  className="flex flex-wrap items-center gap-2 text-xs"
                >
                  <label className="flex items-center gap-1">
                    <span className="text-neutral-500">Months</span>
                    <input
                      type="number"
                      value={e.fromMonth}
                      min={1}
                      onChange={(ev) =>
                        updateRentScheduleRow(i, {
                          fromMonth: Number(ev.target.value),
                        })
                      }
                      className="w-16 rounded border border-neutral-300 bg-white px-1.5 py-0.5 font-mono"
                    />
                    <span className="text-neutral-500">–</span>
                    <input
                      type="number"
                      value={e.toMonth}
                      min={1}
                      onChange={(ev) =>
                        updateRentScheduleRow(i, {
                          toMonth: Number(ev.target.value),
                        })
                      }
                      className="w-16 rounded border border-neutral-300 bg-white px-1.5 py-0.5 font-mono"
                    />
                  </label>
                  <label className="flex items-center gap-1">
                    <span className="text-neutral-500">$/SF</span>
                    <input
                      type="number"
                      value={e.baseRentPsf}
                      step="0.01"
                      onChange={(ev) =>
                        updateRentScheduleRow(i, {
                          baseRentPsf: Number(ev.target.value),
                        })
                      }
                      className="w-20 rounded border border-neutral-300 bg-white px-1.5 py-0.5 font-mono"
                    />
                  </label>
                  <input
                    type="text"
                    value={e.notes ?? ""}
                    placeholder="Notes (optional)"
                    onChange={(ev) =>
                      updateRentScheduleRow(i, {
                        notes: ev.target.value || null,
                      })
                    }
                    className="min-w-0 flex-1 rounded border border-neutral-300 bg-white px-1.5 py-0.5"
                  />
                  <button
                    type="button"
                    onClick={() => removeRentScheduleRow(i)}
                    className="rounded border border-red-200 bg-white px-1.5 py-0.5 text-red-700 hover:bg-red-50"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={addRentScheduleRow}
            className="mt-2 rounded-md border border-neutral-300 bg-white px-2 py-0.5 text-[11px] font-medium text-neutral-700 hover:bg-neutral-100"
          >
            + Add step
          </button>
        </div>
      </details>

      <details className="rounded-md border border-neutral-200 bg-neutral-50">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
          Options & rights
          {options.length > 0 && (
            <span className="ml-2 text-[11px] font-normal text-neutral-500">
              · {options.length}
            </span>
          )}
        </summary>
        <div className="border-t border-neutral-200 p-3">
          <p className="mb-2 text-[11px] text-neutral-500">
            Renewals, expansions, rights of first refusal/offer, early
            termination. Leave empty when there aren't any.
          </p>
          {options.length === 0 ? (
            <p className="text-xs text-neutral-500">No options yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {options.map((o, i) => (
                <li
                  key={i}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-neutral-200 bg-white p-2 text-xs"
                >
                  <select
                    value={o.kind}
                    onChange={(e) =>
                      updateOption(i, {
                        kind: e.target.value as LeaseOptionKind,
                      })
                    }
                    className="rounded border border-neutral-300 bg-white px-1.5 py-0.5"
                  >
                    {OPTION_KIND_OPTIONS.map((k) => (
                      <option key={k} value={k}>
                        {LEASE_OPTION_LABELS[k]}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1">
                    <span className="text-neutral-500">Notice mo</span>
                    <input
                      type="number"
                      value={o.noticeMonths ?? ""}
                      onChange={(e) =>
                        updateOption(i, {
                          noticeMonths:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        })
                      }
                      className="w-14 rounded border border-neutral-300 bg-white px-1.5 py-0.5 font-mono"
                    />
                  </label>
                  {o.kind !== "termination" ? (
                    <label className="flex items-center gap-1">
                      <span className="text-neutral-500">Term mo</span>
                      <input
                        type="number"
                        value={o.termMonths ?? ""}
                        onChange={(e) =>
                          updateOption(i, {
                            termMonths:
                              e.target.value === ""
                                ? null
                                : Number(e.target.value),
                          })
                        }
                        className="w-16 rounded border border-neutral-300 bg-white px-1.5 py-0.5 font-mono"
                      />
                    </label>
                  ) : (
                    <label className="flex items-center gap-1">
                      <span className="text-neutral-500">Fee $/SF</span>
                      <input
                        type="number"
                        value={o.feePsf ?? ""}
                        step="0.01"
                        onChange={(e) =>
                          updateOption(i, {
                            feePsf:
                              e.target.value === ""
                                ? null
                                : Number(e.target.value),
                          })
                        }
                        className="w-16 rounded border border-neutral-300 bg-white px-1.5 py-0.5 font-mono"
                      />
                    </label>
                  )}
                  <input
                    type="text"
                    placeholder="Rent basis (e.g. FMV)"
                    value={o.rentBasis ?? ""}
                    onChange={(e) =>
                      updateOption(i, {
                        rentBasis: e.target.value || null,
                      })
                    }
                    className="min-w-0 flex-1 rounded border border-neutral-300 bg-white px-1.5 py-0.5"
                  />
                  <button
                    type="button"
                    onClick={() => removeOption(i)}
                    className="rounded border border-red-200 bg-white px-1.5 py-0.5 text-red-700 hover:bg-red-50"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={addOption}
            className="mt-2 rounded-md border border-neutral-300 bg-white px-2 py-0.5 text-[11px] font-medium text-neutral-700 hover:bg-neutral-100"
          >
            + Add option
          </button>
        </div>
      </details>

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
