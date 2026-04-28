import { z } from "zod";
import {
  expiringWithinMonths,
  rollupExpirations,
  rollupTenants,
  type BuildingForRollup,
  type LeaseForRollup,
} from "@/lib/metricsRollup";
import {
  computePropertyMetrics,
  type BuildingForMetrics,
} from "@/lib/propertyMetrics";
import { orgProcedure, router } from "../init";

/**
 * Single canonical endpoint for "property metrics". Future consumers
 * (CSV exports, share views, public APIs) call this instead of
 * re-implementing the roll-up math. The property dashboard itself
 * already has the underlying data via listForMap + activeByProject and
 * applies the same lib helpers client-side; the dashboard doesn't have
 * to switch to this endpoint to benefit from the consolidation, but it
 * may in the future to drop those queries.
 *
 * The select string matches listForMap's defensive shape (with a
 * fallback if migrations 0005/0006 haven't been applied) so
 * environments that haven't run the latest migrations still get a
 * meaningful answer.
 */
export const metricsRouter = router({
  byProject: orgProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // ---------- Fetch project code (for expiration display) ----------
      const projectRes = await ctx.supabase
        .from("project")
        .select("code")
        .eq("org_id", ctx.orgId)
        .eq("id", input.projectId)
        .maybeSingle();
      if (projectRes.error) throw projectRes.error;
      const projectCode = projectRes.data?.code ?? "";

      // ---------- Fetch buildings (with bays + spaces) ----------
      const augmented = `id, code, name, total_sf,
         bay (id, ordinal, width_ft, depth_ft),
         space (id, code, target_sf, space_bay (bay_id))`;
      const core = `id, code, name, total_sf,
         bay (id, ordinal, width_ft, depth_ft),
         space (id, code, space_bay (bay_id))`;
      const tryQuery = (select: string) =>
        ctx.supabase
          .from("building")
          .select(select)
          .eq("org_id", ctx.orgId)
          .eq("project_id", input.projectId)
          .order("code");
      let buildingRows: Array<Record<string, unknown>>;
      const first = await tryQuery(augmented);
      if (!first.error) {
        buildingRows = (first.data ?? []) as unknown as Array<
          Record<string, unknown>
        >;
      } else {
        const msg = first.error.message ?? "";
        const looksLikeMissingColumn =
          first.error.code === "42703" ||
          first.error.code === "PGRST204" ||
          first.error.code === "PGRST116" ||
          /column .* does not exist/i.test(msg) ||
          /could not find .* column/i.test(msg) ||
          /schema cache/i.test(msg);
        if (!looksLikeMissingColumn) throw first.error;
        const fallback = await tryQuery(core);
        if (fallback.error) throw fallback.error;
        buildingRows = (fallback.data ?? []) as unknown as Array<
          Record<string, unknown>
        >;
      }

      // ---------- Fetch active leases ----------
      const today = new Date().toISOString().slice(0, 10);
      const buildingIds = buildingRows.map((b) => String(b.id));
      let leaseRows: Array<Record<string, unknown>> = [];
      if (buildingIds.length > 0) {
        const { data: spaces, error: spacesErr } = await ctx.supabase
          .from("space")
          .select("id")
          .eq("org_id", ctx.orgId)
          .in("building_id", buildingIds);
        if (spacesErr) throw spacesErr;
        const spaceIds = (spaces ?? []).map((s) => s.id);
        if (spaceIds.length > 0) {
          const { data: leases, error: leasesErr } = await ctx.supabase
            .from("lease")
            .select(
              "id, space_id, start_date, end_date, base_rent_psf, tenant:tenant_id (id, code, name, brand_color)",
            )
            .eq("org_id", ctx.orgId)
            .in("space_id", spaceIds)
            .lte("start_date", today)
            .gte("end_date", today);
          if (leasesErr) throw leasesErr;
          leaseRows = (leases ?? []) as Array<Record<string, unknown>>;
        }
      }

      // ---------- Normalize for the rollup helpers ----------
      type RawSpace = {
        id: string;
        code: string;
        target_sf?: number | null;
        space_bay: Array<{ bay_id: string }>;
      };
      type RawBay = {
        id: string;
        ordinal: number;
        width_ft: number;
        depth_ft: number;
      };
      type RawBuilding = {
        id: string;
        code: string;
        name: string | null;
        total_sf: number | null;
        bay: RawBay[];
        space: RawSpace[];
      };
      const buildings = buildingRows as unknown as RawBuilding[];

      const buildingsForMetrics: BuildingForMetrics[] = buildings.map((b) => ({
        id: b.id,
        totalSf: Number(b.total_sf ?? 0),
        bays: b.bay.map((x) => ({
          id: x.id,
          widthFt: Number(x.width_ft),
          depthFt: Number(x.depth_ft),
        })),
        spaces: b.space.map((s) => ({
          id: s.id,
          targetSf: s.target_sf ?? null,
          bayIds: s.space_bay.map((sb) => sb.bay_id),
        })),
      }));

      const buildingsForRollup: BuildingForRollup[] = buildings.map((b) => ({
        id: b.id,
        code: b.code,
        bays: buildingsForMetrics.find((x) => x.id === b.id)!.bays,
        spaces: b.space.map((s) => ({
          id: s.id,
          code: s.code,
          targetSf: s.target_sf ?? null,
          bayIds: s.space_bay.map((sb) => sb.bay_id),
        })),
      }));

      type RawTenant = {
        id: string;
        code: string;
        name: string;
        brand_color: string | null;
      };
      const leasesForRollup: LeaseForRollup[] = leaseRows.flatMap((l) => {
        const t = (l.tenant ?? null) as RawTenant | RawTenant[] | null;
        const tenant = Array.isArray(t) ? t[0] ?? null : t;
        return [
          {
            id: String(l.id),
            spaceId: String(l.space_id),
            endDate: String(l.end_date),
            baseRentPsf:
              l.base_rent_psf != null ? Number(l.base_rent_psf) : null,
            tenant: tenant
              ? {
                  id: tenant.id,
                  code: tenant.code,
                  name: tenant.name,
                  brandColor: tenant.brand_color,
                }
              : null,
          },
        ];
      });

      const activeSpaceIds = new Set(leasesForRollup.map((l) => l.spaceId));

      const summary = computePropertyMetrics(buildingsForMetrics, activeSpaceIds);
      const tenants = rollupTenants({
        buildings: buildingsForRollup,
        leases: leasesForRollup,
      });
      const expirations = rollupExpirations({
        buildings: buildingsForRollup,
        leases: leasesForRollup,
        projectCode,
      });

      return {
        summary,
        tenants,
        expirations,
        expiringIn12moCount: expiringWithinMonths(expirations, 12),
      };
    }),
});
