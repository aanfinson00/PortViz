/**
 * Display metadata for the leasing-prospect pipeline. Shared between the
 * Kanban view, table view, and detail drawer so labels/colors/sort order
 * stay consistent. Keep in sync with the enum in
 * supabase/migrations/0014_leasing_tracker.sql and the PROSPECT_STAGES
 * constant in server/trpc/routers/leasingProspect.ts.
 */

export interface ProspectStageMeta {
  key: string;
  label: string;
  shortLabel: string;
  description: string;
  defaultProbability: number;
  /** Tailwind color classes — header background. */
  headerClass: string;
  /** Tailwind color classes — chip / dot. */
  chipClass: string;
  /** Hex for chart fills / map colors. */
  color: string;
}

export const PROSPECT_STAGE_META: readonly ProspectStageMeta[] = [
  {
    key: "prospect",
    label: "Prospect",
    shortLabel: "Prospect",
    description: "Identified lead, no engagement yet.",
    defaultProbability: 10,
    headerClass: "bg-neutral-100 text-neutral-700",
    chipClass: "bg-neutral-100 text-neutral-700 border-neutral-200",
    color: "#a3a3a3",
  },
  {
    key: "tour",
    label: "Tour",
    shortLabel: "Tour",
    description: "Tour scheduled or completed.",
    defaultProbability: 25,
    headerClass: "bg-sky-50 text-sky-900",
    chipClass: "bg-sky-50 text-sky-900 border-sky-200",
    color: "#0ea5e9",
  },
  {
    key: "rfp",
    label: "RFP",
    shortLabel: "RFP",
    description: "Request-for-proposal issued (either side).",
    defaultProbability: 40,
    headerClass: "bg-indigo-50 text-indigo-900",
    chipClass: "bg-indigo-50 text-indigo-900 border-indigo-200",
    color: "#6366f1",
  },
  {
    key: "proposal",
    label: "Proposal",
    shortLabel: "Proposal",
    description: "Proposal / unsolicited proposal sent.",
    defaultProbability: 55,
    headerClass: "bg-violet-50 text-violet-900",
    chipClass: "bg-violet-50 text-violet-900 border-violet-200",
    color: "#8b5cf6",
  },
  {
    key: "loi",
    label: "LOI",
    shortLabel: "LOI",
    description: "Letter of intent in negotiation.",
    defaultProbability: 75,
    headerClass: "bg-amber-50 text-amber-900",
    chipClass: "bg-amber-50 text-amber-900 border-amber-200",
    color: "#f59e0b",
  },
  {
    key: "lease_out",
    label: "Lease Out",
    shortLabel: "Lease Out",
    description: "Lease document out for signature.",
    defaultProbability: 90,
    headerClass: "bg-emerald-50 text-emerald-900",
    chipClass: "bg-emerald-50 text-emerald-900 border-emerald-200",
    color: "#10b981",
  },
  {
    key: "executed",
    label: "Executed",
    shortLabel: "Executed",
    description: "Lease signed — convert to a real lease record.",
    defaultProbability: 100,
    headerClass: "bg-emerald-100 text-emerald-900",
    chipClass: "bg-emerald-100 text-emerald-900 border-emerald-300",
    color: "#059669",
  },
  {
    key: "dead",
    label: "Dead",
    shortLabel: "Dead",
    description: "Lost deal (record lost_reason).",
    defaultProbability: 0,
    headerClass: "bg-rose-50 text-rose-900",
    chipClass: "bg-rose-50 text-rose-900 border-rose-200",
    color: "#f43f5e",
  },
  {
    key: "on_hold",
    label: "On Hold",
    shortLabel: "On Hold",
    description: "Paused / parked.",
    defaultProbability: 15,
    headerClass: "bg-neutral-50 text-neutral-600",
    chipClass: "bg-neutral-50 text-neutral-600 border-neutral-200",
    color: "#737373",
  },
];

export const ACTIVE_STAGE_KEYS = [
  "prospect",
  "tour",
  "rfp",
  "proposal",
  "loi",
  "lease_out",
] as const;

export function stageMeta(key: string): ProspectStageMeta {
  return (
    PROSPECT_STAGE_META.find((s) => s.key === key) ??
    PROSPECT_STAGE_META[0]!
  );
}

export const PROSPECT_SOURCE_LABELS: Record<string, string> = {
  cold_call: "Cold call",
  tenant_broker: "Tenant broker",
  cooperating_broker: "Cooperating broker",
  marketing: "Marketing",
  referral: "Referral",
  existing_tenant: "Existing tenant",
  website: "Website",
  other: "Other",
};

export function formatSf(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString();
}

export function formatPsf(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${n.toFixed(2)}`;
}

export function formatMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000)
    return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}
