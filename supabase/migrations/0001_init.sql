-- Enable the extensions PortViz relies on.
create extension if not exists "uuid-ossp";
create extension if not exists postgis;

-- Helper: read the caller's org_id from the Supabase JWT. Set via custom
-- claims in a post-login trigger (see 0003_auth.sql when added).
create or replace function public.current_org_id()
returns uuid
language sql
stable
as $$
  select nullif(
    (current_setting('request.jwt.claims', true)::jsonb
      -> 'app_metadata' ->> 'org_id'),
    ''
  )::uuid;
$$;
