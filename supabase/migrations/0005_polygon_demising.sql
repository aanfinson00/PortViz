-- Adds polygon-based demising columns alongside the existing AABB flow.
-- Existing buildings keep working unchanged: bay.shape stays null, the
-- in-app code falls back to splitFootprintIntoBays() for those rows.

alter table public.bay
  add column if not exists shape jsonb;
  -- GeoJSON Polygon in WGS84 lng/lat. When set, it is the source of truth
  -- for the bay's footprint; when null, the bay's polygon is computed from
  -- the building outline + bay widths.

alter table public.building
  add column if not exists site_plan_doc_id uuid references public.document (id) on delete set null,
  add column if not exists trace_target_sf int,
  add column if not exists trace_image_dims jsonb;
  -- {widthPx, heightPx} of the rendered site plan, kept so the trace can
  -- be re-opened later for editing.

alter table public.space
  add column if not exists target_sf int;
  -- User's intended SF for the space; the demising editor compares this to
  -- the polygon-computed SF and shows a Δ% accuracy badge.
