import type { Polygon } from "geojson";
import { describe, expect, it } from "vitest";
import {
  lightenColor,
  parseOfficeCorner,
  placeCornerOffice,
  splitOfficeWarehouse,
  squarestOfficeDimensions,
  type OfficeCorner,
} from "./officeBuildout";
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

describe("squarestOfficeDimensions", () => {
  it("returns a square when target SF fits comfortably in the slab", () => {
    // 2,500 SF in a 200×200 slab → ~50×50 ideal.
    const out = squarestOfficeDimensions(200, 200, 2_500);
    expect(out.widthFt).toBeCloseTo(50, 0);
    expect(out.depthFt).toBeCloseTo(50, 0);
  });

  it("clamps width to slab frontage when sqrt(SF) > frontage", () => {
    // 10,000 SF, slab 50ft frontage × 500ft depth. sqrt = 100 > 50.
    // → width = 50, depth = 200.
    const out = squarestOfficeDimensions(50, 500, 10_000);
    expect(out.widthFt).toBeCloseTo(50, 0);
    expect(out.depthFt).toBeCloseTo(200, 0);
  });

  it("clamps depth to slab depth when sqrt(SF) > depth", () => {
    // 10,000 SF, slab 500ft frontage × 50ft depth.
    // → depth = 50, width = 200.
    const out = squarestOfficeDimensions(500, 50, 10_000);
    expect(out.depthFt).toBeCloseTo(50, 0);
    expect(out.widthFt).toBeCloseTo(200, 0);
  });

  it("caps both dimensions at slab dims when SF exceeds slab area", () => {
    // 100,000 SF target on a 100×100 (10k SF) slab → output is the slab
    // dims themselves; caller treats this as 'whole slab is office'.
    const out = squarestOfficeDimensions(100, 100, 100_000);
    expect(out.widthFt).toBeCloseTo(100, 0);
    expect(out.depthFt).toBeCloseTo(100, 0);
  });

  it("returns zeros for zero / negative SF or zero slab", () => {
    expect(squarestOfficeDimensions(100, 100, 0)).toEqual({ widthFt: 0, depthFt: 0 });
    expect(squarestOfficeDimensions(100, 100, -50)).toEqual({ widthFt: 0, depthFt: 0 });
    expect(squarestOfficeDimensions(0, 100, 1_000)).toEqual({ widthFt: 0, depthFt: 0 });
  });
});

describe("parseOfficeCorner", () => {
  it("accepts the four valid corners", () => {
    expect(parseOfficeCorner("front-left")).toBe("front-left");
    expect(parseOfficeCorner("front-right")).toBe("front-right");
    expect(parseOfficeCorner("rear-left")).toBe("rear-left");
    expect(parseOfficeCorner("rear-right")).toBe("rear-right");
  });

  it("returns null for unknown values", () => {
    expect(parseOfficeCorner("center")).toBeNull();
    expect(parseOfficeCorner(null)).toBeNull();
    expect(parseOfficeCorner(undefined)).toBeNull();
    expect(parseOfficeCorner(42)).toBeNull();
  });
});

describe("placeCornerOffice", () => {
  it("returns no office when officeSf is null/zero/negative", () => {
    const out = placeCornerOffice({
      slab: SLAB,
      side: "S",
      officeSf: null,
      corner: "front-left",
    });
    expect(out.office).toBeNull();
    expect(out.warehouseParts).toHaveLength(1);
  });

  it("front-left office on S frontage sits at the SW corner", () => {
    const out = placeCornerOffice({
      slab: SLAB,
      side: "S",
      officeSf: 100_000,
      corner: "front-left",
    });
    expect(out.office).not.toBeNull();
    const ring = out.office!.coordinates[0]!;
    const minLng = Math.min(...ring.map((p) => p[0]!));
    const minLat = Math.min(...ring.map((p) => p[1]!));
    // SW corner: minLng + minLat should match the slab's SW.
    expect(minLng).toBeCloseTo(-96.8, 5);
    expect(minLat).toBeCloseTo(32.78, 5);
  });

  it("front-right office on S frontage sits at the SE corner", () => {
    const out = placeCornerOffice({
      slab: SLAB,
      side: "S",
      officeSf: 100_000,
      corner: "front-right",
    });
    const ring = out.office!.coordinates[0]!;
    const maxLng = Math.max(...ring.map((p) => p[0]!));
    const minLat = Math.min(...ring.map((p) => p[1]!));
    expect(maxLng).toBeCloseTo(-96.79, 5);
    expect(minLat).toBeCloseTo(32.78, 5);
  });

  it("rear-left office on S frontage sits at the NW corner", () => {
    const out = placeCornerOffice({
      slab: SLAB,
      side: "S",
      officeSf: 100_000,
      corner: "rear-left",
    });
    const ring = out.office!.coordinates[0]!;
    const minLng = Math.min(...ring.map((p) => p[0]!));
    const maxLat = Math.max(...ring.map((p) => p[1]!));
    expect(minLng).toBeCloseTo(-96.8, 5);
    expect(maxLat).toBeCloseTo(32.785, 5);
  });

  it("rear-right office on S frontage sits at the NE corner", () => {
    const out = placeCornerOffice({
      slab: SLAB,
      side: "S",
      officeSf: 100_000,
      corner: "rear-right",
    });
    const ring = out.office!.coordinates[0]!;
    const maxLng = Math.max(...ring.map((p) => p[0]!));
    const maxLat = Math.max(...ring.map((p) => p[1]!));
    expect(maxLng).toBeCloseTo(-96.79, 5);
    expect(maxLat).toBeCloseTo(32.785, 5);
  });

  it("office area lands within ~10% of the requested SF on a rectangular slab", () => {
    const target = 50_000;
    const out = placeCornerOffice({
      slab: SLAB,
      side: "S",
      officeSf: target,
      corner: "front-left",
    });
    // Slab is roughly 0.01° × 0.005°. Allow some tolerance because the
    // dimension math uses cosine-corrected ft <-> deg.
    expect(out.officeSf).toBeGreaterThan(target * 0.85);
    expect(out.officeSf).toBeLessThan(target * 1.15);
  });

  it("warehouse parts are non-empty when there's room beyond the office", () => {
    const out = placeCornerOffice({
      slab: SLAB,
      side: "S",
      officeSf: 50_000,
      corner: "front-left",
    });
    expect(out.warehouseParts.length).toBeGreaterThan(0);
    expect(out.warehouseSf).toBeGreaterThan(0);
  });

  it("when officeSf >= slab area, the entire slab becomes office", () => {
    const total = polygonAreaSqFt(SLAB);
    const out = placeCornerOffice({
      slab: SLAB,
      side: "S",
      officeSf: total + 1_000_000,
      corner: "front-left",
    });
    expect(out.warehouseParts).toEqual([]);
    expect(out.officeSf).toBeCloseTo(total, 0);
    expect(out.warehouseSf).toBe(0);
  });

  it("preserves total area: office + warehouse SF ≈ slab SF", () => {
    const total = polygonAreaSqFt(SLAB);
    const corners: OfficeCorner[] = [
      "front-left",
      "front-right",
      "rear-left",
      "rear-right",
    ];
    for (const corner of corners) {
      const out = placeCornerOffice({
        slab: SLAB,
        side: "S",
        officeSf: 80_000,
        corner,
      });
      expect(out.officeSf + out.warehouseSf).toBeCloseTo(total, 0);
    }
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
