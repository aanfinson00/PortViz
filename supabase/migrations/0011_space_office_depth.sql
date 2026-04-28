-- Per-space office buildout depth (front strip along the frontage).
-- Nullable / 0 = no office. The warehouse area is the rest of the space.
-- Width override (e.g. half-width corner office) is deferred to v2;
-- v1 assumes the office spans the full frontage of the space.

alter table public.space
  add column if not exists office_depth_ft int;
