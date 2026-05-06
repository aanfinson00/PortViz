-- Listing data per space: powers the Available tab + future per-space
-- marketing flyer. All nullable so existing rows stay valid.
--
-- asking_rent_psf       : annual base rent the space is being marketed at
-- opex_psf_year_one     : year-1 operating expense estimate (NNN)
-- available_date        : when the space comes online
-- min_divisibility_sf   : smallest tenant block we'll demise to
-- max_divisibility_sf   : largest contiguous block we can offer
-- marketing_description : free text for the listing flyer / OM blurb

alter table public.space
  add column if not exists asking_rent_psf numeric,
  add column if not exists opex_psf_year_one numeric,
  add column if not exists available_date date,
  add column if not exists min_divisibility_sf int,
  add column if not exists max_divisibility_sf int,
  add column if not exists marketing_description text;
