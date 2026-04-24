import type { Polygon } from "geojson";
import { describe, expect, it } from "vitest";
import type { Bay } from "./demising";
import { footprintBbox, splitFootprintIntoBays } from "./geometry";

const RECT: Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [-100, 40],
      [-99, 40],
      [-99, 41],
      [-100, 41],
      [-100, 40],
    ],
  ],
};

function bay(partial: Partial<Bay> & Pick<Bay, "id" | "ordinal">): Bay {
  return {
    widthFt: 50,
    depthFt: 200,
    dockDoorCount: 0,
    driveInCount: 0,
    hasYardAccess: false,
    frontageSide: "S",
    ...partial,
  };
}

describe("footprintBbox", () => {
  it("returns min/max lng+lat for a rectangle", () => {
    expect(footprintBbox(RECT)).toEqual({
      minLng: -100,
      maxLng: -99,
      minLat: 40,
      maxLat: 41,
    });
  });
});

describe("splitFootprintIntoBays", () => {
  it("produces N polygons proportional to bay widths for S frontage", () => {
    const bays = [
      bay({ id: "b1", ordinal: 1, widthFt: 100 }),
      bay({ id: "b2", ordinal: 2, widthFt: 200 }),
      bay({ id: "b3", ordinal: 3, widthFt: 100 }),
    ];
    const out = splitFootprintIntoBays(RECT, bays, "S");
    expect(Object.keys(out)).toEqual(["b1", "b2", "b3"]);

    const r1 = out.b1!.coordinates[0]!;
    const r2 = out.b2!.coordinates[0]!;
    const r3 = out.b3!.coordinates[0]!;
    // b1 covers 0-25% of [-100, -99] → [-100, -99.75]
    expect(r1[0]![0]).toBeCloseTo(-100);
    expect(r1[1]![0]).toBeCloseTo(-99.75);
    // b2 covers 25%-75% → [-99.75, -99.25]
    expect(r2[0]![0]).toBeCloseTo(-99.75);
    expect(r2[1]![0]).toBeCloseTo(-99.25);
    // b3 covers 75%-100% → [-99.25, -99]
    expect(r3[0]![0]).toBeCloseTo(-99.25);
    expect(r3[1]![0]).toBeCloseTo(-99);
  });

  it("slices along latitude for E/W frontage", () => {
    const bays = [
      bay({ id: "b1", ordinal: 1, widthFt: 100, frontageSide: "E" }),
      bay({ id: "b2", ordinal: 2, widthFt: 100, frontageSide: "E" }),
    ];
    const out = splitFootprintIntoBays(RECT, bays, "E");
    const r1 = out.b1!.coordinates[0]!;
    const r2 = out.b2!.coordinates[0]!;
    // b1 bottom half latitude: [40, 40.5]
    expect(r1[0]![1]).toBeCloseTo(40);
    expect(r1[2]![1]).toBeCloseTo(40.5);
    // b2 top half: [40.5, 41]
    expect(r2[0]![1]).toBeCloseTo(40.5);
    expect(r2[2]![1]).toBeCloseTo(41);
  });

  it("returns an empty object for zero bays", () => {
    expect(splitFootprintIntoBays(RECT, [], "S")).toEqual({});
  });
});
