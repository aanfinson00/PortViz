import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseLeasingProspectXlsx } from "./leasingProspectImport";
import { buildLeasingProspectTemplate } from "./leasingProspectTemplate";

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

const HEADERS = [
  "code",
  "name",
  "stage",
  "source",
  "project_code",
  "building_code",
  "space_code",
  "broker_company",
  "broker_name",
  "broker_email",
  "broker_phone",
  "contact_name",
  "contact_email",
  "contact_phone",
  "requested_sf",
  "target_commencement",
  "term_months",
  "asking_rent_psf",
  "proposed_rent_psf",
  "ti_allowance_psf",
  "free_rent_months",
  "probability_pct",
  "last_activity_date",
  "next_action",
  "next_action_date",
  "lost_reason",
  "notes",
];

describe("parseLeasingProspectXlsx", () => {
  it("parses a happy-path row with full attributes", () => {
    const buf = buildXlsx({
      Prospects: [
        HEADERS,
        [
          "P001",
          "Acme Logistics",
          "tour",
          "tenant_broker",
          "ACME",
          "A",
          "101",
          "CBRE",
          "Jane Smith",
          "jane@cbre.com",
          "555-1234",
          null,
          null,
          null,
          50000,
          "2026-09-01",
          60,
          9.5,
          8.75,
          6.0,
          3,
          25,
          "2026-05-15",
          "Send proposal",
          "2026-05-30",
          null,
          "Tour was good",
        ],
      ],
    });
    const { prospects, errors } = parseLeasingProspectXlsx(buf);
    expect(errors).toEqual([]);
    expect(prospects).toHaveLength(1);
    const p = prospects[0]!;
    expect(p.code).toBe("P001");
    expect(p.name).toBe("Acme Logistics");
    expect(p.stage).toBe("tour");
    expect(p.source).toBe("tenant_broker");
    expect(p.projectCode).toBe("ACME");
    expect(p.buildingCode).toBe("A");
    expect(p.spaceCode).toBe("101");
    expect(p.requestedSf).toBe(50000);
    expect(p.targetCommencement).toBe("2026-09-01");
    expect(p.askingRentPsf).toBe(9.5);
    expect(p.probabilityPct).toBe(25);
  });

  it("flags missing name as an error and skips the row", () => {
    const buf = buildXlsx({
      Prospects: [
        HEADERS,
        [
          null,
          null,
          "tour",
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
        ],
      ],
    });
    const { prospects, errors } = parseLeasingProspectXlsx(buf);
    expect(prospects).toHaveLength(0);
    expect(errors.some((e) => /name is required/i.test(e.message))).toBe(true);
  });

  it("rejects unknown stage values", () => {
    const buf = buildXlsx({
      Prospects: [
        HEADERS,
        [
          null,
          "Acme",
          "definitely_not_a_stage",
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
        ],
      ],
    });
    const { errors } = parseLeasingProspectXlsx(buf);
    expect(
      errors.some((e) => /stage .*must be one of/i.test(e.message)),
    ).toBe(true);
  });

  it("normalizes probability inputs (0.25 → 25, 25% → 25)", () => {
    const buf = buildXlsx({
      Prospects: [
        HEADERS,
        [null, "A", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0.25, null, null, null, null, null],
        [null, "B", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, "60%", null, null, null, null, null],
      ],
    });
    const { prospects, errors } = parseLeasingProspectXlsx(buf);
    expect(errors).toEqual([]);
    expect(prospects[0]!.probabilityPct).toBe(25);
    expect(prospects[1]!.probabilityPct).toBe(60);
  });

  it("detects duplicate codes within the same upload", () => {
    const buf = buildXlsx({
      Prospects: [
        HEADERS,
        ["DUP", "A", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        ["DUP", "B", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
      ],
    });
    const { errors } = parseLeasingProspectXlsx(buf);
    expect(errors.some((e) => /duplicate code/i.test(e.message))).toBe(true);
  });

  it("defaults stage to 'prospect' when omitted", () => {
    const buf = buildXlsx({
      Prospects: [
        HEADERS,
        [null, "Acme", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
      ],
    });
    const { prospects, errors } = parseLeasingProspectXlsx(buf);
    expect(errors).toEqual([]);
    expect(prospects[0]!.stage).toBe("prospect");
  });

  it("skips the hints row from the bundled template", () => {
    // Round-trip through the generated template so we exercise the
    // hints-row detection logic against the real artifact users download.
    const template = buildLeasingProspectTemplate();
    const { prospects, errors } = parseLeasingProspectXlsx(template);
    // Template contains exactly one example row.
    expect(errors).toEqual([]);
    expect(prospects).toHaveLength(1);
    expect(prospects[0]!.name).toBe("Acme Logistics Inc.");
    expect(prospects[0]!.stage).toBe("tour");
  });

  it("reports an error if the Prospects sheet is missing", () => {
    const buf = buildXlsx({ Other: [["foo"]] });
    const { errors } = parseLeasingProspectXlsx(buf);
    expect(errors.some((e) => /Prospects.*sheet/i.test(e.message))).toBe(true);
  });
});
