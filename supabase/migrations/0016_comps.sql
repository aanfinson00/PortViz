-- Lease comps: deals at competitor properties used to benchmark pricing
-- for the org's own listings. Stored at the org level (not per-project)
-- because a single comp informs multiple properties; the comp_assignment
-- join records which of the org's projects each comp is relevant to.
--
-- kind         : lease | sale (sale data is rarer in industrial leasing
--                workflows but the schema supports it from day one)
-- tenant_name  : free text — comps are typed by hand off broker emails
-- building_name: e.g. "Crossroads Distribution Center"
-- address/city/state : street + locality
-- lng/lat      : geocoded location used by the flow map
-- sf           : leased size of the deal
-- rent_psf     : starting base rent in $/SF/year
-- lease_type   : nnn | modified_gross | gross | absolute_net | percentage | other
-- term_months  : initial term length
-- deal_date    : signing date (or as close as the source records it)
-- source       : where the comp came from ("CoStar", "broker email", etc.)

create table public.comp (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.org (id) on delete cascade,
  kind text not null default 'lease' check (kind in ('lease', 'sale')),
  tenant_name text,
  building_name text,
  address text,
  city text,
  state text,
  lng double precision,
  lat double precision,
  sf int,
  rent_psf numeric,
  lease_type text,
  term_months int,
  deal_date date,
  source text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

create index if not exists comp_org_idx on public.comp (org_id);
create index if not exists comp_deal_date_idx on public.comp (deal_date desc);

-- A comp can be assigned to multiple projects: a 250k SF deal across
-- the highway is a relevant comp for every nearby property.
create table public.comp_assignment (
  comp_id uuid not null references public.comp (id) on delete cascade,
  project_id uuid not null references public.project (id) on delete cascade,
  org_id uuid not null references public.org (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comp_id, project_id)
);

create index if not exists comp_assignment_project_idx
  on public.comp_assignment (project_id);

alter table public.comp enable row level security;
alter table public.comp_assignment enable row level security;

create policy comp_rw on public.comp
  for all using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

create policy comp_assignment_rw on public.comp_assignment
  for all using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());
