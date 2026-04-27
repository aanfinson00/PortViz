import { describe, expect, it } from "vitest";
import {
  computeSpaceMetrics,
  totalBuildingSfFromBays,
  validateDemisingScheme,
  type Bay,
  type SpaceGroup,
} from "./demising";

function bay(partial: Partial<Bay> & Pick<Bay, "id" | "ordinal">): Bay {
  return {
    widthFt: 50,
    depthFt: 200,
    dockDoorCount: 2,
    driveInCount: 0,
    hasYardAccess: false,
    frontageSide: "S",
    ...partial,
  };
}

const BAYS: Bay[] = [
  bay({ id: "b1", ordinal: 1, dockDoorCount: 3, hasYardAccess: true }),
  bay({ id: "b2", ordinal: 2, dockDoorCount: 2 }),
  bay({ id: "b3", ordinal: 3, dockDoorCount: 2, driveInCount: 1 }),
  bay({ id: "b4", ordinal: 4, dockDoorCount: 1, widthFt: 60 }),
];

describe("totalBuildingSfFromBays", () => {
  it("sums width x depth across bays", () => {
    expect(totalBuildingSfFromBays(BAYS)).toBe(
      50 * 200 + 50 * 200 + 50 * 200 + 60 * 200,
    );
  });
});

describe("computeSpaceMetrics", () => {
  const totalSf = totalBuildingSfFromBays(BAYS);
  const parking = { totalCarParking: 100, totalTrailerParking: 20 };

  it("sums metrics across the contained bays", () => {
    const space: SpaceGroup = {
      id: "s1",
      code: "100",
      bayIds: ["b1", "b2"],
    };
    const m = computeSpaceMetrics(space, BAYS, parking, totalSf);
    expect(m.sf).toBe(50 * 200 + 50 * 200);
    expect(m.frontageFt).toBe(100);
    expect(m.dockDoors).toBe(5);
    expect(m.driveIns).toBe(0);
    expect(m.hasYardAccess).toBe(true);
  });

  it("allocates parking proportionally by SF", () => {
    const space: SpaceGroup = {
      id: "s1",
      code: "100",
      bayIds: ["b1", "b2"],
    };
    const m = computeSpaceMetrics(space, BAYS, parking, totalSf);
    // Two bays out of four equal-SF bays until b4: 20000/44000 ~= 0.4545
    // Actually bays 1-3 are 10000 SF, b4 is 12000 SF → total 42000.
    // space has 20000/42000 ~= 0.4762
    expect(m.carParking).toBeGreaterThan(40);
    expect(m.carParking).toBeLessThan(60);
    expect(m.trailerParking).toBeGreaterThan(7);
    expect(m.trailerParking).toBeLessThan(13);
  });

  it("honors parking overrides", () => {
    const space: SpaceGroup = {
      id: "s1",
      code: "100",
      bayIds: ["b1"],
      carParkingOverride: 5,
      trailerParkingOverride: 1,
    };
    const m = computeSpaceMetrics(space, BAYS, parking, totalSf);
    expect(m.carParking).toBe(5);
    expect(m.trailerParking).toBe(1);
  });
});

describe("validateDemisingScheme", () => {
  it("accepts a complete contiguous partition", () => {
    const spaces: SpaceGroup[] = [
      { id: "s1", code: "100", bayIds: ["b1", "b2"] },
      { id: "s2", code: "200", bayIds: ["b3", "b4"] },
    ];
    expect(validateDemisingScheme(spaces, BAYS)).toEqual({ ok: true });
  });

  it("rejects non-contiguous bay groupings", () => {
    const spaces: SpaceGroup[] = [
      { id: "s1", code: "100", bayIds: ["b1", "b3"] },
      { id: "s2", code: "200", bayIds: ["b2", "b4"] },
    ];
    const r = validateDemisingScheme(spaces, BAYS);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.includes("not contiguous"))).toBe(true);
    }
  });

  it("rejects unassigned bays", () => {
    const spaces: SpaceGroup[] = [
      { id: "s1", code: "100", bayIds: ["b1", "b2"] },
    ];
    const r = validateDemisingScheme(spaces, BAYS);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.includes("not assigned"))).toBe(true);
    }
  });

  it("rejects bays assigned to multiple spaces", () => {
    const spaces: SpaceGroup[] = [
      { id: "s1", code: "100", bayIds: ["b1", "b2"] },
      { id: "s2", code: "200", bayIds: ["b2", "b3", "b4"] },
    ];
    const r = validateDemisingScheme(spaces, BAYS);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.includes("multiple spaces"))).toBe(true);
    }
  });

  it("rejects duplicate space codes", () => {
    const spaces: SpaceGroup[] = [
      { id: "s1", code: "100", bayIds: ["b1", "b2"] },
      { id: "s2", code: "100", bayIds: ["b3", "b4"] },
    ];
    const r = validateDemisingScheme(spaces, BAYS);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.includes("Duplicate space code"))).toBe(
        true,
      );
    }
  });
});
