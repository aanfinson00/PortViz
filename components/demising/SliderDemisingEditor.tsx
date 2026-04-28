"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { spaceColor } from "@/components/demising/DemisingEditor";
import { toastError, toastSuccess } from "@/components/ui/Toaster";
import { nextSpaceCode } from "@/lib/codes";
import {
  dragWall,
  removeSpace,
  resolveSpaces,
  splitLargest,
  type SliderSpace,
} from "@/lib/sliderDemising";
import { api } from "@/lib/trpc/react";

interface DbSpace {
  id: string;
  code: string;
  position_order: number | null;
  target_sf: number | null;
  is_pinned: boolean | null;
  office_depth_ft: number | null;
}

/**
 * Slider space + the office depth, threaded together so the parent page
 * can render the office vs warehouse extrusions in real time.
 */
export interface EditableSpace extends SliderSpace {
  officeDepthFt: number | null;
}

interface SliderDemisingEditorProps {
  buildingId: string;
  /** Total SF of the building (typically computed from the polygon area). */
  totalSf: number;
  initialSpaces: DbSpace[];
  /**
   * Notify the parent (building detail page) when the local space layout
   * changes — used to drive the live 3D preview on the building map.
   */
  onChange?: (spaces: EditableSpace[]) => void;
  /**
   * Per-space office and warehouse SF computed by the parent from the
   * polygon slabs. Keyed by space id; the editor displays these as
   * read-only readouts next to the office-depth input.
   */
  officeBreakdown?: Record<string, { officeSf: number; warehouseSf: number }>;
}

const TEMP_PREFIX = "new:";

/**
 * Slider-based demising panel. Buildings get their total SF from the
 * polygon area; the user adds N-1 walls to split the building into N
 * spaces, drags walls to adjust, and pins individual spaces to lock
 * them at exact SFs.
 *
 * Design notes:
 *  - Local state is a sorted SliderSpace[] indexed by positionOrder.
 *  - Pure helpers in lib/sliderDemising do the math; this component is
 *    only orchestration + DOM events.
 *  - Save is explicit (not autosave) to avoid hammering the bulk-upsert
 *    mutation during a drag.
 */
