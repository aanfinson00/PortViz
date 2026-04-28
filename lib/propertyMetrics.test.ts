import { describe, expect, it } from "vitest";
import {
  computePropertyMetrics,
  spaceSf,
  type BuildingForMetrics,
} from "./propertyMetrics";

const BUILDING: BuildingForMetrics = {
  id: "b1",
  totalSf: 100_000,
  bays: [
    { id: "ba1", widthFt: 50, depthFt: 200 }, // 10,000 SF
    { id: "ba2", widthFt: 50, depthFt: 200 }, // 10,000 SF
    { id: "ba3", widthFt: 50, depthFt: 200 }, // 10,000 SF
    { id: "ba4", widthFt: 50, depthFt: 200 }, // 10,000 SF
  ],
  spaces: [
    { id: "s1", targetSf: null, bayIds: ["ba1", "ba2"] },
    { id: "s2", targetSf: null, bayIds: ["ba3", "ba4"] },
  ],
};

describe("spaceSf", () => {
  it("sums width × depth across the space's bays", () => {
    expect(spaceSf(BUILDING.spaces[0]!, BUILDING.bays)).toBe(20_000);
  });

  it("uses targetSf when set, ignoring bays", () => {
    expect(
      spaceSf(
        { id: "x", targetSf: 25_000, bayIds: ["ba1"] },
        BUILDING.bays,
      ),
    ).toBe(25_000);
  });
});

describe("computePropertyMetrics", () => {
  it("counts vacant when no leases are active", () => {
    const m = computePropertyMetrics([BUILDING], new Set());
    expect(m.totalSf).toBe(100_000);
    expect(m.leasedSf).toBe(0);
    expect(m.vacantSf).toBe(100_000);
    expect(m.occupancyPct).toBe(0);
    expect(m.buildingCount).toBe(1);
    expect(m.spaceCount).toBe(2);
  });

  it("computes leased + vacant from active spaces", () => {
    const m = computePropertyMetrics([BUILDING], new Set(["s1"]));
    expect(m.leasedSf).toBe(20_000);
    expect(m.vacantSf).toBe(80_000);
    expect(m.occupancyPct).toBeCloseTo(20);
  });

  it("treats missing bay assignments as zero leased SF", () => {
    const empty: BuildingForMetrics = {
      id: "b2",
      totalSf: 50_000,
      bays: [],
      spaces: [],
    };
    const m = computePropertyMetrics([empty], new Set());
    expect(m.totalSf).toBe(50_000);
    expect(m.leasedSf).toBe(0);
    expect(m.spaceCount).toBe(0);
  });

  it("zero total SF returns 0% occupancy without dividing by zero", () => {
    const m = computePropertyMetrics([], new Set());
    expect(m.totalSf).toBe(0);
    expect(m.occupancyPct).toBe(0);
  });
});
