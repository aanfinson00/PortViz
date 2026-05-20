-- Leasing prospect tracker.
--
-- A leasing prospect is a deal in the pipeline before it becomes a signed
-- lease — anything from a cold cold-call lead up through an executed LOI
-- waiting on legal. The structure mirrors how brokerage groups (VTS, CBRE,
-- JLL, etc.) track deals: a single record per prospect that moves through
-- well-defined stages, with broker contact info, requested SF, target
-- economics, and a probability % for forecasting.
--
-- Once a prospect reaches "executed" the broker typically creates the
-- real lease row (table public.lease) and links back via
-- converted_lease_id; the prospect stays in place as historical record.
--
-- A second table (leasing_prospect_activity) keeps an append-only log of
-- stage transitions and free-form notes so the team can see how a deal
-- evolved — particularly important for handing off between brokers or
-- explaining a "dead" deal six months later.

-- Pipeline stages. The order roughly matches the typical VTS pipeline.
-- "dead" and "on_hold" are terminal/parked states reachable from any
-- earlier stage.
create type public.prospect_stage as enum (
  'prospect',     -- identified lead, no contact yet
  'tour',         -- tour scheduled or completed
  'rfp',          -- request-for-proposal issued (landlord or tenant side)
  'proposal',     -- proposal / unsolicited proposal sent
  'loi',          -- letter of intent in negotiation
  'lease_out',    -- lease document out for signature
  'executed',     -- lease signed — convert to public.lease
  'dead',         -- lost to competitor / no deal
  'on_hold'       -- paused (tenant timing slipped, budget hold, etc.)
);

-- Where the lead came from. Free text would work but a small enum keeps
-- pipeline-source analytics consistent across users.
create type public.prospect_source as enum (
  'cold_call',
  'tenant_broker',
  'cooperating_broker',
  'marketing',
  'referral',
  'existing_tenant',
  'website',
  'other'
);

create table public.leasing_prospect (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.org (id) on delete cascade,

  -- Short human code (optional) — useful for cross-referencing in emails.
  code text,

  -- Prospect company name. Required; "Acme Logistics", "Confidential Fortune
  -- 500 retailer", etc.
  name text not null,

  -- Target property — any of these may be null while the prospect is still
  -- shopping; brokers often track a deal before it lands on a specific space.
  project_id uuid references public.project (id) on delete set null,
  building_id uuid references public.building (id) on delete set null,
  space_id uuid references public.space (id) on delete set null,

  stage public.prospect_stage not null default 'prospect',
  source public.prospect_source,

  -- Tenant rep info (the broker bringing the prospect, if any).
  broker_company text,
  broker_name text,
  broker_email text,
  broker_phone text,

  -- Direct prospect contact (skip-the-broker scenarios — common with
  -- unsolicited proposals).
  contact_name text,
  contact_email text,
  contact_phone text,

  -- Deal scope.
  requested_sf int,
  target_commencement date,
  term_months int,

  -- Economics. Asking is what the landlord wants; proposed is the last
  -- number on the table. Both are PSF/yr for industrial; PSF/yr or PSF/mo
  -- depending on market — we don't enforce units, the broker decides.
  asking_rent_psf numeric(8, 2),
  proposed_rent_psf numeric(8, 2),
  ti_allowance_psf numeric(8, 2),
  free_rent_months numeric(5, 2),

  -- Forecasting fields used by pipeline-weighted-revenue analytics. Pct is
  -- 0-100 and conventionally tracks stage (prospect=10, tour=25, rfp=40,
  -- proposal=55, loi=75, lease_out=90, executed=100); but brokers can
  -- override per-deal.
  probability_pct int check (probability_pct is null or (probability_pct between 0 and 100)),

  -- Pipeline hygiene fields.
  last_activity_date date,
  next_action text,
  next_action_date date,
  assigned_to uuid references auth.users (id) on delete set null,

  -- "Dead" deals: store the reason so we can run loss-reason analysis.
  lost_reason text,

  -- Free-form notes (call summaries, tour feedback, etc.).
  notes text,

  -- When the deal closes, link to the lease row we created.
  converted_lease_id uuid references public.lease (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, code)
);

create index leasing_prospect_org_idx on public.leasing_prospect (org_id);
create index leasing_prospect_stage_idx on public.leasing_prospect (org_id, stage);
create index leasing_prospect_project_idx on public.leasing_prospect (project_id);
create index leasing_prospect_building_idx on public.leasing_prospect (building_id);
create index leasing_prospect_space_idx on public.leasing_prospect (space_id);

-- Append-only activity log. Every stage transition lands here, plus
-- free-form notes the broker wants to record without overwriting the
-- prospect's `notes` field.
create table public.leasing_prospect_activity (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.org (id) on delete cascade,
  prospect_id uuid not null references public.leasing_prospect (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  -- 'stage_changed' | 'note' | 'tour_logged' | 'imported' | etc.
  kind text not null,
  from_stage public.prospect_stage,
  to_stage public.prospect_stage,
  note text,
  occurred_at timestamptz not null default now()
);

create index leasing_prospect_activity_prospect_idx
  on public.leasing_prospect_activity (prospect_id, occurred_at desc);

create index leasing_prospect_activity_org_recent_idx
  on public.leasing_prospect_activity (org_id, occurred_at desc);

-- updated_at trigger.
create trigger trg_leasing_prospect_updated
  before update on public.leasing_prospect
  for each row execute function public.set_updated_at();

-- Row Level Security.
alter table public.leasing_prospect enable row level security;
alter table public.leasing_prospect_activity enable row level security;

create policy leasing_prospect_rw on public.leasing_prospect
  for all using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

create policy leasing_prospect_activity_rw on public.leasing_prospect_activity
  for all using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());
