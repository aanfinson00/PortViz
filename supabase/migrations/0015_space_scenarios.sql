-- Space-planning scenarios.
--
-- Extends `demising_scheme` (introduced in 0002) so the table can store
-- two flavors of named layout:
--
--   1. Historical snapshots of layouts that have been applied to live
--      space records (the original behavior — is_scenario=false).
--   2. Scenarios: draft layouts a broker is evaluating without disturbing
--      live spaces (is_scenario=true). Scenarios are never `is_active`;
--      promoting a scenario to live writes its snapshot to the live
--      space rows and flips is_scenario to false.
--
-- `snapshot_data` captures the layout shape for either demising_mode in
-- one jsonb blob so a single tRPC procedure can hydrate either. See
-- lib/scenarioSnapshot.ts for the Zod schema; the database is forgiving
-- (jsonb) and validation happens in the application layer.
--
-- `linked_prospect_ids` is an optional list of leasing_prospect ids the
-- broker is targeting with this scenario — surfaces in the test-fit UI
-- as "deals we explicitly want to fit here" alongside the SF-bucket
-- auto-matches.

alter table public.demising_scheme
  add column if not exists is_scenario boolean not null default false,
  add column if not exists description text,
  add column if not exists snapshot_data jsonb,
  add column if not exists mode text,
  add column if not exists linked_prospect_ids uuid[] not null default '{}';

-- A scenario must not be the active scheme — keeps the "only one active"
-- semantics from the partial unique index honest.
alter table public.demising_scheme
  add constraint demising_scheme_scenario_not_active
  check (not (is_scenario and is_active));

-- Most lookups are "give me scenarios for this building" — index it.
create index if not exists demising_scheme_building_scenario_idx
  on public.demising_scheme (building_id, is_scenario, updated_at desc);
