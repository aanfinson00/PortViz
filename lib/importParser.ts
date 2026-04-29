/**
 * Parse + validate an uploaded bulk-import XLSX into typed entities,
 * collecting per-row errors. Pure server-side logic — no Supabase calls,
 * no React. The caller (the API route) handles the actual DB inserts in
 * dependency order once validation is clean.
 *
 * Validation rules:
 *   - Required fields per sheet (declared in COLUMN_SPECS).
 *   - Codes coerced uppercase; must match /^[A-Z0-9]{1,10}$/.
 *   - Dates parsed via the Excel serial-number convention OR ISO strings.
 *   - Enums (status, frontage_side, etc.) checked against allowed values.
 *   - Cross-sheet references: project_code → row in Projects, etc.
 *   - Codes must be unique within their scope (project_code unique in
 *     Projects sheet, building_code unique within (project_code) etc.).
 *
 * The hints row from the template (row 2 of each sheet) is detected and
 * skipped so users don't have to delete it manually.
 */

import * as XLSX from "xlsx";

export type Row = Record<string, unknown>;

export interface RowError {
  sheet: string;
  rowIndex: number; // 1-based, including the header row
  message: string;
}

export interface ParsedProject {
  code: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  description: string | null;
}

export interface ParsedBuilding {
  projectCode: string;
  code: string;
  name: string | null;
  heightFt: number | null;
  numFloors: number;
  clearHeightFt: number | null;
  yearBuilt: number | null;
  constructionType: string | null;
  officeSf: number;
  warehouseSf: number;
  truckCourtDepthFt: number | null;
  demisingMode: "bays" | "sliders";
}

export interface ParsedBay {
  projectCode: string;
  buildingCode: string;
  ordinal: number;
  widthFt: number;
  depthFt: number;
  dockDoorCount: number;
  driveInCount: number;
  hasYardAccess: boolean;
  frontageSide: "N" | "S" | "E" | "W";
}

export interface ParsedSpace {
  projectCode: string;
  buildingCode: string;
  code: string;
  status: "vacant" | "available" | "pending" | "leased";
  targetSf: number | null;
  isPinned: boolean;
  officeSf: number | null;
  officeCorner: "front-left" | "front-right" | "rear-left" | "rear-right" | null;
  floor: number;
}

export interface ParsedTenant {
  code: string;
  name: string;
  brandColor: string | null;
}

export interface ParsedLease {
  projectCode: string;
  buildingCode: string;
  spaceCode: string;
  tenantCode: string;
  startDate: string;
  endDate: string;
  commencementDate: string | null;
  baseRentPsf: number | null;
  escalationPct: number | null;
  termMonths: number | null;
  tiAllowancePsf: number | null;
  freeRentMonths: number | null;
  commissionPsf: number | null;
  securityDeposit: number | null;
  notes: string | null;
}

export interface ParsedImport {
  projects: ParsedProject[];
  buildings: ParsedBuilding[];
  bays: ParsedBay[];
  spaces: ParsedSpace[];
  tenants: ParsedTenant[];
  leases: ParsedLease[];
  errors: RowError[];
}

const CODE_RE = /^[A-Z0-9]{1,10}$/;

/**
 * Top-level parse. Reads the workbook, walks each sheet, calls the
 * sheet-specific parser, applies cross-sheet validation, returns the
 * whole bag.
 */
export function parseImportXlsx(buf: ArrayBuffer | Uint8Array): ParsedImport {
  const errors: RowError[] = [];
  const wb = XLSX.read(buf, { type: "array", cellDates: false });

  const projects = parseProjects(wb, errors);
  const buildings = parseBuildings(wb, errors);
  const bays = parseBays(wb, errors);
  const spaces = parseSpaces(wb, errors);
  const tenants = parseTenants(wb, errors);
  const leases = parseLeases(wb, errors);

  validateReferences(
    { projects, buildings, bays, spaces, tenants, leases },
    errors,
  );

  return { projects, buildings, bays, spaces, tenants, leases, errors };
}

