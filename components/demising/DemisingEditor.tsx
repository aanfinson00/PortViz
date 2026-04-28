"use client";

import { useEffect, useMemo, useState } from "react";
import { toastError, toastSuccess } from "@/components/ui/Toaster";
import type { Bay, SpaceGroup } from "@/lib/demising";
import { computeSpaceMetrics, totalBuildingSfFromBays } from "@/lib/demising";
import { api } from "@/lib/trpc/react";

interface DemisingEditorProps {
  buildingId: string;
  bays: Bay[];
  totalCarParking: number;
  totalTrailerParking: number;
  /**
   * Existing demising from the database. When provided, the editor's split
   * points are derived from the bay ordinals at the boundary between groups.
   */
  initialGroups?: SpaceGroup[];
  onChange?: (groups: SpaceGroup[]) => void;
}

/**
 * Interactive demising editor. Shows each bay as a card in the frontage-order
 * strip; clicking the handle between two adjacent bays either splits the
 * current space at that boundary or merges across it. Metrics recompute live
 * on every change using lib/demising#computeSpaceMetrics.
 *
 * Persistence (creating space rows + a demising_scheme) is intentionally out
 * of scope for this revision — the editor is useful on its own as a what-if
 * tool, and the Save button surfaces a clear TODO until Phase 5 wires it up.
 */
