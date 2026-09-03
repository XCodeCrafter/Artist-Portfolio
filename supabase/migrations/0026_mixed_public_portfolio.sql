-- Activate the mixed Actor + Music review experience without deleting legacy
-- profile settings or rewriting historical inquiry classification.

begin;

alter table public.booking_inquiries
add column if not exists inquiry_intent text;

alter table public.booking_inquiries
drop constraint if exists booking_inquiries_inquiry_intent_check;

alter table public.booking_inquiries
add constraint booking_inquiries_inquiry_intent_check
check (
  inquiry_intent is null
  or inquiry_intent in ('music', 'acting', 'general')
);

create index if not exists booking_inquiries_intent_created_at_idx
on public.booking_inquiries (inquiry_intent, created_at desc)
where inquiry_intent is not null;

-- Page routes lead the temporary review navbar; nested destinations follow.
-- The upsert and activation share one transaction, so version 1 never observes
-- a half-written collection.
insert into public.site_navigation_items (
  site_id,
  destination_key,
  is_visible,
  sort_order
) select
  'main',
  preset.destination_key,
  preset.is_visible,
  preset.sort_order
from (
  values
    ('home', true, 10::smallint),
    ('bio', true, 20::smallint),
    ('gallery', true, 30::smallint),
    ('music', true, 40::smallint),
    ('works', true, 50::smallint),
    ('contact', true, 60::smallint),
    ('home.about', true, 70::smallint),
    ('home.cnc', true, 80::smallint),
    ('home.stories', true, 90::smallint),
    ('bio.resume', true, 100::smallint),
    ('music.platforms', true, 110::smallint),
    ('music.spotify', true, 120::smallint),
    ('music.soundcloud', true, 130::smallint)
) as preset(destination_key, is_visible, sort_order)
where exists (
  select 1 from public.site_settings where id = 'main'
)
on conflict (site_id, destination_key) do update set
  is_visible = excluded.is_visible,
  sort_order = excluded.sort_order;

update public.site_settings
set navigation_config_version = 1
where id = 'main';

-- Replace only untouched starter copy. Custom artist text is never overwritten.
update public.site_settings
set tagline = 'Actor / Music / Creative Work'
where id = 'main'
  and tagline = 'Music / Photos / Illustration';

update public.site_settings
set description = 'Official actor and musician portfolio featuring biography, headshots, acting credits, showreel, releases, videos, and contact information.'
where id = 'main'
  and description = 'Official portfolio for Franky Fugazi - music, video, biography, and booking.';

update public.site_settings
set contact_blurb = 'For acting, music, productions, bookings, and creative collaborations.'
where id = 'main'
  and contact_blurb = 'Use the form for direct booking and inquiries.';

update public.page_heroes
set subtitle = 'ACTOR / MUSIC / CREATIVE WORK'
where page_slug = 'home'
  and subtitle = 'MUSIC / PHOTOS / ILLUSTRATION';

update public.page_heroes
set title = 'SHOWREEL', subtitle = 'WATCH'
where page_slug = 'video'
  and title = 'VIDEOS'
  and subtitle = 'WATCH';

update public.page_heroes
set title = 'CONTACT', subtitle = 'LET''S WORK TOGETHER'
where page_slug = 'booking'
  and title = 'BOOKING'
  and subtitle = 'CONTACT';

comment on column public.booking_inquiries.inquiry_intent is
  'Visitor-selected music, acting, or general intent. Null preserves legacy rows without guessing.';

commit;
