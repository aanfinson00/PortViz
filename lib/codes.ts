import { z } from "zod";

/**
 * Human-readable codes for projects, buildings, spaces, and tenants.
 *
 * Rules:
 * - Uppercase A-Z, digits 0-9.
 * - 1 to 10 characters.
 * - No dashes inside a single code (dashes join codes into composite IDs).
 */
export const CODE_REGEX = /^[A-Z0-9]{1,10}$/;
export const codeSchema = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .pipe(
    z.string().regex(CODE_REGEX, {
      message: "Code must be 1-10 uppercase letters or digits (no spaces or dashes).",
    }),
  );

export function buildProjectId(projectCode: string): string {
  return codeSchema.parse(projectCode);
}

export function buildBuildingId(
  projectCode: string,
  buildingCode: string,
): string {
  return `${codeSchema.parse(projectCode)}-${codeSchema.parse(buildingCode)}`;
}

export function buildSpaceId(
  projectCode: string,
  buildingCode: string,
  spaceCode: string,
): string {
  return `${codeSchema.parse(projectCode)}-${codeSchema.parse(buildingCode)}-${codeSchema.parse(spaceCode)}`;
}

export function buildTenantId(tenantCode: string): string {
  return codeSchema.parse(tenantCode);
}

export type ParsedCompositeId =
  | { kind: "project"; projectCode: string }
  | { kind: "building"; projectCode: string; buildingCode: string }
  | {
      kind: "space";
      projectCode: string;
      buildingCode: string;
      spaceCode: string;
    };

/**
 * Parse a composite ID like "ATL01", "ATL01-A", or "ATL01-A-100" back into
 * its component codes. Throws if the format is invalid.
 */
export function parseCompositeId(id: string): ParsedCompositeId {
  const parts = id.trim().toUpperCase().split("-");
  if (parts.length < 1 || parts.length > 3) {
    throw new Error(`Invalid composite ID: "${id}"`);
  }
  for (const part of parts) {
    if (!CODE_REGEX.test(part)) {
      throw new Error(`Invalid code segment "${part}" in "${id}"`);
    }
  }
  if (parts.length === 1) {
    return { kind: "project", projectCode: parts[0]! };
  }
  if (parts.length === 2) {
    return {
      kind: "building",
      projectCode: parts[0]!,
      buildingCode: parts[1]!,
    };
  }
  return {
    kind: "space",
    projectCode: parts[0]!,
    buildingCode: parts[1]!,
    spaceCode: parts[2]!,
  };
}

/**
 * Coin a fresh space code given the codes already in use within the
 * building. Picks the lowest unused integer in 100..999 (matches the
 * 100-floor numbering convention industrial brokers use). Falls back to
 * "S<n>" if 100..999 are all taken (unlikely in practice).
 */
export function nextSpaceCode(usedCodes: string[]): string {
  const used = new Set(usedCodes.map((c) => c.toUpperCase()));
  for (let n = 100; n < 1000; n++) {
    const candidate = String(n);
    if (!used.has(candidate)) return candidate;
  }
  for (let n = 1; n < 1000; n++) {
    const candidate = `S${n}`;
    if (!used.has(candidate)) return candidate;
  }
  return "S";
}
