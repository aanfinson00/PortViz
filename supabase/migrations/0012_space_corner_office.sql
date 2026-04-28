-- Corner-anchored office buildout: replaces the front-strip model from
-- migration 0011. The user picks a corner (front-left / front-right /
-- rear-left / rear-right relative to the building's frontage) and a target
-- office SF; the app derives the squarest rectangle that fits the SF inside
-- the space's slab.
--
-- office_corner is plain text validated in app code so the value set can
-- iterate without enum migrations. office_depth_ft from 0011 is left in
-- place but no longer read or written by the app.

alter table public.space
  add column if not exists office_sf int,
  add column if not exists office_corner text;
