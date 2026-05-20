/**
 * Parse + validate an uploaded leasing-prospect XLSX into typed records.
 * Mirrors lib/importParser.ts' style: pure server-side, collects per-row
 * errors, the caller (the API route) handles DB upserts in dependency
 * order once validation passes.
 *
 * Upsert semantics: rows with a `code` are upsert keys (insert if new,
 * update existing). Rows without a `code` always insert. Brokers can
 * re-upload an updated pipeline weekly without creating duplicates.
 */

import * as XLSX from "xlsx";
import {
  PROSPECT_SOURCES,
  PROSPECT_STAGES,
} from "@/server/trpc/routers/leasingProspect";

export type Row = Record<string, unknown>;

export interface RowError {
  sheet: string;
  rowIndex: number;
  message: string;
}

export interface ParsedProspect {
  /** Row number in the source XLSX, for error reporting. */
  rowIndex: number;
  code: string | null;
  name: string;
  stage: (typeof PROSPECT_STAGES)[number];
  source: (typeof PROSPECT_SOURCES)[number] | null;
  projectCode: string | null;
  buildingCode: string | null;
  spaceCode: string | null;
  brokerCompany: string | null;
  brokerName: string | null;
  brokerEmail: string | null;
  brokerPhone: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  requestedSf: number | null;
  targetCommencement: string | null;
  termMonths: number | null;
  askingRentPsf: number | null;
  proposedRentPsf: number | null;
  tiAllowancePsf: number | null;
  freeRentMonths: number | null;
  probabilityPct: number | null;
  lastActivityDate: string | null;
  nextAction: string | null;
  nextActionDate: string | null;
  lostReason: string | null;
  notes: string | null;
}

export interface ParsedLeasingProspectImport {
  prospects: ParsedProspect[];
  errors: RowError[];
}

const SHEET_NAME = "Prospects";

export function parseLeasingProspectXlsx(
  buf: ArrayBuffer | Uint8Array,
): ParsedLeasingProspectImport {
  const errors: RowError[] = [];
  const wb = XLSX.read(buf, { type: "array", cellDates: false });
  const ws = wb.Sheets[SHEET_NAME];
  if (!ws) {
    errors.push({
      sheet: SHEET_NAME,
      rowIndex: 0,
      message: `No "${SHEET_NAME}" sheet found. Download the template and fill in the Prospects sheet.`,
    });
    return { prospects: [], errors };
  }

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
    blankrows: false,
  });
  if (aoa.length === 0) return { prospects: [], errors };

  const headers = (aoa[0] ?? []).map((h) => String(h ?? "").trim());

  // Skip the row-2 hints if present.
  let bodyStart = 1;
  if (aoa.length > 1 && isLikelyHintsRow(aoa[1] ?? [])) bodyStart = 2;

  const rows: Row[] = [];
  for (let i = bodyStart; i < aoa.length; i++) {
    const r = aoa[i] ?? [];
    if (r.every((c) => c === null || c === undefined || c === "")) continue;
    const obj: Row = {};
    headers.forEach((h, j) => {
      obj[h] = r[j] ?? null;
    });
    obj.__rowIndex = i + 1;
    rows.push(obj);
  }

  const seenCodes = new Set<string>();
  const prospects: ParsedProspect[] = [];
  for (const r of rows) {
    const ri = r.__rowIndex as number;
    const name = asString(r.name);
    if (!name) {
      errors.push({ sheet: SHEET_NAME, rowIndex: ri, message: "name is required" });
      continue;
    }
    const code = asString(r.code);
    if (code && seenCodes.has(code.toLowerCase())) {
      errors.push({
        sheet: SHEET_NAME,
        rowIndex: ri,
        message: `duplicate code '${code}' earlier in this sheet`,
      });
      continue;
    }
    if (code) seenCodes.add(code.toLowerCase());

    const stage =
      asEnum(
        r.stage,
        PROSPECT_STAGES,
        SHEET_NAME,
        ri,
        "stage",
        errors,
        "prospect",
      ) ?? "prospect";

    const source = asEnum(
      r.source,
      PROSPECT_SOURCES,
      SHEET_NAME,
      ri,
      "source",
      errors,
    );

    prospects.push({
      rowIndex: ri,
      code,
      name,
      stage,
      source,
      projectCode: asUpperCodeMaybe(r.project_code, SHEET_NAME, ri, "project_code", errors),
      buildingCode: asUpperCodeMaybe(r.building_code, SHEET_NAME, ri, "building_code", errors),
      spaceCode: asUpperCodeMaybe(r.space_code, SHEET_NAME, ri, "space_code", errors),
      brokerCompany: asString(r.broker_company),
      brokerName: asString(r.broker_name),
      brokerEmail: asEmailMaybe(r.broker_email, SHEET_NAME, ri, "broker_email", errors),
      brokerPhone: asString(r.broker_phone),
      contactName: asString(r.contact_name),
      contactEmail: asEmailMaybe(r.contact_email, SHEET_NAME, ri, "contact_email", errors),
      contactPhone: asString(r.contact_phone),
      requestedSf: asInt(r.requested_sf, SHEET_NAME, ri, "requested_sf", errors),
      targetCommencement: asDateISO(
        r.target_commencement,
        SHEET_NAME,
        ri,
        "target_commencement",
        errors,
      ),
      termMonths: asInt(r.term_months, SHEET_NAME, ri, "term_months", errors),
      askingRentPsf: asNumber(r.asking_rent_psf, SHEET_NAME, ri, "asking_rent_psf", errors),
      proposedRentPsf: asNumber(
        r.proposed_rent_psf,
        SHEET_NAME,
        ri,
        "proposed_rent_psf",
        errors,
      ),
      tiAllowancePsf: asNumber(
        r.ti_allowance_psf,
        SHEET_NAME,
        ri,
        "ti_allowance_psf",
        errors,
      ),
      freeRentMonths: asNumber(
        r.free_rent_months,
        SHEET_NAME,
        ri,
        "free_rent_months",
        errors,
      ),
      probabilityPct: asPercent(r.probability_pct, SHEET_NAME, ri, "probability_pct", errors),
      lastActivityDate: asDateISO(
        r.last_activity_date,
        SHEET_NAME,
        ri,
        "last_activity_date",
        errors,
      ),
      nextAction: asString(r.next_action),
      nextActionDate: asDateISO(
        r.next_action_date,
        SHEET_NAME,
        ri,
        "next_action_date",
        errors,
      ),
      lostReason: asString(r.lost_reason),
      notes: asString(r.notes),
    });
  }

  return { prospects, errors };
}

