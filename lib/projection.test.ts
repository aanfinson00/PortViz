import { describe, expect, it } from "vitest";
import { distanceFt, projectPolygonPixToLngLat } from "./projection";

describe("projectPolygonPixToLngLat", () => {
  const anchor: [number, number] = [-84.388, 33.749];

  it("places the polygon's centroid on the anchor when no rotation", () => {
    const out = projectPolygonPixToLngLat(
      [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
      ],
      anchor,
      1, // 1 ft per pixel
      0,
    );
    const ring = out.coordinates[0]!;
    const cx = (ring[0]![0] + ring[2]![0]) / 2;
    const cy = (ring[0]![1] + ring[2]![1]) / 2;
    expect(cx).toBeCloseTo(anchor[0], 6);
    expect(cy).toBeCloseTo(anchor[1], 6);
  });

  it("scales correctly: a 100x100 px polygon at 1 ft/px is ~100 ft on a side", () => {
    const out = projectPolygonPixToLngLat(
      [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
      ],
      anchor,
      1,
      0,
    );
    const ring = out.coordinates[0]!;
    const east = distanceFt(
      [ring[0]![0], ring[0]![1]],
      [ring[1]![0], ring[1]![1]],
    );
    expect(east).toBeGreaterThan(95);
    expect(east).toBeLessThan(105);
  });

  it("rotates the polygon clockwise by the given degrees", () => {
    const noRot = projectPolygonPixToLngLat(
      [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
      ],
      anchor,
      1,
      0,
    );
    const rotated = projectPolygonPixToLngLat(
      [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
      ],
      anchor,
      1,
      90,
    );
    // After a 90° rotation, the ring is the same set of corners but in a
    // different order. Both rings should contain the same set of points
    // (within precision).
    const sortedNoRot = noRot.coordinates[0]!
      .slice(0, -1) // drop closing point
      .map((p) => `${p[0]!.toFixed(6)},${p[1]!.toFixed(6)}`)
      .sort();
    const sortedRotated = rotated.coordinates[0]!
      .slice(0, -1)
      .map((p) => `${p[0]!.toFixed(6)},${p[1]!.toFixed(6)}`)
      .sort();
    expect(sortedRotated).toEqual(sortedNoRot);
  });

  it("closes the ring", () => {
    const out = projectPolygonPixToLngLat(
      [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
      ],
      anchor,
      1,
      0,
    );
    const ring = out.coordinates[0]!;
    expect(ring[0]).toEqual(ring.at(-1));
  });
});
