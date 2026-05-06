import { afterEach, describe, expect, it, vi } from "vitest";
import { geocodeAddress, geocodeBatch } from "./geocode";

function mockFetch(impl: (url: string) => Promise<Response> | Response) {
  return vi.fn(async (input: string | URL | Request) => {
    const u = typeof input === "string" ? input : input.toString();
    return impl(u);
  }) as unknown as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => vi.restoreAllMocks());

describe("geocodeAddress", () => {
  it("returns null when query is blank", async () => {
    const fetchImpl = mockFetch(() => jsonResponse({}));
    const out = await geocodeAddress("   ", { token: "pk.x", fetchImpl });
    expect(out).toBeNull();
  });

  it("returns null when no token is supplied or in env", async () => {
    const old = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    delete process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    const out = await geocodeAddress("123 Main St");
    expect(out).toBeNull();
    if (old) process.env.NEXT_PUBLIC_MAPBOX_TOKEN = old;
  });

  it("returns lng/lat for a successful resolve", async () => {
    const fetchImpl = mockFetch((url) => {
      expect(url).toContain("api.mapbox.com/search/geocode/v6/forward");
      expect(url).toContain("q=123+Main+St");
      expect(url).toContain("access_token=pk.x");
      return jsonResponse({
        features: [
          { geometry: { coordinates: [-96.8, 32.78] } },
        ],
      });
    });
    const out = await geocodeAddress("123 Main St", {
      token: "pk.x",
      fetchImpl,
    });
    expect(out).toEqual({ lng: -96.8, lat: 32.78 });
  });

  it("returns null on non-2xx response", async () => {
    const fetchImpl = mockFetch(() => new Response("nope", { status: 429 }));
    const out = await geocodeAddress("nowhere", {
      token: "pk.x",
      fetchImpl,
    });
    expect(out).toBeNull();
  });

  it("returns null on network failure", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("boom");
    }) as unknown as typeof fetch;
    const out = await geocodeAddress("nowhere", {
      token: "pk.x",
      fetchImpl,
    });
    expect(out).toBeNull();
  });

  it("returns null when Mapbox returns no features", async () => {
    const fetchImpl = mockFetch(() => jsonResponse({ features: [] }));
    const out = await geocodeAddress("garbage", {
      token: "pk.x",
      fetchImpl,
    });
    expect(out).toBeNull();
  });

  it("returns null when coordinates are non-finite", async () => {
    const fetchImpl = mockFetch(() =>
      jsonResponse({
        features: [{ geometry: { coordinates: [Number.NaN, 32] } }],
      }),
    );
    const out = await geocodeAddress("weird", {
      token: "pk.x",
      fetchImpl,
    });
    expect(out).toBeNull();
  });
});

describe("geocodeBatch", () => {
  it("preserves input order across parallel workers", async () => {
    const fetchImpl = mockFetch((url) => {
      const params = new URL(url).searchParams;
      const q = params.get("q") ?? "";
      // Encode lng to be a deterministic function of the query length
      // so the test can verify per-row mapping.
      return jsonResponse({
        features: [{ geometry: { coordinates: [q.length, 1] } }],
      });
    });
    const out = await geocodeBatch(["a", "bb", "ccc", "dddd"], {
      token: "pk.x",
      fetchImpl,
      concurrency: 2,
    });
    expect(out).toEqual([
      { lng: 1, lat: 1 },
      { lng: 2, lat: 1 },
      { lng: 3, lat: 1 },
      { lng: 4, lat: 1 },
    ]);
  });

  it("skips blank/null entries without making a request", async () => {
    const fetchImpl = mockFetch(() =>
      jsonResponse({
        features: [{ geometry: { coordinates: [-1, 1] } }],
      }),
    );
    const out = await geocodeBatch(["good", null, "", "also good"], {
      token: "pk.x",
      fetchImpl,
    });
    expect(out[0]).toEqual({ lng: -1, lat: 1 });
    expect(out[1]).toBeNull();
    expect(out[2]).toBeNull();
    expect(out[3]).toEqual({ lng: -1, lat: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("invokes onProgress for every entry", async () => {
    const fetchImpl = mockFetch(() =>
      jsonResponse({
        features: [{ geometry: { coordinates: [0, 0] } }],
      }),
    );
    const progress: Array<[number, number]> = [];
    await geocodeBatch(["a", null, "b"], {
      token: "pk.x",
      fetchImpl,
      onProgress: (done, total) => progress.push([done, total]),
    });
    expect(progress).toHaveLength(3);
    // Each call's `done` is monotonically non-decreasing and final value
    // equals total — the actual ordering between workers isn't tightly
    // constrained, so we just check the endpoints.
    expect(progress[progress.length - 1]).toEqual([3, 3]);
    expect(progress.every(([d, t]) => t === 3 && d >= 1 && d <= 3)).toBe(true);
  });
});
