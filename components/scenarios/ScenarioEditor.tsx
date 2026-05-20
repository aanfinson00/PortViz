"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toastError, toastSuccess } from "@/components/ui/Toaster";
import { nextSpaceCode } from "@/lib/codes";
import { type OfficeCorner } from "@/lib/officeBuildout";
import {
  dragWall,
  removeSpace,
  resolveSpaces,
  splitLargest,
  type SliderSpace,
} from "@/lib/sliderDemising";
import {
  resolveSnapshotSpaces,
  scenarioSnapshotSchema,
  type ScenarioSnapshot,
  type SliderSnapshotSpace,
} from "@/lib/scenarioSnapshot";
import { api } from "@/lib/trpc/react";
import { ScenarioCompare } from "./ScenarioCompare";
import { TestFitList } from "./TestFitList";
import type { SchemeRow } from "./types";

interface Props {
  buildingId: string;
  /** Polygon-derived total SF. */
  totalSf: number;
  /** Demising mode of the underlying building (sliders or bays). */
  mode: "sliders" | "bays";
  /** The scheme being edited; null means a fresh scenario. */
  scheme: SchemeRow | null;
  /** Bay area lookup — only needed for bay-mode scenarios. */
  bayAreaById: Map<string, number>;
  onClose: () => void;
  onSaved: (id: string) => void;
}

interface SliderDraftSpace extends SliderSpace {
  code: string;
  officeSf: number | null;
  officeCorner: OfficeCorner;
}

/**
 * Scenario sandbox editor. Renders a slider-style demising panel (or a
 * bay readout for bay-mode buildings) wired to local draft state — no
 * live writes until the user clicks "Save scenario". For bay-mode
 * buildings the snapshot is constructed from the building's current
 * demising; users can rename + describe but adjusting bay assignments
 * happens through the main DemisingEditor in the sidebar (a deliberate
 * scope limit for v1 — bay-mode scenarios are mostly snapshots of
 * "what we did" rather than what-if exploration).
 */
