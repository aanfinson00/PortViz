/**
 * Parse + validate an uploaded comps XLSX (or CSV) into typed rows. Pure
 * client-side helper — the page calls this against an ArrayBuffer and ships
 * the resulting rows to the `comp.bulkUpsert` mutation. Mirrors the shape
 * of `lib/importParser.ts` but with a single flat sheet, no cross-refs,
 * and no required code/uppercase rules (comps are free-text by nature).
 *
 * Recognized columns (case-insensitive, underscores or spaces fine):
 *   tenant_name, building_name, address, city, state, lng, lat, sf,
 *   rent_psf, lease_type, term_months, deal_date, source, notes, kind
 *
 * Required: at minimum one of (tenant_name | building_name | address) plus
 * sf or rent_psf — i.e. enough to identify the deal and read a metric off it.
 */

import * as XLSX from "xlsx";

export type CompKind = "lease" | "sale";
export type CompLeaseType =
  | "nnn"
  | "modified_gross"
  | "gross"
  | "absolute_net"
  | "percentage"
  | "other";

export interface ParsedComp {
  kind: CompKind;
  tenantName: string | null;
  buildingName: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  lng: number | null;
  lat: number | null;
  sf: number | null;
  rentPsf: number | null;
  leaseType: CompLeaseType | null;
  termMonths: number | null;
  dealDate: string | null;
  source: string | null;
  notes: string | null;
}

export interface CompRowError {
  rowIndex: number;
  message: string;
}

export interface ParsedCompImport {
  comps: ParsedComp[];
  errors: CompRowError[];
}

const HEADER_ALIASES: Record<string, string> = {
  tenant: "tenant_name",
  tenant_name: "tenant_name",
  building: "building_name",
  building_name: "building_name",
  property: "building_name",
  address: "address",
  street: "address",
  city: "city",
  state: "state",
  lng: "lng",
  longitude: "lng",
  lon: "lng",
  lat: "lat",
  latitude: "lat",
  sf: "sf",
  size: "sf",
  square_feet: "sf",
  squarefeet: "sf",
  rent: "rent_psf",
  rent_psf: "rent_psf",
  rent_per_sf: "rent_psf",
  base_rent: "rent_psf",
  lease_type: "lease_type",
  type: "lease_type",
  term: "term_months",
  term_months: "term_months",
  deal_date: "deal_date",
  date: "deal_date",
  signed_date: "deal_date",
  source: "source",
  notes: "notes",
  comments: "notes",
  kind: "kind",
};

const LEASE_TYPES: readonly CompLeaseType[] = [
  "nnn",
  "modified_gross",
  "gross",
  "absolute_net",
  "percentage",
  "other",
];

function normalizeHeader(raw: string): string | null {
  const k = raw.trim().toLowerCase().replace(/\s+/g, "_");
  return HEADER_ALIASES[k] ?? null;
}

function asString(v: unknown): string | null {
  if (v == null || v === "") return null;
  return String(v).trim() || null;
}

function asNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,]/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function asInt(v: unknown): number | null {
  const n = asNumber(v);
  return n == null ? null : Math.round(n);
}

function asDateISO(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    // Excel serial date — same epoch trick the main importer uses.
    const epoch = Date.UTC(1899, 11, 30);
    const ms = epoch + Math.round(v * 86_400_000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    return `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function asLeaseType(v: unknown): CompLeaseType | null {
  if (v == null || v === "") return null;
  const s = String(v).trim().toLowerCase().replace(/[\s-]/g, "_");
  if (s === "nnn" || s === "triple_net") return "nnn";
  if (s === "mg" || s === "modified" || s === "modified_gross") {
    return "modified_gross";
  }
  if (s === "gross") return "gross";
  if (s === "absolute_net" || s === "abs_net") return "absolute_net";
  if (s === "percentage" || s === "%") return "percentage";
  if ((LEASE_TYPES as readonly string[]).includes(s)) {
    return s as CompLeaseType;
  }
  return "other";
}

function asKind(v: unknown): CompKind {
  if (v == null || v === "") return "lease";
  const s = String(v).trim().toLowerCase();
  return s === "sale" ? "sale" : "lease";
}

/**
 * Parse the first sheet of a workbook (or a CSV) into typed comp rows.
 * The first row is treated as headers; unrecognized headers are silently
 * dropped. We accept loose column naming because brokers paste from a
 * dozen different sources.
 */
export function parseCompsXlsx(buf: ArrayBuffer | Uint8Array): ParsedCompImport {
  const errors: CompRowError[] = [];
  const wb = XLSX.read(buf, { type: "array", cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { comps: [], errors };
  const ws = wb.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
    blankrows: false,
  });
  if (aoa.length < 2) return { comps: [], errors };

  const rawHeaders = (aoa[0] ?? []).map((h) => String(h ?? ""));
  const headerMap = rawHeaders.map((h) => normalizeHeader(h));

  const comps: ParsedComp[] = [];
  for (let i = 1; i < aoa.length; i++) {
    const r = aoa[i] ?? [];
    if (r.every((c) => c == null || c === "")) continue;
    const rec: Record<string, unknown> = {};
    headerMap.forEach((key, idx) => {
      if (key) rec[key] = r[idx] ?? null;
    });

    const rowIndex = i + 1;
    const tenantName = asString(rec.tenant_name);
    const buildingName = asString(rec.building_name);
    const address = asString(rec.address);
    if (!tenantName && !buildingName && !address) {
      errors.push({
        rowIndex,
        message: "row needs at least tenant_name, building_name, or address",
      });
      continue;
    }
    const sf = asInt(rec.sf);
    const rentPsf = asNumber(rec.rent_psf);
    if (sf == null && rentPsf == null) {
      errors.push({
        rowIndex,
        message: "row needs at least sf or rent_psf",
      });
      continue;
    }
    comps.push({
      kind: asKind(rec.kind),
      tenantName,
      buildingName,
      address,
      city: asString(rec.city),
      state: asString(rec.state),
      lng: asNumber(rec.lng),
      lat: asNumber(rec.lat),
      sf,
      rentPsf,
      leaseType: asLeaseType(rec.lease_type),
      termMonths: asInt(rec.term_months),
      dealDate: asDateISO(rec.deal_date),
      source: asString(rec.source),
      notes: asString(rec.notes),
    });
  }
  return { comps, errors };
}
