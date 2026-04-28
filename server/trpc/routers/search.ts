import { orgProcedure, router } from "../init";

/**
 * Search index for the global Cmd-K palette. Returns a flat list of every
 * project / building / space / tenant in the caller's org. The client does
 * fuzzy matching locally so typing feels instant; this query runs once when
 * the palette opens.
 *
 * For an org with thousands of spaces this would need to be paginated or
 * server-filtered, but PortViz portfolios fit comfortably in memory.
 */
export const searchRouter = router({
  all: orgProcedure.query(async ({ ctx }) => {
    const [{ data: projects, error: pErr }, { data: tenants, error: tErr }] =
      await Promise.all([
        ctx.supabase
          .from("project")
          .select(
            `id, code, name,
             building (id, code, name,
               space (id, code, status))`,
          )
          .eq("org_id", ctx.orgId),
        ctx.supabase
          .from("tenant")
          .select("id, code, name, brand_color")
          .eq("org_id", ctx.orgId),
      ]);
    if (pErr) throw pErr;
    if (tErr) throw tErr;

    type ProjectRow = {
      id: string;
      code: string;
      name: string;
      building?: BuildingRow[];
    };
    type BuildingRow = {
      id: string;
      code: string;
      name: string | null;
      space?: SpaceRow[];
    };
    type SpaceRow = {
      id: string;
      code: string;
      status: string;
    };

    const items: SearchItem[] = [];
    for (const p of (projects ?? []) as ProjectRow[]) {
      items.push({
        type: "project",
        id: p.id,
        code: p.code,
        label: p.name,
        sublabel: p.code,
        url: `/app/projects/${p.code}`,
      });
      for (const b of p.building ?? []) {
        items.push({
          type: "building",
          id: b.id,
          code: `${p.code}-${b.code}`,
          label: b.name ?? `Building ${b.code}`,
          sublabel: `${p.code}-${b.code}`,
          url: `/app/projects/${p.code}/buildings/${b.code}`,
        });
        for (const s of b.space ?? []) {
          items.push({
            type: "space",
            id: s.id,
            code: `${p.code}-${b.code}-${s.code}`,
            label: `Space ${s.code}`,
            sublabel: `${p.code}-${b.code}-${s.code} · ${s.status}`,
            url: `/app/projects/${p.code}/buildings/${b.code}/spaces/${s.code}`,
          });
        }
      }
    }
    for (const t of tenants ?? []) {
      items.push({
        type: "tenant",
        id: t.id,
        code: t.code,
        label: t.name,
        sublabel: t.code,
        url: `/app/tenants`,
        brandColor: t.brand_color ?? undefined,
      });
    }
    return items;
  }),
});

export type SearchItem = {
  type: "project" | "building" | "space" | "tenant";
  id: string;
  code: string;
  label: string;
  sublabel?: string;
  url: string;
  brandColor?: string;
};
