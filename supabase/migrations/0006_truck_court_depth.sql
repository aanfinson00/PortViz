-- Site amenities: truck court depth.
-- Used by the property dashboard's amenities overlay to render a buffer
-- polygon projected outward from the frontage face. Nullable so existing
-- buildings keep working unchanged; the overlay simply skips a building
-- without a depth set.

alter table public.building
  add column if not exists truck_court_depth_ft int;
