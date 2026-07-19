-- Module registry defaults.
-- Run after 0001_initial_schema.sql.

insert into public.page_heroes (
  page_slug,
  title,
  subtitle,
  cta_label,
  cta_href,
  background_src,
  poster_src,
  media_type,
  sort_order
) values (
  'gallery',
  'GALLERY',
  'HEADSHOTS',
  'VIEW',
  '#gallery',
  '/images/bio-music.jpg',
  '',
  'image',
  30
) on conflict (page_slug) do nothing;
