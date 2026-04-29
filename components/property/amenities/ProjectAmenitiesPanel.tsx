"use client";

import type { Polygon } from "geojson";
import { useEffect, useMemo, useState } from "react";
import { FootprintEditor } from "@/components/map/FootprintEditor";
import { AccessPointsMapEditor } from "@/components/property/amenities/AccessPointsMapEditor";
import { toastError, toastSuccess } from "@/components/ui/Toaster";
import {
  parseAccessPoints,
  parseParcelPolygon,
  parseParkingAreas,
  parseYardAreas,
  type AccessPoint,
  type ParkingArea,
  type ParkingKind,
  type YardArea,
} from "@/lib/projectAmenities";
import { api } from "@/lib/trpc/react";

interface Props {
  projectId: string;
  center: [number, number];
  initialParcel: unknown;
  initialAccessPoints: unknown;
  initialParkingAreas: unknown;
  initialYardAreas: unknown;
}

const PARKING_KIND_OPTIONS: ParkingKind[] = ["car", "trailer", "mixed"];

/**
 * Project-level site-amenity editor: parcel boundary, access points, and
 * one or more parking + yard areas. Mounted on the project edit page;
 * calls the narrowly-scoped project.updateAmenities mutation so other
 * project fields stay untouched.
 *
 * Each parking / yard area is collapsible; the FootprintEditor only
 * mounts when the area is expanded so multiple areas don't pile up
 * Mapbox GL instances on the page.
 */
