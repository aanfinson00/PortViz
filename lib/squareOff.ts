/**
 * Right-angle snapping for traced building polygons.
 *
 * Industrial buildings are overwhelmingly rectilinear. After the user has
 * traced a polygon by clicking corners, this snaps each non-diagonal vertex
 * so that its two adjacent edges meet at exactly 90°, projecting the vertex
 * onto the shorter neighbor's axis. Edges flagged as "diagonal" (e.g. a 45°
 * chamfer) are skipped — the algorithm leaves vertices touching them alone.
 *
 * The polygon is open (no closing duplicate point); the caller can re-close
 * it after if needed.
 */

export type Point = readonly [number, number];

const ANGLE_TOLERANCE_DEG = 15;

interface Options {
  /** Indices of edges (i means the edge from points[i] -> points[i+1]) that
   * should be left as-is (i.e. not used to snap their adjacent vertex). */
  diagonalEdges?: ReadonlySet<number>;
  /** Override the ±15° tolerance. */
  toleranceDeg?: number;
}

export function squareOffPolygon(
  points: ReadonlyArray<Point>,
  opts: Options = {},
): Point[] {
  const n = points.length;
  if (n < 4) return points.slice();

  const diagonal = opts.diagonalEdges ?? new Set<number>();
  const tol = opts.toleranceDeg ?? ANGLE_TOLERANCE_DEG;

  const out: [number, number][] = points.map((p) => [p[0], p[1]]);

  for (let i = 0; i < n; i++) {
    const prevEdgeIdx = (i - 1 + n) % n; // edge ending at i
    const nextEdgeIdx = i; // edge starting at i

    if (diagonal.has(prevEdgeIdx) || diagonal.has(nextEdgeIdx)) continue;

    const prev = out[(i - 1 + n) % n]!;
    const here = out[i]!;
    const next = out[(i + 1) % n]!;

    const incoming = [here[0] - prev[0], here[1] - prev[1]] as const;
    const outgoing = [next[0] - here[0], next[1] - here[1]] as const;

    const angleBetween = angleDeg(incoming, outgoing);
    // Closest 90° multiple to the actual interior turn.
    const target = Math.round(angleBetween / 90) * 90;
    if (Math.abs(angleBetween - target) > tol) continue;
    if (Math.abs(target) !== 90 && Math.abs(target) !== 0 && Math.abs(target) !== 180) {
      continue;
    }

    // Snap by projecting `here` so the prev->here edge is axis-aligned with
    // the dominant component of the incoming edge.
    const dx = here[0] - prev[0];
    const dy = here[1] - prev[1];
    if (Math.abs(dx) > Math.abs(dy)) {
      // Force horizontal incoming edge: drop here.y to prev.y.
      out[i] = [here[0], prev[1]];
    } else {
      // Force vertical incoming edge: drop here.x to prev.x.
      out[i] = [prev[0], here[1]];
    }
  }

  return out;
}

/**
 * Signed turn angle in degrees from `a` to `b` (range -180..180).
 * Positive is a counter-clockwise turn.
 */
function angleDeg(a: readonly [number, number], b: readonly [number, number]): number {
  const cross = a[0] * b[1] - a[1] * b[0];
  const dot = a[0] * b[0] + a[1] * b[1];
  const rad = Math.atan2(cross, dot);
  return (rad * 180) / Math.PI;
}
