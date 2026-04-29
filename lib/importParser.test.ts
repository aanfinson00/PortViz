import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildImportTemplate } from "./importTemplate";
import { parseImportXlsx } from "./importParser";

/**
 * Build a minimal in-memory XLSX workbook from sheet name → array of
 * rows (with a header row first). Used to drive the parser without
 * round-tripping through the on-disk template.
 */
function buildXlsx(
  sheets: Record<string, Array<Array<string | number | boolean | null>>>,
): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}

describe("parseImportXlsx — happy path", () => {
  it("parses a small portfolio across all six sheets", () => {
    const buf = buildXlsx({
      Projects: [
        ["code", "name", "address", "lat", "lng", "description"],
        ["ACME", "Acme Park", null, 32.78, -96.79, null],
      ],
      Buildings: [
        [
          "project_code",
          "code",
          "name",
          "height_ft",
          "num_floors",
          "clear_height_ft",
          "year_built",
          "construction_type",
          "office_sf",
          "warehouse_sf",
          "truck_court_depth_ft",
          "demising_mode",
        ],
        ["ACME", "A", "Building A", 32, 1, 30, 2018, "tilt-up", 8000, 92000, 130, "sliders"],
      ],
      Bays: [
        [
          "project_code",
          "building_code",
          "ordinal",
          "width_ft",
          "depth_ft",
          "dock_door_count",
          "drive_in_count",
          "has_yard_access",
          "frontage_side",
        ],
        ["ACME", "A", 1, 50, 200, 4, 0, true, "S"],
      ],
      Spaces: [
        [
          "project_code",
          "building_code",
          "code",
          "status",
          "target_sf",
          "is_pinned",
          "office_sf",
          "office_corner",
          "floor",
        ],
        ["ACME", "A", "101", "available", 50000, true, 5000, "front-left", 1],
      ],
      Tenants: [
        ["code", "name", "brand_color"],
        ["LOGISTICO", "Logistico", "#2563eb"],
      ],
      Leases: [
        [
          "project_code",
          "building_code",
          "space_code",
          "tenant_code",
          "start_date",
          "end_date",
          "commencement_date",
          "base_rent_psf",
          "escalation_pct",
          "term_months",
          "ti_allowance_psf",
          "free_rent_months",
          "commission_psf",
          "security_deposit",
          "notes",
        ],
        [
          "ACME",
          "A",
          "101",
          "LOGISTICO",
          "2025-04-01",
          "2030-03-31",
          null,
          8.5,
          3,
          60,
          5,
          2,
          0.5,
          50000,
          null,
        ],
      ],
    });

    const out = parseImportXlsx(buf);
    expect(out.errors).toEqual([]);
    expect(out.projects).toHaveLength(1);
    expect(out.projects[0]?.code).toBe("ACME");
    expect(out.buildings).toHaveLength(1);
    expect(out.buildings[0]?.demisingMode).toBe("sliders");
    expect(out.bays).toHaveLength(1);
    expect(out.bays[0]?.hasYardAccess).toBe(true);
    expect(out.spaces).toHaveLength(1);
    expect(out.spaces[0]?.officeCorner).toBe("front-left");
    expect(out.tenants[0]?.brandColor).toBe("#2563eb");
    expect(out.leases).toHaveLength(1);
    expect(out.leases[0]?.startDate).toBe("2025-04-01");
  });

  it("uppercases lowercase codes automatically", () => {
    const buf = buildXlsx({
      Projects: [
        ["code", "name"],
        ["acme", "Acme"],
      ],
      Buildings: [
        ["project_code", "code", "name", "height_ft"],
        ["acme", "a", "A", 32],
      ],
    });
    const out = parseImportXlsx(buf);
    expect(out.projects[0]?.code).toBe("ACME");
    expect(out.buildings[0]?.code).toBe("A");
    expect(out.errors).toEqual([]);
  });

  it("skips the template's hints row automatically", () => {
    const buf = buildXlsx({
      Projects: [
        ["code", "name", "address"],
        ["A-Z 0-9, max 10", "Required", ""], // hints row from the template
        ["ACME", "Acme Park", "100 Industrial Way"],
      ],
    });
    const out = parseImportXlsx(buf);
    expect(out.projects).toHaveLength(1);
    expect(out.projects[0]?.code).toBe("ACME");
  });
});

