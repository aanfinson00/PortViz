import type { Polygon } from "geojson";
import { describe, expect, it } from "vitest";
import { polygonsToSvgPaths } from "./svgPath";

function square(lng: number, lat: number, sizeDeg: number): Polygon {
  return {
    type: "Polygon",
    coordinates: [
      [
        [lng, lat],
        [lng + sizeDeg, lat],
        [lng + sizeDeg, lat + sizeDeg],
        [lng, lat + sizeDeg],
        [lng, lat],
      ],
    ],
  };
}

function extractPoints(path: string): Array<[number, number]> {
  return Array.from(path.matchAll(/[ML]\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)).map(
    (m) => [Number(m[1]), Number(m[2])] as [number, number],
  );
}

describe("polygonsToSvgPaths", () => {
  it("returns [] for empty input", () => {
    expect(polygonsToSvgPaths([])).toEqual([]);
  });

  it("renders a square near the equator with equal width and height", () => {
    const out = polygonsToSvgPaths([{ polygon: square(0, 0, 1) }], 100, 100);
    expect(out).toHaveLength(1);
    const pts = extractPoints(out[0]!.path);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    expect(w).toBeCloseTo(h, 1);
  });

  it("applies cosine correction at mid-latitudes", () => {
    // A 1°×1° square at lat 33°: longitude spans should appear ~cos(33°) ≈ 0.84
    // narrower than latitude spans on screen.
    const out = polygonsToSvgPaths([{ polygon: square(0, 33, 1) }], 200, 200);
    const pts = extractPoints(out[0]!.path);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    // cos(33°) ≈ 0.838
    expect(w / h).toBeCloseTo(Math.cos((33 * Math.PI) / 180), 2);
  });

  it("preserves relative positions when given multiple polygons", () => {
    // Two 1° squares, one at (0,0) and one shifted east by 2°. Their projected
    // centroids should also be shifted east on screen, by twice the side length.
    const a = square(0, 0, 1);
    const b = square(2, 0, 1);
    const out = polygonsToSvgPaths(
      [{ polygon: a }, { polygon: b }],
      300,
      300,
    );
    const ptsA = extractPoints(out[0]!.path);
    const ptsB = extractPoints(out[1]!.path);
    const cxA = ptsA.reduce((s, p) => s + p[0], 0) / ptsA.length;
    const cxB = ptsB.reduce((s, p) => s + p[0], 0) / ptsB.length;
    const widthA =
      Math.max(...ptsA.map((p) => p[0])) - Math.min(...ptsA.map((p) => p[0]));
    expect(cxB - cxA).toBeCloseTo(widthA * 2, 1);
  });

  it("keeps every vertex at least `padding` from each edge", () => {
    const out = polygonsToSvgPaths(
      [{ polygon: square(0, 0, 1) }],
      100,
      60,
      8,
    );
    const pts = extractPoints(out[0]!.path);
    for (const [x, y] of pts) {
      expect(x).toBeGreaterThanOrEqual(8 - 0.01);
      expect(x).toBeLessThanOrEqual(100 - 8 + 0.01);
      expect(y).toBeGreaterThanOrEqual(8 - 0.01);
      expect(y).toBeLessThanOrEqual(60 - 8 + 0.01);
    }
  });

  it("carries through the per-polygon color, defaulting to blue", () => {
    const out = polygonsToSvgPaths([
      { polygon: square(0, 0, 1), color: "#ff0000" },
      { polygon: square(2, 0, 1) },
    ]);
    expect(out[0]!.color).toBe("#ff0000");
    expect(out[1]!.color).toBe("#2563eb");
  });
});
