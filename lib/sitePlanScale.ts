import { pixelPolygonArea } from "./polygonArea";

/**
 * Calibrate the trace's pixel-to-feet scale: given the polygon the user drew
 * (in image pixel coordinates) and the building's true total SF, returns
 * how many feet each pixel represents along one axis.
 *
 * pixelArea is in px^2; targetSf is in ft^2. Solving for k where
 *   targetSf = k^2 * pixelArea
 * gives k = sqrt(targetSf / pixelArea), in ft/px.
 */
export function computeScale(
  polygonPx: ReadonlyArray<readonly [number, number]>,
  targetSf: number,
): number {
  const area = pixelPolygonArea(polygonPx);
  if (area <= 0 || targetSf <= 0) return 0;
  return Math.sqrt(targetSf / area);
}
