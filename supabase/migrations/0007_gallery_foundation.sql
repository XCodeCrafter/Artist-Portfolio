-- Gallery foundation for actor portfolios.
-- Run after 0001_initial_schema.sql and 0006_module_registry.sql.

create table if not exists public.gallery_images (
  id text primary key,
  title text not null,
  src text not null,
  alt text not null default '',
  caption text not null default '',
  category text not null default '',
  sort_order int not null default 0,
  is_published boolean not null default true,
  updated_at timestamptz not null default now()
);

drop trigger if exists gallery_images_updated_at on public.gallery_images;
create trigger gallery_images_updated_at
before update on public.gallery_images
for each row execute function public.set_updated_at();

alter table public.gallery_images enable row level security;

drop policy if exists "Public can read published gallery images"
on public.gallery_images;
create policy "Public can read published gallery images"
on public.gallery_images for select
to anon, authenticated
using (is_published = true);

drop policy if exists "Admins can manage gallery images"
on public.gallery_images;
create policy "Admins can manage gallery images"
on public.gallery_images for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

insert into public.gallery_images (
  id,
  title,
  src,
  alt,
  caption,
  category,
  sort_order
) values
  (
    'headshot-01',
    'Editorial Portrait',
    '/images/bio.jpg',
    'Editorial actor portrait',
    'Natural-light portrait suitable for casting and press.',
    'Headshot',
    10
  ),
  (
    'headshot-02',
    'Studio Headshot',
    '/images/bio-music.jpg',
    'Studio headshot portrait',
    'Clean studio portrait for agencies and casting profiles.',
    'Headshot',
    20
  ),
  (
    'portrait-03',
    'Character Portrait',
    '/images/bio-music-1.jpg',
    'Character portrait',
    'Mood-led portrait for editorial and role range context.',
    'Portrait',
    30
  ),
  (
    'portrait-04',
    'Profile Still',
    '/images/bio-music-3.jpg',
    'Profile still',
    'Portfolio still with a cinematic profile angle.',
    'Still',
    40
  )
on conflict (id) do update set
  title = excluded.title,
  src = excluded.src,
  alt = excluded.alt,
  caption = excluded.caption,
  category = excluded.category,
  sort_order = excluded.sort_order;
