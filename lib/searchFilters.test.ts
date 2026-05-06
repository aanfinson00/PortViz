import { describe, expect, it } from "vitest";
import { matchesFilters, parseQuery } from "./searchFilters";

describe("parseQuery", () => {
  it("returns empty filters for empty input", () => {
    const p = parseQuery("");
    expect(p.text).toBe("");
    expect(p.statuses).toEqual([]);
    expect(p.type).toBeNull();
  });

  it("treats unrecognized text as fuzzy text", () => {
    const p = parseQuery("warehouse");
    expect(p.text).toBe("warehouse");
    expect(p.statuses).toEqual([]);
    expect(p.type).toBeNull();
  });

  it("recognizes a single status keyword", () => {
    const p = parseQuery("vacant");
    expect(p.text).toBe("");
    expect(p.statuses).toEqual(["vacant"]);
  });

  it("recognizes multiple status keywords", () => {
    const p = parseQuery("vacant available");
    expect(new Set(p.statuses)).toEqual(new Set(["vacant", "available"]));
    expect(p.text).toBe("");
  });

  it("strips status keywords out of mixed input", () => {
    const p = parseQuery("vacant warehouse");
    expect(p.statuses).toEqual(["vacant"]);
    expect(p.text).toBe("warehouse");
  });

  it("is order-independent", () => {
    const a = parseQuery("vacant warehouse");
    const b = parseQuery("warehouse vacant");
    expect(a).toEqual(b);
  });

  it("recognizes type keywords (singular and plural)", () => {
    expect(parseQuery("buildings").type).toBe("building");
    expect(parseQuery("space").type).toBe("space");
    expect(parseQuery("tenants").type).toBe("tenant");
  });

  it("last type keyword wins", () => {
    const p = parseQuery("buildings tenants");
    expect(p.type).toBe("tenant");
  });

  it("dedupes status keywords", () => {
    const p = parseQuery("vacant vacant");
    expect(p.statuses).toEqual(["vacant"]);
  });

  it("is case-insensitive", () => {
    const p = parseQuery("VACANT Warehouse");
    expect(p.statuses).toEqual(["vacant"]);
    expect(p.text).toBe("warehouse");
  });
});

describe("matchesFilters", () => {
  const empty = parseQuery("");
  const vacantOnly = parseQuery("vacant");
  const buildingsOnly = parseQuery("buildings");
  const vacantSpaces = parseQuery("vacant spaces");

  it("passes everything through with no filters", () => {
    expect(matchesFilters({ type: "space", status: "leased" }, empty)).toBe(true);
    expect(matchesFilters({ type: "tenant" }, empty)).toBe(true);
  });

  it("status filter restricts to space items with that status", () => {
    expect(matchesFilters({ type: "space", status: "vacant" }, vacantOnly)).toBe(true);
    expect(matchesFilters({ type: "space", status: "leased" }, vacantOnly)).toBe(false);
  });

  it("status filter excludes non-space types", () => {
    expect(matchesFilters({ type: "tenant" }, vacantOnly)).toBe(false);
    expect(matchesFilters({ type: "building" }, vacantOnly)).toBe(false);
  });

  it("status filter excludes spaces with no status", () => {
    expect(matchesFilters({ type: "space" }, vacantOnly)).toBe(false);
  });

  it("type filter restricts to that type", () => {
    expect(matchesFilters({ type: "building" }, buildingsOnly)).toBe(true);
    expect(matchesFilters({ type: "space", status: "vacant" }, buildingsOnly)).toBe(false);
  });

  it("type + status compose: vacant spaces only", () => {
    expect(matchesFilters({ type: "space", status: "vacant" }, vacantSpaces)).toBe(true);
    expect(matchesFilters({ type: "space", status: "leased" }, vacantSpaces)).toBe(false);
    expect(matchesFilters({ type: "building" }, vacantSpaces)).toBe(false);
  });
});
