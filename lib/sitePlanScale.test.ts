import { describe, expect, it } from "vitest";
import { computeScale } from "./sitePlanScale";

describe("computeScale", () => {
  it("returns 1 ft/px for a 100x100 px polygon meant to be 10,000 SF", () => {
    expect(
      computeScale(
        [
          [0, 0],
          [100, 0],
          [100, 100],
          [0, 100],
        ],
        10_000,
      ),
    ).toBe(1);
  });

  it("returns 2 ft/px when the polygon should represent 4x its area in SF", () => {
    expect(
      computeScale(
        [
          [0, 0],
          [100, 0],
          [100, 100],
          [0, 100],
        ],
        40_000,
      ),
    ).toBe(2);
  });

  it("works for non-rectangular polygons (L-shape)", () => {
    // L-shape footprint: 100x50 base joined with 50x50 stack = 7,500 px^2.
    // Target 30,000 SF -> k^2 = 30000/7500 = 4 -> k = 2.
    const k = computeScale(
      [
        [0, 0],
        [100, 0],
        [100, 50],
        [50, 50],
        [50, 100],
        [0, 100],
      ],
      30_000,
    );
    expect(k).toBeCloseTo(2);
  });

  it("returns 0 for degenerate input", () => {
    expect(computeScale([], 1000)).toBe(0);
    expect(
      computeScale(
        [
          [0, 0],
          [10, 0],
          [10, 10],
        ],
        0,
      ),
    ).toBe(0);
  });
});
