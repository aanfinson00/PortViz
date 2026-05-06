"use client";

import { useEffect, useState } from "react";
import { toastError, toastSuccess } from "@/components/ui/Toaster";
import { api } from "@/lib/trpc/react";

interface Props {
  spaceId: string;
  initial: {
    askingRentPsf: number | null;
    opexPsfYearOne: number | null;
    availableDate: string | null;
    minDivisibilitySf: number | null;
    maxDivisibilitySf: number | null;
    marketingDescription: string | null;
  };
}

function toNumOrNull(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Inline editor for the per-space listing fields (migration 0015). Lives on
 * the space detail page; the same fields surface as columns on the property
 * dashboard's Available tab.
 */
export function ListingPanel({ spaceId, initial }: Props) {
  const utils = api.useUtils();
  const update = api.space.update.useMutation({
    onSuccess: async () => {
      await utils.space.byCompositeId.invalidate();
      await utils.building.listForMap.invalidate();
      toastSuccess("Listing updated");
    },
    onError: (err) => toastError(err.message),
  });

  const [askingRent, setAskingRent] = useState(
    initial.askingRentPsf != null ? String(initial.askingRentPsf) : "",
  );
  const [opex, setOpex] = useState(
    initial.opexPsfYearOne != null ? String(initial.opexPsfYearOne) : "",
  );
  const [availableDate, setAvailableDate] = useState(
    initial.availableDate ?? "",
  );
  const [minDiv, setMinDiv] = useState(
    initial.minDivisibilitySf != null ? String(initial.minDivisibilitySf) : "",
  );
  const [maxDiv, setMaxDiv] = useState(
    initial.maxDivisibilitySf != null ? String(initial.maxDivisibilitySf) : "",
  );
  const [description, setDescription] = useState(
    initial.marketingDescription ?? "",
  );

  // Re-hydrate when the parent re-fetches (e.g. after the mutation
  // settles) — the initial prop changes but local state would otherwise
  // stay stuck on the user's pre-save values.
  useEffect(() => {
    setAskingRent(
      initial.askingRentPsf != null ? String(initial.askingRentPsf) : "",
    );
    setOpex(
      initial.opexPsfYearOne != null ? String(initial.opexPsfYearOne) : "",
    );
    setAvailableDate(initial.availableDate ?? "");
    setMinDiv(
      initial.minDivisibilitySf != null
        ? String(initial.minDivisibilitySf)
        : "",
    );
    setMaxDiv(
      initial.maxDivisibilitySf != null
        ? String(initial.maxDivisibilitySf)
        : "",
    );
    setDescription(initial.marketingDescription ?? "");
  }, [
    initial.askingRentPsf,
    initial.opexPsfYearOne,
    initial.availableDate,
    initial.minDivisibilitySf,
    initial.maxDivisibilitySf,
    initial.marketingDescription,
  ]);

  function handleSave() {
    const minN = toNumOrNull(minDiv);
    const maxN = toNumOrNull(maxDiv);
    if (minN != null && maxN != null && minN > maxN) {
      toastError("Min divisibility must be ≤ max divisibility");
      return;
    }
    update.mutate({
      id: spaceId,
      asking_rent_psf: toNumOrNull(askingRent),
      opex_psf_year_one: toNumOrNull(opex),
      available_date: availableDate.trim() === "" ? null : availableDate,
      min_divisibility_sf: minN != null ? Math.round(minN) : null,
      max_divisibility_sf: maxN != null ? Math.round(maxN) : null,
      marketing_description:
        description.trim() === "" ? null : description,
    });
  }

  return (
    <div className="rounded-md border border-neutral-200 bg-white p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Asking rent ($/SF/yr)">
          <input
            type="number"
            step="0.01"
            min="0"
            value={askingRent}
            onChange={(e) => setAskingRent(e.target.value)}
            placeholder="—"
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </Field>
        <Field label="OpEx Y1 ($/SF/yr)">
          <input
            type="number"
            step="0.01"
            min="0"
            value={opex}
            onChange={(e) => setOpex(e.target.value)}
            placeholder="—"
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </Field>
        <Field label="Available date">
          <input
            type="date"
            value={availableDate}
            onChange={(e) => setAvailableDate(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Min divisibility (SF)">
            <input
              type="number"
              min="0"
              step="1"
              value={minDiv}
              onChange={(e) => setMinDiv(e.target.value)}
              placeholder="—"
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </Field>
          <Field label="Max divisibility (SF)">
            <input
              type="number"
              min="0"
              step="1"
              value={maxDiv}
              onChange={(e) => setMaxDiv(e.target.value)}
              placeholder="—"
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </Field>
        </div>
      </div>
      <Field label="Marketing description">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          maxLength={5000}
          placeholder="Free-form blurb for the listing flyer / OM."
          className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
        />
      </Field>
      <div className="mt-3 flex justify-end">
        <button
          onClick={handleSave}
          disabled={update.isPending}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {update.isPending ? "Saving…" : "Save listing"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-neutral-600">
        {label}
      </span>
      {children}
    </label>
  );
}
