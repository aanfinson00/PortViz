import { describe, expect, it } from "vitest";
import {
  expiringWithinMonths,
  rollupExpirations,
  rollupTenants,
  type BuildingForRollup,
  type LeaseForRollup,
} from "./metricsRollup";

const T1 = {
  id: "t1",
  code: "ACME",
  name: "Acme Logistics",
  brandColor: "#ff0000",
};
const T2 = {
  id: "t2",
  code: "BETA",
  name: "Beta Foods",
  brandColor: null,
};

const BUILDING_A: BuildingForRollup = {
  id: "b1",
  code: "A",
  bays: [
    { id: "ba1", widthFt: 50, depthFt: 200 },
    { id: "ba2", widthFt: 50, depthFt: 200 },
  ],
  spaces: [
    {
      id: "s1",
      code: "101",
      targetSf: null,
      bayIds: ["ba1"],
    },
    {
      id: "s2",
      code: "102",
      targetSf: null,
      bayIds: ["ba2"],
    },
  ],
};

const BUILDING_B: BuildingForRollup = {
  id: "b2",
  code: "B",
  bays: [{ id: "ba3", widthFt: 100, depthFt: 200 }],
  spaces: [
    {
      id: "s3",
      code: "201",
      targetSf: 25_000, // overrides bay-derived SF
      bayIds: ["ba3"],
    },
  ],
};

describe("rollupTenants", () => {
  it("returns no tenants when no leases are active", () => {
    expect(
      rollupTenants({
        buildings: [BUILDING_A, BUILDING_B],
        leases: [],
      }),
    ).toEqual([]);
  });

  it("aggregates SF + space count per tenant, sorted desc by SF", () => {
    const leases: LeaseForRollup[] = [
      { id: "l1", spaceId: "s1", endDate: "2026-12-31", baseRentPsf: 12, tenant: T1 },
      { id: "l2", spaceId: "s2", endDate: "2026-06-30", baseRentPsf: 10, tenant: T1 },
      { id: "l3", spaceId: "s3", endDate: "2027-01-31", baseRentPsf: 14, tenant: T2 },
    ];
    const out = rollupTenants({
      buildings: [BUILDING_A, BUILDING_B],
      leases,
    });
    expect(out).toHaveLength(2);
    // Acme: s1 (10k) + s2 (10k) = 20k
    // Beta: s3 (target_sf 25k overrides bay-derived 20k) = 25k
    expect(out[0]?.id).toBe("t2");
    expect(out[0]?.totalSf).toBe(25_000);
    expect(out[1]?.id).toBe("t1");
    expect(out[1]?.totalSf).toBe(20_000);
    expect(out[1]?.spaceCount).toBe(2);
  });

  it("ignores leases whose tenant is null", () => {
    const leases: LeaseForRollup[] = [
      { id: "l1", spaceId: "s1", endDate: "2026-12-31", baseRentPsf: 12, tenant: null },
    ];
    expect(
      rollupTenants({ buildings: [BUILDING_A], leases }),
    ).toEqual([]);
  });
});

describe("rollupExpirations", () => {
  it("denormalizes leases with project + building + space codes", () => {
    const leases: LeaseForRollup[] = [
      { id: "l1", spaceId: "s1", endDate: "2026-12-31", baseRentPsf: 12, tenant: T1 },
      { id: "l2", spaceId: "s3", endDate: "2027-01-31", baseRentPsf: 14, tenant: T2 },
    ];
    const out = rollupExpirations({
      buildings: [BUILDING_A, BUILDING_B],
      leases,
      projectCode: "ACME",
    });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      buildingCode: "A",
      spaceCode: "101",
      projectCode: "ACME",
      tenantName: "Acme Logistics",
      baseRentPsf: 12,
    });
  });

  it("orders by endDate ascending", () => {
    const leases: LeaseForRollup[] = [
      { id: "l1", spaceId: "s1", endDate: "2027-01-01", baseRentPsf: 12, tenant: T1 },
      { id: "l2", spaceId: "s2", endDate: "2026-06-30", baseRentPsf: 10, tenant: T1 },
      { id: "l3", spaceId: "s3", endDate: "2026-09-15", baseRentPsf: 14, tenant: T2 },
    ];
    const out = rollupExpirations({
      buildings: [BUILDING_A, BUILDING_B],
      leases,
      projectCode: "ACME",
    });
    expect(out.map((x) => x.endDate)).toEqual([
      "2026-06-30",
      "2026-09-15",
      "2027-01-01",
    ]);
  });

  it("drops leases whose space or tenant is missing", () => {
    const leases: LeaseForRollup[] = [
      { id: "l1", spaceId: "missing", endDate: "2026-12-31", baseRentPsf: 12, tenant: T1 },
      { id: "l2", spaceId: "s1", endDate: "2026-06-30", baseRentPsf: 10, tenant: null },
    ];
    expect(
      rollupExpirations({
        buildings: [BUILDING_A],
        leases,
        projectCode: "ACME",
      }),
    ).toEqual([]);
  });
});

describe("expiringWithinMonths", () => {
  const now = new Date("2026-04-28T00:00:00Z");

  it("counts expirations inside the window, inclusive", () => {
    const expirations = [
      { endDate: "2026-05-15" },
      { endDate: "2027-04-01" }, // 11mo out: in the 12mo window
      { endDate: "2027-05-15" }, // 13mo out: outside
      { endDate: "2025-12-31" }, // already expired
    ].map((x, i) => ({
      id: `l${i}`,
      endDate: x.endDate,
      spaceCode: "x",
      buildingCode: "x",
      projectCode: "x",
      tenantName: "x",
      tenantColor: null,
      baseRentPsf: null,
    }));
    expect(expiringWithinMonths(expirations, 12, now)).toBe(2);
  });

  it("returns 0 for an empty list", () => {
    expect(expiringWithinMonths([], 12, now)).toBe(0);
  });
});
