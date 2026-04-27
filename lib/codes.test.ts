import { describe, expect, it } from "vitest";
import {
  buildBuildingId,
  buildProjectId,
  buildSpaceId,
  buildTenantId,
  codeSchema,
  parseCompositeId,
} from "./codes";

describe("codeSchema", () => {
  it("accepts 1-10 char uppercase alphanumerics", () => {
    expect(codeSchema.parse("A")).toBe("A");
    expect(codeSchema.parse("ATL01")).toBe("ATL01");
    expect(codeSchema.parse("1234567890")).toBe("1234567890");
  });

  it("uppercases input", () => {
    expect(codeSchema.parse("atl01")).toBe("ATL01");
  });

  it("rejects dashes, spaces, and over-long codes", () => {
    expect(() => codeSchema.parse("ATL-01")).toThrow();
    expect(() => codeSchema.parse("ATL 01")).toThrow();
    expect(() => codeSchema.parse("12345678901")).toThrow();
    expect(() => codeSchema.parse("")).toThrow();
  });
});

describe("composite ID builders", () => {
  it("builds project/building/space/tenant IDs", () => {
    expect(buildProjectId("atl01")).toBe("ATL01");
    expect(buildBuildingId("atl01", "a")).toBe("ATL01-A");
    expect(buildSpaceId("atl01", "a", "100")).toBe("ATL01-A-100");
    expect(buildTenantId("acme")).toBe("ACME");
  });
});

describe("parseCompositeId", () => {
  it("parses project IDs", () => {
    expect(parseCompositeId("ATL01")).toEqual({
      kind: "project",
      projectCode: "ATL01",
    });
  });

  it("parses building IDs", () => {
    expect(parseCompositeId("ATL01-A")).toEqual({
      kind: "building",
      projectCode: "ATL01",
      buildingCode: "A",
    });
  });

  it("parses space IDs", () => {
    expect(parseCompositeId("ATL01-A-100")).toEqual({
      kind: "space",
      projectCode: "ATL01",
      buildingCode: "A",
      spaceCode: "100",
    });
  });

  it("normalizes case", () => {
    expect(parseCompositeId("atl01-a-100").kind).toBe("space");
  });

  it("rejects malformed IDs", () => {
    expect(() => parseCompositeId("ATL01-A-100-X")).toThrow();
    expect(() => parseCompositeId("ATL 01")).toThrow();
    expect(() => parseCompositeId("")).toThrow();
    expect(() => parseCompositeId("ATL_01")).toThrow();
  });
});
