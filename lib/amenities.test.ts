import type { Polygon } from "geojson";
import { describe, expect, it } from "vitest";
import {
  dockMarkerPolygons,
  frontageEdge,
  ftToDegLat,
  ftToDegLng,
  truckCourtPolygon,
} from "./amenities";
import type { Bay } from "./demising";

const FOOTPRINT: Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [-100, 33],
      [-100 + 0.001, 33],
      [-100 + 0.001, 33 + 0.0005],
      [-100, 33 + 0.0005],
      [-100, 33],
    ],
  ],
};

function bay(
  id: string,
  ordinal: number,
  dockDoorCount: number,
  driveInCount: number,
): Bay {
  return {
    id,
    ordinal,
    widthFt: 50,
    depthFt: 200,
    dockDoorCount,
    driveInCount,
    hasYardAccess: false,
    frontageSide: "S",
  };
}

describe("ft↔deg conversions", () => {
  it("ftToDegLat: 364,000 ft is exactly 1°", () => {
    expect(ftToDegLat(364_000)).toBeCloseTo(1, 6);
  });

  it("ftToDegLng: shrinks with latitude (cos correction)", () => {
    const atEquator = ftToDegLng(364_000, 0);
    const atMidLat = ftToDegLng(364_000, 33);
    expect(atEquator).toBeCloseTo(1, 4);
    // cos(33°) ≈ 0.838, so 1 / 0.838 ≈ 1.193°
    expect(atMidLat).toBeCloseTo(1 / Math.cos((33 * Math.PI) / 180), 4);
  });
});

describe("frontageEdge", () => {
  it("returns the south edge for S frontage with outward = [0, -1]", () => {
    const { a, b, outward } = frontageEdge(FOOTPRINT, "S");
    expect(a[1]).toBeCloseTo(33);
    expect(b[1]).toBeCloseTo(33);
    expect(outward).toEqual([0, -1]);
  });

  it("returns the north edge for N frontage with outward = [0, 1]", () => {
    const { a, b, outward } = frontageEdge(FOOTPRINT, "N");
    expect(a[1]).toBeCloseTo(33.0005);
    expect(b[1]).toBeCloseTo(33.0005);
    expect(outward).toEqual([0, 1]);
  });

  it("returns the east edge for E frontage with outward = [1, 0]", () => {
    const { a, b, outward } = frontageEdge(FOOTPRINT, "E");
    expect(a[0]).toBeCloseTo(-99.999);
    expect(b[0]).toBeCloseTo(-99.999);
    expect(outward).toEqual([1, 0]);
  });
});

describe("truckCourtPolygon", () => {
  it("returns null when depthFt is missing or non-positive", () => {
    expect(
      truckCourtPolygon({ footprint: FOOTPRINT, side: "S", depthFt: null }),
    ).toBeNull();
    expect(
      truckCourtPolygon({ footprint: FOOTPRINT, side: "S", depthFt: 0 }),
    ).toBeNull();
    expect(
      truckCourtPolygon({ footprint: FOOTPRINT, side: "S", depthFt: -100 }),
    ).toBeNull();
  });

  it("projects a south-facing court below the footprint", () => {
    const poly = truckCourtPolygon({
      footprint: FOOTPRINT,
      side: "S",
      depthFt: 130,
    });
    expect(poly).not.toBeNull();
    const ring = poly!.coordinates[0]!;
    // The four corners + closing point.
    expect(ring).toHaveLength(5);
    // Two corners should sit on the footprint's south edge (lat 33),
    // two should sit south of it (lat < 33).
    const lats = ring.map((p) => p[1]);
    const onEdge = lats.filter((l) => Math.abs(l - 33) < 1e-9);
    const south = lats.filter((l) => l < 33 - 1e-9);
    expect(onEdge).toHaveLength(3); // 2 + closing point
    expect(south).toHaveLength(2);
  });

  it("court depth in degrees corresponds to depthFt feet", () => {
    const poly = truckCourtPolygon({
      footprint: FOOTPRINT,
      side: "S",
      depthFt: 130,
    })!;
    const ring = poly.coordinates[0]!;
    const onEdge = ring.find((p) => Math.abs(p[1] - 33) < 1e-9)!;
    const offEdge = ring.find((p) => p[1] < 33 - 1e-9)!;
    const dLat = onEdge[1] - offEdge[1];
    expect(dLat).toBeCloseTo(ftToDegLat(130), 6);
  });
});

describe("dockMarkerPolygons", () => {
  it("returns no markers when there are no bays", () => {
    const out = dockMarkerPolygons({
      footprint: FOOTPRINT,
      bays: [],
      side: "S",
    });
    expect(out.docks).toEqual([]);
    expect(out.driveIns).toEqual([]);
  });

  it("emits one rectangle per dock door + one per drive-in", () => {
    const bays = [bay("ba1", 1, 4, 1), bay("ba2", 2, 0, 0), bay("ba3", 3, 2, 0)];
    const out = dockMarkerPolygons({
      footprint: FOOTPRINT,
      bays,
      side: "S",
    });
    expect(out.docks).toHaveLength(4 + 2);
    expect(out.driveIns).toHaveLength(1);
  });

  it("places markers along (or just outside) the frontage edge", () => {
    const out = dockMarkerPolygons({
      footprint: FOOTPRINT,
      bays: [bay("ba1", 1, 3, 0)],
      side: "S",
    });
    for (const m of out.docks) {
      const lats = m.coordinates[0]!.map((p) => p[1]);
      // S frontage projects outward (lat < 33), and the inner edge sits
      // exactly on the building's south edge (lat = 33).
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      expect(maxLat).toBeCloseTo(33, 9);
      expect(minLat).toBeLessThan(33);
    }
  });

  it("skips bays with zero markers", () => {
    const out = dockMarkerPolygons({
      footprint: FOOTPRINT,
      bays: [bay("zero", 1, 0, 0), bay("two", 2, 2, 0)],
      side: "S",
    });
    expect(out.docks).toHaveLength(2);
  });
});
