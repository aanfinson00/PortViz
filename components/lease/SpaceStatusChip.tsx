"use client";

import { useState } from "react";
import { toastError, toastSuccess } from "@/components/ui/Toaster";
import { api } from "@/lib/trpc/react";

const STATUSES = ["vacant", "available", "pending", "leased"] as const;
type Status = (typeof STATUSES)[number];

const COLORS: Record<Status, string> = {
  vacant: "bg-neutral-100 text-neutral-700 border-neutral-300",
  available: "bg-emerald-50 text-emerald-700 border-emerald-300",
  pending: "bg-amber-50 text-amber-800 border-amber-300",
  leased: "bg-blue-50 text-blue-700 border-blue-300",
};

interface Props {
  spaceId: string;
  status: string;
  buildingId?: string;
}

/**
 * Click-to-edit status chip. Renders as a colored badge; clicking pops a
 * tiny dropdown of the four statuses. No page navigation, no form.
 */
export function SpaceStatusChip({ spaceId, status, buildingId }: Props) {
  const [open, setOpen] = useState(false);
  const utils = api.useUtils();
  const update = api.space.update.useMutation({
    onSuccess: () => {
      if (buildingId) utils.space.listByBuilding.invalidate({ buildingId });
      utils.lease.rentRoll.invalidate();
      toastSuccess("Status updated");
    },
    onError: (e) => toastError(e.message),
  });

  const current = (status as Status) ?? "vacant";

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        disabled={update.isPending}
        className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize disabled:opacity-50 ${COLORS[current]}`}
      >
        {update.isPending ? "Saving…" : current}
      </button>
      {open && (
        <>
          <button
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          />
          <ul className="absolute right-0 top-full z-20 mt-1 w-32 overflow-hidden rounded-md border border-neutral-200 bg-white shadow-md">
            {STATUSES.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    if (s !== current) {
                      update.mutate({ id: spaceId, status: s });
                    }
                  }}
                  className={`flex w-full items-center justify-between px-3 py-1.5 text-xs capitalize hover:bg-neutral-50 ${
                    s === current ? "bg-neutral-50 font-medium" : ""
                  }`}
                >
                  <span>{s}</span>
                  <span
                    className={`h-2 w-2 rounded-full ${COLORS[s].split(" ")[0]}`}
                  />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
