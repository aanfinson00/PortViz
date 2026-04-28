/**
 * Lease date math used by the lease form to auto-suggest an end date.
 * Convention: end = start + termMonths, then back off by one day so the
 * lease "covers" the full term (Jan 1 + 60 mo => Dec 31 of year 5, not Jan 1).
 *
 * Returns null for invalid inputs (empty start, non-finite term, term <= 0,
 * unparseable date) so callers can early-return without pre-validating.
 */
export function addMonthsMinusDay(
  startISO: string,
  termMonths: number | string,
): string | null {
  if (!startISO) return null;
  const months =
    typeof termMonths === "string" ? Number(termMonths) : termMonths;
  if (!Number.isFinite(months) || months <= 0) return null;

  const d = new Date(startISO);
  if (Number.isNaN(d.getTime())) return null;

  d.setMonth(d.getMonth() + months);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}
