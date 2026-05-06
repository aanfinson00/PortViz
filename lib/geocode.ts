/**
 * Forward-geocode a single address via Mapbox's v6 search API.
 *
 * Returns null when the token isn't configured, the address is empty,
 * the request errors, or Mapbox couldn't resolve the address. Callers
 * treat null as "couldn't locate" and leave lng/lat blank rather than
 * blocking the wider flow.
 *
 * Designed for the comps bulk import: the user pastes a CSV, we walk
 * rows in parallel batches calling this helper, and rows that don't
 * resolve simply get a missing-coords warning chip in the UI (the user
 * can still drop a pin later via the Locate modal).
 */

export interface GeocodeResult {
  lng: number;
  lat: number;
}

interface MapboxFeature {
  geometry?: { coordinates?: [number, number] };
}
interface MapboxResponse {
  features?: MapboxFeature[];
}

interface GeocodeOptions {
  /** Override the token (mostly for tests). */
  token?: string;
  /** Override fetch (mostly for tests). */
  fetchImpl?: typeof fetch;
  /** Bias results toward this country code (ISO 3166-1 alpha-2). Default 'us'. */
  country?: string;
  /** Limit result types — Mapbox's forward search returns POIs by default,
   *  which usually isn't what we want for street addresses. */
  types?: string;
}

export async function geocodeAddress(
  rawQuery: string,
  options: GeocodeOptions = {},
): Promise<GeocodeResult | null> {
  const query = rawQuery.trim();
  if (!query) return null;
  const token = options.token ?? process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return null;

  const fetchImpl = options.fetchImpl ?? fetch;
  const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
  url.searchParams.set("q", query);
  url.searchParams.set("access_token", token);
  url.searchParams.set("limit", "1");
  url.searchParams.set("country", options.country ?? "us");
  url.searchParams.set(
    "types",
    options.types ?? "address,street,postcode,place",
  );

  let res: Response;
  try {
    res = await fetchImpl(url.toString());
  } catch {
    return null;
  }
  if (!res.ok) return null;
  let body: MapboxResponse;
  try {
    body = (await res.json()) as MapboxResponse;
  } catch {
    return null;
  }
  const coords = body.features?.[0]?.geometry?.coordinates;
  if (!coords || coords.length < 2) return null;
  const [lng, lat] = coords;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return { lng, lat };
}

/**
 * Run geocoding across many inputs with bounded concurrency. Returns
 * results in the same order as the input array — null for entries that
 * couldn't be geocoded (or had no query). Caller-supplied `onProgress`
 * fires after each individual lookup so the UI can update a counter.
 */
export async function geocodeBatch(
  queries: Array<string | null | undefined>,
  options: GeocodeOptions & {
    concurrency?: number;
    onProgress?: (done: number, total: number) => void;
  } = {},
): Promise<Array<GeocodeResult | null>> {
  const concurrency = Math.max(1, options.concurrency ?? 4);
  const results: Array<GeocodeResult | null> = new Array(queries.length).fill(
    null,
  );
  let cursor = 0;
  let done = 0;
  const total = queries.length;

  async function worker() {
    while (cursor < total) {
      const i = cursor++;
      const q = queries[i];
      if (q && q.trim()) {
        results[i] = await geocodeAddress(q, options);
      }
      done += 1;
      options.onProgress?.(done, total);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, total) }, () =>
    worker(),
  );
  await Promise.all(workers);
  return results;
}
