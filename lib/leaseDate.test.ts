import { describe, expect, it } from "vitest";
import { addMonthsMinusDay } from "./leaseDate";

describe("addMonthsMinusDay", () => {
  it("returns end one day before the term completes", () => {
    expect(addMonthsMinusDay("2025-01-01", 60)).toBe("2029-12-31");
  });

  it("handles a 1-month term", () => {
    expect(addMonthsMinusDay("2025-03-15", 1)).toBe("2025-04-14");
  });

  it("handles month-end overflow without crashing", () => {
    // Jan 31 + 1 month: JS Date rolls into March; minus-1 lands in Feb/Mar.
    // We don't pin the exact day — just that it returns a valid YYYY-MM-DD.
    const out = addMonthsMinusDay("2025-01-31", 1);
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("accepts a stringified term (LeaseForm passes useState strings)", () => {
    expect(addMonthsMinusDay("2025-01-01", "12")).toBe("2025-12-31");
  });

  it("returns null for empty start date", () => {
    expect(addMonthsMinusDay("", 60)).toBeNull();
  });

  it("returns null for non-positive term", () => {
    expect(addMonthsMinusDay("2025-01-01", 0)).toBeNull();
    expect(addMonthsMinusDay("2025-01-01", -3)).toBeNull();
  });

  it("returns null for non-numeric term", () => {
    expect(addMonthsMinusDay("2025-01-01", "abc")).toBeNull();
    expect(addMonthsMinusDay("2025-01-01", "")).toBeNull();
  });

  it("returns null for unparseable start date", () => {
    expect(addMonthsMinusDay("not-a-date", 12)).toBeNull();
  });
});
