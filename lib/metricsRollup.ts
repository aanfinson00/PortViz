/**
 * Pure roll-ups for the property dashboard's secondary panels (tenants,
 * expirations) and any future surface that needs the same numbers
 * (CSV export, share view, server-side reports). Decoupled from React
 * and tRPC so it stays unit-testable and reusable.
 *
 * The propertyMetrics module covers the headline KPIs (Total / Leased /
 * Vacant / Occupancy); this one covers the cross-cutting roll-ups that
 * combine leases + tenants + the building/space hierarchy.
 */

import {
  spaceSf,
  type BayForMetrics,
  type SpaceForMetrics,
} from "./propertyMetrics";

export interface TenantRef {
  id: string;
  code: string;
  name: string;
  brandColor: string | null;
}

export interface LeaseForRollup {
  id: string;
  spaceId: string;
  endDate: string;
  baseRentPsf: number | null;
  tenant: TenantRef | null;
}

export interface SpaceForRollup extends SpaceForMetrics {
  code: string;
}

export interface BuildingForRollup {
  id: string;
  code: string;
  bays: BayForMetrics[];
  spaces: SpaceForRollup[];
}

export interface TenantRollup {
  id: string;
  code: string;
  name: string;
  brandColor: string | null;
  totalSf: number;
  spaceCount: number;
}

export interface ExpirationLease {
  id: string;
  endDate: string;
  spaceCode: string;
  buildingCode: string;
  projectCode: string;
  tenantName: string;
  tenantColor: string | null;
  baseRentPsf: number | null;
}

/**
 * Roll active leases up to one row per tenant. SF is the sum of the
 * tenant's leased spaces (using spaceSf, which prefers target_sf when
 * set). Sorted by total SF descending so headline tenants surface first.
 */
export function rollupTenants(args: {
  buildings: BuildingForRollup[];
  leases: LeaseForRollup[];
}): TenantRollup[] {
  const acc = new Map<string, TenantRollup>();
  for (const b of args.buildings) {
    for (const s of b.spaces) {
      const lease = args.leases.find((l) => l.spaceId === s.id);
      if (!lease?.tenant) continue;
      const sf = spaceSf(s, b.bays);
      const existing = acc.get(lease.tenant.id) ?? {
        id: lease.tenant.id,
        code: lease.tenant.code,
        name: lease.tenant.name,
        brandColor: lease.tenant.brandColor,
        totalSf: 0,
        spaceCount: 0,
      };
      existing.totalSf += sf;
      existing.spaceCount += 1;
      acc.set(lease.tenant.id, existing);
    }
  }
  return Array.from(acc.values()).sort((a, b) => b.totalSf - a.totalSf);
}

/**
 * Flatten active leases into a list of upcoming expirations, denormalized
 * with the codes the UI needs. Ordered ascending by end date.
 */
export function rollupExpirations(args: {
  buildings: BuildingForRollup[];
  leases: LeaseForRollup[];
  projectCode: string;
}): ExpirationLease[] {
  const buildingByIdToCode = new Map<string, string>();
  const spaceById = new Map<
    string,
    { code: string; buildingId: string }
  >();
  for (const b of args.buildings) {
    buildingByIdToCode.set(b.id, b.code);
    for (const s of b.spaces) {
      spaceById.set(s.id, { code: s.code, buildingId: b.id });
    }
  }

  const out: ExpirationLease[] = [];
  for (const l of args.leases) {
    const sp = spaceById.get(l.spaceId);
    if (!sp) continue;
    const buildingCode = buildingByIdToCode.get(sp.buildingId);
    if (!buildingCode || !l.tenant) continue;
    out.push({
      id: l.id,
      endDate: l.endDate,
      spaceCode: sp.code,
      buildingCode,
      projectCode: args.projectCode,
      tenantName: l.tenant.name,
      tenantColor: l.tenant.brandColor,
      baseRentPsf: l.baseRentPsf,
    });
  }
  out.sort((a, b) => a.endDate.localeCompare(b.endDate));
  return out;
}

/**
 * Count expirations whose end date falls in the next `months` months from
 * `now` (default: today). Used for the dashboard tab badge.
 */
export function expiringWithinMonths(
  expirations: ExpirationLease[],
  months: number,
  now: Date = new Date(),
): number {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() + months);
  return expirations.filter((l) => {
    const end = new Date(l.endDate);
    return end >= now && end <= cutoff;
  }).length;
}
