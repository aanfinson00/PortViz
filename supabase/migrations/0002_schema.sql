-- Core PortViz schema: org tenancy, projects, buildings, bays, spaces,
-- tenants, leases, documents, and demising schemes. All tenant-scoped tables
-- carry org_id and are guarded by RLS policies that compare against the
-- caller's JWT claim via public.current_org_id().

-- ---------- Organization & membership ----------

create table public.org (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type public.org_role as enum ('owner', 'editor', 'viewer');

create table public.org_member (
  org_id uuid not null references public.org (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.org_role not null default 'editor',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- ---------- Projects ----------

create table public.project (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.org (id) on delete cascade,
  code text not null,
  name text not null,
  address text,
  -- Plain numeric columns for easy reads via PostgREST. The geography column
  -- below is kept in sync on insert/update by set_project_location_geom()
  -- and is what spatial queries should use.
  lat double precision,
  lng double precision,
  location geography(Point, 4326),
  site_geom geography(Polygon, 4326),
  description text,
  cover_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, code)
);

-- Keep project.location in sync with lat/lng so writers only need to set one.
create or replace function public.set_project_location_geom()
returns trigger language plpgsql as $$
begin
  if new.lat is not null and new.lng is not null then
    new.location = ST_SetSRID(ST_MakePoint(new.lng, new.lat), 4326)::geography;
  else
    new.location = null;
  end if;
  return new;
end;
$$;

create trigger trg_project_location_geom
  before insert or update of lat, lng on public.project
  for each row execute function public.set_project_location_geom();

create index project_org_idx on public.project (org_id);
create index project_location_idx on public.project using gist (location);

-- ---------- Buildings ----------

create table public.building (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.org (id) on delete cascade,
  project_id uuid not null references public.project (id) on delete cascade,
  code text not null,
  name text,
  footprint_geom geography(Polygon, 4326),
  height_ft numeric(6, 2),
  num_floors int default 1,
  clear_height_ft numeric(5, 2),
  year_built int,
  construction_type text,
  office_sf int default 0,
  warehouse_sf int default 0,
  total_sf int generated always as (coalesce(office_sf, 0) + coalesce(warehouse_sf, 0)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, code)
);

create index building_org_idx on public.building (org_id);
create index building_project_idx on public.building (project_id);
create index building_footprint_idx on public.building using gist (footprint_geom);

-- ---------- Bays ----------

create type public.frontage_side as enum ('N', 'S', 'E', 'W');

create table public.bay (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.org (id) on delete cascade,
  building_id uuid not null references public.building (id) on delete cascade,
  ordinal int not null,
  width_ft numeric(6, 2) not null,
  depth_ft numeric(6, 2) not null,
  dock_door_count int not null default 0,
  drive_in_count int not null default 0,
  power_spec jsonb,
  has_yard_access boolean not null default false,
  frontage_side public.frontage_side not null default 'S',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (building_id, ordinal)
);

create index bay_org_idx on public.bay (org_id);
create index bay_building_idx on public.bay (building_id);

-- ---------- Spaces ----------

create type public.space_status as enum ('vacant', 'available', 'pending', 'leased');

create table public.space (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.org (id) on delete cascade,
  building_id uuid not null references public.building (id) on delete cascade,
  code text not null,
  status public.space_status not null default 'vacant',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (building_id, code)
);

create index space_org_idx on public.space (org_id);
create index space_building_idx on public.space (building_id);

-- Which bays a space currently owns. Contiguity is enforced at the app layer
-- (lib/demising.ts#validateDemisingScheme) and re-checked in the tRPC mutation.
create table public.space_bay (
  space_id uuid not null references public.space (id) on delete cascade,
  bay_id uuid not null references public.bay (id) on delete cascade,
  primary key (space_id, bay_id),
  unique (bay_id)
);

-- ---------- Tenants ----------

create table public.tenant (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.org (id) on delete cascade,
  code text not null,
  name text not null,
  contact_name text,
  contact_email text,
  contact_phone text,
  logo_url text,
  brand_color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, code)
);

create index tenant_org_idx on public.tenant (org_id);

-- ---------- Leases ----------

create table public.lease (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.org (id) on delete cascade,
  space_id uuid not null references public.space (id) on delete cascade,
  tenant_id uuid not null references public.tenant (id) on delete restrict,
  start_date date not null,
  end_date date not null,
  commencement_date date,
  base_rent_psf numeric(8, 2),
  escalation_pct numeric(5, 2),
  term_months int,
  options jsonb,
  ti_allowance_psf numeric(8, 2),
  free_rent_months numeric(5, 2),
  commission_psf numeric(8, 2),
  security_deposit numeric(12, 2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index lease_org_idx on public.lease (org_id);
create index lease_space_idx on public.lease (space_id);
create index lease_tenant_idx on public.lease (tenant_id);

-- ---------- Space attributes (industrial-specific per-space extras) ----------

create table public.space_attribute (
  space_id uuid primary key references public.space (id) on delete cascade,
  org_id uuid not null references public.org (id) on delete cascade,
  trailer_parking_count int default 0,
  car_parking_count int default 0,
  yard_sf int default 0,
  exclusive_use jsonb,
  special_rights text,
  updated_at timestamptz not null default now()
);

-- ---------- Documents ----------

create type public.document_kind as enum (
  'lease',
  'site_plan',
  'floor_plan',
  'photo',
  'other'
);

create type public.document_entity as enum ('project', 'building', 'space', 'tenant');

create table public.document (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.org (id) on delete cascade,
  entity_type public.document_entity not null,
  entity_id uuid not null,
  kind public.document_kind not null default 'other',
  file_path text not null,
  file_name text,
  uploaded_by uuid references auth.users (id),
  uploaded_at timestamptz not null default now()
);

create index document_org_idx on public.document (org_id);
create index document_entity_idx on public.document (entity_type, entity_id);

-- ---------- Demising schemes ----------

create table public.demising_scheme (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.org (id) on delete cascade,
  building_id uuid not null references public.building (id) on delete cascade,
  name text not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (building_id, name)
);

create unique index demising_scheme_active_per_building
  on public.demising_scheme (building_id)
  where is_active;

-- Snapshot of which bays a space owned under a given scheme.
create table public.demising_scheme_space (
  scheme_id uuid not null references public.demising_scheme (id) on delete cascade,
  space_id uuid not null references public.space (id) on delete cascade,
  bay_ids uuid[] not null,
  primary key (scheme_id, space_id)
);

-- ---------- updated_at triggers ----------

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'org', 'project', 'building', 'bay', 'space',
    'tenant', 'lease', 'space_attribute', 'demising_scheme'
  ]
  loop
    execute format(
      'create trigger trg_%1$I_updated before update on public.%1$I
         for each row execute function public.set_updated_at();',
      tbl
    );
  end loop;
end $$;

-- ---------- Row Level Security ----------

alter table public.org enable row level security;
alter table public.org_member enable row level security;
alter table public.project enable row level security;
alter table public.building enable row level security;
alter table public.bay enable row level security;
alter table public.space enable row level security;
alter table public.space_bay enable row level security;
alter table public.tenant enable row level security;
alter table public.lease enable row level security;
alter table public.space_attribute enable row level security;
alter table public.document enable row level security;
alter table public.demising_scheme enable row level security;
alter table public.demising_scheme_space enable row level security;

-- Users can see an org if they're a member.
create policy org_select on public.org
  for select using (
    id in (select org_id from public.org_member where user_id = auth.uid())
  );

create policy org_member_select on public.org_member
  for select using (user_id = auth.uid() or org_id = public.current_org_id());

-- Tenant-scoped tables: access if row.org_id equals the caller's active org.
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'project', 'building', 'bay', 'space',
    'tenant', 'lease', 'space_attribute', 'document',
    'demising_scheme'
  ]
  loop
    execute format(
      'create policy %1$I_rw on public.%1$I
         for all using (org_id = public.current_org_id())
         with check (org_id = public.current_org_id());',
      tbl
    );
  end loop;
end $$;

-- Join tables inherit via their parent's org_id.
create policy space_bay_rw on public.space_bay
  for all using (
    space_id in (select id from public.space where org_id = public.current_org_id())
  )
  with check (
    space_id in (select id from public.space where org_id = public.current_org_id())
  );

create policy demising_scheme_space_rw on public.demising_scheme_space
  for all using (
    scheme_id in (
      select id from public.demising_scheme where org_id = public.current_org_id()
    )
  )
  with check (
    scheme_id in (
      select id from public.demising_scheme where org_id = public.current_org_id()
    )
  );
