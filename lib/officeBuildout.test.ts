import type { Polygon } from "geojson";
import { describe, expect, it } from "vitest";
import { lightenColor, splitOfficeWarehouse } from "./officeBuildout";
import { polygonAreaSqFt } from "./polygonArea";

// A 3,000 ft (E-W) × 1,000 ft (N-S) slab anchored near Dallas. We use a
// big slab so the cosine-corrected widths in feet are noticeably bigger
// than the latitude widths and the office/warehouse split is unambiguous.
const SLAB: Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [-96.8, 32.78],
      [-96.79, 32.78],
      [-96.79, 32.785],
      [-96.8, 32.785],
      [-96.8, 32.78],
    ],
  ],
};

describe("splitOfficeWarehouse", () => {
  it("returns warehouse-only when depth is null/zero/negative", () => {
    const a = splitOfficeWarehouse(SLAB, "S", null);
    expect(a.office).toBeNull();
    expect(a.warehouse).not.toBeNull();
    const b = splitOfficeWarehouse(SLAB, "S", 0);
    expect(b.office).toBeNull();
    const c = splitOfficeWarehouse(SLAB, "S", -50);
    expect(c.office).toBeNull();
  });

  it("S frontage office sits along the southern edge", () => {
    const out = splitOfficeWarehouse(SLAB, "S", 100);
    expect(out.office).not.toBeNull();
    const ring = out.office!.coordinates[0]!;
    const lats = ring.map((p) => p[1]!);
    // The office's max lat should be only ~100ft north of the slab's
    // south edge, i.e., far less than the full slab depth.
    const maxLat = Math.max(...lats);
    expect(maxLat - 32.78).toBeLessThan(0.001); // 100ft ≈ 0.000275°
  });

  it("N frontage office sits along the northern edge", () => {
    const out = splitOfficeWarehouse(SLAB, "N", 100);
    const ring = out.office!.coordinates[0]!;
    const lats = ring.map((p) => p[1]!);
    const minLat = Math.min(...lats);
    // The office's min lat should be near the slab's north edge.
    expect(32.785 - minLat).toBeLessThan(0.001);
  });

  it("office area + warehouse area sums to total slab area", () => {
    const total = polygonAreaSqFt(SLAB);
    const out = splitOfficeWarehouse(SLAB, "S", 100);
    expect(out.officeSf + out.warehouseSf).toBeCloseTo(total, 0);
  });

  it("requested depth produces approximately depth × frontage SF", () => {
    // Slab is ~0.01° × ~0.005° at lat 32.78. The east-west frontage in
    // ft = 0.01° × cos(32.78°) × 364,000 ≈ 3,058 ft. Depth 100ft ⇒ office
    // ≈ 305,800 SF.
    const out = splitOfficeWarehouse(SLAB, "S", 100);
    expect(out.officeSf).toBeGreaterThan(280_000);
    expect(out.officeSf).toBeLessThan(330_000);
  });

  it("when depth >= slab depth, the entire slab becomes office", () => {
    const total = polygonAreaSqFt(SLAB);
    // 5000ft is way more than the slab's depth (~1820ft).
    const out = splitOfficeWarehouse(SLAB, "S", 5000);
    expect(out.warehouse).toBeNull();
    expect(out.officeSf).toBeCloseTo(total, 0);
    expect(out.warehouseSf).toBe(0);
  });
});

describe("lightenColor", () => {
  it("blends a known hex toward white", () => {
    // 50% mix of #000000 and #ffffff is #808080.
    expect(lightenColor("#000000", 0.5)).toBe("#808080");
  });

  it("preserves hue when mixed with white at 0", () => {
    expect(lightenColor("#2563eb", 0)).toBe("#2563eb");
  });

  it("returns the input unchanged when it isn't a 6-char hex", () => {
    expect(lightenColor("rgb(0,0,0)")).toBe("rgb(0,0,0)");
  });

  it("default mix lightens without inverting", () => {
    const out = lightenColor("#2563eb"); // default 0.45
    // Should be a lighter blue — R rises from 0x25 → ~0x8d, B from 0xeb → ~0xf2.
    expect(out).toMatch(/^#[0-9a-f]{6}$/);
    expect(out).not.toBe("#2563eb");
  });
});
