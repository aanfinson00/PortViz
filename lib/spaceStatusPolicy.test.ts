import { describe, expect, it } from "vitest";
import { nextSpaceStatusAfterLeaseChange } from "./spaceStatusPolicy";

const today = "2026-05-06";

describe("nextSpaceStatusAfterLeaseChange", () => {
  it("flips vacant → leased when an active lease exists", () => {
    expect(
      nextSpaceStatusAfterLeaseChange(
        "vacant",
        [{ start_date: "2025-01-01", end_date: "2027-01-01" }],
        today,
      ),
    ).toBe("leased");
  });

  it("flips available → leased when an active lease exists", () => {
    expect(
      nextSpaceStatusAfterLeaseChange(
        "available",
        [{ start_date: "2025-01-01", end_date: "2027-01-01" }],
        today,
      ),
    ).toBe("leased");
  });

  it("returns null when status is already leased and a lease is active (no thrash)", () => {
    expect(
      nextSpaceStatusAfterLeaseChange(
        "leased",
        [{ start_date: "2025-01-01", end_date: "2027-01-01" }],
        today,
      ),
    ).toBeNull();
  });

  it("a lease starting in the future still locks the space as leased", () => {
    expect(
      nextSpaceStatusAfterLeaseChange(
        "vacant",
        [{ start_date: "2026-09-01", end_date: "2031-08-31" }],
        today,
      ),
    ).toBe("leased");
  });

  it("flips leased → vacant when every lease has already expired", () => {
    expect(
      nextSpaceStatusAfterLeaseChange(
        "leased",
        [
          { start_date: "2020-01-01", end_date: "2024-12-31" },
          { start_date: "2018-01-01", end_date: "2022-12-31" },
        ],
        today,
      ),
    ).toBe("vacant");
  });

  it("flips leased → vacant when there are no leases at all", () => {
    expect(nextSpaceStatusAfterLeaseChange("leased", [], today)).toBe(
      "vacant",
    );
  });

  it("preserves a manually-set 'available' status when leases are expired", () => {
    expect(
      nextSpaceStatusAfterLeaseChange(
        "available",
        [{ start_date: "2020-01-01", end_date: "2024-12-31" }],
        today,
      ),
    ).toBeNull();
  });

  it("preserves a manually-set 'pending' status with no leases", () => {
    expect(nextSpaceStatusAfterLeaseChange("pending", [], today)).toBeNull();
  });

  it("treats an end_date equal to today as still active (renews same-day)", () => {
    expect(
      nextSpaceStatusAfterLeaseChange(
        "vacant",
        [{ start_date: "2020-01-01", end_date: today }],
        today,
      ),
    ).toBe("leased");
  });

  it("ignores rows with malformed end_date", () => {
    expect(
      nextSpaceStatusAfterLeaseChange(
        "leased",
        [{ start_date: "2020-01-01", end_date: null as unknown as string }],
        today,
      ),
    ).toBe("vacant");
  });
});
