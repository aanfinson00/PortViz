import type { Polygon } from "geojson";
import { describe, expect, it } from "vitest";
import {
  pixelPolygonArea,
  polygonAreaSqFt,
  polygonAreaSqM,
} from "./polygonArea";

describe("pixelPolygonArea", () => {
  it("computes a unit square = 1", () => {
    expect(
      pixelPolygonArea([
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ]),
    ).toBe(1);
  });

  it("computes a 5x10 rectangle = 50 regardless of winding", () => {
    expect(
      pixelPolygonArea([
        [0, 0],
        [5, 0],
        [5, 10],
        [0, 10],
      ]),
    ).toBe(50);
    expect(
      pixelPolygonArea([
        [0, 0],
        [0, 10],
        [5, 10],
        [5, 0],
      ]),
    ).toBe(50);
  });

  it("returns 0 for fewer than 3 points", () => {
    expect(pixelPolygonArea([])).toBe(0);
    expect(pixelPolygonArea([[0, 0]])).toBe(0);
    expect(
      pixelPolygonArea([
        [0, 0],
        [1, 1],
      ]),
    ).toBe(0);
  });
});

describe("polygonAreaSqM / polygonAreaSqFt", () => {
  // Roughly a 100m x 100m square near the equator, where 1 deg lat ≈ 111 km
  // and 1 deg lng ≈ 111 km. So 0.000898 deg ≈ 100 m.
  const square100m: Polygon = {
    type: "Polygon",
    coordinates: [
      [
        [-100, 0],
        [-100 + 0.000898, 0],
        [-100 + 0.000898, 0.000898],
        [-100, 0.000898],
        [-100, 0],
      ],
    ],
  };

  it("computes a ~100x100m square as ~10,000 m^2", () => {
    const m2 = polygonAreaSqM(square100m);
    expect(m2).toBeGreaterThan(9_900);
    expect(m2).toBeLessThan(10_100);
  });

  it("converts to ft^2 (~107,639 ft^2 for 10,000 m^2)", () => {
    const ft2 = polygonAreaSqFt(square100m);
    expect(ft2).toBeGreaterThan(106_000);
    expect(ft2).toBeLessThan(109_000);
  });

  it("returns 0 for empty rings", () => {
    expect(polygonAreaSqM({ type: "Polygon", coordinates: [] })).toBe(0);
  });
});
