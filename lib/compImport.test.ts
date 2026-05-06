import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { parseCompsXlsx } from "./compImport";

function makeWorkbook(rows: unknown[][]): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Comps");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

describe("parseCompsXlsx", () => {
  it("parses a basic comp row", () => {
    const buf = makeWorkbook([
      ["tenant_name", "building_name", "sf", "rent_psf", "deal_date"],
      ["Acme Logistics", "Crossroads DC", 250000, 7.25, "2025-09-15"],
    ]);
    const r = parseCompsXlsx(buf);
    expect(r.errors).toEqual([]);
    expect(r.comps).toHaveLength(1);
    expect(r.comps[0]).toMatchObject({
      tenantName: "Acme Logistics",
      buildingName: "Crossroads DC",
      sf: 250000,
      rentPsf: 7.25,
      dealDate: "2025-09-15",
      kind: "lease",
    });
  });

  it("accepts loose / aliased column headers", () => {
    const buf = makeWorkbook([
      ["Tenant", "Property", "Square Feet", "Base Rent", "Date"],
      ["Acme", "South Park 1", "100,000", "$8.50", "2025-01-15"],
    ]);
    const r = parseCompsXlsx(buf);
    expect(r.errors).toEqual([]);
    expect(r.comps).toHaveLength(1);
    expect(r.comps[0].sf).toBe(100000);
    expect(r.comps[0].rentPsf).toBe(8.5);
  });

  it("flags rows with no identifying info", () => {
    const buf = makeWorkbook([
      ["tenant_name", "sf", "rent_psf"],
      [null, 50000, 6.0],
    ]);
    const r = parseCompsXlsx(buf);
    expect(r.errors).toHaveLength(1);
    expect(r.comps).toHaveLength(0);
  });

  it("flags rows with no metric", () => {
    const buf = makeWorkbook([
      ["tenant_name"],
      ["Acme"],
    ]);
    const r = parseCompsXlsx(buf);
    expect(r.errors).toHaveLength(1);
  });

  it("normalizes lease type variations", () => {
    const buf = makeWorkbook([
      ["tenant_name", "sf", "lease_type"],
      ["A", 1000, "NNN"],
      ["B", 1000, "Modified Gross"],
      ["C", 1000, "MG"],
      ["D", 1000, "weird"],
    ]);
    const r = parseCompsXlsx(buf);
    expect(r.comps.map((c) => c.leaseType)).toEqual([
      "nnn",
      "modified_gross",
      "modified_gross",
      "other",
    ]);
  });

  it("skips blank rows", () => {
    const buf = makeWorkbook([
      ["tenant_name", "sf"],
      ["Acme", 1000],
      [null, null],
      ["Beta", 2000],
    ]);
    const r = parseCompsXlsx(buf);
    expect(r.comps).toHaveLength(2);
  });

  it("defaults kind to lease", () => {
    const buf = makeWorkbook([
      ["tenant_name", "sf"],
      ["Acme", 1000],
    ]);
    const r = parseCompsXlsx(buf);
    expect(r.comps[0].kind).toBe("lease");
  });

  it("recognizes sale kind", () => {
    const buf = makeWorkbook([
      ["building_name", "sf", "rent_psf", "kind"],
      ["Tower 1", 50000, 250, "sale"],
    ]);
    const r = parseCompsXlsx(buf);
    expect(r.comps[0].kind).toBe("sale");
  });
});
