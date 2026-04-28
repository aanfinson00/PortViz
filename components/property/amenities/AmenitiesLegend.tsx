"use client";

import { PARKING_KIND_COLORS, type ParkingKind } from "@/lib/projectAmenities";
import type { AmenityToggles } from "./buildAmenityLayers";
import type { ProjectAmenityToggles } from "./buildProjectAmenityLayers";

/**
 * Combined toggle state for both building-level (docks, truck courts) and
 * project-level (parcel, access points) amenities. Kept here so the
 * legend has a single source of truth.
 */
export type AllAmenityToggles = AmenityToggles & ProjectAmenityToggles;

interface Props {
  toggles: AllAmenityToggles;
  onChange: (next: AllAmenityToggles) => void;
  /**
   * Whether each layer has any data to show. When false, the row is
   * dimmed and unchecked (the underlying layer is empty anyway). Lets
   * the user see which amenities have been configured at a glance.
   */
  available?: Partial<Record<keyof AllAmenityToggles, boolean>>;
  /** Color the Parking row's swatch to match the configured kind. */
  parkingKind?: ParkingKind | null;
}

/**
 * Compact legend overlaid on the property hero map. Lets the user toggle
 * the amenity layers off when they're scanning the raw 3D view, without
 * unmounting the layers (which would force re-creation on the map).
 */
export function AmenitiesLegend({
  toggles,
  onChange,
  available,
  parkingKind,
}: Props) {
  const parkingSwatch =
    PARKING_KIND_COLORS[parkingKind ?? "car"] ?? "#94a3b8";
  return (
    <div className="absolute bottom-3 left-3 z-10 flex flex-col gap-1 rounded-md border border-neutral-200 bg-white/95 p-2 text-xs shadow-sm backdrop-blur">
      <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
        Site amenities
      </p>
      <Row
        label="Parcel boundary"
        swatch="#0ea5e9"
        swatchOpacity={0.85}
        dashed
        checked={toggles.parcel}
        disabled={available?.parcel === false}
        onChange={(v) => onChange({ ...toggles, parcel: v })}
      />
      <Row
        label="Access points"
        swatch="#2563eb"
        swatchOpacity={0.95}
        rounded
        checked={toggles.accessPoints}
        disabled={available?.accessPoints === false}
        onChange={(v) => onChange({ ...toggles, accessPoints: v })}
      />
      <Row
        label="Parking"
        swatch={parkingSwatch}
        swatchOpacity={0.5}
        checked={toggles.parking}
        disabled={available?.parking === false}
        onChange={(v) => onChange({ ...toggles, parking: v })}
      />
      <Row
        label="Yard / storage"
        swatch="#65a30d"
        swatchOpacity={0.4}
        checked={toggles.yard}
        disabled={available?.yard === false}
        onChange={(v) => onChange({ ...toggles, yard: v })}
      />
      <Row
        label="Truck courts"
        swatch="#f59e0b"
        swatchOpacity={0.5}
        checked={toggles.truckCourts}
        onChange={(v) => onChange({ ...toggles, truckCourts: v })}
      />
      <Row
        label="Docks & drive-ins"
        swatch="#111827"
        swatchOpacity={0.85}
        checked={toggles.docks}
        onChange={(v) => onChange({ ...toggles, docks: v })}
      />
    </div>
  );
}

function Row({
  label,
  swatch,
  swatchOpacity,
  checked,
  onChange,
  disabled = false,
  dashed = false,
  rounded = false,
}: {
  label: string;
  swatch: string;
  swatchOpacity: number;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  dashed?: boolean;
  rounded?: boolean;
}) {
  const swatchClass = rounded
    ? "inline-block h-3 w-3 rounded-full"
    : "inline-block h-3 w-3 rounded-sm";
  return (
    <label
      className={`flex items-center gap-2 px-1 py-0.5 ${
        disabled
          ? "cursor-not-allowed text-neutral-400"
          : "cursor-pointer text-neutral-700"
      }`}
    >
      <input
        type="checkbox"
        checked={checked && !disabled}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3 w-3"
      />
      <span
        aria-hidden
        className={swatchClass}
        style={{
          background: dashed
            ? `repeating-linear-gradient(90deg, ${swatch} 0 4px, transparent 4px 7px)`
            : swatch,
          opacity: swatchOpacity,
        }}
      />
      <span>{label}</span>
    </label>
  );
}
