"use client";

import type { Polygon } from "geojson";
import { useEffect, useMemo, useState } from "react";
import { FootprintEditor } from "@/components/map/FootprintEditor";
import { AccessPointsMapEditor } from "@/components/property/amenities/AccessPointsMapEditor";
import { toastError, toastSuccess } from "@/components/ui/Toaster";
import {
  parseAccessPoints,
  parseParcelPolygon,
  parseParkingKind,
  type AccessPoint,
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

  // Per-field dirty bits drive both the Save button's enabled state and
  // the patch we actually send — only changed fields go in the mutation,
  // so a user who only touched the parcel doesn't reach for access_points
  // (which would fail loudly if migration 0007 hasn't been applied yet).
  const dirty = useMemo(() => {
    const initialP = parseParcelPolygon(initialParcel);
    const initialA = parseAccessPoints(initialAccessPoints);
    const initialPark = parseParcelPolygon(initialParkingPolygon);
    const initialKind = parseParkingKind(initialParkingKind) ?? "car";
    const initialYard = parseParcelPolygon(initialYardPolygon);
    const stallsNow =
      parkingStalls.trim() === "" ? null : Number(parkingStalls);
    return {
      parcel: JSON.stringify(initialP) !== JSON.stringify(parcel),
      accessPoints: JSON.stringify(initialA) !== JSON.stringify(points),
      parkingPolygon:
        JSON.stringify(initialPark) !== JSON.stringify(parkingPolygon),
      parkingStalls: (initialParkingStalls ?? null) !== stallsNow,
      parkingKind: initialKind !== parkingKind,
      yardPolygon: JSON.stringify(initialYard) !== JSON.stringify(yardPolygon),
    };
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

  const hasChanges = useMemo(
    () => Object.values(dirty).some(Boolean),
    [dirty],
  );

  function handleSave() {
    const stallsNum =
      parkingStalls.trim() === "" ? null : Number(parkingStalls);
    const stallsClean =
      stallsNum != null && Number.isFinite(stallsNum) && stallsNum >= 0
        ? Math.round(stallsNum)
        : null;
    update.mutate({
      id: projectId,
      ...(dirty.parcel ? { parcelPolygon: parcel } : {}),
      ...(dirty.accessPoints ? { accessPoints: points } : {}),
      ...(dirty.parkingPolygon ? { parkingPolygon } : {}),
      ...(dirty.parkingStalls ? { parkingStalls: stallsClean } : {}),
      ...(dirty.parkingKind && parkingPolygon
        ? { parkingKind }
        : {}),
      ...(dirty.yardPolygon ? { yardPolygon } : {}),
    });
  }

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
