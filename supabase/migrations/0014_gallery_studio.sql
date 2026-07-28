-- Editable copy and media for the public Gallery sequence.
-- Story chapter copy remains attached to gallery_images: category, title, caption.

create table if not exists public.gallery_presentation (
  id text primary key default 'main',
  intro_eyebrow text not null default 'Artist gallery - selected frames',
  intro_title text not null default 'A visual archive with room to breathe.',
  interlude_label text not null default 'The Interlude',
  interlude_meta text not null default 'Portfolio / In progress',
  interlude_eyebrow text not null default 'A quiet study in motion',
  interlude_title text not null default 'Between the frames, the work keeps moving.',
  interlude_video_src text not null default '/media/hero-loop.mp4',
  interlude_poster_src text not null default '/images/video-hero.jpg',
  story_label text not null default 'Artist freelancer life',
  story_scroll_label text not null default 'Scroll through the practice',
  updated_at timestamptz not null default now(),
  constraint gallery_presentation_singleton check (id = 'main')
);

drop trigger if exists gallery_presentation_updated_at
on public.gallery_presentation;
create trigger gallery_presentation_updated_at
before update on public.gallery_presentation
for each row execute function public.set_updated_at();

alter table public.gallery_presentation enable row level security;

drop policy if exists "Public can read gallery presentation"
on public.gallery_presentation;
create policy "Public can read gallery presentation"
on public.gallery_presentation for select
to anon, authenticated
using (true);

drop policy if exists "Admins can manage gallery presentation"
on public.gallery_presentation;
create policy "Admins can manage gallery presentation"
on public.gallery_presentation for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

insert into public.gallery_presentation (id)
values ('main')
on conflict (id) do nothing;
