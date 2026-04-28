import type { Polygon } from "geojson";
import { describe, expect, it } from "vitest";
import { squareOffPolygonLngLat } from "./squareOffLngLat";

function poly(corners: Array<[number, number]>): Polygon {
  return {
    type: "Polygon",
    coordinates: [[...corners, corners[0]!]],
  };
}

describe("squareOffPolygonLngLat", () => {
  it("returns the polygon unchanged when there are fewer than 4 corners", () => {
    const triangle = poly([
      [-100, 33],
      [-99.999, 33],
      [-99.9995, 33.001],
    ]);
    expect(squareOffPolygonLngLat(triangle)).toEqual(triangle);
  });

  it("snaps a 92° corner (within 80–100°) to a true right angle", () => {
    // Build a near-rectangle whose top-right corner is slightly off. In
    // projected (cos-corrected) space the top-right vertex is at
    // (lng*cos, lat) with a small +x offset that turns the corner into
    // ~92°. The snap should pull it back to share lat with the top-left.
    const lat0 = 33;
    const lat1 = 33.0005;
    const lng0 = -100;
    const lng1 = -99.999;
    const cos = Math.cos((((lat0 + lat1) / 2) * Math.PI) / 180);
    // Offset the top-right's projected x by ~3% of the side length to
    // produce ~2° of corner deviation, easily inside the ±10° window.
    const sideXProjected = (lng1 - lng0) * cos;
    const skew = sideXProjected * 0.03;
    const skewedTopRightLng = (lng1 * cos + skew) / cos;

    const input = poly([
      [lng0, lat0],
      [lng1, lat0],
      [skewedTopRightLng, lat1],
      [lng0, lat1],
    ]);

    const out = squareOffPolygonLngLat(input);
    const ring = out.coordinates[0]!;
    // Ring is closed.
    expect(ring[ring.length - 1]).toEqual(ring[0]);
    expect(ring).toHaveLength(5);

    // After squaring, the top-right corner should sit at lat1 (sharing
    // the top edge with the top-left), not above it. Reading the third
    // vertex of the snapped polygon.
    const [, snappedTopRightLat] = ring[2]!;
    expect(snappedTopRightLat).toBeCloseTo(lat1, 9);
  });

  it("leaves chamfered (~135°) corners alone", () => {
    // A pentagon whose corners are far from any 90° multiple should
    // pass through untouched.
    const lat = 33;
    const lng = -100;
    const r = 0.001;
    const input = poly([
      [lng + r * Math.cos(0), lat + r * Math.sin(0)],
      [lng + r * Math.cos((72 * Math.PI) / 180), lat + r * Math.sin((72 * Math.PI) / 180)],
      [
        lng + r * Math.cos((144 * Math.PI) / 180),
        lat + r * Math.sin((144 * Math.PI) / 180),
      ],
      [
        lng + r * Math.cos((216 * Math.PI) / 180),
        lat + r * Math.sin((216 * Math.PI) / 180),
      ],
      [
        lng + r * Math.cos((288 * Math.PI) / 180),
        lat + r * Math.sin((288 * Math.PI) / 180),
      ],
    ]);
    const out = squareOffPolygonLngLat(input);
    // Each corresponding vertex should be unchanged within float error.
    for (let i = 0; i < 5; i++) {
      expect(out.coordinates[0]![i]![0]).toBeCloseTo(
        input.coordinates[0]![i]![0],
        9,
      );
      expect(out.coordinates[0]![i]![1]).toBeCloseTo(
        input.coordinates[0]![i]![1],
        9,
      );
    }
  });

  it("returns a closed ring with the same first and last vertex", () => {
    const input = poly([
      [-100, 33],
      [-99.999, 33],
      [-99.999, 33.0005],
      [-100, 33.0005],
    ]);
    const out = squareOffPolygonLngLat(input);
    const ring = out.coordinates[0]!;
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });
});
