import type { Polygon } from "geojson";

/**
 * Project one or more lng/lat polygons into a small SVG viewport. Returns a
 * list of path strings (one per input polygon) plus the colors carried
 * through. Used to render building thumbnails on dashboard cards without
 * mounting a full Mapbox map per row.
 *
 * Cosine correction is applied so longitude isn't visually stretched at
 * mid-latitudes. Padding keeps the shape from touching the SVG edge.
 */
export interface PolygonPath {
  path: string;
  color: string;
}

export interface PolygonInput {
  polygon: Polygon;
  color?: string;
}

export function polygonsToSvgPaths(
  polygons: PolygonInput[],
  vbWidth = 100,
  vbHeight = 60,
  padding = 4,
): PolygonPath[] {
  if (polygons.length === 0) return [];

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const { polygon } of polygons) {
    for (const ring of polygon.coordinates) {
      for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (!Number.isFinite(minX)) return [];

  const w = maxX - minX;
  const h = maxY - minY;
  const latMid = (minY + maxY) / 2;
  const lngScale = Math.cos((latMid * Math.PI) / 180);
  const wAdj = w * lngScale;
  const innerW = vbWidth - 2 * padding;
  const innerH = vbHeight - 2 * padding;
  const scale = Math.min(
    innerW / Math.max(wAdj, 1e-9),
    innerH / Math.max(h, 1e-9),
  );
  const offsetX = (vbWidth - wAdj * scale) / 2;
  const offsetY = (vbHeight - h * scale) / 2;

  function pathFor(polygon: Polygon): string {
    return polygon.coordinates
      .map((ring) => {
        const segs = ring.map(([x, y], i) => {
          const px = (x - minX) * lngScale * scale + offsetX;
          // SVG y is inverted relative to latitude.
          const py = vbHeight - ((y - minY) * scale + offsetY);
          return `${i === 0 ? "M" : "L"} ${px.toFixed(2)} ${py.toFixed(2)}`;
        });
        return `${segs.join(" ")} Z`;
      })
      .join(" ");
  }

  return polygons.map(({ polygon, color }) => ({
    path: pathFor(polygon),
    color: color ?? "#2563eb",
  }));
}
