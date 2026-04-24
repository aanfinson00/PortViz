# PortViz

3D portfolio & lease visualization for commercial/industrial real estate.

Drop pins for every project on a map, extrude buildings in 3D from their
footprints, and demise spaces bay-by-bay to see how SF, frontage, dock doors,
drive-ins, and parking redistribute in real time.

## Stack

- **Next.js 15** (App Router) + **TypeScript** + **Tailwind CSS**
- **tRPC** for typesafe server/client APIs
- **Supabase** — Postgres + PostGIS + Auth + Storage + RLS
- **Mapbox GL JS** + **Three.js** (custom layer) for the 3D map — Phase 3
- **Vitest** for unit tests

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in Supabase + Mapbox keys
npm run dev                  # http://localhost:3000
npm test                     # run unit tests
npm run typecheck            # strict TypeScript
npm run build                # production build
```

## Data model spine

Every entity has a UUID and a human code. Composite IDs:

| Entity   | Example          |
|----------|------------------|
| Project  | `ATL01`          |
| Building | `ATL01-A`        |
| Space    | `ATL01-A-100`    |
| Tenant   | `ACME`           |

See `lib/codes.ts` for the regex and builders, and
`supabase/migrations/0002_schema.sql` for the full schema with RLS policies
scoped by `org_id`.

## Roadmap

| Phase | Focus                                                          |
|-------|----------------------------------------------------------------|
| 0     | Scaffolding (Next.js, Supabase clients, tRPC) — **done**       |
| 1     | Data model + CRUD routers — **in progress**                    |
| 2     | Portfolio map view with pins and project detail pages          |
| 3     | 3D buildings (Three.js on Mapbox custom layer)                 |
| 4     | Dynamic demising editor — the signature UX                     |
| 5     | Lease details, rent roll, documents via Supabase Storage       |
| 6     | Org invites, roles, public share tokens, CSV export            |

## Repo layout

```
app/                    Next.js App Router pages
  api/trpc/[trpc]/      tRPC route handler
components/             React UI components (built per phase)
lib/
  codes.ts              Composite ID helpers
  demising.ts           Pure demising math + validation
  supabase/             Browser + server Supabase clients
server/trpc/
  init.ts               Context, procedures (public/protected/org)
  root.ts               App router composition
  routers/              Per-domain tRPC routers
supabase/migrations/    SQL migrations (PostGIS + schema + RLS)
```
