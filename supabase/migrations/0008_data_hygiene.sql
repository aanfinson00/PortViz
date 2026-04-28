-- Data hygiene pass:
--   1. Allow 'lease' as a document attachment target.
--   2. Add 'survey' + 'marketing' to document_kind so future uploads
--      have a place to land without falling back to 'other'.
--   3. Per-space floor number for multi-floor demising.
--   4. Audit event log so high-value mutations leave a trail.
--
-- Each change is additive / idempotent; existing rows keep working.

-- 1. document_entity: add 'lease'.
alter type public.document_entity add value if not exists 'lease';

-- 2. document_kind: add 'survey', 'marketing'.
alter type public.document_kind add value if not exists 'survey';
alter type public.document_kind add value if not exists 'marketing';

-- 3. Space floor (defaults to ground floor; existing rows get 1).
alter table public.space
  add column if not exists floor int not null default 1;

-- 4. Audit event log. One row per recorded mutation; payload is a free-form
-- jsonb diff that the routers populate (e.g. {before, after} or {patch}).
-- entity_type is text rather than an enum so any future entity (lease,
-- demising_scheme, etc.) can be logged without an enum migration.
create table if not exists public.event (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.org (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  kind text not null,            -- 'created' | 'updated' | 'deleted' | etc.
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists event_org_entity_idx
  on public.event (org_id, entity_type, entity_id, created_at desc);

create index if not exists event_org_recent_idx
  on public.event (org_id, created_at desc);

alter table public.event enable row level security;

-- Same org-scoped RW policy as the rest of the tenant tables.
create policy event_rw on public.event
  for all using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());
