import { describe, expect, it } from "vitest";
import { fuzzyScore, rankFuzzy } from "./fuzzy";

describe("fuzzyScore", () => {
  it("returns 0 for an empty query (everything matches)", () => {
    expect(fuzzyScore("", "anything")).toBe(0);
  });

  it("returns null when chars are missing or out of order", () => {
    expect(fuzzyScore("xyz", "abc")).toBeNull();
    expect(fuzzyScore("ba", "abc")).toBeNull();
  });

  it("matches case-insensitively", () => {
    expect(fuzzyScore("ABC", "xabcx")).not.toBeNull();
    expect(fuzzyScore("abc", "XABCX")).not.toBeNull();
  });

  it("ranks prefix matches above mid-string matches", () => {
    const prefix = fuzzyScore("abc", "abcdef")!;
    const mid = fuzzyScore("abc", "xxxabc")!;
    expect(prefix).toBeLessThan(mid);
  });

  it("ranks tighter spans above looser spans", () => {
    const tight = fuzzyScore("abc", "xabc")!;
    const loose = fuzzyScore("abc", "aXXXbXXXc")!;
    expect(tight).toBeLessThan(loose);
  });
});

describe("rankFuzzy", () => {
  type Row = { id: string; label: string; code: string };
  const rows: Row[] = [
    { id: "1", label: "Acme Logistics", code: "ACME" },
    { id: "2", label: "Atlas Foods", code: "ATL" },
    { id: "3", label: "Northwest Brewing", code: "NWB" },
  ];
  const fields = (r: Row) => [r.label, r.code];

  it("returns the first `limit` items unchanged for empty query", () => {
    expect(rankFuzzy(rows, "", fields, 2)).toEqual([rows[0], rows[1]]);
  });

  it("drops non-matching items", () => {
    const out = rankFuzzy(rows, "xyz", fields);
    expect(out).toEqual([]);
  });

  it("prefers matches across any of the haystacks", () => {
    // "atl" matches both Atlas Foods (label) and ATL (code prefix);
    // either way the row should be ranked first.
    const out = rankFuzzy(rows, "atl", fields);
    expect(out[0]?.id).toBe("2");
  });

  it("preserves stable order across ties via input order", () => {
    const sameLabel: Row[] = [
      { id: "a", label: "Acme", code: "X1" },
      { id: "b", label: "Acme", code: "X2" },
    ];
    const out = rankFuzzy(sameLabel, "acme", (r) => [r.label, r.code]);
    expect(out.map((r) => r.id)).toEqual(["a", "b"]);
  });
});
