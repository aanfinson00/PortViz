import { describe, expect, it } from "vitest";
import {
  resolveSnapshotSpaces,
  scenarioSnapshotSchema,
  type ScenarioSnapshot,
} from "./scenarioSnapshot";

describe("scenarioSnapshotSchema", () => {
  it("accepts a valid slider snapshot", () => {
    const raw: ScenarioSnapshot = {
      mode: "sliders",
      spaces: [
        {
          id: "s1",
          code: "101",
          positionOrder: 0,
          isPinned: true,
          targetSf: 50000,
          officeSf: 5000,
          officeCorner: "front-left",
        },
        {
          id: "new:1",
          code: "102",
          positionOrder: 1,
          isPinned: false,
          targetSf: null,
          officeSf: null,
          officeCorner: null,
        },
      ],
    };
    const parsed = scenarioSnapshotSchema.parse(raw);
    expect(parsed.mode).toBe("sliders");
    expect(parsed.spaces).toHaveLength(2);
  });

  it("accepts a valid bays snapshot", () => {
    const raw = {
      mode: "bays" as const,
      spaces: [
        {
          id: "s1",
          code: "101",
          bayIds: [
            "11111111-1111-1111-1111-111111111111",
            "22222222-2222-2222-2222-222222222222",
          ],
        },
      ],
    };
    const parsed = scenarioSnapshotSchema.parse(raw);
    expect(parsed.mode).toBe("bays");
    if (parsed.mode !== "bays") throw new Error("expected bays mode");
    expect(parsed.spaces[0]!.bayIds).toHaveLength(2);
  });

  it("uppercases codes during parse", () => {
    const parsed = scenarioSnapshotSchema.parse({
      mode: "sliders",
      spaces: [
        {
          id: "s1",
          code: "abc",
          positionOrder: 0,
          isPinned: false,
          targetSf: null,
          officeSf: null,
          officeCorner: null,
        },
      ],
    });
    expect(parsed.spaces[0]!.code).toBe("ABC");
  });

  it("rejects bay snapshot with non-uuid bayIds", () => {
    expect(() =>
      scenarioSnapshotSchema.parse({
        mode: "bays",
        spaces: [{ id: "s1", code: "101", bayIds: ["not-a-uuid"] }],
      }),
    ).toThrow();
  });

  it("rejects unknown mode via the discriminated union", () => {
    expect(() =>
      scenarioSnapshotSchema.parse({
        mode: "freeform",
        spaces: [],
      }),
    ).toThrow();
  });
});

describe("resolveSnapshotSpaces — slider mode", () => {
  it("honors pinned SFs and shares the rest equally among unpinned", () => {
    const snap: ScenarioSnapshot = {
      mode: "sliders",
      spaces: [
        { id: "a", code: "101", positionOrder: 0, isPinned: true, targetSf: 40000, officeSf: null, officeCorner: null },
        { id: "b", code: "102", positionOrder: 1, isPinned: false, targetSf: null, officeSf: null, officeCorner: null },
        { id: "c", code: "103", positionOrder: 2, isPinned: false, targetSf: null, officeSf: null, officeCorner: null },
      ],
    };
    const resolved = resolveSnapshotSpaces(snap, { totalSf: 100000 });
    expect(resolved.find((r) => r.id === "a")?.sf).toBe(40000);
    expect(resolved.find((r) => r.id === "b")?.sf).toBe(30000);
    expect(resolved.find((r) => r.id === "c")?.sf).toBe(30000);
  });

  it("uses soft targets to weight the unpinned share", () => {
    const snap: ScenarioSnapshot = {
      mode: "sliders",
      spaces: [
        { id: "a", code: "A", positionOrder: 0, isPinned: false, targetSf: 60000, officeSf: null, officeCorner: null },
        { id: "b", code: "B", positionOrder: 1, isPinned: false, targetSf: 40000, officeSf: null, officeCorner: null },
      ],
    };
    const resolved = resolveSnapshotSpaces(snap, { totalSf: 100000 });
    expect(resolved.find((r) => r.id === "a")?.sf).toBe(60000);
    expect(resolved.find((r) => r.id === "b")?.sf).toBe(40000);
  });

  it("scales pinned values down when over-allocated", () => {
    const snap: ScenarioSnapshot = {
      mode: "sliders",
      spaces: [
        { id: "a", code: "A", positionOrder: 0, isPinned: true, targetSf: 80000, officeSf: null, officeCorner: null },
        { id: "b", code: "B", positionOrder: 1, isPinned: true, targetSf: 80000, officeSf: null, officeCorner: null },
      ],
    };
    const resolved = resolveSnapshotSpaces(snap, { totalSf: 100000 });
    // Each pinned space gets half the available SF.
    expect(resolved.find((r) => r.id === "a")?.sf).toBe(50000);
    expect(resolved.find((r) => r.id === "b")?.sf).toBe(50000);
  });

  it("returns zero SF when totalSf is zero", () => {
    const snap: ScenarioSnapshot = {
      mode: "sliders",
      spaces: [
        { id: "a", code: "A", positionOrder: 0, isPinned: false, targetSf: null, officeSf: null, officeCorner: null },
      ],
    };
    const resolved = resolveSnapshotSpaces(snap, { totalSf: 0 });
    expect(resolved[0]!.sf).toBe(0);
  });
});

describe("resolveSnapshotSpaces — bay mode", () => {
  it("sums bay areas via the provided lookup map", () => {
    const bayA = "11111111-1111-1111-1111-111111111111";
    const bayB = "22222222-2222-2222-2222-222222222222";
    const bayC = "33333333-3333-3333-3333-333333333333";
    const snap: ScenarioSnapshot = {
      mode: "bays",
      spaces: [
        { id: "s1", code: "101", bayIds: [bayA, bayB] },
        { id: "s2", code: "102", bayIds: [bayC] },
      ],
    };
    const areas = new Map<string, number>([
      [bayA, 10000],
      [bayB, 12000],
      [bayC, 8000],
    ]);
    const resolved = resolveSnapshotSpaces(snap, {
      totalSf: 30000,
      bayAreaById: areas,
    });
    expect(resolved.find((r) => r.id === "s1")?.sf).toBe(22000);
    expect(resolved.find((r) => r.id === "s2")?.sf).toBe(8000);
  });

  it("treats missing bay ids as zero (defensive — caller should validate)", () => {
    const snap: ScenarioSnapshot = {
      mode: "bays",
      spaces: [
        {
          id: "s1",
          code: "101",
          bayIds: ["00000000-0000-0000-0000-000000000000"],
        },
      ],
    };
    const resolved = resolveSnapshotSpaces(snap, {
      totalSf: 0,
      bayAreaById: new Map(),
    });
    expect(resolved[0]!.sf).toBe(0);
  });
});
