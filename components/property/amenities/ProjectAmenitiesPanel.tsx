"use client";

import type { Polygon } from "geojson";
import { useEffect, useMemo, useState } from "react";
import { FootprintEditor } from "@/components/map/FootprintEditor";
import { toastError, toastSuccess } from "@/components/ui/Toaster";
import {
  ACCESS_ROLE_COLORS,
  parseAccessPoints,
  parseParcelPolygon,
  parseParkingKind,
  type AccessPoint,
  type AccessRole,
  type ParkingKind,
} from "@/lib/projectAmenities";
import { api } from "@/lib/trpc/react";

interface Props {
  projectId: string;
  center: [number, number];
  initialParcel: unknown;
  initialAccessPoints: unknown;
  initialParkingPolygon: unknown;
  initialParkingStalls: number | null;
  initialParkingKind: unknown;
  initialYardPolygon: unknown;
}

const ROLE_OPTIONS: AccessRole[] = [
  "main",
  "truck",
  "service",
  "emergency",
  "other",
];
const PARKING_KIND_OPTIONS: ParkingKind[] = ["car", "trailer", "mixed"];

/**
 * Project-level site-amenity editor: parcel boundary, access points,
 * parking lot, and yard / outside storage. Mounted on the project edit
 * page; calls the narrowly-scoped project.updateAmenities mutation so
 * other project fields stay untouched.
 *
 * Parking + yard sections render inside <details> so their FootprintEditors
 * (each one mounts a Mapbox GL instance) only spin up on demand. The
 * parcel editor stays expanded by default since it's the most-used.
 */
