import { describe, expect, it } from "vitest";
import {
  currentYearRent,
  parseLeaseOptions,
  parseLeaseType,
  parseRentSchedule,
} from "./leaseEconomics";

describe("parseLeaseType", () => {
  it("accepts the supported types", () => {
    expect(parseLeaseType("nnn")).toBe("nnn");
    expect(parseLeaseType("modified_gross")).toBe("modified_gross");
    expect(parseLeaseType("absolute_net")).toBe("absolute_net");
  });
  it("returns null for unknown values", () => {
    expect(parseLeaseType("triple-net")).toBeNull();
    expect(parseLeaseType(null)).toBeNull();
    expect(parseLeaseType(42)).toBeNull();
  });
});

describe("parseRentSchedule", () => {
  it("returns [] for non-array input", () => {
    expect(parseRentSchedule(null)).toEqual([]);
    expect(parseRentSchedule({})).toEqual([]);
  });

  it("keeps valid entries, drops malformed ones", () => {
    const out = parseRentSchedule([
      { fromMonth: 1, toMonth: 12, baseRentPsf: 8 },
      { fromMonth: 13, toMonth: 24, baseRentPsf: 8.5, notes: "yr2 bump" },
      { fromMonth: 1, toMonth: 0, baseRentPsf: 9 }, // toMonth < fromMonth -> drop
      { fromMonth: 0, toMonth: 12, baseRentPsf: 8 }, // fromMonth < 1 -> drop
      "string",
      null,
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]?.baseRentPsf).toBe(8);
    expect(out[1]?.notes).toBe("yr2 bump");
  });

  it("sorts by fromMonth ascending", () => {
    const out = parseRentSchedule([
      { fromMonth: 25, toMonth: 36, baseRentPsf: 9 },
      { fromMonth: 1, toMonth: 12, baseRentPsf: 8 },
      { fromMonth: 13, toMonth: 24, baseRentPsf: 8.5 },
    ]);
    expect(out.map((e) => e.fromMonth)).toEqual([1, 13, 25]);
  });
});

describe("parseLeaseOptions", () => {
  it("keeps the five supported kinds", () => {
    const out = parseLeaseOptions([
      { kind: "renewal", termMonths: 60 },
      { kind: "expansion", noticeMonths: 6 },
      { kind: "rofr" },
      { kind: "rofo" },
      { kind: "termination", feePsf: 5 },
      { kind: "unknown" },
    ]);
    expect(out).toHaveLength(5);
    expect(out.map((o) => o.kind)).toEqual([
      "renewal",
      "expansion",
      "rofr",
      "rofo",
      "termination",
    ]);
  });

  it("preserves notes and rentBasis", () => {
    const out = parseLeaseOptions([
      {
        kind: "renewal",
        termMonths: 60,
        rentBasis: "FMV",
        notes: "two 5-year options",
      },
    ]);
    expect(out[0]?.rentBasis).toBe("FMV");
    expect(out[0]?.notes).toBe("two 5-year options");
  });
});

describe("currentYearRent", () => {
  it("uses base + escalation when no schedule is set", () => {
    // Year 1 of a 5-year lease, base $8 + 3% bumps. asOf in month 6.
    const r = currentYearRent({
      startDate: "2025-01-01",
      endDate: "2030-01-01",
      baseRentPsf: 8,
      escalationPct: 3,
      rentSchedule: null,
      asOf: new Date("2025-06-15"),
    });
    expect(r).toBeCloseTo(8, 4);
  });

  it("compounds annual escalation on the anniversary", () => {
    const r = currentYearRent({
      startDate: "2025-01-01",
      endDate: "2030-01-01",
      baseRentPsf: 8,
      escalationPct: 3,
      rentSchedule: null,
      asOf: new Date("2026-06-15"), // year 2
    });
    expect(r).toBeCloseTo(8 * 1.03, 4);
  });

  it("prefers an explicit rent_schedule entry over base + escalation", () => {
    const r = currentYearRent({
      startDate: "2025-01-01",
      endDate: "2030-01-01",
      baseRentPsf: 8,
      escalationPct: 3,
      rentSchedule: [
        { fromMonth: 1, toMonth: 12, baseRentPsf: 7 },
        { fromMonth: 13, toMonth: 24, baseRentPsf: 7.5 },
        { fromMonth: 25, toMonth: 60, baseRentPsf: 8 },
      ],
      asOf: new Date("2026-03-15"), // month 15 -> 7.5 entry
    });
    expect(r).toBe(7.5);
  });

  it("falls back to base + escalation when schedule doesn't cover the month", () => {
    const r = currentYearRent({
      startDate: "2025-01-01",
      endDate: "2030-01-01",
      baseRentPsf: 8,
      escalationPct: 3,
      rentSchedule: [
        { fromMonth: 1, toMonth: 12, baseRentPsf: 7 }, // only year 1
      ],
      asOf: new Date("2026-06-15"), // year 2 -> not covered
    });
    expect(r).toBeCloseTo(8 * 1.03, 4); // falls through to base + escalation
  });

  it("returns null when the as-of date is outside the lease term", () => {
    const r = currentYearRent({
      startDate: "2025-01-01",
      endDate: "2030-01-01",
      baseRentPsf: 8,
      escalationPct: 3,
      rentSchedule: null,
      asOf: new Date("2030-06-15"),
    });
    expect(r).toBeNull();
  });

  it("returns null when there is neither baseRentPsf nor a covering schedule", () => {
    const r = currentYearRent({
      startDate: "2025-01-01",
      endDate: "2030-01-01",
      baseRentPsf: null,
      escalationPct: null,
      rentSchedule: null,
      asOf: new Date("2025-06-15"),
    });
    expect(r).toBeNull();
  });
});
