"use client";

import { useEffect, useRef, useState } from "react";
import { squareOffPolygon, type Point } from "@/lib/squareOff";

interface TraceCanvasProps {
  /** Bitmap to draw underneath the trace. Width/height come from the image. */
  image: HTMLImageElement | null;
  /** Current polygon in pixel coordinates of the source image. */
  points: Point[];
  /** Fired when the user adds, moves, or removes a point. */
  onChange: (points: Point[]) => void;
  /** Whether the polygon has been closed (no more clicking adds points). */
  closed: boolean;
  onClose: () => void;
  /** Edge indices marked diagonal (skip in square-off). */
  diagonalEdges: Set<number>;
  onToggleDiagonal: (edgeIndex: number) => void;
}

const SNAP_TOLERANCE_DEG = 15;
const CLOSE_SNAP_PX = 12;

/**
 * Click-to-place polygon tracer over a background image. While drawing, the
 * next vertex snaps to a 90° turn from the previous edge if the cursor is
 * within ±15° of perpendicular (Shift disables snap for one click). After
 * closing, segments become hover-clickable to toggle a diagonal lock.
 *
 * Coordinates are stored in source-image pixels regardless of the canvas's
 * displayed size, so the polygon's area is meaningful for scale calibration.
 */
export function TraceCanvas({
  image,
  points,
  onChange,
  closed,
  onClose,
  diagonalEdges,
  onToggleDiagonal,
}: TraceCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [hoverEdge, setHoverEdge] = useState<number | null>(null);
  const shiftPressedRef = useRef(false);

  // Layout: scale the canvas to fit the container while preserving aspect ratio.
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number }>({
    w: 0,
    h: 0,
  });

  useEffect(() => {
    if (!image || !containerRef.current) return;
    const fit = () => {
      const cw = containerRef.current!.clientWidth;
      const ch = containerRef.current!.clientHeight;
      const ratio = Math.min(cw / image.width, ch / image.height);
      setCanvasSize({ w: image.width * ratio, h: image.height * ratio });
    };
    fit();
    const obs = new ResizeObserver(fit);
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [image]);

  // Track Shift key globally so the snap can be disabled on the fly.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Shift") shiftPressedRef.current = e.type === "keydown";
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, []);

  const scale = image && canvasSize.w > 0 ? canvasSize.w / image.width : 1;

  function clientToImagePx(e: React.MouseEvent): Point {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    return [x, y];
  }

  function snapToRightAngle(prev: Point, prior: Point | null, target: Point): Point {
    if (!prior) return target;
    if (shiftPressedRef.current) return target;
    // Direction of the previous edge.
    const ex = prev[0] - prior[0];
    const ey = prev[1] - prior[1];
    const len = Math.hypot(ex, ey);
    if (len === 0) return target;
    const ux = ex / len;
    const uy = ey / len;
    // Perpendicular (rotated 90° CCW).
    const px = -uy;
    const py = ux;
    // Cursor offset from prev.
    const tx = target[0] - prev[0];
    const ty = target[1] - prev[1];
    // Project onto perpendicular axis to get the right-angle target.
    const dPerp = tx * px + ty * py;
    const dAlong = tx * ux + ty * uy;
    // Compute angle between prev->cursor and perpendicular axis.
    const cursorLen = Math.hypot(tx, ty);
    if (cursorLen === 0) return target;
    const cosAngle = (tx * px + ty * py) / cursorLen;
    const angleDeg = Math.acos(Math.max(-1, Math.min(1, cosAngle))) * (180 / Math.PI);
    const offBy = Math.min(angleDeg, Math.abs(180 - angleDeg));
    if (offBy > SNAP_TOLERANCE_DEG) return target;
    // Snap: zero out the along-axis component.
    return [prev[0] + px * dPerp, prev[1] + py * dPerp] as Point;
  }

  function handleClick(e: React.MouseEvent) {
    if (closed || !image) return;
    let p = clientToImagePx(e);
    if (points.length >= 2) {
      const prev = points[points.length - 1]!;
      const prior = points[points.length - 2]!;
      p = snapToRightAngle(prev, prior, p);
    }
    // Snap-to-close if near the first point.
    if (points.length >= 3) {
      const first = points[0]!;
      const dx = (p[0] - first[0]) * scale;
      const dy = (p[1] - first[1]) * scale;
      if (Math.hypot(dx, dy) < CLOSE_SNAP_PX) {
        onClose();
        return;
      }
    }
    onChange([...points, p]);
  }

  function handleMove(e: React.MouseEvent) {
    if (!image) return;
    if (closed) {
      // Hit-test the segments to highlight one for click-to-toggle-diagonal.
      const cursorPt = clientToImagePx(e);
      let nearestIdx: number | null = null;
      let nearestDist = Infinity;
      for (let i = 0; i < points.length; i++) {
        const a = points[i]!;
        const b = points[(i + 1) % points.length]!;
        const d = pointToSegmentDistance(cursorPt, a, b) * scale;
        if (d < 8 && d < nearestDist) {
          nearestDist = d;
          nearestIdx = i;
        }
      }
      setHoverEdge(nearestIdx);
      setCursor(null);
      return;
    }
    let p = clientToImagePx(e);
    if (points.length >= 2) {
      const prev = points[points.length - 1]!;
      const prior = points[points.length - 2]!;
      p = snapToRightAngle(prev, prior, p);
    }
    setCursor(p);
  }

  function handleMouseLeave() {
    setCursor(null);
    setHoverEdge(null);
  }

  function handleSegmentClick(e: React.MouseEvent) {
    if (!closed || hoverEdge === null) return;
    e.stopPropagation();
    onToggleDiagonal(hoverEdge);
  }

  // Render the background image to the canvas whenever it changes.
  useEffect(() => {
    if (!image || !canvasRef.current || canvasSize.w === 0) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    canvasRef.current.width = canvasSize.w;
    canvasRef.current.height = canvasSize.h;
    ctx.drawImage(image, 0, 0, canvasSize.w, canvasSize.h);
  }, [image, canvasSize]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-neutral-100"
    >
      {!image && (
        <p className="absolute inset-0 m-auto flex h-full items-center justify-center text-sm text-neutral-500">
          Upload a site plan to start tracing.
        </p>
      )}
      <div
        className="relative mx-auto"
        style={{ width: canvasSize.w, height: canvasSize.h }}
        onMouseLeave={handleMouseLeave}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0"
          onClick={closed ? handleSegmentClick : handleClick}
          onMouseMove={handleMove}
          style={{ cursor: closed ? (hoverEdge !== null ? "pointer" : "default") : "crosshair" }}
        />
        <svg
          className="pointer-events-none absolute inset-0"
          width={canvasSize.w}
          height={canvasSize.h}
        >
          {/* Existing segments. */}
          {points.length > 1 &&
            points.map((p, i) => {
              if (!closed && i === points.length - 1) return null;
              const next = points[(i + 1) % points.length]!;
              const isDiagonal = diagonalEdges.has(i);
              const isHover = hoverEdge === i;
              return (
                <line
                  key={`seg-${i}`}
                  x1={p[0] * scale}
                  y1={p[1] * scale}
                  x2={next[0] * scale}
                  y2={next[1] * scale}
                  stroke={isDiagonal ? "#dc2626" : isHover ? "#2563eb" : "#111827"}
                  strokeWidth={isHover ? 3 : 2}
                  strokeDasharray={isDiagonal ? "6 4" : undefined}
                />
              );
            })}
          {/* Live preview while drawing. */}
          {!closed && cursor && points.length > 0 && (
            <line
              x1={points[points.length - 1]![0] * scale}
              y1={points[points.length - 1]![1] * scale}
              x2={cursor[0] * scale}
              y2={cursor[1] * scale}
              stroke="#2563eb"
              strokeWidth={2}
              strokeDasharray="4 4"
            />
          )}
          {/* Vertices. */}
          {points.map((p, i) => (
            <circle
              key={`pt-${i}`}
              cx={p[0] * scale}
              cy={p[1] * scale}
              r={i === 0 && !closed && points.length >= 3 ? 7 : 4}
              fill={i === 0 && !closed && points.length >= 3 ? "#2563eb" : "#111827"}
              stroke="white"
              strokeWidth={1.5}
            />
          ))}
        </svg>
      </div>
      {/* Help overlay. */}
      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-white/90 px-2 py-1 text-xs text-neutral-600 shadow">
        {closed
          ? "Hover an edge and click to toggle 'diagonal' lock (red dashed = locked)."
          : points.length === 0
            ? "Click to place the first vertex."
            : points.length < 3
              ? "Hold Shift to disable right-angle snap."
              : "Click the first point to close, or keep adding vertices."}
      </div>
    </div>
  );
}

function pointToSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const projX = a[0] + t * dx;
  const projY = a[1] + t * dy;
  return Math.hypot(p[0] - projX, p[1] - projY);
}

export { squareOffPolygon };
