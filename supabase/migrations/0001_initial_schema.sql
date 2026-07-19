-- Artist portfolio CMS schema.
-- Run in Supabase SQL editor or through the Supabase CLI.

create extension if not exists pgcrypto;

create table if not exists public.site_settings (
  id text primary key default 'main' check (id = 'main'),
  portfolio_type text not null default 'musician' check (portfolio_type in ('musician', 'actor')),
  artist_name text not null,
  tagline text not null default '',
  description text not null default '',
  location text not null default '',
  spotify_artist_url text not null default '',
  spotify_embed_url text not null default '',
  contact_blurb text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.page_heroes (
  page_slug text primary key,
  title text not null,
  subtitle text not null default '',
  cta_label text not null default '',
  cta_href text not null default '',
  background_src text not null,
  poster_src text not null default '',
  media_type text not null default 'image' check (media_type in ('image', 'video')),
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.media_assets (
  id text primary key,
  label text not null,
  src text not null,
  alt text not null default '',
  media_type text not null check (media_type in ('image', 'video', 'audio', 'document')),
  usage_key text not null default '',
  sort_order int not null default 0,
  is_published boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.home_updates (
  id text primary key,
  text text not null,
  link_label text not null default '',
  href text not null default '',
  avatar_src text not null default '',
  sort_order int not null default 0,
  is_published boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.about_home (
  id text primary key default 'main' check (id = 'main'),
  heading text not null default 'ABOUT',
  body text not null default '',
  cta_label text not null default '',
  cta_href text not null default '',
  image_src text not null default '',
  image_alt text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.social_links (
  id text primary key,
  label text not null,
  platform text not null,
  href text not null,
  icon_key text not null default '',
  sort_order int not null default 0,
  is_published boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.music_platform_links (
  id text primary key,
  title text not null,
  label text not null default '',
  href text not null,
  icon_key text not null,
  image_src text not null,
  sort_order int not null default 0,
  is_published boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.soundcloud_tracks (
  id text primary key,
  title text not null default '',
  embed_url text not null,
  sort_order int not null default 0,
  is_published boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.bio_gallery_images (
  id text primary key,
  src text not null,
  alt text not null default '',
  sort_order int not null default 0,
  is_published boolean not null default true,
  updated_at timestamptz not null default now()
);

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

create table if not exists public.bio_profile (
  id text primary key default 'main' check (id = 'main'),
  top_label text not null default '',
  intro_text text not null default '',
  caption text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.bio_paragraphs (
  id text primary key,
  body text not null,
  reveal_delay int not null default 0,
  sort_order int not null default 0,
  is_published boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.actor_resume (
  id text primary key default 'main' check (id = 'main'),
  headline text not null default '',
  summary text not null default '',
  location text not null default '',
  playing_age text not null default '',
  height text not null default '',
  eyes text not null default '',
  hair text not null default '',
  languages text not null default '',
  skills text not null default '',
  representation text not null default '',
  resume_url text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.actor_credits (
  id text primary key,
  credit_type text not null default 'other' check (
    credit_type in (
      'film',
      'television',
      'theatre',
      'commercial',
      'voiceover',
      'training',
      'other'
    )
  ),
  title text not null,
  role text not null default '',
  production text not null default '',
  director text not null default '',
  year text not null default '',
  href text not null default '',
  sort_order int not null default 0,
  is_published boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.videos (
  id text primary key,
  title text not null,
  description text not null default '',
  embed_url text not null,
  platform text not null default 'youtube',
  thumbnail_src text not null default '',
  video_type text not null default 'music_video' check (
    video_type in (
      'showreel',
      'scene',
      'self_tape',
      'interview',
      'music_video',
      'behind_scenes',
      'other'
    )
  ),
  is_featured boolean not null default false,
  sort_order int not null default 0,
  is_published boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.booking_inquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  message text not null,
  portfolio_type text not null default 'musician' check (portfolio_type in ('musician', 'actor')),
  inquiry_type text not null default 'booking' check (inquiry_type in ('booking', 'collaboration')),
  status text not null default 'new' check (status in ('new', 'read', 'replied', 'archived')),
  source_ip text,
  user_agent text,
  admin_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  page_path text not null default '',
  target_label text not null default '',
  target_url text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  table_name text not null default '',
  record_id text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role text not null default 'admin' check (role in ('admin', 'owner')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists site_settings_updated_at on public.site_settings;
create trigger site_settings_updated_at
before update on public.site_settings
for each row execute function public.set_updated_at();

drop trigger if exists page_heroes_updated_at on public.page_heroes;
create trigger page_heroes_updated_at
before update on public.page_heroes
for each row execute function public.set_updated_at();

drop trigger if exists media_assets_updated_at on public.media_assets;
create trigger media_assets_updated_at
before update on public.media_assets
for each row execute function public.set_updated_at();

drop trigger if exists home_updates_updated_at on public.home_updates;
create trigger home_updates_updated_at
before update on public.home_updates
for each row execute function public.set_updated_at();

drop trigger if exists about_home_updated_at on public.about_home;
create trigger about_home_updated_at
before update on public.about_home
for each row execute function public.set_updated_at();

drop trigger if exists social_links_updated_at on public.social_links;
create trigger social_links_updated_at
before update on public.social_links
for each row execute function public.set_updated_at();

drop trigger if exists music_platform_links_updated_at on public.music_platform_links;
create trigger music_platform_links_updated_at
before update on public.music_platform_links
for each row execute function public.set_updated_at();

drop trigger if exists soundcloud_tracks_updated_at on public.soundcloud_tracks;
create trigger soundcloud_tracks_updated_at
before update on public.soundcloud_tracks
for each row execute function public.set_updated_at();

drop trigger if exists bio_gallery_images_updated_at on public.bio_gallery_images;
create trigger bio_gallery_images_updated_at
before update on public.bio_gallery_images
for each row execute function public.set_updated_at();

drop trigger if exists gallery_images_updated_at on public.gallery_images;
create trigger gallery_images_updated_at
before update on public.gallery_images
for each row execute function public.set_updated_at();

drop trigger if exists bio_profile_updated_at on public.bio_profile;
create trigger bio_profile_updated_at
before update on public.bio_profile
for each row execute function public.set_updated_at();

drop trigger if exists bio_paragraphs_updated_at on public.bio_paragraphs;
create trigger bio_paragraphs_updated_at
before update on public.bio_paragraphs
for each row execute function public.set_updated_at();

drop trigger if exists actor_resume_updated_at on public.actor_resume;
create trigger actor_resume_updated_at
before update on public.actor_resume
for each row execute function public.set_updated_at();

drop trigger if exists actor_credits_updated_at on public.actor_credits;
create trigger actor_credits_updated_at
before update on public.actor_credits
for each row execute function public.set_updated_at();

drop trigger if exists videos_updated_at on public.videos;
create trigger videos_updated_at
before update on public.videos
for each row execute function public.set_updated_at();

drop trigger if exists booking_inquiries_updated_at on public.booking_inquiries;
create trigger booking_inquiries_updated_at
before update on public.booking_inquiries
for each row execute function public.set_updated_at();

alter table public.site_settings enable row level security;
alter table public.page_heroes enable row level security;
alter table public.media_assets enable row level security;
alter table public.home_updates enable row level security;
alter table public.about_home enable row level security;
alter table public.social_links enable row level security;
alter table public.music_platform_links enable row level security;
alter table public.soundcloud_tracks enable row level security;
alter table public.bio_gallery_images enable row level security;
alter table public.gallery_images enable row level security;
alter table public.bio_profile enable row level security;
alter table public.bio_paragraphs enable row level security;
alter table public.actor_resume enable row level security;
alter table public.actor_credits enable row level security;
alter table public.videos enable row level security;
alter table public.booking_inquiries enable row level security;
alter table public.analytics_events enable row level security;
alter table public.audit_logs enable row level security;
alter table public.admin_profiles enable row level security;

drop trigger if exists admin_profiles_updated_at on public.admin_profiles;
create trigger admin_profiles_updated_at
before update on public.admin_profiles
for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_profiles
    where user_id = auth.uid()
      and is_active = true
  );
$$;

create policy "Public can read site settings"
on public.site_settings for select
to anon, authenticated
using (true);

create policy "Public can read page heroes"
on public.page_heroes for select
to anon, authenticated
using (true);

create policy "Public can read published media"
on public.media_assets for select
to anon, authenticated
using (is_published = true);

create policy "Public can read published updates"
on public.home_updates for select
to anon, authenticated
using (is_published = true);

create policy "Public can read about home"
on public.about_home for select
to anon, authenticated
using (true);

create policy "Public can read published social links"
on public.social_links for select
to anon, authenticated
using (is_published = true);

create policy "Public can read published music platform links"
on public.music_platform_links for select
to anon, authenticated
using (is_published = true);

create policy "Public can read published soundcloud tracks"
on public.soundcloud_tracks for select
to anon, authenticated
using (is_published = true);

create policy "Public can read published bio gallery images"
on public.bio_gallery_images for select
to anon, authenticated
using (is_published = true);

create policy "Public can read published gallery images"
on public.gallery_images for select
to anon, authenticated
using (is_published = true);

create policy "Public can read bio profile"
on public.bio_profile for select
to anon, authenticated
using (true);

create policy "Public can read published bio paragraphs"
on public.bio_paragraphs for select
to anon, authenticated
using (is_published = true);

create policy "Public can read actor resume"
on public.actor_resume for select
to anon, authenticated
using (true);

create policy "Public can read published actor credits"
on public.actor_credits for select
to anon, authenticated
using (is_published = true);

create policy "Public can read published videos"
on public.videos for select
to anon, authenticated
using (is_published = true);

create policy "Admins can read admin profiles"
on public.admin_profiles for select
to authenticated
using (public.is_admin() or user_id = auth.uid());

create policy "Admins can manage site settings"
on public.site_settings for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can manage page heroes"
on public.page_heroes for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can manage media assets"
on public.media_assets for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can manage home updates"
on public.home_updates for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can manage about home"
on public.about_home for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can manage social links"
on public.social_links for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can manage music platform links"
on public.music_platform_links for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can manage soundcloud tracks"
on public.soundcloud_tracks for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can manage bio gallery images"
on public.bio_gallery_images for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can manage gallery images"
on public.gallery_images for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can manage bio profile"
on public.bio_profile for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can manage bio paragraphs"
on public.bio_paragraphs for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can manage actor resume"
on public.actor_resume for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can manage actor credits"
on public.actor_credits for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can manage videos"
on public.videos for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create unique index if not exists videos_single_featured_idx
on public.videos (is_featured)
where is_featured = true;

create index if not exists videos_type_order_idx
on public.videos (video_type, sort_order);

create index if not exists actor_credits_type_order_idx
on public.actor_credits (credit_type, sort_order);

create index if not exists booking_inquiries_type_created_at_idx
on public.booking_inquiries (portfolio_type, inquiry_type, created_at desc);

create policy "Admins can manage booking inquiries"
on public.booking_inquiries for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can read analytics events"
on public.analytics_events for select
to authenticated
using (public.is_admin());

create policy "Admins can read audit logs"
on public.audit_logs for select
to authenticated
using (public.is_admin());