export function DemisingEditor({
  buildingId,
  bays,
  totalCarParking,
  totalTrailerParking,
  initialGroups,
  onChange,
}: DemisingEditorProps) {
  const utils = api.useUtils();
  const apply = api.demising.applyCurrent.useMutation({
    onSuccess: (res) => {
      utils.space.listByBuilding.invalidate({ buildingId });
      toastSuccess(`Saved ${res.spaceCount} space${res.spaceCount === 1 ? "" : "s"}`);
    },
    onError: (e) => toastError(e.message),
  });
  const sorted = useMemo(
    () => [...bays].sort((a, b) => a.ordinal - b.ordinal),
    [bays],
  );

  // splitAfter[i] === true means there is a boundary after bay sorted[i].
  const deriveSplits = (
    orderedBays: Bay[],
    groupsFromDb: SpaceGroup[] | undefined,
  ): boolean[] => {
    const base = orderedBays.map(() => false);
    if (!groupsFromDb || groupsFromDb.length === 0) return base;

    const bayIndex = new Map(orderedBays.map((b, i) => [b.id, i]));
    // Map each bay to its group; place a split after every bay whose next
    // neighbor is in a different group.
    const bayToGroup = new Map<string, number>();
    groupsFromDb.forEach((g, gi) => {
      for (const bayId of g.bayIds) bayToGroup.set(bayId, gi);
    });
    for (let i = 0; i < orderedBays.length - 1; i++) {
      const hereGroup = bayToGroup.get(orderedBays[i]!.id);
      const nextGroup = bayToGroup.get(orderedBays[i + 1]!.id);
      if (hereGroup != null && nextGroup != null && hereGroup !== nextGroup) {
        base[i] = true;
      }
    }
    return base;
  };

  const [splitAfter, setSplitAfter] = useState<boolean[]>(() =>
    deriveSplits(sorted, initialGroups),
  );

  // Re-derive whenever the bay set or the saved groups shape changes.
  // We key on bay id sequence + initialGroups reference so edits keep local
  // state but an external refresh (after Save) pulls in the server truth.
  const baySignature = sorted.map((b) => b.id).join(",");
  const groupsSignature = (initialGroups ?? [])
    .map((g) => `${g.code}:${g.bayIds.join("|")}`)
    .join(";");
  useEffect(() => {
    setSplitAfter(deriveSplits(sorted, initialGroups));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baySignature, groupsSignature]);

  const groups: SpaceGroup[] = useMemo(() => {
    const out: SpaceGroup[] = [];
    let current: string[] = [];
    let index = 0;
    for (let i = 0; i < sorted.length; i++) {
      current.push(sorted[i]!.id);
      const isLast = i === sorted.length - 1;
      if (isLast || splitAfter[i]) {
        out.push({
          id: `local-${index}`,
          code: String(100 * (index + 1)),
          bayIds: current,
        });
        index += 1;
        current = [];
      }
    }
    return out;
  }, [sorted, splitAfter]);

  // Emit group changes to the parent for map coloring.
  useEffect(() => {
    onChange?.(groups);
  }, [groups, onChange]);

  const totalSf = totalBuildingSfFromBays(sorted);
  const metrics = useMemo(
    () =>
      groups.map((g) =>
        computeSpaceMetrics(
          g,
          sorted,
          { totalCarParking, totalTrailerParking },
          totalSf,
        ),
      ),
    [groups, sorted, totalCarParking, totalTrailerParking, totalSf],
  );

  // Map each bay to the index of its group so we can color it.
  const bayGroupIndex = new Map<string, number>();
  groups.forEach((g, i) => {
    for (const bayId of g.bayIds) bayGroupIndex.set(bayId, i);
  });

  function toggleSplit(i: number) {
    setSplitAfter((prev) => {
      const next = [...prev];
      next[i] = !next[i];
      return next;
    });
  }

  if (sorted.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        Add bays with the quick setup above, then drag the handles here to
        split them into spaces.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Bay strip
        </h3>
        <p className="mt-1 text-xs text-neutral-500">
          Click a handle to split spaces there; click it again to merge.
        </p>

        <div className="mt-3 flex overflow-x-auto rounded-md border border-neutral-200 bg-neutral-50 p-2">
          {sorted.map((b, i) => {
            const groupIndex = bayGroupIndex.get(b.id) ?? 0;
            const color = spaceColor(groupIndex);
            const isLast = i === sorted.length - 1;
            return (
              <div key={b.id} className="flex items-stretch">
                <div
                  className="flex min-w-[8rem] flex-col justify-between rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs shadow-sm"
                  style={{ borderTop: `4px solid ${color}` }}
                >
                  <span className="font-mono text-[10px] text-neutral-500">
                    Bay {b.ordinal}
                  </span>
                  <span className="font-medium">{b.widthFt}&prime; wide</span>
                  <span className="text-neutral-500">
                    {b.dockDoorCount} dock · {b.driveInCount} drive-in
                  </span>
                </div>
                {!isLast && (
                  <button
                    type="button"
                    onClick={() => toggleSplit(i)}
                    title={
                      splitAfter[i]
                        ? "Merge spaces across this boundary"
                        : "Split the space here"
                    }
                    className={`mx-1 flex w-6 items-center justify-center rounded-md border text-xs transition ${
                      splitAfter[i]
                        ? "border-blue-500 bg-blue-500 text-white"
                        : "border-dashed border-neutral-300 bg-white text-neutral-400 hover:border-neutral-500 hover:text-neutral-700"
                    }`}
                  >
                    {splitAfter[i] ? "|" : "·"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Spaces ({metrics.length})
        </h3>
        <ul className="mt-3 divide-y divide-neutral-100 rounded-md border border-neutral-200 bg-white">
          {metrics.map((m, i) => (
            <li key={m.spaceId} className="flex items-center gap-4 px-4 py-3 text-sm">
              <span
                className="inline-block h-3 w-3 flex-shrink-0 rounded-sm"
                style={{ background: spaceColor(i) }}
              />
              <div className="min-w-[4rem] font-mono text-xs text-neutral-500">
                {m.code}
              </div>
              <div className="flex-1 font-medium">
                {m.sf.toLocaleString()} SF
              </div>
              <div className="text-xs text-neutral-600">
                {m.frontageFt}&prime; frontage · {m.dockDoors} dock ·{" "}
                {m.driveIns} drive-in ·{" "}
                {m.carParking}/{m.trailerParking} car/trailer
                {m.hasYardAccess ? " · yard" : ""}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {apply.error && (
        <p className="text-sm text-red-600">{apply.error.message}</p>
      )}
      {apply.isSuccess && (
        <p className="text-sm text-emerald-700">
          Saved {metrics.length} space{metrics.length === 1 ? "" : "s"}.
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          disabled={apply.isPending || groups.length === 0}
          onClick={() =>
            apply.mutate({
              buildingId,
              groups: groups.map((g) => ({ code: g.code, bayIds: g.bayIds })),
            })
          }
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {apply.isPending ? "Saving…" : "Save demising"}
        </button>
      </div>
    </div>
  );
}

const SPACE_COLORS = [
  "#2563eb", // blue
  "#16a34a", // green
  "#f59e0b", // amber
  "#db2777", // pink
  "#7c3aed", // violet
  "#0891b2", // cyan
  "#dc2626", // red
  "#4f46e5", // indigo
];

export function spaceColor(index: number): string {
  return SPACE_COLORS[index % SPACE_COLORS.length]!;
}

/**
 * Quick-setup form to populate a building's bays in one shot. Used when the
 * building has no bays yet. Uses api.bay.replaceAll so rerunning it replaces
 * the entire bay grid.
 */
export function BayQuickSetup({ buildingId }: { buildingId: string }) {
  const utils = api.useUtils();
  const replace = api.bay.replaceAll.useMutation({
    onSuccess: (rows) => {
      utils.bay.listByBuilding.invalidate({ buildingId });
      toastSuccess(`Created ${rows.length} bays`);
    },
    onError: (e) => toastError(e.message),
  });

  const [count, setCount] = useState("4");
  const [widthFt, setWidthFt] = useState("50");
  const [depthFt, setDepthFt] = useState("200");
  const [dockDoors, setDockDoors] = useState("2");
  const [driveIns, setDriveIns] = useState("0");
  const [frontage, setFrontage] = useState<"N" | "S" | "E" | "W">("S");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = Math.max(1, Math.min(50, Number(count) || 1));
    const bays = Array.from({ length: n }, (_, i) => ({
      ordinal: i + 1,
      widthFt: Number(widthFt) || 50,
      depthFt: Number(depthFt) || 200,
      dockDoorCount: Number(dockDoors) || 0,
      driveInCount: Number(driveIns) || 0,
      hasYardAccess: false,
      frontageSide: frontage,
    }));
    replace.mutate({ buildingId, bays });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-md border border-dashed border-neutral-300 bg-neutral-50 p-4"
    >
      <div>
        <h3 className="text-sm font-semibold">Quick setup: bays</h3>
        <p className="text-xs text-neutral-500">
          Create a uniform bay grid. Re-running this replaces every bay on the
          building.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Bays">
          <input
            value={count}
            onChange={(e) => setCount(e.target.value)}
            inputMode="numeric"
            className={inputClass}
          />
        </Field>
        <Field label="Width (ft)">
          <input
            value={widthFt}
            onChange={(e) => setWidthFt(e.target.value)}
            inputMode="decimal"
            className={inputClass}
          />
        </Field>
        <Field label="Depth (ft)">
          <input
            value={depthFt}
            onChange={(e) => setDepthFt(e.target.value)}
            inputMode="decimal"
            className={inputClass}
          />
        </Field>
        <Field label="Dock doors / bay">
          <input
            value={dockDoors}
            onChange={(e) => setDockDoors(e.target.value)}
            inputMode="numeric"
            className={inputClass}
          />
        </Field>
        <Field label="Drive-ins / bay">
          <input
            value={driveIns}
            onChange={(e) => setDriveIns(e.target.value)}
            inputMode="numeric"
            className={inputClass}
          />
        </Field>
        <Field label="Frontage side">
          <select
            value={frontage}
            onChange={(e) => setFrontage(e.target.value as "N" | "S" | "E" | "W")}
            className={inputClass}
          >
            <option value="N">North</option>
            <option value="S">South</option>
            <option value="E">East</option>
            <option value="W">West</option>
          </select>
        </Field>
      </div>
      {replace.error && (
        <p className="text-xs text-red-600">{replace.error.message}</p>
      )}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={replace.isPending}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {replace.isPending ? "Saving…" : "Apply grid"}
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
      <span className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </span>
      {children}
    </label>
  );
}