function readSheetRows(
  wb: XLSX.WorkBook,
  sheetName: string,
): { rows: Row[]; rowOffset: number } {
  const ws = wb.Sheets[sheetName];
  if (!ws) return { rows: [], rowOffset: 0 };

  // sheet_to_json with header:1 returns array-of-arrays; we want the first
  // row as keys (the column headers from the template).
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
    blankrows: false,
  });
  if (aoa.length === 0) return { rows: [], rowOffset: 0 };

  const headers = (aoa[0] ?? []).map((h) => String(h ?? "").trim());

  // The template's row-2 hints row would otherwise be parsed as data; detect
  // it by looking at the first column's value: required hints contain
  // 'Required', 'must match', 'A-Z', etc. Pragmatic heuristic: if every
  // non-empty cell on row 2 starts with a hint word OR is empty, skip it.
  let bodyStart = 1;
  if (aoa.length > 1) {
    const r2 = aoa[1] ?? [];
    const hintsRow = isLikelyHintsRow(r2);
    if (hintsRow) bodyStart = 2;
  }

  const rows: Row[] = [];
  for (let i = bodyStart; i < aoa.length; i++) {
    const r = aoa[i] ?? [];
    if (r.every((c) => c === null || c === undefined || c === "")) continue;
    const obj: Row = {};
    headers.forEach((h, j) => {
      obj[h] = r[j] ?? null;
    });
    obj.__rowIndex = i + 1; // 1-based for user-facing messages
    rows.push(obj);
  }
  return { rows, rowOffset: bodyStart };
}

function isLikelyHintsRow(row: unknown[]): boolean {
  const cells = row.map((c) => (c == null ? "" : String(c)));
  let hits = 0;
  for (const c of cells) {
    if (!c) continue;
    if (
      /^Required\b/i.test(c) ||
      /must match/i.test(c) ||
      /A-Z/i.test(c) ||
      /YYYY-MM-DD/i.test(c) ||
      /TRUE \| FALSE/i.test(c) ||
      /unique within/i.test(c) ||
      /default \d/i.test(c) ||
      /N \| S/i.test(c) ||
      /front-left/i.test(c) ||
      /vacant \| available/i.test(c) ||
      /bays \| sliders/i.test(c) ||
      /^hex like/i.test(c) ||
      /decimal degrees/i.test(c) ||
      /\$\/SF/i.test(c)
    ) {
      hits++;
    }
  }
  // If most non-empty cells look like hints, skip the row.
  const nonEmpty = cells.filter((c) => c).length;
  return nonEmpty > 0 && hits >= Math.max(1, Math.floor(nonEmpty / 2));
}

function asString(v: unknown): string | null {
  if (v == null || v === "") return null;
  return String(v).trim();
}

function asUpperCode(
  v: unknown,
  sheet: string,
  rowIndex: number,
  field: string,
  errors: RowError[],
  required = true,
): string | null {
  const s = asString(v);
  if (!s) {
    if (required) errors.push({ sheet, rowIndex, message: `${field} is required` });
    return null;
  }
  const u = s.toUpperCase();
  if (!CODE_RE.test(u)) {
    errors.push({
      sheet,
      rowIndex,
      message: `${field} '${s}' must be 1–10 chars, A–Z and 0–9 only`,
    });
    return null;
  }
  return u;
}

function asNumber(
  v: unknown,
  sheet: string,
  rowIndex: number,
  field: string,
  errors: RowError[],
  required = false,
): number | null {
  if (v == null || v === "") {
    if (required)
      errors.push({ sheet, rowIndex, message: `${field} is required` });
    return null;
  }
  const n = typeof v === "number" ? v : Number(String(v).trim());
  if (!Number.isFinite(n)) {
    errors.push({
      sheet,
      rowIndex,
      message: `${field} '${String(v)}' is not a valid number`,
    });
    return null;
  }
  return n;
}

function asInt(
  v: unknown,
  sheet: string,
  rowIndex: number,
  field: string,
  errors: RowError[],
  required = false,
): number | null {
  const n = asNumber(v, sheet, rowIndex, field, errors, required);
  return n == null ? null : Math.round(n);
}

function asBool(v: unknown, defaultValue = false): boolean {
  if (v == null || v === "") return defaultValue;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  return s === "true" || s === "yes" || s === "1" || s === "y";
}

/**
 * Parse a date cell. Excel serializes dates as numbers (days since 1900);
 * the template uses string dates, but we accept both. Returns ISO-8601
 * (YYYY-MM-DD) or null.
 */
