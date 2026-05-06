/**
 * Decide whether a space's status should auto-flip after a lease event
 * (create / update / delete). Pure helper — the router fetches the
 * space + all its leases, runs this, and applies the result if non-null.
 *
 * Policy:
 *   - If any lease is currently active OR future-dated (end_date today or
 *     later), the space is "leased". Only flip if it isn't already, so
 *     we never thrash on every save.
 *   - If every lease has already expired (or there are none), only flip
 *     a "leased" status back to "vacant". Manually-set "available" /
 *     "pending" statuses are preserved — those are intentional curation
 *     by the user, not automated bookkeeping.
 *   - Returns null when no change is needed.
 */

export type SpaceStatus = "vacant" | "available" | "pending" | "leased";

export interface LeaseDateRow {
  start_date: string;
  end_date: string;
}

/**
 * Compare two ISO yyyy-mm-dd strings lexicographically — works for
 * date ordering because the format is sortable as text.
 */
export function nextSpaceStatusAfterLeaseChange(
  currentStatus: string,
  leases: LeaseDateRow[],
  todayISO: string = new Date().toISOString().slice(0, 10),
): SpaceStatus | null {
  const hasActiveOrFuture = leases.some(
    (l) =>
      typeof l.end_date === "string" && l.end_date >= todayISO,
  );
  if (hasActiveOrFuture) {
    return currentStatus === "leased" ? null : "leased";
  }
  return currentStatus === "leased" ? "vacant" : null;
}
