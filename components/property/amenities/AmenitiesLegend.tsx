"use client";

import type { AmenityToggles } from "./buildAmenityLayers";

interface Props {
  toggles: AmenityToggles;
  onChange: (next: AmenityToggles) => void;
}

/**
 * Compact legend overlaid on the property hero map. Lets the user toggle
 * the amenity layers off when they're scanning the raw 3D view, without
 * unmounting the layers (which would force re-creation on the map).
 */
export function AmenitiesLegend({ toggles, onChange }: Props) {
  return (
    <div className="absolute bottom-3 left-3 z-10 flex flex-col gap-1 rounded-md border border-neutral-200 bg-white/95 p-2 text-xs shadow-sm backdrop-blur">
      <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
        Site amenities
      </p>
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
}: {
  label: string;
  swatch: string;
  swatchOpacity: number;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 px-1 py-0.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3 w-3"
      />
      <span
        aria-hidden
        className="inline-block h-3 w-3 rounded-sm"
        style={{ background: swatch, opacity: swatchOpacity }}
      />
      <span>{label}</span>
    </label>
  );
}
