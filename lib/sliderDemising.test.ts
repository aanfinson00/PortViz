import { describe, expect, it } from "vitest";
import {
  dragWall,
  removeSpace,
  resolveSpaces,
  splitLargest,
  type SliderSpace,
} from "./sliderDemising";

const TOTAL = 100_000;

function s(
  id: string,
  positionOrder: number,
  isPinned = false,
  targetSf: number | null = null,
): SliderSpace {
  return { id, positionOrder, isPinned, targetSf };
}

describe("resolveSpaces", () => {
  it("splits totalSf evenly across unpinned spaces with no targets", () => {
    const out = resolveSpaces([s("a", 0), s("b", 1), s("c", 2)], TOTAL);
    expect(out.map((x) => x.sf)).toEqual([
      TOTAL / 3,
      TOTAL / 3,
      TOTAL / 3,
    ]);
    expect(out[2]?.rightWall).toBeCloseTo(1, 9);
  });

  it("honors pinned SFs and shares leftover across unpinned", () => {
    const out = resolveSpaces(
      [s("a", 0, true, 60_000), s("b", 1), s("c", 2)],
      TOTAL,
    );
    expect(out[0]?.sf).toBe(60_000);
    expect(out[1]?.sf).toBe(20_000);
    expect(out[2]?.sf).toBe(20_000);
  });

  it("uses soft targets as proportional weights when no pins", () => {
    // Targets 30k and 70k → split leftover 100k as 30/100 and 70/100.
    const out = resolveSpaces(
      [s("a", 0, false, 30_000), s("b", 1, false, 70_000)],
      TOTAL,
    );
    expect(out[0]?.sf).toBe(30_000);
    expect(out[1]?.sf).toBe(70_000);
  });

  it("scales pinned values down proportionally when over-allocated", () => {
    // 80k + 80k pinned in a 100k building → scale to 50/50.
    const out = resolveSpaces(
      [s("a", 0, true, 80_000), s("b", 1, true, 80_000)],
      TOTAL,
    );
    expect(out[0]?.sf).toBe(50_000);
    expect(out[1]?.sf).toBe(50_000);
  });

  it("orders by positionOrder, not by array index", () => {
    const out = resolveSpaces([s("c", 2), s("a", 0), s("b", 1)], TOTAL);
    expect(out.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("computes cumulative wall positions with rightWall=1 on the last space", () => {
    const out = resolveSpaces(
      [s("a", 0, true, 25_000), s("b", 1, true, 75_000)],
      TOTAL,
    );
    expect(out[0]?.leftWall).toBe(0);
    expect(out[0]?.rightWall).toBe(0.25);
    expect(out[1]?.leftWall).toBe(0.25);
    expect(out[1]?.rightWall).toBe(1);
  });
});

describe("dragWall", () => {
  it("moves the wall right by deltaSf, pinning both adjacent spaces", () => {
    const spaces = [s("a", 0), s("b", 1)]; // 50/50 default
    const out = dragWall(spaces, 0, 10_000, TOTAL);
    expect(out.find((x) => x.id === "a")?.targetSf).toBe(60_000);
    expect(out.find((x) => x.id === "a")?.isPinned).toBe(true);
    expect(out.find((x) => x.id === "b")?.targetSf).toBe(40_000);
    expect(out.find((x) => x.id === "b")?.isPinned).toBe(true);
  });

  it("does nothing when an adjacent space is already pinned", () => {
    const spaces = [s("a", 0, true, 60_000), s("b", 1)];
    const out = dragWall(spaces, 0, 10_000, TOTAL);
    expect(out).toEqual(spaces);
  });

  it("clamps the drag so neither side goes negative", () => {
    const spaces = [s("a", 0), s("b", 1)]; // 50/50 default
    // Try to move 80k to the right; left side only has 50k.
    const out = dragWall(spaces, 0, 80_000, TOTAL);
    expect(out.find((x) => x.id === "b")?.targetSf).toBe(0);
    expect(out.find((x) => x.id === "a")?.targetSf).toBe(100_000);
  });
});

describe("splitLargest", () => {
  it("splits a single space in half", () => {
    const out = splitLargest([s("a", 0)], TOTAL, "new1");
    expect(out).toHaveLength(2);
    expect(out[0]?.id).toBe("a");
    expect(out[1]?.id).toBe("new1");
    expect(out[1]?.positionOrder).toBe(1);
  });

  it("splits the largest unpinned space when others are pinned", () => {
    const spaces = [
      s("a", 0, true, 60_000), // pinned 60k
      s("b", 1), // unpinned 40k (only one)
    ];
    const out = splitLargest(spaces, TOTAL, "new1");
    // 'b' should be split, 'a' untouched.
    expect(out.find((x) => x.id === "a")?.targetSf).toBe(60_000);
    expect(out).toHaveLength(3);
    expect(out[1]?.id).toBe("b");
    expect(out[2]?.id).toBe("new1");
  });

  it("creates a single space from empty input", () => {
    const out = splitLargest([], TOTAL, "new1");
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe("new1");
  });
});

describe("removeSpace", () => {
  it("removes a space and renumbers the rest", () => {
    const out = removeSpace(
      [s("a", 0), s("b", 1), s("c", 2)],
      "b",
    );
    expect(out.map((x) => x.id)).toEqual(["a", "c"]);
    expect(out.map((x) => x.positionOrder)).toEqual([0, 1]);
  });

  it("returns the input unchanged when id isn't found", () => {
    const input = [s("a", 0), s("b", 1)];
    expect(removeSpace(input, "nope")).toHaveLength(2);
  });
});
