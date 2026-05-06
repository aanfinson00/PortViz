/**
 * Parses Cmd-K palette queries into a free-text portion plus a set of
 * structured filters. Filters are recognized as bare keywords anywhere
 * in the query — the same word also acts as a filter when typed alone
 * (e.g. typing "vacant" shows only vacant spaces; "vacant 12" then
 * narrows by the "12" fuzzy term while keeping the status filter).
 *
 * Keep the surface small for v1: status filters for spaces, plus a
 * type filter (project/building/space/tenant). More verbs like
 * `expiring` or `industry:3pl` are deferred until a user asks.
 */

export type SpaceStatusFilter = "vacant" | "available" | "pending" | "leased";
export type TypeFilter = "project" | "building" | "space" | "tenant";

export interface ParsedQuery {
  /** Words to match fuzzily against item labels. */
  text: string;
  /** Status filters for spaces. Multiple = OR. */
  statuses: SpaceStatusFilter[];
  /** Type filter for the result set. Single value (last one wins). */
  type: TypeFilter | null;
}

const STATUS_KEYWORDS: Record<string, SpaceStatusFilter> = {
  vacant: "vacant",
  available: "available",
  pending: "pending",
  leased: "leased",
};

const TYPE_KEYWORDS: Record<string, TypeFilter> = {
  project: "project",
  projects: "project",
  building: "building",
  buildings: "building",
  space: "space",
  spaces: "space",
  tenant: "tenant",
  tenants: "tenant",
};

/**
 * Splits raw input into tokens, plucks recognized filter keywords out
 * of the token stream, and returns the rest as `text`. Order doesn't
 * matter: "vacant warehouse" and "warehouse vacant" parse identically.
 */
export function parseQuery(input: string): ParsedQuery {
  const tokens = input.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const statusSet = new Set<SpaceStatusFilter>();
  let type: TypeFilter | null = null;
  const rest: string[] = [];
  for (const tok of tokens) {
    if (tok in STATUS_KEYWORDS) {
      statusSet.add(STATUS_KEYWORDS[tok]);
      continue;
    }
    if (tok in TYPE_KEYWORDS) {
      type = TYPE_KEYWORDS[tok];
      continue;
    }
    rest.push(tok);
  }
  return {
    text: rest.join(" "),
    statuses: Array.from(statusSet),
    type,
  };
}

/**
 * Item shape the filter cares about. Designed to overlap with
 * `SearchItem` from the search router without coupling to its
 * import path (so this helper is unit-testable without the trpc
 * server-side types).
 */
export interface FilterableItem {
  type: TypeFilter;
  status?: string;
}

/**
 * Returns true if the item passes the parsed filter set.
 * - `type` filter: item's type must match.
 * - `statuses` filter: only applies to space items; project / building /
 *   tenant items pass through unchanged. If the user explicitly typed
 *   a status keyword, restrict to space items with a matching status.
 */
export function matchesFilters(
  item: FilterableItem,
  parsed: ParsedQuery,
): boolean {
  if (parsed.type && item.type !== parsed.type) return false;
  if (parsed.statuses.length > 0) {
    if (item.type !== "space") return false;
    if (!item.status) return false;
    if (!parsed.statuses.includes(item.status as SpaceStatusFilter)) {
      return false;
    }
  }
  return true;
}

/**
 * Pretty-print a status filter for display in the chip strip.
 */
export const STATUS_LABEL: Record<SpaceStatusFilter, string> = {
  vacant: "Vacant",
  available: "Available",
  pending: "Pending",
  leased: "Leased",
};

export const TYPE_LABEL: Record<TypeFilter, string> = {
  project: "Properties",
  building: "Buildings",
  space: "Spaces",
  tenant: "Tenants",
};
