import type { Polygon } from "geojson";
import { describe, expect, it } from "vitest";
import { sliceFootprintByArea } from "./footprintSlicer";
import { polygonAreaSqFt } from "./polygonArea";

function rect(
  west: number,
  south: number,
  east: number,
  north: number,
): Polygon {
  return {
    type: "Polygon",
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    ],
  };
}

// Roughly 100,000 SF rectangle near Dallas: 0.001° × ~280ft N-S worth, but
// the absolute size doesn't matter — we test the proportional split.
const FOOTPRINT = rect(-96.8, 32.78, -96.797, 32.781);

describe("sliceFootprintByArea (rectangle)", () => {
  const total = polygonAreaSqFt(FOOTPRINT);

  it("returns the original polygon for a single target", () => {
    const slabs = sliceFootprintByArea(FOOTPRINT, "S", [total]);
    expect(slabs).toHaveLength(1);
    expect(polygonAreaSqFt(slabs[0]!)).toBeCloseTo(total, 0);
  });

  it("splits a rectangle 50/50 by area", () => {
    const slabs = sliceFootprintByArea(FOOTPRINT, "S", [total / 2, total / 2]);
    expect(slabs).toHaveLength(2);
    const a = polygonAreaSqFt(slabs[0]!);
    const b = polygonAreaSqFt(slabs[1]!);
    expect(a + b).toBeCloseTo(total, 0);
    // Each side ~50%, within 0.5%.
    expect(Math.abs(a - total / 2) / total).toBeLessThan(0.005);
    expect(Math.abs(b - total / 2) / total).toBeLessThan(0.005);
  });

  it("splits a rectangle 60/40 honoring the targets", () => {
    const slabs = sliceFootprintByArea(FOOTPRINT, "S", [
      total * 0.6,
      total * 0.4,
    ]);
    const a = polygonAreaSqFt(slabs[0]!);
    const b = polygonAreaSqFt(slabs[1]!);
    expect(Math.abs(a - total * 0.6) / total).toBeLessThan(0.005);
    expect(Math.abs(b - total * 0.4) / total).toBeLessThan(0.005);
  });

  it("splits into 3 unequal slabs", () => {
    const targets = [total * 0.5, total * 0.25, total * 0.25];
    const slabs = sliceFootprintByArea(FOOTPRINT, "S", targets);
    expect(slabs).toHaveLength(3);
    const sum = slabs.reduce((s, p) => s + polygonAreaSqFt(p), 0);
    expect(sum).toBeCloseTo(total, 0);
    expect(Math.abs(polygonAreaSqFt(slabs[0]!) - targets[0]!) / total).toBeLessThan(0.005);
    expect(Math.abs(polygonAreaSqFt(slabs[1]!) - targets[1]!) / total).toBeLessThan(0.005);
  });

  it("orders slabs left→right along the frontage axis", () => {
    // S frontage: looking south, west is left → minLng. So slab 0's west
    // edge should equal the polygon's minLng.
    const slabs = sliceFootprintByArea(FOOTPRINT, "S", [total / 2, total / 2]);
    const slab0Lngs = slabs[0]!.coordinates[0]!.map((p) => p[0]!);
    expect(Math.min(...slab0Lngs)).toBeCloseTo(-96.8, 6);
  });

  it("on N frontage, slab 0 sits on the EAST end (mirrored)", () => {
    const slabs = sliceFootprintByArea(FOOTPRINT, "N", [total / 2, total / 2]);
    const slab0Lngs = slabs[0]!.coordinates[0]!.map((p) => p[0]!);
    expect(Math.max(...slab0Lngs)).toBeCloseTo(-96.797, 6);
  });
});

describe("sliceFootprintByArea (L-shape)", () => {
  // L-shape: a 2×2 square with a 1×1 chunk cut from the NE corner.
  // Total area is 3 unit-squares.
  const L: Polygon = {
    type: "Polygon",
    coordinates: [
      [
        [-96.8, 32.78],
        [-96.798, 32.78],
        [-96.798, 32.781],
        [-96.799, 32.781],
        [-96.799, 32.782],
        [-96.8, 32.782],
        [-96.8, 32.78],
      ],
    ],
  };

  it("preserves total area when split into multiple slabs", () => {
    const total = polygonAreaSqFt(L);
    const slabs = sliceFootprintByArea(L, "S", [
      total / 3,
      total / 3,
      total / 3,
    ]);
    const sum = slabs.reduce((s, p) => s + polygonAreaSqFt(p), 0);
    expect(sum).toBeCloseTo(total, 0);
  });

  it("each slab's area lands within 1% of the requested target", () => {
    const total = polygonAreaSqFt(L);
    const targets = [total * 0.4, total * 0.6];
    const slabs = sliceFootprintByArea(L, "S", targets);
    expect(
      Math.abs(polygonAreaSqFt(slabs[0]!) - targets[0]!) / total,
    ).toBeLessThan(0.01);
    expect(
      Math.abs(polygonAreaSqFt(slabs[1]!) - targets[1]!) / total,
    ).toBeLessThan(0.01);
  });
});