// ----- helpers (duplicated from importParser.ts to keep this file
// self-contained; the file-level docstring describes the contract).

function isLikelyHintsRow(row: unknown[]): boolean {
  const cells = row.map((c) => (c == null ? "" : String(c)));
  let hits = 0;
  for (const c of cells) {
    if (!c) continue;
    if (
      /^Required\b/i.test(c) ||
      /must match/i.test(c) ||
      /optional/i.test(c) ||
      /YYYY-MM-DD/i.test(c) ||
      /prospect \| tour/i.test(c) ||
      /cold_call/i.test(c) ||
      /\$\/SF/i.test(c) ||
      /^0-100/i.test(c) ||
      /^months\b/i.test(c)
    ) {
      hits++;
    }
  }
  const nonEmpty = cells.filter((c) => c).length;
  return nonEmpty > 0 && hits >= Math.max(1, Math.floor(nonEmpty / 2));
}

function asString(v: unknown): string | null {
  if (v == null || v === "") return null;
  return String(v).trim();
}

function asUpperCodeMaybe(
  v: unknown,
  sheet: string,
  rowIndex: number,
  field: string,
  errors: RowError[],
): string | null {
  const s = asString(v);
  if (!s) return null;
  const u = s.toUpperCase();
  if (!/^[A-Z0-9]{1,10}$/.test(u)) {
    errors.push({
      sheet,
      rowIndex,
      message: `${field} '${s}' must be 1-10 chars, A-Z and 0-9 only`,
    });
    return null;
  }
  return u;
}

function asEmailMaybe(
  v: unknown,
  sheet: string,
  rowIndex: number,
  field: string,
  errors: RowError[],
): string | null {
  const s = asString(v);
  if (!s) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
    errors.push({
      sheet,
      rowIndex,
      message: `${field} '${s}' is not a valid email`,
    });
    return null;
  }
  return s;
}

function asNumber(
  v: unknown,
  sheet: string,
  rowIndex: number,
  field: string,
  errors: RowError[],
): number | null {
  if (v == null || v === "") return null;
  const n =
    typeof v === "number"
      ? v
      : Number(String(v).trim().replace(/[$,]/g, ""));
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
): number | null {
  const n = asNumber(v, sheet, rowIndex, field, errors);
  return n == null ? null : Math.round(n);
}

function asPercent(
  v: unknown,
  sheet: string,
  rowIndex: number,
  field: string,
  errors: RowError[],
): number | null {
  // Accept trailing '%' before delegating to asNumber.
  const cleaned =
    typeof v === "string" ? v.replace(/%\s*$/, "").trim() : v;
  const n = asNumber(cleaned, sheet, rowIndex, field, errors);
  if (n == null) return null;
  // Accept "25", "25%", or 0.25 — normalize to 0-100 integer.
  const normalized = n <= 1 ? Math.round(n * 100) : Math.round(n);
  if (normalized < 0 || normalized > 100) {
    errors.push({
      sheet,
      rowIndex,
      message: `${field} '${String(v)}' must be between 0 and 100`,
    });
    return null;
  }
  return normalized;
}

function asDateISO(
  v: unknown,
  sheet: string,
  rowIndex: number,
  field: string,
  errors: RowError[],
): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    const epoch = Date.UTC(1899, 11, 30);
    const ms = epoch + Math.round(v * 86_400_000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
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
  const s = String(v).trim().toLowerCase().replace(/[\s-]/g, "_");
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
