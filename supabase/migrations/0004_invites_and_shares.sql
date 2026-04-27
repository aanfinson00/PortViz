-- Org invites: inviters generate a token, recipients exchange it for org
-- membership. Email sending is left to the integrator; the UI surfaces the
-- generated join URL directly.

create table public.org_invite (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.org (id) on delete cascade,
  email text not null,
  role public.org_role not null default 'editor',
  token uuid not null default uuid_generate_v4() unique,
  invited_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id)
);

create index org_invite_org_idx on public.org_invite (org_id);
create index org_invite_token_idx on public.org_invite (token);

alter table public.org_invite enable row level security;

-- Owners/editors of the org can read/manage invites for their org.
create policy org_invite_rw on public.org_invite
  for all
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

-- Public share tokens per project: a token lets anyone read the project (and
-- its buildings, spaces, leases, etc.) through a dedicated share endpoint.
-- Enforced by the app layer using the service-role client; RLS on the base
-- tables stays strict.

create table public.project_share (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.org (id) on delete cascade,
  project_id uuid not null references public.project (id) on delete cascade,
  token uuid not null default uuid_generate_v4() unique,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (project_id, token)
);

create index project_share_token_idx on public.project_share (token) where revoked_at is null;

alter table public.project_share enable row level security;

create policy project_share_rw on public.project_share
  for all
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());