export function ProjectAmenitiesPanel({
  projectId,
  center,
  initialParcel,
  initialAccessPoints,
  initialParkingAreas,
  initialYardAreas,
}: Props) {
  const utils = api.useUtils();
  const [parcel, setParcel] = useState<Polygon | null>(() =>
    parseParcelPolygon(initialParcel),
  );
  const [points, setPoints] = useState<AccessPoint[]>(() =>
    parseAccessPoints(initialAccessPoints),
  );
  const [parkingAreas, setParkingAreas] = useState<EditableParking[]>(() =>
    parseParkingAreas(initialParkingAreas).map(toEditableParking),
  );
  const [yardAreas, setYardAreas] = useState<EditableYard[]>(() =>
    parseYardAreas(initialYardAreas).map(toEditableYard),
  );
  const [openAreaId, setOpenAreaId] = useState<string | null>(null);

  // Re-hydrate when the initial inputs land asynchronously (project query).
  useEffect(() => {
    setParcel(parseParcelPolygon(initialParcel));
  }, [initialParcel]);
  useEffect(() => {
    setPoints(parseAccessPoints(initialAccessPoints));
  }, [initialAccessPoints]);
  useEffect(() => {
    setParkingAreas(
      parseParkingAreas(initialParkingAreas).map(toEditableParking),
    );
  }, [initialParkingAreas]);
  useEffect(() => {
    setYardAreas(parseYardAreas(initialYardAreas).map(toEditableYard));
  }, [initialYardAreas]);

  const update = api.project.updateAmenities.useMutation({
    onSuccess: async () => {
      await utils.project.byCode.invalidate();
      toastSuccess("Site amenities saved");
    },
    onError: (e) => toastError(e.message),
  });

  function handleSave() {
    update.mutate({
      id: projectId,
      parcelPolygon: parcel,
      accessPoints: points,
      parkingAreas: parkingAreas
        .filter((a) => a.polygon)
        .map((a) => ({
          polygon: a.polygon!,
          stalls: a.stalls,
          kind: a.kind,
          label: a.label,
        })),
      yardAreas: yardAreas
        .filter((a) => a.polygon)
        .map((a) => ({
          polygon: a.polygon!,
          label: a.label,
        })),
    });
  }

  function addParkingArea() {
    const id = newId("p");
    setParkingAreas((prev) => [
      ...prev,
      {
        id,
        polygon: null,
        stalls: null,
        kind: "car",
        label: `Parking ${prev.length + 1}`,
      },
    ]);
    setOpenAreaId(id);
  }
  function addYardArea() {
    const id = newId("y");
    setYardAreas((prev) => [
      ...prev,
      { id, polygon: null, label: `Yard ${prev.length + 1}` },
    ]);
    setOpenAreaId(id);
  }
  function updateParking(id: string, patch: Partial<EditableParking>) {
    setParkingAreas((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    );
  }
  function updateYard(id: string, patch: Partial<EditableYard>) {
    setYardAreas((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    );
  }
  function removeParking(id: string) {
    setParkingAreas((prev) => prev.filter((a) => a.id !== id));
    if (openAreaId === id) setOpenAreaId(null);
  }
  function removeYard(id: string) {
    setYardAreas((prev) => prev.filter((a) => a.id !== id));
    if (openAreaId === id) setOpenAreaId(null);
  }

  const hasChanges = useMemo(() => {
    const initialP = parseParcelPolygon(initialParcel);
    const initialA = parseAccessPoints(initialAccessPoints);
    const initialPark = parseParkingAreas(initialParkingAreas);
    const initialYards = parseYardAreas(initialYardAreas);
    return (
      JSON.stringify(initialP) !== JSON.stringify(parcel) ||
      JSON.stringify(initialA) !== JSON.stringify(points) ||
      JSON.stringify(initialPark) !==
        JSON.stringify(
          parkingAreas
            .filter((a) => a.polygon)
            .map((a) => ({
              polygon: a.polygon,
              stalls: a.stalls,
              kind: a.kind,
              label: a.label,
            })),
        ) ||
      JSON.stringify(initialYards) !==
        JSON.stringify(
          yardAreas
            .filter((a) => a.polygon)
            .map((a) => ({ polygon: a.polygon, label: a.label })),
        )
    );
  }, [
    initialParcel,
    initialAccessPoints,
    initialParkingAreas,
    initialYardAreas,
    parcel,
    points,
    parkingAreas,
    yardAreas,
  ]);

  return (
    <section className="rounded-md border border-neutral-200 bg-white p-4">
      <header className="mb-3 flex items-baseline justify-between">
        <div>
          <h2 className="text-sm font-semibold">Site amenities</h2>
          <p className="text-[11px] text-neutral-500">
            Parcel · access · parking · yard
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={update.isPending || !hasChanges}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {update.isPending ? "Saving…" : "Save amenities"}
        </button>
      </header>

      <div className="flex flex-col gap-5">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
            Parcel polygon
          </p>
          <p className="mb-2 text-[11px] text-neutral-500">
            Trace the legal lot boundary. Auto-snaps near-90° corners. Use the
            trash control to clear.
          </p>
          <div className="h-72 w-full overflow-hidden rounded-md border border-neutral-200">
            <FootprintEditor
              center={center}
              value={parcel}
              onChange={setParcel}
            />
          </div>
        </div>

        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
            Access points
          </p>
          <p className="mb-2 text-[11px] text-neutral-500">
            Click <strong>+ Add point</strong>, then click on the map to drop
            an ingress/egress marker. Drag a pin to reposition. Edit the
            label + role in the side list.
          </p>
          <AccessPointsMapEditor
            center={center}
            parcel={parcel}
            points={points}
            onChange={setPoints}
          />
        </div>
      </div>

      <AreaListSection
        title="Parking areas"
        emptyHint="No parking areas yet. Add one for each lot, e.g. 'Trailer staging' or 'Employee lot'."
        addLabel="+ Add parking area"
        onAdd={addParkingArea}
        items={parkingAreas}
        openAreaId={openAreaId}
        onToggleOpen={(id) => setOpenAreaId((cur) => (cur === id ? null : id))}
        renderSummary={(a) => (
          <span className="text-xs text-neutral-700">
            {a.label || "Untitled lot"}
            <span className="ml-2 text-[11px] text-neutral-500">
              {a.polygon ? "polygon set" : "no polygon"} ·{" "}
              {a.stalls ?? "—"} stalls · {a.kind ?? "car"}
            </span>
          </span>
        )}
        renderBody={(a) => (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[2fr_1fr]">
            <div className="h-64 w-full overflow-hidden rounded-md border border-neutral-200">
              <FootprintEditor
                center={center}
                value={a.polygon}
                onChange={(p) => updateParking(a.id, { polygon: p })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Field label="Label">
                <input
                  type="text"
                  value={a.label ?? ""}
                  onChange={(e) =>
                    updateParking(a.id, { label: e.target.value })
                  }
                  placeholder="e.g. Trailer staging"
                  className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs"
                />
              </Field>
              <Field label="Stalls">
                <input
                  type="number"
                  value={a.stalls ?? ""}
                  onChange={(e) =>
                    updateParking(a.id, {
                      stalls: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  inputMode="numeric"
                  placeholder="e.g. 250"
                  className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs"
                />
              </Field>
              <Field label="Kind">
                <select
                  value={a.kind ?? "car"}
                  onChange={(e) =>
                    updateParking(a.id, {
                      kind: e.target.value as ParkingKind,
                    })
                  }
                  className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs capitalize"
                >
                  {PARKING_KIND_OPTIONS.map((k) => (
                    <option key={k} value={k} className="capitalize">
                      {k}
                    </option>
                  ))}
                </select>
              </Field>
              <button
                type="button"
                onClick={() => removeParking(a.id)}
                className="self-start rounded-md border border-red-200 bg-white px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50"
              >
                Remove this lot
              </button>
            </div>
          </div>
        )}
      />

      <AreaListSection
        title="Yard / outside storage areas"
        emptyHint="No yard areas yet. Add one for each fenced storage zone."
        addLabel="+ Add yard area"
        onAdd={addYardArea}
        items={yardAreas}
        openAreaId={openAreaId}
        onToggleOpen={(id) => setOpenAreaId((cur) => (cur === id ? null : id))}
        renderSummary={(a) => (
          <span className="text-xs text-neutral-700">
            {a.label || "Untitled yard"}
            <span className="ml-2 text-[11px] text-neutral-500">
              {a.polygon ? "polygon set" : "no polygon"}
            </span>
          </span>
        )}
        renderBody={(a) => (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[2fr_1fr]">
            <div className="h-64 w-full overflow-hidden rounded-md border border-neutral-200">
              <FootprintEditor
                center={center}
                value={a.polygon}
                onChange={(p) => updateYard(a.id, { polygon: p })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Field label="Label">
                <input
                  type="text"
                  value={a.label ?? ""}
                  onChange={(e) =>
                    updateYard(a.id, { label: e.target.value })
                  }
                  placeholder="e.g. Equipment yard"
                  className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs"
                />
              </Field>
              <button
                type="button"
                onClick={() => removeYard(a.id)}
                className="self-start rounded-md border border-red-200 bg-white px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50"
              >
                Remove this yard
              </button>
            </div>
          </div>
        )}
      />
    </section>
  );
}

interface EditableParking {
  id: string;
  polygon: Polygon | null;
  stalls: number | null;
  kind: ParkingKind | null;
  label: string | null;
}

interface EditableYard {
  id: string;
  polygon: Polygon | null;
  label: string | null;
}

function toEditableParking(a: ParkingArea): EditableParking {
  return {
    id: newId("p"),
    polygon: a.polygon,
    stalls: a.stalls,
    kind: a.kind,
    label: a.label,
  };
}

function toEditableYard(a: YardArea): EditableYard {
  return { id: newId("y"), polygon: a.polygon, label: a.label };
}

function newId(prefix: string): string {
  // Local-only id for React keys + open/close tracking. Never sent to the
  // server (the mutation just persists arrays and re-derives ids on read).
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

interface AreaListSectionProps<T extends { id: string }> {
  title: string;
  emptyHint: string;
  addLabel: string;
  onAdd: () => void;
  items: T[];
  openAreaId: string | null;
  onToggleOpen: (id: string) => void;
  renderSummary: (item: T) => React.ReactNode;
  renderBody: (item: T) => React.ReactNode;
}

function AreaListSection<T extends { id: string }>({
  title,
  emptyHint,
  addLabel,
  onAdd,
  items,
  openAreaId,
  onToggleOpen,
  renderSummary,
  renderBody,
}: AreaListSectionProps<T>) {
  return (
    <section className="mt-5">
      <header className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
          {title} ({items.length})
        </p>
        <button
          type="button"
          onClick={onAdd}
          className="rounded-md border border-neutral-300 bg-white px-2 py-0.5 text-[11px] font-medium text-neutral-700 hover:bg-neutral-50"
        >
          {addLabel}
        </button>
      </header>
      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-500">
          {emptyHint}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((a) => {
            const isOpen = openAreaId === a.id;
            return (
              <li
                key={a.id}
                className="rounded-md border border-neutral-200 bg-neutral-50"
              >
                <button
                  type="button"
                  onClick={() => onToggleOpen(a.id)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium hover:bg-neutral-100"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-[10px] text-neutral-500">
                      {isOpen ? "▾" : "▸"}
                    </span>
                    {renderSummary(a)}
                  </span>
                </button>
                {isOpen && (
                  <div className="border-t border-neutral-200 p-3">
                    {renderBody(a)}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
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
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
        {label}
      </span>
      {children}
    </label>
  );
}
