-- Explicit media placements for the Gallery Mosaic and Artist freelancer life.
-- Run after 0012_typography_settings.sql.

alter table public.gallery_images
  add column if not exists is_mosaic boolean not null default true,
  add column if not exists is_freelance_story boolean not null default false,
  add column if not exists freelance_story_order int not null default 0;

alter table public.gallery_images
  drop constraint if exists gallery_images_freelance_story_order_check;

alter table public.gallery_images
  add constraint gallery_images_freelance_story_order_check
  check (freelance_story_order between 0 and 9999);

-- Keep existing gallery frames in the mosaic and seed the first four as the
-- initial story sequence so current galleries remain complete after migration.
update public.gallery_images
set is_mosaic = true
where is_mosaic is distinct from true;

with first_story_frames as (
  select id, row_number() over (order by sort_order asc, id asc) * 10 as frame_order
  from public.gallery_images
  order by sort_order asc, id asc
  limit 4
)
update public.gallery_images as image
set
  is_freelance_story = true,
  freelance_story_order = first_story_frames.frame_order
from first_story_frames
where image.id = first_story_frames.id;
