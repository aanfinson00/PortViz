-- Tier 1 amenities #4 + #5: parking + yard polygons.
-- Single-polygon-per-amenity for v1; multi-polygon support is a deferred
-- follow-up that can land without a schema migration (just change the parser
-- to read jsonb arrays).
--
-- parking_polygon : GeoJSON Polygon outlining the parking lot.
-- parking_stalls  : stall count entered by the user (or auto-inferred later).
-- parking_kind    : 'car' | 'trailer' | 'mixed'. Plain text, validated in
--                   app code so we can iterate the value set without enum
--                   migrations.
-- yard_polygon    : GeoJSON Polygon outlining fenced exterior storage.

alter table public.project
  add column if not exists parking_polygon jsonb,
  add column if not exists parking_stalls int,
  add column if not exists parking_kind text,
  add column if not exists yard_polygon jsonb;
