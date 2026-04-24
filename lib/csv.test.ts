import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("writes a header + body row with plain fields", () => {
    const csv = toCsv(
      [{ code: "A-100", rent: 9.5 }],
      [
        { key: "code", label: "Code" },
        { key: "rent", label: "Rent $/SF" },
      ],
    );
    expect(csv).toBe("Code,Rent $/SF\nA-100,9.5\n");
  });

  it("quotes fields containing commas and quotes", () => {
    const csv = toCsv(
      [{ note: 'Includes "roof rights", free rent' }],
      [{ key: "note", label: "Note" }],
    );
    expect(csv).toContain('"Includes ""roof rights"", free rent"');
  });

  it("renders nullish values as empty strings", () => {
    const csv = toCsv(
      [{ code: "A-100", rent: null, notes: undefined }],
      [
        { key: "code", label: "Code" },
        { key: "rent", label: "Rent" },
        { key: "notes", label: "Notes" },
      ],
    );
    expect(csv).toBe("Code,Rent,Notes\nA-100,,\n");
  });
});