function asDateISO(
  v: unknown,
  sheet: string,
  rowIndex: number,
  field: string,
  errors: RowError[],
  required = false,
): string | null {
  if (v == null || v === "") {
    if (required)
      errors.push({ sheet, rowIndex, message: `${field} is required` });
    return null;
  }
  if (typeof v === "number") {
    // Excel serial: days since 1899-12-30 (Lotus 1-2-3 quirk). Use SheetJS
    // helper indirectly by computing it ourselves to avoid version drift.
    const epoch = Date.UTC(1899, 11, 30);
    const ms = epoch + Math.round(v * 86_400_000);
    const d = new Date(ms);
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  // Accept YYYY-MM-DD and a few common variants.
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  errors.push({
    sheet,
    rowIndex,
    message: `${field} '${s}' is not a valid date (use YYYY-MM-DD)`,
  });
  return null;
}

function asEnum<T extends string>(
  v: unknown,
  allowed: readonly T[],
  sheet: string,
  rowIndex: number,
  field: string,
  errors: RowError[],
  defaultValue?: T,
): T | null {
  if (v == null || v === "") return defaultValue ?? null;
  const s = String(v).trim().toLowerCase().replace(/_/g, "-");
  for (const a of allowed) {
    if (a.toLowerCase() === s) return a;
  }
  errors.push({
    sheet,
    rowIndex,
    message: `${field} '${String(v)}' must be one of: ${allowed.join(", ")}`,
  });
  return null;
}

// ----- Per-sheet parsers ----------------------------------------------

function parseProjects(wb: XLSX.WorkBook, errors: RowError[]): ParsedProject[] {
  const sheet = "Projects";
  const { rows } = readSheetRows(wb, sheet);
  const seen = new Set<string>();
  const out: ParsedProject[] = [];
  for (const r of rows) {
    const ri = r.__rowIndex as number;
    const code = asUpperCode(r.code, sheet, ri, "code", errors);
    const name = asString(r.name);
    if (!name) errors.push({ sheet, rowIndex: ri, message: "name is required" });
    if (!code || !name) continue;
    if (seen.has(code)) {
      errors.push({
        sheet,
        rowIndex: ri,
        message: `duplicate code '${code}' (already used earlier in this sheet)`,
      });
      continue;
    }
    seen.add(code);
    out.push({
      code,
      name,
      address: asString(r.address),
      lat: asNumber(r.lat, sheet, ri, "lat", errors),
      lng: asNumber(r.lng, sheet, ri, "lng", errors),
      description: asString(r.description),
    });
  }
  return out;
}

function parseBuildings(
  wb: XLSX.WorkBook,
  errors: RowError[],
): ParsedBuilding[] {
  const sheet = "Buildings";
  const { rows } = readSheetRows(wb, sheet);
  const seen = new Set<string>();
  const out: ParsedBuilding[] = [];
  for (const r of rows) {
    const ri = r.__rowIndex as number;
    const projectCode = asUpperCode(r.project_code, sheet, ri, "project_code", errors);
    const code = asUpperCode(r.code, sheet, ri, "code", errors);
    if (!projectCode || !code) continue;
    const key = `${projectCode}|${code}`;
    if (seen.has(key)) {
      errors.push({
        sheet,
        rowIndex: ri,
        message: `duplicate (project_code, code) '${projectCode}, ${code}' earlier in this sheet`,
      });
      continue;
    }
    seen.add(key);
    out.push({
      projectCode,
      code,
      name: asString(r.name),
      heightFt: asNumber(r.height_ft, sheet, ri, "height_ft", errors),
      numFloors: asInt(r.num_floors, sheet, ri, "num_floors", errors) ?? 1,
      clearHeightFt: asNumber(r.clear_height_ft, sheet, ri, "clear_height_ft", errors),
      yearBuilt: asInt(r.year_built, sheet, ri, "year_built", errors),
      constructionType: asString(r.construction_type),
      officeSf: asInt(r.office_sf, sheet, ri, "office_sf", errors) ?? 0,
      warehouseSf: asInt(r.warehouse_sf, sheet, ri, "warehouse_sf", errors) ?? 0,
      truckCourtDepthFt: asInt(
        r.truck_court_depth_ft,
        sheet,
        ri,
        "truck_court_depth_ft",
        errors,
      ),
      demisingMode:
        asEnum(
          r.demising_mode,
          ["bays", "sliders"] as const,
          sheet,
          ri,
          "demising_mode",
          errors,
          "sliders",
        ) ?? "sliders",
    });
  }
  return out;
}

function parseBays(wb: XLSX.WorkBook, errors: RowError[]): ParsedBay[] {
  const sheet = "Bays";
  const { rows } = readSheetRows(wb, sheet);
  const out: ParsedBay[] = [];
  for (const r of rows) {
    const ri = r.__rowIndex as number;
    const projectCode = asUpperCode(r.project_code, sheet, ri, "project_code", errors);
    const buildingCode = asUpperCode(r.building_code, sheet, ri, "building_code", errors);
    const ordinal = asInt(r.ordinal, sheet, ri, "ordinal", errors, true);
    const widthFt = asNumber(r.width_ft, sheet, ri, "width_ft", errors, true);
    const depthFt = asNumber(r.depth_ft, sheet, ri, "depth_ft", errors, true);
    const frontageSide = asEnum(
      r.frontage_side,
      ["N", "S", "E", "W"] as const,
      sheet,
      ri,
      "frontage_side",
      errors,
      "S",
    );
    if (
      !projectCode ||
      !buildingCode ||
      ordinal == null ||
      widthFt == null ||
      depthFt == null ||
      !frontageSide
    ) {
      continue;
    }
    out.push({
      projectCode,
      buildingCode,
      ordinal,
      widthFt,
      depthFt,
      dockDoorCount: asInt(r.dock_door_count, sheet, ri, "dock_door_count", errors) ?? 0,
      driveInCount: asInt(r.drive_in_count, sheet, ri, "drive_in_count", errors) ?? 0,
      hasYardAccess: asBool(r.has_yard_access),
      frontageSide,
    });
  }
  return out;
}

function parseSpaces(wb: XLSX.WorkBook, errors: RowError[]): ParsedSpace[] {
  const sheet = "Spaces";
  const { rows } = readSheetRows(wb, sheet);
  const seen = new Set<string>();
  const out: ParsedSpace[] = [];
  for (const r of rows) {
    const ri = r.__rowIndex as number;
    const projectCode = asUpperCode(r.project_code, sheet, ri, "project_code", errors);
    const buildingCode = asUpperCode(r.building_code, sheet, ri, "building_code", errors);
    const code = asUpperCode(r.code, sheet, ri, "code", errors);
    if (!projectCode || !buildingCode || !code) continue;
    const key = `${projectCode}|${buildingCode}|${code}`;
    if (seen.has(key)) {
      errors.push({
        sheet,
        rowIndex: ri,
        message: `duplicate space (${projectCode}-${buildingCode}-${code}) earlier in this sheet`,
      });
      continue;
    }
    seen.add(key);
    out.push({
      projectCode,
      buildingCode,
      code,
      status:
        asEnum(
          r.status,
          ["vacant", "available", "pending", "leased"] as const,
          sheet,
          ri,
          "status",
          errors,
          "vacant",
        ) ?? "vacant",
      targetSf: asInt(r.target_sf, sheet, ri, "target_sf", errors),
      isPinned: asBool(r.is_pinned),
      officeSf: asInt(r.office_sf, sheet, ri, "office_sf", errors),
      officeCorner: asEnum(
        r.office_corner,
        ["front-left", "front-right", "rear-left", "rear-right"] as const,
        sheet,
        ri,
        "office_corner",
        errors,
      ),
      floor: asInt(r.floor, sheet, ri, "floor", errors) ?? 1,
    });
  }
  return out;
}

function parseTenants(wb: XLSX.WorkBook, errors: RowError[]): ParsedTenant[] {
  const sheet = "Tenants";
  const { rows } = readSheetRows(wb, sheet);
  const seen = new Set<string>();
  const out: ParsedTenant[] = [];
  for (const r of rows) {
    const ri = r.__rowIndex as number;
    const code = asUpperCode(r.code, sheet, ri, "code", errors);
    const name = asString(r.name);
    if (!name) errors.push({ sheet, rowIndex: ri, message: "name is required" });
    if (!code || !name) continue;
    if (seen.has(code)) {
      errors.push({
        sheet,
        rowIndex: ri,
        message: `duplicate tenant code '${code}' earlier in this sheet`,
      });
      continue;
    }
    seen.add(code);
    const brand = asString(r.brand_color);
    if (brand && !/^#?[0-9a-fA-F]{6}$/.test(brand.replace(/^#/, ""))) {
      errors.push({
        sheet,
        rowIndex: ri,
        message: `brand_color '${brand}' must be a 6-digit hex (e.g. #2563eb)`,
      });
    }
    out.push({
      code,
      name,
      brandColor: brand
        ? brand.startsWith("#")
          ? brand
          : `#${brand}`
        : null,
    });
  }
  return out;
}

function parseLeases(wb: XLSX.WorkBook, errors: RowError[]): ParsedLease[] {
  const sheet = "Leases";
  const { rows } = readSheetRows(wb, sheet);
  const out: ParsedLease[] = [];
  for (const r of rows) {
    const ri = r.__rowIndex as number;
    const projectCode = asUpperCode(r.project_code, sheet, ri, "project_code", errors);
    const buildingCode = asUpperCode(r.building_code, sheet, ri, "building_code", errors);
    const spaceCode = asUpperCode(r.space_code, sheet, ri, "space_code", errors);
    const tenantCode = asUpperCode(r.tenant_code, sheet, ri, "tenant_code", errors);
    const startDate = asDateISO(r.start_date, sheet, ri, "start_date", errors, true);
    const endDate = asDateISO(r.end_date, sheet, ri, "end_date", errors, true);
    if (
      !projectCode ||
      !buildingCode ||
      !spaceCode ||
      !tenantCode ||
      !startDate ||
      !endDate
    ) {
      continue;
    }
    if (startDate >= endDate) {
      errors.push({
        sheet,
        rowIndex: ri,
        message: `end_date (${endDate}) must be after start_date (${startDate})`,
      });
      continue;
    }
    out.push({
      projectCode,
      buildingCode,
      spaceCode,
      tenantCode,
      startDate,
      endDate,
      commencementDate: asDateISO(
        r.commencement_date,
        sheet,
        ri,
        "commencement_date",
        errors,
      ),
      baseRentPsf: asNumber(r.base_rent_psf, sheet, ri, "base_rent_psf", errors),
      escalationPct: asNumber(r.escalation_pct, sheet, ri, "escalation_pct", errors),
      termMonths: asInt(r.term_months, sheet, ri, "term_months", errors),
      tiAllowancePsf: asNumber(r.ti_allowance_psf, sheet, ri, "ti_allowance_psf", errors),
      freeRentMonths: asNumber(r.free_rent_months, sheet, ri, "free_rent_months", errors),
      commissionPsf: asNumber(r.commission_psf, sheet, ri, "commission_psf", errors),
      securityDeposit: asNumber(r.security_deposit, sheet, ri, "security_deposit", errors),
      notes: asString(r.notes),
    });
  }
  return out;
}

// ----- Cross-sheet reference checks -----------------------------------

function validateReferences(
  parsed: Omit<ParsedImport, "errors">,
  errors: RowError[],
) {
  const projectCodes = new Set(parsed.projects.map((p) => p.code));
  const buildingKeys = new Set(
    parsed.buildings.map((b) => `${b.projectCode}|${b.code}`),
  );
  const spaceKeys = new Set(
    parsed.spaces.map((s) => `${s.projectCode}|${s.buildingCode}|${s.code}`),
  );
  const tenantCodes = new Set(parsed.tenants.map((t) => t.code));

  for (const b of parsed.buildings) {
    if (!projectCodes.has(b.projectCode)) {
      errors.push({
        sheet: "Buildings",
        rowIndex: 0,
        message: `building '${b.code}' references project_code '${b.projectCode}', which is not in the Projects sheet`,
      });
    }
  }
  for (const bay of parsed.bays) {
    if (!buildingKeys.has(`${bay.projectCode}|${bay.buildingCode}`)) {
      errors.push({
        sheet: "Bays",
        rowIndex: 0,
        message: `bay references building (${bay.projectCode}-${bay.buildingCode}) that's not in the Buildings sheet`,
      });
    }
  }
  for (const s of parsed.spaces) {
    if (!buildingKeys.has(`${s.projectCode}|${s.buildingCode}`)) {
      errors.push({
        sheet: "Spaces",
        rowIndex: 0,
        message: `space '${s.code}' references building (${s.projectCode}-${s.buildingCode}) that's not in the Buildings sheet`,
      });
    }
  }
  for (const l of parsed.leases) {
    const sk = `${l.projectCode}|${l.buildingCode}|${l.spaceCode}`;
    if (!spaceKeys.has(sk)) {
      errors.push({
        sheet: "Leases",
        rowIndex: 0,
        message: `lease references space (${l.projectCode}-${l.buildingCode}-${l.spaceCode}) that's not in the Spaces sheet`,
      });
    }
    if (!tenantCodes.has(l.tenantCode)) {
      errors.push({
        sheet: "Leases",
        rowIndex: 0,
        message: `lease references tenant_code '${l.tenantCode}' that's not in the Tenants sheet`,
      });
    }
  }
}
