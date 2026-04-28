import { describe, expect, it } from "vitest";
import { squareOffPolygon } from "./squareOff";

describe("squareOffPolygon", () => {
  it("snaps a slightly off-square rectangle to perfect 90° corners", () => {
    const wobbly: [number, number][] = [
      [0, 0],
      [100, 1],
      [101, 50],
      [-2, 51],
    ];
    const out = squareOffPolygon(wobbly);
    // Each consecutive edge should be axis-aligned (one of dx/dy ~= 0).
    for (let i = 0; i < out.length; i++) {
      const a = out[i]!;
      const b = out[(i + 1) % out.length]!;
      const dx = Math.abs(b[0] - a[0]);
      const dy = Math.abs(b[1] - a[1]);
      expect(Math.min(dx, dy)).toBeLessThan(0.001);
    }
  });

  it("leaves diagonal-flagged edges untouched", () => {
    // A pentagon: rectangle with one corner clipped at a 45° diagonal.
    const pts: [number, number][] = [
      [0, 0],
      [80, 0],
      [100, 20], // diagonal edge goes from idx 1 -> 2
      [100, 50],
      [0, 50],
    ];
    const out = squareOffPolygon(pts, { diagonalEdges: new Set([1]) });
    // The diagonal vertices (indices 1 and 2) should be unchanged.
    expect(out[1]).toEqual(pts[1]);
    expect(out[2]).toEqual(pts[2]);
  });

  it("does not snap a true diagonal that is far from 90°", () => {
    const triangle: [number, number][] = [
      [0, 0],
      [100, 0],
      [50, 80], // 30°ish at vertex 1, 30°ish at vertex 2
    ];
    const out = squareOffPolygon(triangle);
    // Triangle should be unchanged because no interior turn is near 90°.
    expect(out).toEqual(triangle);
  });

  it("handles an L-shape (6 vertices, all 90°-ish)", () => {
    const wobbly: [number, number][] = [
      [0, 1],
      [100, 0],
      [101, 50],
      [49, 51],
      [50, 100],
      [-1, 99],
    ];
    const out = squareOffPolygon(wobbly);
    // After snapping every edge should be axis-aligned.
    for (let i = 0; i < out.length; i++) {
      const a = out[i]!;
      const b = out[(i + 1) % out.length]!;
      const dx = Math.abs(b[0] - a[0]);
      const dy = Math.abs(b[1] - a[1]);
      expect(Math.min(dx, dy)).toBeLessThan(2);
    }
  });

  it("returns the input unchanged for fewer than 4 points", () => {
    const tri: [number, number][] = [
      [0, 0],
      [10, 0],
      [5, 10],
    ];
    expect(squareOffPolygon(tri)).toEqual(tri);
  });
});