describe("parseImportXlsx — validation errors", () => {
  it("flags missing required fields", () => {
    const buf = buildXlsx({
      Projects: [
        ["code", "name"],
        ["", "Acme"], // missing code
        ["ACME", ""], // missing name
      ],
    });
    const out = parseImportXlsx(buf);
    expect(out.errors.length).toBeGreaterThanOrEqual(2);
    expect(out.errors.some((e) => /code is required/.test(e.message))).toBe(true);
    expect(out.errors.some((e) => /name is required/.test(e.message))).toBe(true);
  });

  it("rejects malformed codes (lowercase OK; symbols not)", () => {
    const buf = buildXlsx({
      Projects: [
        ["code", "name"],
        ["ACME-1!", "Bad"],
      ],
    });
    const out = parseImportXlsx(buf);
    expect(out.errors.length).toBe(1);
    expect(out.errors[0]?.message).toMatch(/A–Z and 0–9/);
  });

  it("flags duplicate codes within a single sheet", () => {
    const buf = buildXlsx({
      Projects: [
        ["code", "name"],
        ["ACME", "First"],
        ["ACME", "Second"],
      ],
    });
    const out = parseImportXlsx(buf);
    expect(out.errors.some((e) => /duplicate/.test(e.message))).toBe(true);
  });

  it("flags cross-sheet broken references", () => {
    const buf = buildXlsx({
      Projects: [
        ["code", "name"],
        ["ACME", "Acme"],
      ],
      Buildings: [
        ["project_code", "code", "name", "height_ft"],
        ["NONEXISTENT", "A", "A", 32],
      ],
    });
    const out = parseImportXlsx(buf);
    expect(
      out.errors.some((e) =>
        /project_code 'NONEXISTENT'/.test(e.message),
      ),
    ).toBe(true);
  });

  it("rejects end_date before start_date on leases", () => {
    const buf = buildXlsx({
      Projects: [
        ["code", "name"],
        ["ACME", "Acme"],
      ],
      Buildings: [
        ["project_code", "code", "name", "height_ft"],
        ["ACME", "A", "A", 32],
      ],
      Spaces: [
        ["project_code", "building_code", "code", "status"],
        ["ACME", "A", "101", "available"],
      ],
      Tenants: [
        ["code", "name"],
        ["LOGI", "Logi"],
      ],
      Leases: [
        ["project_code", "building_code", "space_code", "tenant_code", "start_date", "end_date"],
        ["ACME", "A", "101", "LOGI", "2030-01-01", "2025-01-01"],
      ],
    });
    const out = parseImportXlsx(buf);
    expect(
      out.errors.some((e) => /end_date.*must be after start_date/.test(e.message)),
    ).toBe(true);
  });

  it("rejects unknown enums (status, frontage_side, etc.)", () => {
    const buf = buildXlsx({
      Projects: [
        ["code", "name"],
        ["ACME", "Acme"],
      ],
      Buildings: [
        ["project_code", "code", "name", "height_ft"],
        ["ACME", "A", "A", 32],
      ],
      Spaces: [
        ["project_code", "building_code", "code", "status"],
        ["ACME", "A", "101", "haunted"],
      ],
    });
    const out = parseImportXlsx(buf);
    expect(out.errors.some((e) => /status.*must be one of/.test(e.message))).toBe(true);
  });
});

describe("template round-trip", () => {
  it("the generated template parses cleanly through parseImportXlsx", () => {
    const buf = buildImportTemplate();
    const out = parseImportXlsx(buf);
    // Template includes one example row per sheet that should validate.
    expect(out.projects.length).toBe(1);
    expect(out.buildings.length).toBe(1);
    expect(out.spaces.length).toBe(1);
    expect(out.tenants.length).toBe(1);
    expect(out.leases.length).toBe(1);
    expect(out.errors).toEqual([]);
  });
});
