"use client";

import type { PropertyMetrics } from "@/lib/propertyMetrics";

interface Props {
  metrics: PropertyMetrics;
}

/**
 * Headline strip of the property dashboard. Four "leasing basics" tiles
 * with color cues so problems jump out in one glance.
 */
export function KPIStrip({ metrics }: Props) {
  const occupancyTone =
    metrics.totalSf === 0
      ? "neutral"
      : metrics.occupancyPct >= 95
        ? "good"
        : metrics.occupancyPct >= 80
          ? "warn"
          : "bad";

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Tile label="Total SF" value={fmt(metrics.totalSf)} />
      <Tile
        label="Occupancy"
        value={`${metrics.occupancyPct.toFixed(0)}%`}
        tone={occupancyTone}
        sub={`${fmt(metrics.leasedSf)} leased`}
      />
      <Tile
        label="Vacant SF"
        value={fmt(metrics.vacantSf)}
        tone={metrics.vacantSf > 0 ? "warn" : "good"}
      />
      <Tile
        label="Buildings"
        value={String(metrics.buildingCount)}
        sub={`${metrics.spaceCount} space${metrics.spaceCount === 1 ? "" : "s"}`}
      />
    </div>
  );
}

function fmt(n: number): string {
  return n.toLocaleString();
}

function Tile({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "warn" | "bad" | "neutral";
}) {
  const toneClass =
    tone === "good"
      ? "border-emerald-200 bg-emerald-50"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50"
        : tone === "bad"
          ? "border-red-200 bg-red-50"
          : "border-neutral-200 bg-white";

  return (
    <div className={`rounded-md border px-4 py-3 ${toneClass}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-neutral-900">
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-neutral-500">{sub}</p>}
    </div>
  );
}