export function SliderDemisingEditor({
  buildingId,
  totalSf,
  initialSpaces,
  onChange,
  officeBreakdown,
}: SliderDemisingEditorProps) {
  const utils = api.useUtils();
  const tempCounterRef = useRef(0);

  const initialEditable = useMemo<EditableSpace[]>(
    () =>
      initialSpaces
        .map((s, i) => ({
          id: s.id,
          positionOrder: s.position_order ?? i,
          isPinned: s.is_pinned ?? false,
          targetSf: s.target_sf,
          officeDepthFt: s.office_depth_ft,
        }))
        .sort((a, b) => a.positionOrder - b.positionOrder),
    [initialSpaces],
  );

  const [spaces, setSpaces] = useState<EditableSpace[]>(initialEditable);
  const [codes, setCodes] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialSpaces.map((s) => [s.id, s.code])),
  );
  // Track which space rows have the office editor expanded.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Re-hydrate when initialSpaces lands asynchronously.
  useEffect(() => {
    setSpaces(initialEditable);
    setCodes(Object.fromEntries(initialSpaces.map((s) => [s.id, s.code])));
  }, [initialEditable, initialSpaces]);

  useEffect(() => {
    onChange?.(spaces);
  }, [spaces, onChange]);

  const resolved = useMemo(
    () => resolveSpaces(spaces, totalSf),
    [spaces, totalSf],
  );

  const pinnedTotal = useMemo(
    () =>
      spaces.reduce(
        (acc, s) => (s.isPinned ? acc + (s.targetSf ?? 0) : acc),
        0,
      ),
    [spaces],
  );
  const overAllocated = pinnedTotal > totalSf;

  const upsert = api.space.bulkUpsertSliders.useMutation({
    onSuccess: async (res) => {
      // Replace temp ids with the real ones returned from the server.
      if (Object.keys(res.idMap).length > 0) {
        setSpaces((prev) =>
          prev.map((s) =>
            res.idMap[s.id] ? { ...s, id: res.idMap[s.id]! } : s,
          ),
        );
        setCodes((prev) => {
          const next: Record<string, string> = {};
          for (const [oldId, code] of Object.entries(prev)) {
            next[res.idMap[oldId] ?? oldId] = code;
          }
          return next;
        });
      }
      await Promise.all([
        utils.space.listByBuilding.invalidate({ buildingId }),
        utils.building.listForMap.invalidate(),
      ]);
      toastSuccess("Demising saved");
    },
    onError: (e) => toastError(e.message),
  });

  function handleAddSpace() {
    setSpaces((prev) => {
      const newId = `${TEMP_PREFIX}${++tempCounterRef.current}`;
      const next = splitLargest(prev, totalSf, newId, { officeDepthFt: null });
      // Coin a new code for the new space — pick the next free numeric
      // suffix from the existing codes pool.
      const usedCodes = new Set(Object.values(codes));
      const code = nextSpaceCode(Array.from(usedCodes));
      setCodes((c) => ({ ...c, [newId]: code }));
      return next;
    });
  }

  function handleOfficeDepthChange(id: string, value: string) {
    const n =
      value.trim() === ""
        ? null
        : Number.isFinite(Number(value))
          ? Math.max(0, Math.round(Number(value)))
          : null;
    setSpaces((prev) =>
      prev.map((s) => (s.id === id ? { ...s, officeDepthFt: n } : s)),
    );
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function handleRemove(id: string) {
    setSpaces((prev) => removeSpace(prev, id));
    setCodes((prev) => {
      const { [id]: _omit, ...rest } = prev;
      return rest;
    });
  }

  function handlePinToggle(id: string) {
    setSpaces((prev) =>
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

  function handleSfChange(id: string, value: string) {
    const n = value.trim() === "" ? null : Math.round(Number(value));
    if (value.trim() !== "" && (!Number.isFinite(n!) || n! < 0)) return;
    setSpaces((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, targetSf: n, isPinned: n !== null ? true : s.isPinned }
          : s,
      ),
    );
  }

  function handleSave() {
    upsert.mutate({
      buildingId,
      spaces: spaces.map((s, i) => ({
        id: s.id,
        code: codes[s.id] ?? `S${i + 1}`,
        positionOrder: i,
        targetSf: s.isPinned ? s.targetSf : s.targetSf,
        isPinned: s.isPinned,
        officeDepthFt: s.officeDepthFt ?? null,
      })),
    });
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
            Slider demising
          </p>
          <p className="text-xs text-neutral-600">
            Total {totalSf.toLocaleString()} SF · {spaces.length} space
            {spaces.length === 1 ? "" : "s"}
            {overAllocated && (
              <span className="ml-2 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                Over-allocated
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleAddSpace}
            className="rounded-md border border-neutral-300 bg-white px-3 py-1 text-xs font-medium hover:bg-neutral-50"
          >
            + Add space
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={upsert.isPending}
            className="rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {upsert.isPending ? "Saving…" : "Save demising"}
          </button>
        </div>
      </header>

      <SliderBar
        resolved={resolved}
        totalSf={totalSf}
        onWallDrag={(wallIndex, deltaSf) =>
          setSpaces((prev) => dragWall(prev, wallIndex, deltaSf, totalSf))
        }
      />

      {spaces.length === 0 ? (
        <p className="rounded-md border border-dashed border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-500">
          No spaces yet. Click <strong>+ Add space</strong> to split the
          building into demised areas.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {resolved.map((r, i) => {
            const isExpanded = expanded[r.id] ?? false;
            const breakdown = officeBreakdown?.[r.id];
            const officeSf = breakdown?.officeSf ?? 0;
            const warehouseSf = breakdown?.warehouseSf ?? r.sf;
            return (
              <li
                key={r.id}
                className="flex flex-col gap-1 rounded-md border border-neutral-200 bg-white p-2 text-xs"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    aria-hidden
                    className="inline-block h-3 w-3 flex-shrink-0 rounded-sm"
                    style={{ background: spaceColor(i) }}
                  />
                  <input
                    type="text"
                    value={codes[r.id] ?? ""}
                    onChange={(e) =>
                      setCodes((prev) => ({
                        ...prev,
                        [r.id]: e.target.value.toUpperCase(),
                      }))
                    }
                    className="w-20 rounded border border-neutral-200 px-1.5 py-0.5 font-mono"
                    aria-label="Space code"
                  />
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder={`${Math.round(r.sf).toLocaleString()}`}
                    value={r.targetSf ?? ""}
                    onChange={(e) => handleSfChange(r.id, e.target.value)}
                    className="w-28 rounded border border-neutral-200 px-1.5 py-0.5 font-mono"
                    aria-label="Target SF"
                  />
                  <span className="text-neutral-500">
                    · {Math.round(r.sf).toLocaleString()} SF (
                    {(r.share * 100).toFixed(1)}%)
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleExpanded(r.id)}
                    className="ml-auto rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-neutral-600 hover:bg-neutral-50"
                    title={isExpanded ? "Hide office buildout" : "Show office buildout"}
                  >
                    {isExpanded ? "Office ▴" : "Office ▾"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePinToggle(r.id)}
                    className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${
                      r.isPinned
                        ? "border-blue-300 bg-blue-50 text-blue-700"
                        : "border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50"
                    }`}
                    title={
                      r.isPinned
                        ? "Pinned — adjacent walls won't slide"
                        : "Click to pin this space's SF"
                    }
                  >
                    {r.isPinned ? "📌 Pinned" : "Pin"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(r.id)}
                    className="rounded border border-red-200 bg-white px-1.5 py-0.5 text-red-700 hover:bg-red-50"
                    aria-label="Remove space"
                  >
                    ×
                  </button>
                </div>
                {isExpanded && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-neutral-100 pl-5 pt-1.5 text-[11px] text-neutral-600">
                    <label className="flex items-center gap-1">
                      <span className="text-neutral-500">Office depth</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        placeholder="0"
                        value={r.officeDepthFt ?? ""}
                        onChange={(e) =>
                          handleOfficeDepthChange(r.id, e.target.value)
                        }
                        className="w-16 rounded border border-neutral-200 px-1.5 py-0.5 font-mono"
                      />
                      <span className="text-neutral-500">ft</span>
                    </label>
                    {r.officeDepthFt && r.officeDepthFt > 0 ? (
                      <span className="text-neutral-500">
                        →{" "}
                        <span className="font-medium text-neutral-800">
                          {Math.round(officeSf).toLocaleString()}
                        </span>{" "}
                        office /{" "}
                        <span className="font-medium text-neutral-800">
                          {Math.round(warehouseSf).toLocaleString()}
                        </span>{" "}
                        warehouse
                      </span>
                    ) : (
                      <span className="text-neutral-400">
                        No office (full warehouse)
                      </span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

interface SliderBarProps {
  resolved: ReturnType<typeof resolveSpaces>;
  totalSf: number;
  onWallDrag: (wallIndex: number, deltaSf: number) => void;
}

/**
 * Horizontal bar visualization of the demising. Each space is a colored
 * segment proportional to its SF; walls between segments are draggable
 * handles (pointer events). Width is responsive.
 */
function SliderBar({ resolved, totalSf, onWallDrag }: SliderBarProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  function handlePointerDown(e: React.PointerEvent, wallIndex: number) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const barWidth = ref.current?.getBoundingClientRect().width ?? 1;
    const sfPerPixel = totalSf / barWidth;
    let lastDelta = 0;
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const deltaSf = dx * sfPerPixel - lastDelta;
      lastDelta += deltaSf;
      onWallDrag(wallIndex, deltaSf);
    };
    const onUp = (ev: PointerEvent) => {
      handle.releasePointerCapture(ev.pointerId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <div
      ref={ref}
      className="relative h-8 w-full overflow-hidden rounded-md border border-neutral-200 bg-neutral-100"
    >
      {resolved.map((r, i) => (
        <div
          key={r.id}
          className="absolute inset-y-0 flex items-center justify-center text-[10px] font-medium text-white/90"
          style={{
            left: `${r.leftWall * 100}%`,
            width: `${(r.rightWall - r.leftWall) * 100}%`,
            background: spaceColor(i),
            opacity: 0.85,
          }}
          title={`${Math.round(r.sf).toLocaleString()} SF`}
        >
          {r.share > 0.06 ? `${Math.round(r.sf).toLocaleString()} SF` : ""}
        </div>
      ))}
      {resolved.slice(0, -1).map((r, i) => {
        const nextResolved = resolved[i + 1]!;
        const adjacentPinned = r.isPinned || nextResolved.isPinned;
        return (
          <div
            key={`wall-${i}`}
            onPointerDown={(e) => !adjacentPinned && handlePointerDown(e, i)}
            className={`absolute inset-y-0 z-10 -translate-x-1/2 ${
              adjacentPinned
                ? "cursor-not-allowed border-x-2 border-neutral-400 bg-neutral-200"
                : "cursor-ew-resize border-x-2 border-white bg-neutral-700"
            }`}
            style={{
              left: `${r.rightWall * 100}%`,
              width: 6,
            }}
            title={
              adjacentPinned
                ? "Locked — one of the adjacent spaces is pinned"
                : "Drag to adjust"
            }
          />
        );
      })}
    </div>
  );
}
