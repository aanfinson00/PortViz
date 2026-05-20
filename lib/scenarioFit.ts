/**
 * Pure SF-bucket matching between scenario spaces and leasing prospects.
 *
 * A "fit" is when a prospect's requested_sf is within ±tolerancePct of a
 * space's SF. Score = 1 - abs(delta) / spaceSf, clamped to [0, 1], so
 * exact matches score 1 and a 20%-off prospect at the tolerance edge
 * scores 0.8. Brokers tend to want the strongest match first; we sort
 * descending by score.
 *
 * No tRPC / DB dependencies — keeps the function trivially testable and
 * reusable from the building-page UI and the portfolio-wide /app/leasing
 * Test Fits section.
 */

export interface FittableSpace {
  id: string;
  code: string;
  sf: number;
  /** Optional context to surface in the UI. */
  buildingId?: string;
  buildingCode?: string;
  projectCode?: string;
  scenarioId?: string;
  scenarioName?: string;
}

export interface FittableProspect {
  id: string;
  name: string;
  stage: string;
  requestedSf: number | null;
  brokerCompany: string | null;
  probabilityPct: number | null;
}

export interface FitMatch {
  space: FittableSpace;
  prospect: FittableProspect;
  /** Absolute SF difference (always positive). */
  deltaSf: number;
  /** Signed delta — positive = prospect wants MORE SF than the space has. */
  signedDeltaSf: number;
  /** 0..1; 1 = exact match. */
  score: number;
}

/**
 * The set of leasing-prospect stages worth surfacing as fit candidates.
 * Executed deals are already won; dead / on_hold deals shouldn't pollute
 * the test-fit board.
 */
export const ACTIVE_PROSPECT_STAGES = new Set([
  "prospect",
  "tour",
  "rfp",
  "proposal",
  "loi",
  "lease_out",
]);

/** Default tolerance — ±20% of space SF. Tight enough to be useful, wide
 *  enough that a slightly under-built scenario still shows nearby deals. */
export const DEFAULT_TOLERANCE_PCT = 20;

export interface FitOptions {
  tolerancePct?: number;
  /** When true, executed/dead/on_hold prospects are filtered out. */
  activeOnly?: boolean;
}

/**
 * Build a per-space match list. Each space gets every prospect that fits
 * within tolerance, sorted by score descending.
 */
export function fitProspectsToSpaces(
  spaces: FittableSpace[],
  prospects: FittableProspect[],
  options: FitOptions = {},
): Map<string, FitMatch[]> {
  const tol = (options.tolerancePct ?? DEFAULT_TOLERANCE_PCT) / 100;
  const activeOnly = options.activeOnly !== false;

  const eligible = prospects.filter((p) => {
    if (p.requestedSf == null || p.requestedSf <= 0) return false;
    if (activeOnly && !ACTIVE_PROSPECT_STAGES.has(p.stage)) return false;
    return true;
  });

  const byId = new Map<string, FitMatch[]>();
  for (const space of spaces) {
    if (space.sf <= 0) {
      byId.set(space.id, []);
      continue;
    }
    const low = space.sf * (1 - tol);
    const high = space.sf * (1 + tol);
    const matches: FitMatch[] = [];
    for (const prospect of eligible) {
      const requested = prospect.requestedSf!;
      if (requested < low || requested > high) continue;
      const signedDelta = requested - space.sf;
      const delta = Math.abs(signedDelta);
      const score = Math.max(0, Math.min(1, 1 - delta / space.sf));
      matches.push({ space, prospect, deltaSf: delta, signedDeltaSf: signedDelta, score });
    }
    matches.sort((a, b) => b.score - a.score);
    byId.set(space.id, matches);
  }
  return byId;
}

/**
 * Reverse view used by the /app/leasing Test Fits section: for a single
 * prospect, which spaces across all candidate scenarios fit? Sorted by
 * score descending so the best match shows first.
 */
export function fitSpacesToProspect(
  prospect: FittableProspect,
  spaces: FittableSpace[],
  options: FitOptions = {},
): FitMatch[] {
  if (prospect.requestedSf == null || prospect.requestedSf <= 0) return [];
  const tol = (options.tolerancePct ?? DEFAULT_TOLERANCE_PCT) / 100;
  const out: FitMatch[] = [];
  for (const space of spaces) {
    if (space.sf <= 0) continue;
    const low = space.sf * (1 - tol);
    const high = space.sf * (1 + tol);
    if (prospect.requestedSf < low || prospect.requestedSf > high) continue;
    const signedDelta = prospect.requestedSf - space.sf;
    const delta = Math.abs(signedDelta);
    const score = Math.max(0, Math.min(1, 1 - delta / space.sf));
    out.push({ space, prospect, deltaSf: delta, signedDeltaSf: signedDelta, score });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}
