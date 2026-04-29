import { describe, expect, it } from "vitest";
import {
  accessPointMarker,
  parseAccessPoints,
  parseParcelPolygon,
  parseParkingAreas,
  parseParkingKind,
  parseYardAreas,
} from "./projectAmenities";

const VALID_POLYGON = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ],
  ],
};

describe("accessPointMarker", () => {
  it("generates a closed ring centered on the point", () => {
    const m = accessPointMarker({ lng: -100, lat: 33 }, 20, 16);
    const ring = m.coordinates[0]!;
    expect(ring).toHaveLength(17); // 16 + closing duplicate
    expect(ring[0]).toEqual(ring[16]);
    // Centroid of a regular polygon should sit at the input point.
    const cx = ring.slice(0, -1).reduce((s, p) => s + p[0]!, 0) / 16;
    const cy = ring.slice(0, -1).reduce((s, p) => s + p[1]!, 0) / 16;
    expect(cx).toBeCloseTo(-100, 6);
    expect(cy).toBeCloseTo(33, 6);
  });

  it("uses cosine-corrected longitude radius (skinnier in lng than lat)", () => {
    const m = accessPointMarker({ lng: 0, lat: 60 }, 100, 24);
    const ring = m.coordinates[0]!;
    const xs = ring.map((p) => p[0]!);
    const ys = ring.map((p) => p[1]!);
    const xSpan = Math.max(...xs) - Math.min(...xs);
    const ySpan = Math.max(...ys) - Math.min(...ys);
    // At 60° lat, 1° longitude ≈ 0.5× a degree of latitude in real ft, so a
    // circle that's 100ft in both axes should be ~2× wider in lng degrees.
    expect(xSpan / ySpan).toBeCloseTo(1 / Math.cos((60 * Math.PI) / 180), 1);
  });
});

describe("parseAccessPoints", () => {
  it("returns [] for non-array input", () => {
    expect(parseAccessPoints(null)).toEqual([]);
    expect(parseAccessPoints(undefined)).toEqual([]);
    expect(parseAccessPoints({})).toEqual([]);
    expect(parseAccessPoints("nope")).toEqual([]);
  });

  it("keeps valid entries and drops malformed ones silently", () => {
    const out = parseAccessPoints([
      { lng: -100, lat: 33, label: "Main", role: "main" },
      { lng: -100.001, lat: 33.001 }, // no label/role -> ok
      { lng: "bad", lat: 33 }, // bad lng -> drop
      { lat: 33 }, // missing lng -> drop
      null, // -> drop
      "string", // -> drop
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      lng: -100,
      lat: 33,
      label: "Main",
      role: "main",
    });
    expect(out[1]).toEqual({ lng: -100.001, lat: 33.001 });
  });

  it("rejects unknown role values", () => {
    const out = parseAccessPoints([
      { lng: 0, lat: 0, role: "fake" },
      { lng: 0, lat: 0, role: "truck" },
    ]);
    expect(out[0]?.role).toBeUndefined();
    expect(out[1]?.role).toBe("truck");
  });
});

describe("parseParcelPolygon", () => {
  it("returns null for non-polygon shapes", () => {
    expect(parseParcelPolygon(null)).toBeNull();
    expect(parseParcelPolygon({})).toBeNull();
    expect(parseParcelPolygon({ type: "LineString", coordinates: [] })).toBeNull();
  });

  it("returns null when the ring has fewer than 4 points", () => {
    expect(
      parseParcelPolygon({
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [0, 0],
          ],
        ],
      }),
    ).toBeNull();
  });

  it("rejects rings with non-numeric coordinates", () => {
    expect(
      parseParcelPolygon({
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            ["nope", 1],
            [1, 1],
            [0, 0],
          ],
        ],
      }),
    ).toBeNull();
  });

  it("returns the polygon when valid", () => {
    const valid = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0],
        ],
      ],
    };
    const out = parseParcelPolygon(valid);
    expect(out).not.toBeNull();
    expect(out?.type).toBe("Polygon");
    expect(out?.coordinates[0]).toHaveLength(5);
  });
});

describe("parseParkingKind", () => {
  it("accepts the three valid kinds", () => {
    expect(parseParkingKind("car")).toBe("car");
    expect(parseParkingKind("trailer")).toBe("trailer");
    expect(parseParkingKind("mixed")).toBe("mixed");
  });

  it("returns null for unknown strings", () => {
    expect(parseParkingKind("CAR")).toBeNull();
    expect(parseParkingKind("auto")).toBeNull();
    expect(parseParkingKind("")).toBeNull();
  });

  it("returns null for null / undefined / non-string", () => {
    expect(parseParkingKind(null)).toBeNull();
    expect(parseParkingKind(undefined)).toBeNull();
    expect(parseParkingKind(123)).toBeNull();
    expect(parseParkingKind({ kind: "car" })).toBeNull();
  });
});

describe("parseParkingAreas", () => {
  it("returns [] for non-array / null / undefined", () => {
    expect(parseParkingAreas(null)).toEqual([]);
    expect(parseParkingAreas(undefined)).toEqual([]);
    expect(parseParkingAreas({})).toEqual([]);
    expect(parseParkingAreas("nope")).toEqual([]);
  });

  it("keeps valid entries and drops malformed ones silently", () => {
    const out = parseParkingAreas([
      { polygon: VALID_POLYGON, stalls: 100, kind: "car", label: "Lot A" },
      { polygon: VALID_POLYGON, stalls: null, kind: null, label: null },
      { polygon: null }, // dropped
      { stalls: 50, kind: "trailer" }, // no polygon -> dropped
      "string", // dropped
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ stalls: 100, kind: "car", label: "Lot A" });
    expect(out[1]).toMatchObject({ stalls: null, kind: null, label: null });
  });

  it("rounds non-integer stall counts and drops negatives", () => {
    const out = parseParkingAreas([
      { polygon: VALID_POLYGON, stalls: 99.6 },
      { polygon: VALID_POLYGON, stalls: -5 },
    ]);
    expect(out[0]?.stalls).toBe(100);
    expect(out[1]?.stalls).toBeNull();
  });

  it("rejects unknown kinds (sets kind to null)", () => {
    const out = parseParkingAreas([
      { polygon: VALID_POLYGON, kind: "monorail" },
    ]);
    expect(out[0]?.kind).toBeNull();
  });
});

describe("parseYardAreas", () => {
  it("returns [] for non-array / null / undefined", () => {
    expect(parseYardAreas(null)).toEqual([]);
    expect(parseYardAreas(undefined)).toEqual([]);
    expect(parseYardAreas([])).toEqual([]);
  });

  it("keeps valid entries and drops malformed ones silently", () => {
    const out = parseYardAreas([
      { polygon: VALID_POLYGON, label: "Equipment yard" },
      { polygon: VALID_POLYGON },
      {}, // no polygon -> dropped
      null,
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]?.label).toBe("Equipment yard");
    expect(out[1]?.label).toBeNull();
  });
});
