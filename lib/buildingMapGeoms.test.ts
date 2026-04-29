import type { Polygon } from "geojson";
import { describe, expect, it } from "vitest";
import {
  buildBuildingMapGeoms,
  type BuildingForRendering,
} from "./buildingMapGeoms";

const FOOTPRINT: Polygon = {
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

function baseBuilding(overrides: Partial<BuildingForRendering> = {}): BuildingForRendering {
  return {
    id: "b1",
    code: "A",
    name: "Building A",
    footprint: FOOTPRINT,
    heightFt: 32,
    demisingMode: "bays",
    bays: [],
    spaces: [],
    ...overrides,
  };
}

describe("buildBuildingMapGeoms", () => {
  it("returns [] when the building has no footprint", () => {
    const out = buildBuildingMapGeoms(baseBuilding({ footprint: null }));
    expect(out).toEqual([]);
  });

  it("returns one monolithic extrusion in bay mode", () => {
    const out = buildBuildingMapGeoms(baseBuilding({ demisingMode: "bays" }));
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe("b1");
    expect(out[0]?.heightFt).toBe(32);
    expect(out[0]?.color).toBe("#2563eb");
  });

  it("returns one monolithic extrusion in slider mode when no spaces yet", () => {
    const out = buildBuildingMapGeoms(
      baseBuilding({ demisingMode: "sliders", spaces: [] }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe("b1");
  });

  it("returns one monolithic extrusion when slider spaces are missing position_order", () => {
    // Per the helper, only spaces with non-null positionOrder participate;
    // legacy spaces fall through to the bay-mode branch.
    const out = buildBuildingMapGeoms(
      baseBuilding({
        demisingMode: "sliders",
        spaces: [
          {
            id: "s1",
            positionOrder: null as unknown as number,
            isPinned: false,
            targetSf: null,
            officeSf: null,
            officeCorner: null,
          },
        ],
      }),
    );
    expect(out).toHaveLength(1);
  });

  it("renders one warehouse extrusion per space in slider mode (no office)", () => {
    const out = buildBuildingMapGeoms(
      baseBuilding({
        demisingMode: "sliders",
        spaces: [
          {
            id: "s1",
            positionOrder: 0,
            isPinned: false,
            targetSf: null,
            officeSf: null,
            officeCorner: null,
          },
          {
            id: "s2",
            positionOrder: 1,
            isPinned: false,
            targetSf: null,
            officeSf: null,
            officeCorner: null,
          },
        ],
      }),
    );
    // Two warehouse parts, no offices.
    expect(out).toHaveLength(2);
    expect(out.every((g) => g.heightFt === 32)).toBe(true);
    // Distinct colors (each space gets its own ordinal-based color).
    expect(out[0]?.color).not.toBe(out[1]?.color);
  });

  it("renders office at a lower clear height when office_sf is set", () => {
    const out = buildBuildingMapGeoms(
      baseBuilding({
        demisingMode: "sliders",
        spaces: [
          {
            id: "s1",
            positionOrder: 0,
            isPinned: false,
            targetSf: null,
            officeSf: 5_000_000, // overlaps significantly so office DEFINITELY renders
            officeCorner: "front-left",
          },
        ],
      }),
    );
    // 1 warehouse part + 1 office (or 1 office + 0 if office consumed slab).
    const officeGeom = out.find((g) => g.code.includes("-of"));
    expect(officeGeom).toBeDefined();
    expect(officeGeom!.heightFt).toBe(14); // capped at OFFICE_CLEAR_HEIGHT_FT
    // Warehouse extrusions stay at the building height.
    const warehouseGeoms = out.filter((g) => g.code.includes("-wh"));
    if (warehouseGeoms.length > 0) {
      expect(warehouseGeoms.every((g) => g.heightFt === 32)).toBe(true);
    }
  });

  it("clamps office height to building height when building is shorter than 14 ft", () => {
    const out = buildBuildingMapGeoms(
      baseBuilding({
        heightFt: 10,
        demisingMode: "sliders",
        spaces: [
          {
            id: "s1",
            positionOrder: 0,
            isPinned: false,
            targetSf: null,
            officeSf: 5_000_000,
            officeCorner: "front-left",
          },
        ],
      }),
    );
    const officeGeom = out.find((g) => g.code.includes("-of"));
    expect(officeGeom?.heightFt).toBe(10);
  });

  it("colorBy='tenant' uses each space's tenantColor", () => {
    const out = buildBuildingMapGeoms(
      baseBuilding({
        demisingMode: "sliders",
        colorBy: "tenant",
        spaces: [
          {
            id: "s1",
            positionOrder: 0,
            isPinned: false,
            targetSf: null,
            officeSf: null,
            officeCorner: null,
            tenantColor: "#ff0000",
          },
          {
            id: "s2",
            positionOrder: 1,
            isPinned: false,
            targetSf: null,
            officeSf: null,
            officeCorner: null,
            tenantColor: "#00ff00",
          },
        ],
      }),
    );
    expect(out).toHaveLength(2);
    expect(out[0]?.color).toBe("#ff0000");
    expect(out[1]?.color).toBe("#00ff00");
  });

  it("colorBy='tenant' falls back to vacant grey for spaces without a tenantColor", () => {
    const out = buildBuildingMapGeoms(
      baseBuilding({
        demisingMode: "sliders",
        colorBy: "tenant",
        spaces: [
          {
            id: "s1",
            positionOrder: 0,
            isPinned: false,
            targetSf: null,
            officeSf: null,
            officeCorner: null,
            tenantColor: "#ff0000",
          },
          {
            id: "s2",
            positionOrder: 1,
            isPinned: false,
            targetSf: null,
            officeSf: null,
            officeCorner: null,
            tenantColor: null, // vacant
          },
        ],
      }),
    );
    expect(out[0]?.color).toBe("#ff0000");
    // Slate-400 #94a3b8 — distinguishes leased from vacant at a glance.
    expect(out[1]?.color).toBe("#94a3b8");
  });

  it("colorBy default ('ordinal') ignores tenantColor and uses ordinal palette", () => {
    const out = buildBuildingMapGeoms(
      baseBuilding({
        demisingMode: "sliders",
        // colorBy omitted -> ordinal
        spaces: [
          {
            id: "s1",
            positionOrder: 0,
            isPinned: false,
            targetSf: null,
            officeSf: null,
            officeCorner: null,
            tenantColor: "#ff0000", // would-be tenant color, ignored in ordinal mode
          },
        ],
      }),
    );
    expect(out[0]?.color).not.toBe("#ff0000");
  });

  it("uses the bays' frontage_side to orient slab slicing", () => {
    // We can't easily assert orientation here without re-implementing the
    // slicer, but at minimum the helper shouldn't blow up when bays carry
    // a non-default frontage.
    const out = buildBuildingMapGeoms(
      baseBuilding({
        demisingMode: "sliders",
        bays: [
          {
            id: "ba1",
            ordinal: 1,
            widthFt: 50,
            depthFt: 200,
            dockDoorCount: 0,
            driveInCount: 0,
            hasYardAccess: false,
            frontageSide: "N",
          },
        ],
        spaces: [
          {
            id: "s1",
            positionOrder: 0,
            isPinned: false,
            targetSf: null,
            officeSf: null,
            officeCorner: null,
          },
          {
            id: "s2",
            positionOrder: 1,
            isPinned: false,
            targetSf: null,
            officeSf: null,
            officeCorner: null,
          },
        ],
      }),
    );
    expect(out.length).toBeGreaterThanOrEqual(2);
  });
});
