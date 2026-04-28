/**
 * Tiny fuzzy matcher for the Cmd-K palette. Every char of the query must
 * appear in order somewhere in the haystack (case-insensitive). Ranking
 * favors prefix matches and tighter spans, so "abc" hits "abc-123" before
 * "a_b_c_xxx". Returns null when there's no match so callers can filter.
 *
 * Lower score = better. Calibrated for an org-sized index (a few thousand
 * items) where each item's label is short.
 */
export function fuzzyScore(query: string, hay: string): number | null {
  if (!query) return 0;
  const q = query.toLowerCase();
  const h = hay.toLowerCase();
  let qi = 0;
  let firstHit = -1;
  let lastHit = -1;
  for (let i = 0; i < h.length && qi < q.length; i++) {
    if (h[i] === q[qi]) {
      if (firstHit < 0) firstHit = i;
      lastHit = i;
      qi++;
    }
  }
  if (qi < q.length) return null;
  const span = lastHit - firstHit;
  const prefixBonus = h.startsWith(q) ? -50 : 0;
  return span + firstHit + prefixBonus + h.length * 0.01;
}

/**
 * Rank items against a query using `fuzzyScore` over each item's
 * `getStrings(item)` haystacks. The best-scoring haystack per item wins.
 * Items that don't match any haystack are dropped. Empty query passes
 * through the first `limit` items in original order.
 */
export function rankFuzzy<T>(
  items: T[],
  query: string,
  getStrings: (item: T) => Array<string | null | undefined>,
  limit = 50,
): T[] {
  if (!query) return items.slice(0, limit);
  const scored: Array<{ item: T; score: number }> = [];
  for (const item of items) {
    let best: number | null = null;
    for (const s of getStrings(item)) {
      if (!s) continue;
      const sc = fuzzyScore(query, s);
      if (sc === null) continue;
      if (best === null || sc < best) best = sc;
    }
    if (best !== null) scored.push({ item, score: best });
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, limit).map((x) => x.item);
}
