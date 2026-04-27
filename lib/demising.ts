/**
 * Pure functions that power the demising editor. Kept framework-free so they
 * can run on the server (for validation/persistence) and in the browser (for
 * the live preview) without duplication.
 */

export type FrontageSide = "N" | "S" | "E" | "W";

export interface Bay {
  id: string;
  /** Position along the frontage axis; must be unique within a building. */
  ordinal: number;
  widthFt: number;
  depthFt: number;
  dockDoorCount: number;
  driveInCount: number;
  hasYardAccess: boolean;
  frontageSide: FrontageSide;
}

export interface BuildingParkingAllocation {
  /** Total car stalls for the building; allocated to spaces proportionally by SF. */
  totalCarParking: number;
  /** Total trailer stalls for the building; allocated proportionally by SF. */
  totalTrailerParking: number;
}

export interface SpaceGroup {
  id: string;
  code: string;
  /** Contiguous list of bay IDs, in ordinal order. Owned by this space. */
  bayIds: string[];
  /** Optional overrides for auto-allocated parking. */
  carParkingOverride?: number;
  trailerParkingOverride?: number;
}

export interface SpaceMetrics {
  spaceId: string;
  code: string;
  sf: number;
  frontageFt: number;
  dockDoors: number;
  driveIns: number;
  hasYardAccess: boolean;
  carParking: number;
  trailerParking: number;
}

/** Compute metrics for a single space given its bays and building-level pools. */
export function computeSpaceMetrics(
  space: SpaceGroup,
  allBays: Bay[],
  parking: BuildingParkingAllocation,
  totalBuildingSf: number,
): SpaceMetrics {
  const bayById = new Map(allBays.map((b) => [b.id, b]));
  const bays = space.bayIds
    .map((id) => bayById.get(id))
    .filter((b): b is Bay => Boolean(b));

  const sf = bays.reduce((acc, b) => acc + b.widthFt * b.depthFt, 0);
  const frontageFt = bays.reduce((acc, b) => acc + b.widthFt, 0);
  const dockDoors = bays.reduce((acc, b) => acc + b.dockDoorCount, 0);
  const driveIns = bays.reduce((acc, b) => acc + b.driveInCount, 0);
  const hasYardAccess = bays.some((b) => b.hasYardAccess);

  const ratio = totalBuildingSf > 0 ? sf / totalBuildingSf : 0;
  const carParking =
    space.carParkingOverride ?? Math.round(parking.totalCarParking * ratio);
  const trailerParking =
    space.trailerParkingOverride ??
    Math.round(parking.totalTrailerParking * ratio);

  return {
    spaceId: space.id,
    code: space.code,
    sf,
    frontageFt,
    dockDoors,
    driveIns,
    hasYardAccess,
    carParking,
    trailerParking,
  };
}

/** Sum of (width x depth) across all bays in a building. */
export function totalBuildingSfFromBays(bays: Bay[]): number {
  return bays.reduce((acc, b) => acc + b.widthFt * b.depthFt, 0);
}

/**
 * Validate a set of demising groups against the full bay list.
 *
 * Invariants:
 * 1. Every bay belongs to exactly one space.
 * 2. Each space's bays are contiguous when sorted by ordinal.
 * 3. Space codes are unique within the building.
 */
export function validateDemisingScheme(
  spaces: SpaceGroup[],
  allBays: Bay[],
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const bayOrdinals = new Map(allBays.map((b) => [b.id, b.ordinal]));
  const seen = new Set<string>();
  const codes = new Set<string>();

  for (const space of spaces) {
    if (codes.has(space.code)) {
      errors.push(`Duplicate space code "${space.code}".`);
    }
    codes.add(space.code);

    if (space.bayIds.length === 0) {
      errors.push(`Space "${space.code}" has no bays.`);
      continue;
    }

    const ordinals: number[] = [];
    for (const id of space.bayIds) {
      if (seen.has(id)) {
        errors.push(`Bay "${id}" assigned to multiple spaces.`);
      }
      seen.add(id);
      const ord = bayOrdinals.get(id);
      if (ord === undefined) {
        errors.push(`Space "${space.code}" references unknown bay "${id}".`);
      } else {
        ordinals.push(ord);
      }
    }

    ordinals.sort((a, b) => a - b);
    for (let i = 1; i < ordinals.length; i++) {
      if (ordinals[i]! !== ordinals[i - 1]! + 1) {
        errors.push(`Space "${space.code}" bays are not contiguous.`);
        break;
      }
    }
  }

  for (const bay of allBays) {
    if (!seen.has(bay.id)) {
      errors.push(`Bay "${bay.id}" is not assigned to any space.`);
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
