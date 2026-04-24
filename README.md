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

## First-time Supabase setup

1. Create a Supabase project and copy the URL + anon key into `.env.local`.
2. Add `SUPABASE_SERVICE_ROLE_KEY` (optional — only needed for `/share/[token]`).
3. Apply the migrations in order:
   ```bash
   supabase link --project-ref <ref>
   supabase db push
   ```
   (Or run them manually against `postgres` — the four files in
   `supabase/migrations/` apply clean top-to-bottom.)
4. Create an org and add yourself as an owner. Simplest path in the SQL editor:
   ```sql
   insert into public.org (id, name, slug)
     values (gen_random_uuid(), 'My Portfolio', 'my-portfolio');
   insert into public.org_member (org_id, user_id, role)
     select id, auth.uid(), 'owner' from public.org where slug = 'my-portfolio';
   ```
5. Set your JWT custom claim so the app knows which org you&rsquo;re acting as.
   Either attach a post-login trigger that writes `app_metadata.org_id`, or
   update the user&rsquo;s metadata manually:
   ```sql
   update auth.users
     set raw_app_meta_data = jsonb_set(
       coalesce(raw_app_meta_data, '{}'::jsonb),
       '{org_id}',
       to_jsonb((select id::text from public.org where slug = 'my-portfolio'))
     )
     where id = auth.uid();
   ```
6. Create a storage bucket named `documents` (migration `0003_storage.sql`
   does this for you when you run it).
7. Grab a public Mapbox token and put it in `NEXT_PUBLIC_MAPBOX_TOKEN`.

Sign in, open `/app`, click &ldquo;New project&rdquo;, and you&rsquo;re off.

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

| Phase | Focus                                                          | Status    |
|-------|----------------------------------------------------------------|-----------|
| 0     | Scaffolding (Next.js, Supabase clients, tRPC)                  | done      |
| 1     | Data model + CRUD routers                                      | done      |
| 2     | Portfolio map view with pins and project detail pages          | done      |
| 3     | 3D buildings (Mapbox fill-extrusion on footprint polygons)     | done      |
| 4     | Dynamic demising editor — the signature UX                     | done      |
| 5     | Lease details, rent roll, documents via Supabase Storage       | done      |
| 6     | Org invites, roles, public share tokens, CSV export            | done      |

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
