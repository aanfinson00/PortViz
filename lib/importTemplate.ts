/**
 * Generate the bulk-import XLSX template. Six data sheets (Projects,
 * Buildings, Bays, Spaces, Tenants, Leases) plus an Instructions sheet
 * up front. Pure function — returns a Uint8Array buffer the API route
 * can stream back as a download.
 *
 * The template includes column headers, a one-row example for each
 * sheet (intended to be deleted before import), and inline "Required:"
 * markers in the example so the user knows which cells must be filled.
 *
 * Polygons (footprints, parcels, parking, yard) and access-point pins
 * are intentionally NOT in the template — they don't flatten into rows
 * cleanly, and most users only need spatial detail on a subset of
 * buildings. The user traces those in the UI after the bulk import.
 */

import * as XLSX from "xlsx";

interface SheetSpec {
  name: string;
  headers: string[];
  example: Array<string | number | boolean>;
  /** Per-column hint shown under the header row (optional). */
  hints?: string[];
}

const SHEETS: SheetSpec[] = [
  {
    name: "Projects",
    headers: ["code", "name", "address", "lat", "lng", "description"],
    hints: [
      "A-Z 0-9, max 10",
      "Required",
      "",
      "decimal degrees",
      "decimal degrees",
      "",
    ],
    example: [
      "ACME",
      "Acme Industrial Park",
      "100 Industrial Way, Dallas TX",
      32.7767,
      -96.797,
      "Class A industrial park near I-35",
    ],
  },
  {
    name: "Buildings",
    headers: [
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
    hints: [
      "must match Projects.code",
      "A-Z 0-9, unique within project",
      "",
      "overall height in ft",
      "default 1",
      "interior clear",
      "",
      "tilt-up, masonry, etc.",
      "",
      "",
      "feet to property line",
      "bays | sliders (default)",
    ],
    example: [
      "ACME",
      "A",
      "Building A",
      32,
      1,
      30,
      2018,
      "tilt-up",
      8000,
      92000,
      130,
      "sliders",
    ],
  },
  {
    name: "Bays",
    headers: [
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
    hints: [
      "",
      "",
      "1, 2, 3, ...",
      "",
      "",
      "default 0",
      "default 0",
      "TRUE | FALSE",
      "N | S | E | W",
    ],
    example: ["ACME", "A", 1, 50, 200, 4, 0, true, "S"],
  },
  {
    name: "Spaces",
    headers: [
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
    hints: [
      "",
      "",
      "unique within building",
      "vacant | available | pending | leased",
      "pinned SF when is_pinned",
      "TRUE | FALSE",
      "office target SF",
      "front-left | front-right | rear-left | rear-right",
      "default 1",
    ],
    example: [
      "ACME",
      "A",
      "101",
      "available",
      50000,
      true,
      5000,
      "front-left",
      1,
    ],
  },
  {
    name: "Tenants",
    headers: ["code", "name", "brand_color"],
    hints: ["unique within org", "Required", "hex like #2563eb"],
    example: ["LOGISTICO", "Logistico Worldwide", "#2563eb"],
  },
  {
    name: "Leases",
    headers: [
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
    hints: [
      "",
      "",
      "",
      "must match Tenants.code",
      "YYYY-MM-DD",
      "YYYY-MM-DD",
      "YYYY-MM-DD (optional)",
      "$/SF/yr",
      "annual %",
      "",
      "$/SF",
      "months",
      "$/SF",
      "$",
      "",
    ],
    example: [
      "ACME",
      "A",
      "101",
      "LOGISTICO",
      "2025-04-01",
      "2030-03-31",
      "2025-04-01",
      8.5,
      3,
      60,
      5,
      2,
      0.5,
      50000,
      "",
    ],
  },
];

const INSTRUCTIONS: string[][] = [
  ["PortViz bulk import — fill out the sheets, then upload at /app/import"],
  [],
  ["Order"],
  [
    "1. Projects — top of the hierarchy. Codes are alphanumeric uppercase, max 10 chars.",
  ],
  [
    "2. Buildings — each row references a project by code. Codes are unique within the project.",
  ],
  [
    "3. Bays (optional) — structural column grid. Skip if you'll just use slider demising without seeing the column lines.",
  ],
  [
    "4. Spaces — each row references a building by (project_code, building_code).",
  ],
  ["5. Tenants — flat list, codes unique within your org."],
  [
    "6. Leases — each row references a space by (project_code, building_code, space_code) and a tenant by code.",
  ],
  [],
  ["Rules"],
  ["- Codes are case-insensitive; we uppercase them automatically."],
  ["- Booleans: TRUE / FALSE (Excel handles natively)."],
  ["- Dates: YYYY-MM-DD (e.g. 2025-04-01)."],
  ["- Required cells are flagged in the column hints row."],
  [
    "- Polygons (footprints, parcels, parking, yards) are not in the template — trace those in the app's UI after the bulk import.",
  ],
  ["- Documents (PDFs, plans) need to be uploaded individually."],
  [],
  ["What happens when you upload"],
  [
    "- We validate every row first. If anything's wrong, you get a per-row error report and nothing is inserted.",
  ],
  [
    "- If everything passes, all rows commit in dependency order (Projects → Buildings → Bays → Spaces → Tenants → Leases).",
  ],
  [
    "- Duplicates fail the import. If a project_code already exists in your org, fix the row or remove it from the file.",
  ],
  [],
  ["Tips"],
  [
    "- Delete the example row in each sheet before you fill in your own data.",
  ],
  ["- Don't rename the sheets or columns; the parser is strict on names."],
];

/**
 * Build the workbook in memory and return a Uint8Array. Caller
 * (typically the API route) returns it with the appropriate
 * Content-Type + Content-Disposition headers.
 */
export function buildImportTemplate(): Uint8Array {
  const wb = XLSX.utils.book_new();

  // Instructions sheet first.
  const instructions = XLSX.utils.aoa_to_sheet(INSTRUCTIONS);
  instructions["!cols"] = [{ wch: 110 }];
  XLSX.utils.book_append_sheet(wb, instructions, "Instructions");

  // One sheet per entity.
  for (const spec of SHEETS) {
    const rows: Array<Array<string | number | boolean>> = [
      [...spec.headers],
    ];
    if (spec.hints && spec.hints.length === spec.headers.length) {
      rows.push([...spec.hints]);
    }
    rows.push([...spec.example]);
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = spec.headers.map(() => ({ wch: 18 }));
    // Freeze the header row so users keep their bearings while scrolling.
    ws["!freeze"] = { xSplit: 0, ySplit: 1 } as never;
    XLSX.utils.book_append_sheet(wb, ws, spec.name);
  }

  const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Uint8Array(buffer);
}

export const IMPORT_SHEET_NAMES = SHEETS.map((s) => s.name);