export function ProjectAmenitiesPanel({
  projectId,
  center,
  initialParcel,
  initialAccessPoints,
  initialParkingPolygon,
  initialParkingStalls,
  initialParkingKind,
  initialYardPolygon,
}: Props) {
  const utils = api.useUtils();
  const [parcel, setParcel] = useState<Polygon | null>(() =>
    parseParcelPolygon(initialParcel),
  );
  const [points, setPoints] = useState<AccessPoint[]>(() =>
    parseAccessPoints(initialAccessPoints),
  );
  const [parkingPolygon, setParkingPolygon] = useState<Polygon | null>(() =>
    parseParcelPolygon(initialParkingPolygon),
  );
  const [parkingStalls, setParkingStalls] = useState<string>(
    initialParkingStalls != null ? String(initialParkingStalls) : "",
  );
  const [parkingKind, setParkingKind] = useState<ParkingKind>(
    parseParkingKind(initialParkingKind) ?? "car",
  );
  const [yardPolygon, setYardPolygon] = useState<Polygon | null>(() =>
    parseParcelPolygon(initialYardPolygon),
  );

  // Re-hydrate when the initial inputs land asynchronously (project query).
  useEffect(() => {
    setParcel(parseParcelPolygon(initialParcel));
  }, [initialParcel]);
  useEffect(() => {
    setPoints(parseAccessPoints(initialAccessPoints));
  }, [initialAccessPoints]);
  useEffect(() => {
    setParkingPolygon(parseParcelPolygon(initialParkingPolygon));
  }, [initialParkingPolygon]);
  useEffect(() => {
    setParkingStalls(
      initialParkingStalls != null ? String(initialParkingStalls) : "",
    );
  }, [initialParkingStalls]);
  useEffect(() => {
    setParkingKind(parseParkingKind(initialParkingKind) ?? "car");
  }, [initialParkingKind]);
  useEffect(() => {
    setYardPolygon(parseParcelPolygon(initialYardPolygon));
  }, [initialYardPolygon]);

  const update = api.project.updateAmenities.useMutation({
    onSuccess: async () => {
      await utils.project.byCode.invalidate();
      toastSuccess("Site amenities saved");
    },
    onError: (e) => toastError(e.message),
  });

  function handleSave() {
    const stallsNum = parkingStalls.trim() === "" ? null : Number(parkingStalls);
    update.mutate({
      id: projectId,
      parcelPolygon: parcel,
      accessPoints: points,
      parkingPolygon,
      parkingStalls:
        stallsNum != null && Number.isFinite(stallsNum) && stallsNum >= 0
          ? Math.round(stallsNum)
          : null,
      parkingKind: parkingPolygon ? parkingKind : null,
      yardPolygon,
    });
  }

  function addPoint() {
    setPoints((prev) => [
      ...prev,
      { lng: center[0], lat: center[1], label: "", role: "main" },
    ]);
  }

  function updatePoint(idx: number, patch: Partial<AccessPoint>) {
    setPoints((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    );
  }

  function removePoint(idx: number) {
    setPoints((prev) => prev.filter((_, i) => i !== idx));
  }

  const hasChanges = useMemo(() => {
    const initialP = parseParcelPolygon(initialParcel);
    const initialA = parseAccessPoints(initialAccessPoints);
    const initialPark = parseParcelPolygon(initialParkingPolygon);
    const initialKind = parseParkingKind(initialParkingKind) ?? "car";
    const initialYard = parseParcelPolygon(initialYardPolygon);
    const stallsNow = parkingStalls.trim() === "" ? null : Number(parkingStalls);
    return (
      JSON.stringify(initialP) !== JSON.stringify(parcel) ||
      JSON.stringify(initialA) !== JSON.stringify(points) ||
      JSON.stringify(initialPark) !== JSON.stringify(parkingPolygon) ||
      (initialParkingStalls ?? null) !== stallsNow ||
      initialKind !== parkingKind ||
      JSON.stringify(initialYard) !== JSON.stringify(yardPolygon)
    );
  }, [
    initialParcel,
    initialAccessPoints,
    initialParkingPolygon,
    initialParkingStalls,
    initialParkingKind,
    initialYardPolygon,
    parcel,
    points,
    parkingPolygon,
    parkingStalls,
    parkingKind,
    yardPolygon,
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
              Access points ({points.length})
            </p>
            <button
              type="button"
              onClick={addPoint}
              className="rounded-md border border-neutral-300 bg-white px-2 py-0.5 text-[11px] font-medium text-neutral-700 hover:bg-neutral-50"
            >
              + Add
            </button>
          </div>
          {points.length === 0 ? (
            <p className="rounded-md border border-dashed border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-500">
              No access points yet. Click Add to drop one at the property
              center, then edit the coordinates and label.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {points.map((p, i) => (
                <li
                  key={i}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-neutral-200 bg-white p-2 text-xs"
                >
                  <span
                    aria-hidden
                    className="inline-block h-3 w-3 flex-shrink-0 rounded-full"
                    style={{
                      background:
                        ACCESS_ROLE_COLORS[p.role ?? "other"],
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Label"
                    value={p.label ?? ""}
                    onChange={(e) =>
                      updatePoint(i, { label: e.target.value })
                    }
                    className="min-w-0 flex-1 rounded border border-neutral-200 px-1.5 py-0.5"
                  />
                  <select
                    value={p.role ?? "other"}
                    onChange={(e) =>
                      updatePoint(i, {
                        role: e.target.value as AccessRole,
                      })
                    }
                    className="rounded border border-neutral-200 px-1 py-0.5 capitalize"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r} className="capitalize">
                        {r}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.000001"
                    value={p.lat}
                    onChange={(e) =>
                      updatePoint(i, { lat: Number(e.target.value) })
                    }
                    className="w-28 rounded border border-neutral-200 px-1.5 py-0.5 font-mono"
                    aria-label="lat"
                  />
                  <input
                    type="number"
                    step="0.000001"
                    value={p.lng}
                    onChange={(e) =>
                      updatePoint(i, { lng: Number(e.target.value) })
                    }
                    className="w-28 rounded border border-neutral-200 px-1.5 py-0.5 font-mono"
                    aria-label="lng"
                  />
                  <button
                    type="button"
                    onClick={() => removePoint(i)}
                    className="rounded border border-red-200 bg-white px-1.5 py-0.5 text-red-700 hover:bg-red-50"
                    aria-label="Remove access point"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <details className="mt-4 rounded-md border border-neutral-200 bg-neutral-50">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
          Parking lot
          {parkingPolygon && (
            <span className="ml-2 text-[11px] font-normal text-neutral-500">
              · {parkingStalls || "—"} stalls · {parkingKind}
            </span>
          )}
        </summary>
        <div className="border-t border-neutral-200 p-3">
          <p className="mb-2 text-[11px] text-neutral-500">
            Trace the parking lot polygon. Stall count drives the
            cars-per-1,000-SF ratio on the dashboard.
          </p>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[2fr_1fr]">
            <div className="h-64 w-full overflow-hidden rounded-md border border-neutral-200">
              <FootprintEditor
                center={center}
                value={parkingPolygon}
                onChange={setParkingPolygon}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                  Stalls
                </span>
                <input
                  value={parkingStalls}
                  onChange={(e) => setParkingStalls(e.target.value)}
                  inputMode="numeric"
                  placeholder="e.g. 250"
                  className="rounded-md border border-neutral-300 bg-white px-2 py-1"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                  Kind
                </span>
                <select
                  value={parkingKind}
                  onChange={(e) =>
                    setParkingKind(e.target.value as ParkingKind)
                  }
                  className="rounded-md border border-neutral-300 bg-white px-2 py-1 capitalize"
                >
                  {PARKING_KIND_OPTIONS.map((k) => (
                    <option key={k} value={k} className="capitalize">
                      {k}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </div>
      </details>

      <details className="mt-3 rounded-md border border-neutral-200 bg-neutral-50">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
          Yard / outside storage
          {yardPolygon && (
            <span className="ml-2 text-[11px] font-normal text-neutral-500">
              · configured
            </span>
          )}
        </summary>
        <div className="border-t border-neutral-200 p-3">
          <p className="mb-2 text-[11px] text-neutral-500">
            Trace the fenced exterior storage area. Premium for trucking and
            equipment-rental tenants.
          </p>
          <div className="h-64 w-full overflow-hidden rounded-md border border-neutral-200">
            <FootprintEditor
              center={center}
              value={yardPolygon}
              onChange={setYardPolygon}
            />
          </div>
        </div>
      </details>
    </section>
  );
}
