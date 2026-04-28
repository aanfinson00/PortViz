/**
 * Pure aggregation of headline KPIs for a property's dashboard. Decoupled
 * from any tRPC/React shape so it stays testable.
 */

export interface BayForMetrics {
  id: string;
  widthFt: number;
  depthFt: number;
}

export interface SpaceForMetrics {
  id: string;
  /** When set, overrides the polygon-computed SF for this space. */
  targetSf: number | null;
  bayIds: string[];
}

export interface BuildingForMetrics {
  id: string;
  totalSf: number;
  bays: BayForMetrics[];
  spaces: SpaceForMetrics[];
}

export interface PropertyMetrics {
  totalSf: number;
  leasedSf: number;
  vacantSf: number;
  occupancyPct: number;
  buildingCount: number;
  spaceCount: number;
}

export function spaceSf(space: SpaceForMetrics, bays: BayForMetrics[]): number {
  if (space.targetSf != null) return space.targetSf;
  const byId = new Map(bays.map((b) => [b.id, b]));
  return space.bayIds.reduce((acc, id) => {
    const b = byId.get(id);
    return b ? acc + b.widthFt * b.depthFt : acc;
  }, 0);
}

/**
 * Roll up a property's leasing basics. activeSpaceIds are the spaces that
 * currently have an active lease (computed elsewhere from the lease query).
 */
export function computePropertyMetrics(
  buildings: BuildingForMetrics[],
  activeSpaceIds: Set<string>,
): PropertyMetrics {
  let totalSf = 0;
  let leasedSf = 0;
  let spaceCount = 0;

  for (const b of buildings) {
    totalSf += b.totalSf;
    spaceCount += b.spaces.length;
    for (const s of b.spaces) {
      if (!activeSpaceIds.has(s.id)) continue;
      leasedSf += spaceSf(s, b.bays);
    }
  }

  const vacantSf = Math.max(0, totalSf - leasedSf);
  const occupancyPct = totalSf > 0 ? (leasedSf / totalSf) * 100 : 0;

  return {
    totalSf,
    leasedSf,
    vacantSf,
    occupancyPct,
    buildingCount: buildings.length,
    spaceCount,
  };
}
