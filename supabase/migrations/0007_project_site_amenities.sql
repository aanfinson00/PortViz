-- Site amenities: project-level parcel boundary + access points.
-- Both are nullable jsonb so existing rows keep working unchanged. The
-- amenities overlay reads them on the property dashboard's hero map and
-- skips buildings/projects without them.
--
-- parcel_polygon: GeoJSON Polygon (WGS84 lng/lat) outlining the legal lot.
-- access_points:  array of { lng, lat, label?, role? } objects describing
--                 ingress/egress curb cuts. role is one of
--                 'main' | 'truck' | 'service' | 'emergency' | 'other'
--                 (validated in app code; not enforced by SQL).

alter table public.project
  add column if not exists parcel_polygon jsonb,
  add column if not exists access_points jsonb;
