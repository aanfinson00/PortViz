/**
 * Pure geometry helpers for the property-level "Site amenities" overlay
 * (parcel outline + access point pins). Self-contained — no React, no
 * tRPC, no map instance — so it stays unit-testable and can be reused
 * by other surfaces (future: shared link previews, exports).
 */

import type { Polygon } from "geojson";
import { ftToDegLat, ftToDegLng } from "./amenities";

/**
 * One ingress/egress point on the property. Persisted as plain JSON on
 * project.access_points so the schema stays loose during iteration.
 */
export interface AccessPoint {
  lng: number;
  lat: number;
  label?: string;
  role?: AccessRole;
}

export type AccessRole =
  | "main"
  | "truck"
  | "service"
  | "emergency"
  | "other";

export const ACCESS_ROLE_COLORS: Record<AccessRole, string> = {
  main: "#2563eb",
  truck: "#f59e0b",
  service: "#6366f1",
  emergency: "#dc2626",
  other: "#6b7280",
};

/**
 * Approximate a circular pin polygon at lng/lat with the given radius in
 * feet. Mapbox can render circles via a `circle` layer type, but using a
 * polygon keeps the layer pipeline uniform with the rest of the amenity
 * overlay (single OverlayLayer source of truth) and lets the marker scale
 * with map zoom in physical units rather than screen pixels.
 */
export function accessPointMarker(
  point: AccessPoint,
  radiusFt = 14,
  segments = 24,
): Polygon {
  const dLat = ftToDegLat(radiusFt);
  const dLng = ftToDegLng(radiusFt, point.lat);
  const ring: Array<[number, number]> = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    ring.push([point.lng + Math.cos(t) * dLng, point.lat + Math.sin(t) * dLat]);
  }
  ring.push(ring[0]!);
  return {
    type: "Polygon",
    coordinates: [ring],
  };
}

/**
 * Validate + parse an unknown JSON blob into a list of AccessPoints.
 * Tolerant: silently drops malformed entries rather than throwing, so an
 * old row with a stray field doesn't take down the dashboard. Returns []
 * for null / empty / non-array inputs.
 */
export function parseAccessPoints(raw: unknown): AccessPoint[] {
  if (!Array.isArray(raw)) return [];
  const out: AccessPoint[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const lng = typeof r.lng === "number" ? r.lng : null;
    const lat = typeof r.lat === "number" ? r.lat : null;
    if (lng == null || lat == null) continue;
    const label = typeof r.label === "string" ? r.label : undefined;
    const role = isAccessRole(r.role) ? r.role : undefined;
    out.push({ lng, lat, label, role });
  }
  return out;
}

function isAccessRole(value: unknown): value is AccessRole {
  return (
    value === "main" ||
    value === "truck" ||
    value === "service" ||
    value === "emergency" ||
    value === "other"
  );
}

// ----- Parking ---------------------------------------------------------

export type ParkingKind = "car" | "trailer" | "mixed";

export const PARKING_KIND_COLORS: Record<ParkingKind, string> = {
  car: "#94a3b8",
  trailer: "#f59e0b",
  mixed: "#a78bfa",
};

/**
 * Tolerant parser for the parking kind. Returns null when the value isn't
 * one of the three supported kinds, so a stale/garbage row doesn't crash
 * the renderer.
 */
export function parseParkingKind(value: unknown): ParkingKind | null {
  if (value === "car" || value === "trailer" || value === "mixed") {
    return value;
  }
  return null;
}

/**
 * Validate that a raw value looks like a GeoJSON Polygon for parcel
 * persistence. Returns the polygon if it parses, otherwise null.
 */
export function parseParcelPolygon(raw: unknown): Polygon | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.type !== "Polygon") return null;
  if (!Array.isArray(r.coordinates) || r.coordinates.length === 0) return null;
  const ring = r.coordinates[0];
  if (!Array.isArray(ring) || ring.length < 4) return null;
  for (const pt of ring) {
    if (
      !Array.isArray(pt) ||
      pt.length < 2 ||
      typeof pt[0] !== "number" ||
      typeof pt[1] !== "number"
    ) {
      return null;
    }
  }
  return { type: "Polygon", coordinates: r.coordinates as number[][][] };
}
