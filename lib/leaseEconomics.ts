/**
 * Lease economics helpers — pure parsers + the `currentYearRent` math
 * that takes a lease (with optional rent schedule + escalation) and an
 * "as of" date and returns the base rent in effect on that date.
 *
 * Decoupled from React + tRPC so the rent roll, the property hero KPI
 * strip, and any future export / CSV path all derive rent the same way.
 */

export type LeaseType =
  | "nnn"
  | "modified_gross"
  | "gross"
  | "absolute_net"
  | "percentage"
  | "other";

export const LEASE_TYPE_LABELS: Record<LeaseType, string> = {
  nnn: "NNN (triple net)",
  modified_gross: "Modified gross",
  gross: "Gross",
  absolute_net: "Absolute net",
  percentage: "Percentage",
  other: "Other",
};

export interface RentScheduleEntry {
  /** 1-based month of the lease term (month 1 is the first lease month). */
  fromMonth: number;
  /** Inclusive end month for this rate. */
  toMonth: number;
  /** Annual rent per SF in this band. */
  baseRentPsf: number;
  notes?: string | null;
}

export type LeaseOptionKind =
  | "renewal"
  | "expansion"
  | "rofr"
  | "rofo"
  | "termination";

export const LEASE_OPTION_LABELS: Record<LeaseOptionKind, string> = {
  renewal: "Renewal option",
  expansion: "Expansion option",
  rofr: "Right of first refusal",
  rofo: "Right of first offer",
  termination: "Early termination",
};

export interface LeaseOption {
  kind: LeaseOptionKind;
  /** Months of advance notice the tenant must give to exercise. */
  noticeMonths?: number | null;
  /** Length of the renewed/expanded term, in months. */
  termMonths?: number | null;
  /** Free text for rent basis: "FMV", "$10/SF", "+5%", etc. */
  rentBasis?: string | null;
  /** Termination fee in $/SF (only relevant when kind === 'termination'). */
  feePsf?: number | null;
  /** Lease year (1-based) when the option becomes exercisable. */
  effectiveYear?: number | null;
  notes?: string | null;
}

/**
 * Tolerant parser: returns null when the value isn't one of the supported
 * lease types, so a stale row doesn't crash the renderer.
 */
export function parseLeaseType(value: unknown): LeaseType | null {
  if (
    value === "nnn" ||
    value === "modified_gross" ||
    value === "gross" ||
    value === "absolute_net" ||
    value === "percentage" ||
    value === "other"
  ) {
    return value;
  }
  return null;
}

/**
 * Tolerant parser for a stepped rent schedule. Returns [] for non-array
 * inputs or when no valid entries exist. Drops malformed entries silently.
 */
export function parseRentSchedule(raw: unknown): RentScheduleEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: RentScheduleEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const fromMonth = numOrNull(r.fromMonth);
    const toMonth = numOrNull(r.toMonth);
    const baseRentPsf = numOrNull(r.baseRentPsf);
    if (
      fromMonth == null ||
      toMonth == null ||
      baseRentPsf == null ||
      fromMonth < 1 ||
      toMonth < fromMonth
    ) {
      continue;
    }
    out.push({
      fromMonth: Math.round(fromMonth),
      toMonth: Math.round(toMonth),
      baseRentPsf,
      notes: typeof r.notes === "string" ? r.notes : null,
    });
  }
  // Sort by fromMonth so currentYearRent's lookup is straightforward.
  return out.sort((a, b) => a.fromMonth - b.fromMonth);
}

function isOptionKind(value: unknown): value is LeaseOptionKind {
  return (
    value === "renewal" ||
    value === "expansion" ||
    value === "rofr" ||
    value === "rofo" ||
    value === "termination"
  );
}

/**
 * Tolerant parser for the lease's options array. Drops malformed entries.
 */
export function parseLeaseOptions(raw: unknown): LeaseOption[] {
  if (!Array.isArray(raw)) return [];
  const out: LeaseOption[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (!isOptionKind(r.kind)) continue;
    out.push({
      kind: r.kind,
      noticeMonths: numOrNull(r.noticeMonths),
      termMonths: numOrNull(r.termMonths),
      rentBasis: typeof r.rentBasis === "string" ? r.rentBasis : null,
      feePsf: numOrNull(r.feePsf),
      effectiveYear: numOrNull(r.effectiveYear),
      notes: typeof r.notes === "string" ? r.notes : null,
    });
  }
  return out;
}

/**
 * Compute the base rent psf in effect on a given date for a lease.
 * Resolution order:
 *   1. If rent_schedule has an entry covering the lease month, use it.
 *   2. Otherwise compute base_rent_psf compounded annually by escalation
 *      (so year-1 = base, year-2 = base × (1+esc), ...).
 *   3. If neither base_rent_psf nor schedule is set, return null.
 *
 * Returns null when the as-of date is outside the lease term.
 */
export function currentYearRent(args: {
  startDate: string;
  endDate: string;
  baseRentPsf: number | null;
  escalationPct: number | null;
  rentSchedule: RentScheduleEntry[] | null;
  asOf?: Date;
}): number | null {
  const asOf = args.asOf ?? new Date();
  const start = new Date(args.startDate);
  const end = new Date(args.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }
  if (asOf < start || asOf > end) return null;

  const monthIndex = monthsBetween(start, asOf) + 1; // 1-based

  if (args.rentSchedule && args.rentSchedule.length > 0) {
    const hit = args.rentSchedule.find(
      (e) => monthIndex >= e.fromMonth && monthIndex <= e.toMonth,
    );
    if (hit) return hit.baseRentPsf;
    // Fall through: schedule didn't cover this month, use base + escalation.
  }

  if (args.baseRentPsf == null) return null;
  const yearIndex = Math.floor((monthIndex - 1) / 12); // 0-based
  const esc = (args.escalationPct ?? 0) / 100;
  return args.baseRentPsf * Math.pow(1 + esc, yearIndex);
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function monthsBetween(from: Date, to: Date): number {
  return (
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth())
  );
}
