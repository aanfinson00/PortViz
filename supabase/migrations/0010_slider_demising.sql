-- Slider-based demising. Augments the existing bay-based demising rather
-- than replacing it: existing buildings keep their bay assignments and
-- their `demising_mode` defaults to 'bays'. New buildings default to
-- 'sliders', where each space owns a position along the frontage axis
-- and either a pinned target_sf or a proportional share of the leftover.
--
-- Bays remain in the schema as structural metadata (dock counts, frontage,
-- clear height per zone) — the demising math no longer reads from them
-- when demising_mode = 'sliders'.

create type public.demising_mode as enum ('bays', 'sliders');

alter table public.building
  add column if not exists demising_mode public.demising_mode
    not null default 'sliders';

-- Existing rows are switched back to 'bays' so their bay-based demising
-- editor keeps working. New inserts use the column default 'sliders'.
update public.building
  set demising_mode = 'bays'
  where demising_mode = 'sliders'
    and id in (select building_id from public.bay);

alter table public.space
  -- Order along the frontage axis (left = 0). Used by the slider editor
  -- to compute wall positions; ordinals don't have to be contiguous.
  add column if not exists position_order int,
  -- When true, target_sf is a hard constraint (the wall(s) adjacent to
  -- this space don't slide). When false, target_sf may be a soft target
  -- the user typed once and walls can override.
  add column if not exists is_pinned boolean not null default false;

create index if not exists space_building_order_idx
  on public.space (building_id, position_order);
