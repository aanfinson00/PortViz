import { describe, expect, it } from "vitest";
import {
  ACTIVE_PROSPECT_STAGES,
  fitProspectsToSpaces,
  fitSpacesToProspect,
  type FittableProspect,
  type FittableSpace,
} from "./scenarioFit";

function prospect(
  overrides: Partial<FittableProspect> & { id: string; requestedSf: number },
): FittableProspect {
  return {
    name: overrides.id,
    stage: "tour",
    brokerCompany: null,
    probabilityPct: null,
    ...overrides,
  };
}

function space(id: string, sf: number): FittableSpace {
  return { id, code: id, sf };
}

describe("fitProspectsToSpaces", () => {
  it("matches a prospect inside the default 20% tolerance", () => {
    const spaces = [space("s1", 50000)];
    const prospects = [prospect({ id: "p1", requestedSf: 52000 })];
    const out = fitProspectsToSpaces(spaces, prospects);
    expect(out.get("s1")).toHaveLength(1);
    const match = out.get("s1")![0]!;
    expect(match.prospect.id).toBe("p1");
    expect(match.deltaSf).toBe(2000);
    expect(match.signedDeltaSf).toBe(2000);
    expect(match.score).toBeCloseTo(0.96, 2);
  });

  it("excludes prospects outside the tolerance window", () => {
    const spaces = [space("s1", 50000)];
    const prospects = [
      prospect({ id: "in", requestedSf: 55000 }),
      prospect({ id: "out", requestedSf: 75000 }),
    ];
    const out = fitProspectsToSpaces(spaces, prospects);
    const matches = out.get("s1")!;
    expect(matches.map((m) => m.prospect.id)).toEqual(["in"]);
  });

  it("filters by active stages by default", () => {
    const spaces = [space("s1", 50000)];
    const prospects = [
      prospect({ id: "active", requestedSf: 50000, stage: "loi" }),
      prospect({ id: "dead", requestedSf: 50000, stage: "dead" }),
      prospect({ id: "executed", requestedSf: 50000, stage: "executed" }),
      prospect({ id: "hold", requestedSf: 50000, stage: "on_hold" }),
    ];
    const out = fitProspectsToSpaces(spaces, prospects);
    expect(out.get("s1")!.map((m) => m.prospect.id)).toEqual(["active"]);
  });

  it("includes all stages when activeOnly is false", () => {
    const spaces = [space("s1", 50000)];
    const prospects = [
      prospect({ id: "active", requestedSf: 50000, stage: "loi" }),
      prospect({ id: "dead", requestedSf: 50000, stage: "dead" }),
    ];
    const out = fitProspectsToSpaces(spaces, prospects, { activeOnly: false });
    expect(out.get("s1")!.map((m) => m.prospect.id).sort()).toEqual(["active", "dead"]);
  });

  it("sorts matches by score descending", () => {
    const spaces = [space("s1", 50000)];
    const prospects = [
      prospect({ id: "far", requestedSf: 58000 }),
      prospect({ id: "exact", requestedSf: 50000 }),
      prospect({ id: "near", requestedSf: 51000 }),
    ];
    const out = fitProspectsToSpaces(spaces, prospects);
    expect(out.get("s1")!.map((m) => m.prospect.id)).toEqual([
      "exact",
      "near",
      "far",
    ]);
  });

  it("honors a custom tolerance", () => {
    const spaces = [space("s1", 50000)];
    const prospects = [prospect({ id: "p1", requestedSf: 55000 })];
    // 10% tolerance: 55000 is exactly at the edge, included.
    const tight = fitProspectsToSpaces(spaces, prospects, {
      tolerancePct: 10,
    });
    expect(tight.get("s1")).toHaveLength(1);
    // 5% tolerance: 55000 is outside.
    const tighter = fitProspectsToSpaces(spaces, prospects, {
      tolerancePct: 5,
    });
    expect(tighter.get("s1")).toHaveLength(0);
  });

  it("skips prospects with null or zero requested_sf", () => {
    const spaces = [space("s1", 50000)];
    const prospects = [
      prospect({ id: "no_sf", requestedSf: 50000 }),
      { ...prospect({ id: "null_sf", requestedSf: 0 }), requestedSf: null } as FittableProspect,
      prospect({ id: "zero_sf", requestedSf: 0 }),
    ];
    const out = fitProspectsToSpaces(spaces, prospects);
    expect(out.get("s1")!.map((m) => m.prospect.id)).toEqual(["no_sf"]);
  });

  it("returns an empty match list for zero-SF spaces", () => {
    const out = fitProspectsToSpaces(
      [space("empty", 0)],
      [prospect({ id: "p1", requestedSf: 10000 })],
    );
    expect(out.get("empty")).toEqual([]);
  });

  it("ranks across multiple spaces", () => {
    const spaces = [space("small", 25000), space("big", 100000)];
    const prospects = [prospect({ id: "p1", requestedSf: 100000 })];
    const out = fitProspectsToSpaces(spaces, prospects);
    expect(out.get("big")).toHaveLength(1);
    expect(out.get("small")).toHaveLength(0);
  });
});

describe("fitSpacesToProspect", () => {
  it("returns matching spaces sorted by score", () => {
    const p = prospect({ id: "p1", requestedSf: 50000 });
    const spaces = [
      space("near", 48000),
      space("far", 60000),
      space("exact", 50000),
      space("noFit", 100000),
    ];
    const out = fitSpacesToProspect(p, spaces);
    expect(out.map((m) => m.space.id)).toEqual(["exact", "near", "far"]);
  });

  it("returns empty when prospect has no requested_sf", () => {
    const p: FittableProspect = {
      id: "p1",
      name: "Acme",
      stage: "tour",
      requestedSf: null,
      brokerCompany: null,
      probabilityPct: null,
    };
    const out = fitSpacesToProspect(p, [space("s1", 50000)]);
    expect(out).toEqual([]);
  });
});

describe("ACTIVE_PROSPECT_STAGES", () => {
  it("includes the six active pipeline stages", () => {
    expect(ACTIVE_PROSPECT_STAGES.has("prospect")).toBe(true);
    expect(ACTIVE_PROSPECT_STAGES.has("tour")).toBe(true);
    expect(ACTIVE_PROSPECT_STAGES.has("rfp")).toBe(true);
    expect(ACTIVE_PROSPECT_STAGES.has("proposal")).toBe(true);
    expect(ACTIVE_PROSPECT_STAGES.has("loi")).toBe(true);
    expect(ACTIVE_PROSPECT_STAGES.has("lease_out")).toBe(true);
    expect(ACTIVE_PROSPECT_STAGES.has("executed")).toBe(false);
    expect(ACTIVE_PROSPECT_STAGES.has("dead")).toBe(false);
    expect(ACTIVE_PROSPECT_STAGES.has("on_hold")).toBe(false);
  });
});
