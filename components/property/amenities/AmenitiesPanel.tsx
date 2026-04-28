"use client";

import { useState } from "react";
import { toastError, toastSuccess } from "@/components/ui/Toaster";
import { api } from "@/lib/trpc/react";

interface Props {
  buildingId: string;
  initialTruckCourtDepthFt: number | null;
}

/**
 * Inline editor for site-amenity fields on a single building. Mounted on
 * the building detail page; calls the narrowly-scoped
 * building.updateAmenities mutation so other building fields stay
 * untouched. Self-contained — no shared form state with other panels.
 */
export function AmenitiesPanel({
  buildingId,
  initialTruckCourtDepthFt,
}: Props) {
  const utils = api.useUtils();
  const [depth, setDepth] = useState(
    initialTruckCourtDepthFt != null ? String(initialTruckCourtDepthFt) : "",
  );

  const update = api.building.updateAmenities.useMutation({
    onSuccess: async () => {
      await utils.building.byCompositeId.invalidate();
      await utils.building.listForMap.invalidate();
      toastSuccess("Site amenities saved");
    },
    onError: (e) => toastError(e.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = depth.trim();
    const value = trimmed === "" ? null : Number(trimmed);
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      toastError("Truck court depth must be a non-negative number.");
      return;
    }
    update.mutate({
      id: buildingId,
      truckCourtDepthFt: value,
    });
  }

  return (
    <section className="rounded-md border border-neutral-200 bg-white p-4">
      <header className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Site amenities</h2>
        <p className="text-[11px] text-neutral-500">
          Drives the property hero overlay
        </p>
      </header>
      <form
        onSubmit={handleSubmit}
        className="flex flex-wrap items-end gap-3 text-sm"
      >
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
            Truck court depth (ft)
          </span>
          <input
            value={depth}
            onChange={(e) => setDepth(e.target.value)}
            inputMode="numeric"
            placeholder="e.g. 130"
            className="w-32 rounded-md border border-neutral-300 px-2 py-1"
          />
        </label>
        <button
          type="submit"
          disabled={update.isPending}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {update.isPending ? "Saving…" : "Save"}
        </button>
        <p className="text-[11px] text-neutral-500">
          Typical industrial: 130 ft for trailer maneuvering; 60 ft is tight.
        </p>
      </form>
    </section>
  );
}