export function ScenarioEditor({
  buildingId,
  totalSf,
  mode,
  scheme,
  bayAreaById,
  onClose,
  onSaved,
}: Props) {
  const utils = api.useUtils();
  const tempCounterRef = useRef(0);

  const [name, setName] = useState(scheme?.name ?? "");
  const [description, setDescription] = useState(scheme?.description ?? "");

  const initialSliderSpaces: SliderDraftSpace[] = useMemo(() => {
    if (scheme?.snapshot_data?.mode === "sliders") {
      return scheme.snapshot_data.spaces.map((s) => ({
        id: s.id,
        code: s.code,
        positionOrder: s.positionOrder,
        isPinned: s.isPinned,
        targetSf: s.targetSf,
        officeSf: s.officeSf,
        officeCorner: (s.officeCorner ?? "front-left") as OfficeCorner,
      }));
    }
    if (mode === "sliders") {
      // Fresh scenario for a slider building — start with a single
      // unpinned space spanning the whole footprint, ready to split.
      return [
        {
          id: `new:${++tempCounterRef.current}`,
          code: "101",
          positionOrder: 0,
          isPinned: false,
          targetSf: null,
          officeSf: null,
          officeCorner: "front-left",
        },
      ];
    }
    return [];
  }, [scheme, mode]);

  const [sliderSpaces, setSliderSpaces] =
    useState<SliderDraftSpace[]>(initialSliderSpaces);

  // Reset when the user switches between scenarios in the same drawer mount.
  useEffect(() => {
    setSliderSpaces(initialSliderSpaces);
    setName(scheme?.name ?? "");
    setDescription(scheme?.description ?? "");
  }, [initialSliderSpaces, scheme?.name, scheme?.description]);

  const resolved = useMemo(
    () => (mode === "sliders" ? resolveSpaces(sliderSpaces, totalSf) : []),
    [mode, sliderSpaces, totalSf],
  );

  const overAllocated = useMemo(() => {
    const pinned = sliderSpaces.reduce(
      (acc, s) => (s.isPinned ? acc + (s.targetSf ?? 0) : acc),
      0,
    );
    return pinned > totalSf;
  }, [sliderSpaces, totalSf]);

  const save = api.demising.saveScenario.useMutation({
    onSuccess: async (data) => {
      toastSuccess(scheme ? "Scenario updated" : "Scenario created");
      await utils.demising.listSchemes.invalidate({ buildingId });
      onSaved(data.id);
    },
    onError: (e) => toastError(e.message),
  });

  function handleSave() {
    if (!name.trim()) {
      toastError("Give the scenario a name first.");
      return;
    }
    let snapshot: ScenarioSnapshot;
    if (mode === "sliders") {
      const sliders: SliderSnapshotSpace[] = sliderSpaces.map((s, i) => ({
        id: s.id,
        code: s.code,
        positionOrder: i,
        isPinned: s.isPinned,
        targetSf: s.targetSf,
        officeSf: s.officeSf,
        officeCorner: s.officeSf ? s.officeCorner : null,
      }));
      snapshot = { mode: "sliders", spaces: sliders };
    } else {
      // Bay-mode scenarios snapshot the existing demising — see
      // component comment. Pull the current snapshot if editing or
      // refuse to save a fresh bay scenario without one (UI keeps the
      // "Save" button enabled but routes through validation here).
      if (!scheme?.snapshot_data || scheme.snapshot_data.mode !== "bays") {
        toastError(
          "Bay-mode scenarios need an existing layout to snapshot. Apply a demising scheme first, then save it as a scenario.",
        );
        return;
      }
      snapshot = scheme.snapshot_data;
    }
    const parsed = scenarioSnapshotSchema.safeParse(snapshot);
    if (!parsed.success) {
      toastError("Snapshot is invalid; check space codes and SFs.");
      return;
    }
    save.mutate({
      buildingId,
      id: scheme?.id,
      name: name.trim(),
      description: description.trim() || null,
      snapshotData: parsed.data,
    });
  }

  function handleAddSpace() {
    if (mode !== "sliders") return;
    const newId = `new:${++tempCounterRef.current}`;
    const used = new Set(sliderSpaces.map((s) => s.code));
    const code = nextSpaceCode(Array.from(used));
    setSliderSpaces((prev) =>
      splitLargest(prev, totalSf, newId, {
        code,
        officeSf: null,
        officeCorner: "front-left" as OfficeCorner,
      } as Omit<SliderDraftSpace, keyof SliderSpace>),
    );
  }

  function handleRemove(id: string) {
    setSliderSpaces((prev) => removeSpace(prev, id));
  }

  function handleSfChange(id: string, value: string) {
    const n = value.trim() === "" ? null : Math.round(Number(value));
    if (value.trim() !== "" && (!Number.isFinite(n!) || n! < 0)) return;
    setSliderSpaces((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, targetSf: n, isPinned: n !== null ? true : s.isPinned }
          : s,
      ),
    );
  }

  function handlePinToggle(id: string) {
    setSliderSpaces((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              isPinned: !s.isPinned,
              targetSf: !s.isPinned
                ? Math.round(
                    resolved.find((r) => r.id === id)?.sf ?? s.targetSf ?? 0,
                  )
                : s.targetSf,
            }
          : s,
      ),
    );
  }

  function handleCodeChange(id: string, code: string) {
    const up = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
    setSliderSpaces((prev) =>
      prev.map((s) => (s.id === id ? { ...s, code: up } : s)),
    );
  }

  function handleDragWall(wallIndex: number, deltaSf: number) {
    setSliderSpaces((prev) => dragWall(prev, wallIndex, deltaSf, totalSf));
  }

  const snapshotForCompare: ScenarioSnapshot | null = useMemo(() => {
    if (mode === "sliders") {
      return {
        mode: "sliders",
        spaces: sliderSpaces.map((s, i) => ({
          id: s.id,
          code: s.code,
          positionOrder: i,
          isPinned: s.isPinned,
          targetSf: s.targetSf,
          officeSf: s.officeSf,
          officeCorner: s.officeSf ? s.officeCorner : null,
        })),
      };
    }
    return scheme?.snapshot_data ?? null;
  }, [mode, sliderSpaces, scheme]);

  const resolvedForFit = useMemo(() => {
    if (!snapshotForCompare) return [];
    return resolveSnapshotSpaces(snapshotForCompare, {
      totalSf,
      bayAreaById,
    });
  }, [snapshotForCompare, totalSf, bayAreaById]);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="flex-1 bg-neutral-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="flex w-full max-w-3xl flex-col overflow-y-auto bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-neutral-200 px-6 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
              {scheme ? "Edit scenario" : "New scenario"}
            </p>
            <p className="text-sm text-neutral-700">
              {mode === "sliders" ? "Slider demising sandbox" : "Bay demising snapshot"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-neutral-200 bg-white px-3 py-1 text-sm text-neutral-600 hover:bg-neutral-50"
          >
            Close
          </button>
        </header>

        <section className="grid grid-cols-2 gap-3 border-b border-neutral-200 px-6 py-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
              Name
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. 4 × 50k for big-box tenants"
              className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm focus:border-neutral-900 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
              Description
            </span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this scenario is testing"
              className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm focus:border-neutral-900 focus:outline-none"
            />
          </label>
        </section>

        {mode === "sliders" ? (
          <section className="border-b border-neutral-200 px-6 py-3">
            <header className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Layout
              </h3>
              <button
                type="button"
                onClick={handleAddSpace}
                className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-[11px] font-medium hover:bg-neutral-50"
              >
                + Add space
              </button>
            </header>
            <p className="mt-1 text-[11px] text-neutral-500">
              Total {totalSf.toLocaleString()} SF · {sliderSpaces.length} space
              {sliderSpaces.length === 1 ? "" : "s"}
              {overAllocated && (
                <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                  Over-allocated
                </span>
              )}
            </p>

            {/* Wall bar — interior wall handles for proportional adjustment */}
            <div className="mt-3 flex h-6 w-full overflow-hidden rounded border border-neutral-200">
              {resolved.map((r, i) => (
                <div
                  key={r.id}
                  className="relative flex h-full items-center justify-center border-r border-neutral-200 bg-neutral-100 text-[10px] font-mono text-neutral-600 last:border-r-0"
                  style={{ width: `${(r.sf / Math.max(1, totalSf)) * 100}%` }}
                >
                  {Math.round(r.sf / 1000)}k
                  {i < resolved.length - 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        const delta = window.prompt(
                          `Move wall by SF (positive = right):`,
                          "10000",
                        );
                        const n = Number(delta);
                        if (Number.isFinite(n) && n !== 0) {
                          handleDragWall(i, n);
                        }
                      }}
                      title="Click to drag wall"
                      className="absolute right-[-6px] top-0 z-10 h-full w-3 cursor-col-resize bg-neutral-300 opacity-0 transition hover:opacity-80"
                    />
                  )}
                </div>
              ))}
            </div>

            <ul className="mt-3 flex flex-col gap-1.5">
              {sliderSpaces.map((s, i) => {
                const r = resolved[i];
                return (
                  <li
                    key={s.id}
                    className="flex items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-xs"
                  >
                    <span className="font-mono text-[10px] text-neutral-400">
                      #{i + 1}
                    </span>
                    <input
                      value={s.code}
                      onChange={(e) => handleCodeChange(s.id, e.target.value)}
                      maxLength={10}
                      className="w-16 rounded-md border border-neutral-200 bg-white px-1 py-0.5 font-mono text-[11px] focus:border-neutral-900 focus:outline-none"
                    />
                    <input
                      type="number"
                      min={0}
                      value={s.targetSf ?? ""}
                      onChange={(e) => handleSfChange(s.id, e.target.value)}
                      placeholder={r ? `${Math.round(r.sf).toLocaleString()}` : ""}
                      className="w-24 rounded-md border border-neutral-200 bg-white px-1 py-0.5 text-right font-mono text-[11px] focus:border-neutral-900 focus:outline-none"
                    />
                    <span className="text-[10px] text-neutral-500">SF</span>
                    <button
                      type="button"
                      onClick={() => handlePinToggle(s.id)}
                      className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${
                        s.isPinned
                          ? "border-neutral-900 bg-neutral-900 text-white"
                          : "border-neutral-300 bg-white text-neutral-700"
                      }`}
                    >
                      {s.isPinned ? "Pinned" : "Soft"}
                    </button>
                    <span className="ml-auto font-mono text-[10px] text-neutral-500">
                      → {r ? Math.round(r.sf).toLocaleString() : 0} sf
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemove(s.id)}
                      className="rounded-md border border-rose-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-rose-700 hover:bg-rose-50"
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : (
          <section className="border-b border-neutral-200 bg-amber-50 px-6 py-3 text-xs text-amber-900">
            Bay-mode buildings save scenarios as snapshots of the current
            demising. To explore alternates, use the bay editor in the main
            sidebar, then save the result as a new scenario from there.
          </section>
        )}

        {snapshotForCompare && (
          <ScenarioCompare
            buildingId={buildingId}
            totalSf={totalSf}
            bayAreaById={bayAreaById}
            snapshot={snapshotForCompare}
          />
        )}

        {resolvedForFit.length > 0 && (
          <TestFitList resolvedSpaces={resolvedForFit} />
        )}

        <footer className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-neutral-200 bg-white px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={save.isPending || (mode === "sliders" && sliderSpaces.length === 0)}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {save.isPending ? "Saving…" : scheme ? "Save changes" : "Create scenario"}
          </button>
        </footer>
      </div>
    </div>
  );
}
