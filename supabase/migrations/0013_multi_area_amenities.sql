-- Multi-area parking + yard amenities. The single-polygon columns from
-- migrations 0009 (parking_polygon, parking_stalls, parking_kind) and
-- 0009 (yard_polygon) become arrays so users can outline e.g. "Trailer
-- staging" and "Employee lot" as separate areas, each with their own
-- stall count and kind.
--
-- Arrays land in jsonb so the value set can iterate without enum
-- migrations. Each parking area is { polygon, stalls?, kind?, label? };
-- each yard area is { polygon, label? }.
--
-- Existing single-polygon data is migrated into a 1-element array so no
-- user data is lost. The legacy columns stay in place but the app no
-- longer reads or writes them.

alter table public.project
  add column if not exists parking_areas jsonb,
  add column if not exists yard_areas jsonb;

-- Migrate legacy parking data: copy the single polygon into a one-entry
-- array. Skips rows that already have parking_areas set.
update public.project
   set parking_areas = jsonb_build_array(
     jsonb_build_object(
       'polygon', parking_polygon,
       'stalls', parking_stalls,
       'kind', parking_kind
     )
   )
 where parking_polygon is not null
   and parking_areas is null;

-- Migrate legacy yard data.
update public.project
   set yard_areas = jsonb_build_array(
     jsonb_build_object('polygon', yard_polygon)
   )
 where yard_polygon is not null
   and yard_areas is null;
