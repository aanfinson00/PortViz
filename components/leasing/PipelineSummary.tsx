"use client";

import { PROSPECT_STAGE_META, ACTIVE_STAGE_KEYS } from "@/lib/prospectStages";

interface Props {
  summary:
    | Record<string, { count: number; sf: number; weightedRevenue: number }>
    | undefined;
}

/**
 * Sticky strip above the pipeline board showing per-stage counts + SF +
 * weighted-revenue rollups. The weighted-revenue number multiplies each
 * prospect's (SF × rent × term × probability) so brokers can see a quick
 * "what's the pipeline actually worth" figure that respects stage.
 */
export function PipelineSummary({ summary }: Props) {
  if (!summary) return null;

  const totalActiveSf = ACTIVE_STAGE_KEYS.reduce(
    (sum, k) => sum + (summary[k]?.sf ?? 0),
    0,
  );
  const totalActiveCount = ACTIVE_STAGE_KEYS.reduce(
    (sum, k) => sum + (summary[k]?.count ?? 0),
    0,
  );
  const totalWeightedRevenue = ACTIVE_STAGE_KEYS.reduce(
    (sum, k) => sum + (summary[k]?.weightedRevenue ?? 0),
    0,
  );
  const executedCount = summary.executed?.count ?? 0;
  const deadCount = summary.dead?.count ?? 0;

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm">
      <Metric
        label="Active deals"
        value={totalActiveCount.toString()}
        sub="prospect → lease out"
      />
      <Metric
        label="Active SF"
        value={`${totalActiveSf.toLocaleString()} sf`}
        sub="sum of requested SF"
      />
      <Metric
        label="Weighted pipeline"
        value={formatBigMoney(totalWeightedRevenue)}
        sub="SF × rent × term × prob"
      />
      <Metric
        label="Executed (won)"
        value={executedCount.toString()}
        sub="closed deals"
      />
      <Metric
        label="Dead (lost)"
        value={deadCount.toString()}
        sub="closed-lost"
      />
      <div className="ml-auto flex items-center gap-3 text-xs text-neutral-500">
        {PROSPECT_STAGE_META.filter((m) =>
          (ACTIVE_STAGE_KEYS as readonly string[]).includes(m.key),
        ).map((m) => (
          <span key={m.key} className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: m.color }}
            />
            {m.shortLabel} · {summary[m.key]?.count ?? 0}
          </span>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex flex-col">
      <p className="text-xs uppercase tracking-wide text-neutral-400">{label}</p>
      <p className="font-mono text-base font-semibold text-neutral-900">
        {value}
      </p>
      <p className="text-[10px] text-neutral-400">{sub}</p>
    </div>
  );
}

function formatBigMoney(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "$0";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}
