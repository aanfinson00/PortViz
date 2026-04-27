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
