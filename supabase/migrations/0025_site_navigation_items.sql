-- Curated navigation destinations stored independently from the legacy
-- Actor/Musician profile switch. Version 0 keeps the legacy navbar authoritative
-- until the V2 editor atomically saves and activates version 1.

alter table public.site_settings
add column if not exists navigation_config_version smallint not null default 0;

alter table public.site_settings
drop constraint if exists site_settings_navigation_config_version_valid;

alter table public.site_settings
add constraint site_settings_navigation_config_version_valid
check (navigation_config_version in (0, 1));

create table if not exists public.site_navigation_items (
  site_id text not null default 'main'
    references public.site_settings(id) on delete restrict,
  destination_key text not null,
  is_visible boolean not null default false,
  sort_order smallint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_navigation_items_pkey
    primary key (site_id, destination_key),
  constraint site_navigation_items_destination_key_valid check (
    destination_key in (
      'home',
      'home.about',
      'home.cnc',
      'home.stories',
      'bio',
      'bio.resume',
      'gallery',
      'music',
      'music.platforms',
      'music.spotify',
      'music.soundcloud',
      'works',
      'contact'
    )
  ),
  constraint site_navigation_items_sort_order_valid check (
    sort_order between 10 and 9999
  ),
  constraint site_navigation_items_site_sort_order_unique
    unique (site_id, sort_order) deferrable initially deferred
);

-- Serialize the single site's collection before any mutation. Besides making
-- future optimistic saves deterministic, this closes the write-skew race where
-- two transactions could each hide a different one of the final visible rows.
create or replace function public.lock_site_navigation_collection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('site_navigation_items:main', 0)
  );
  return null;
end;
$$;

drop trigger if exists site_navigation_items_serialize_writes
on public.site_navigation_items;
create trigger site_navigation_items_serialize_writes
before insert or update or delete on public.site_navigation_items
for each statement execute function public.lock_site_navigation_collection();

drop trigger if exists site_navigation_items_updated_at
on public.site_navigation_items;
create trigger site_navigation_items_updated_at
before update on public.site_navigation_items
for each row execute function public.set_updated_at();

-- A deferred collection check permits reordering several rows in one
-- transaction while preventing a saved navbar with no visible destination.
create or replace function public.enforce_nonempty_site_navigation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_site_id text;
begin
  if tg_op = 'DELETE' then
    v_site_id := old.site_id;
  else
    v_site_id := new.site_id;
  end if;

  if exists (
    select 1
    from public.site_settings
    where id = v_site_id
  ) and not exists (
    select 1
    from public.site_navigation_items
    where site_id = v_site_id
      and is_visible = true
  ) then
    raise exception 'site_navigation_empty'
      using errcode = '23514';
  end if;

  return null;
end;
$$;

drop trigger if exists site_navigation_items_nonempty
on public.site_navigation_items;
create constraint trigger site_navigation_items_nonempty
after insert or update or delete on public.site_navigation_items
deferrable initially deferred
for each row execute function public.enforce_nonempty_site_navigation();

revoke all on function public.lock_site_navigation_collection()
from public, anon, authenticated, service_role;
revoke all on function public.enforce_nonempty_site_navigation()
from public, anon, authenticated, service_role;

create index if not exists site_navigation_items_visible_order_idx
on public.site_navigation_items (site_id, sort_order, destination_key)
where is_visible = true;

alter table public.site_navigation_items enable row level security;

revoke all on table public.site_navigation_items
from public, anon, authenticated, service_role;
grant select on table public.site_navigation_items
to anon;
grant select, insert, update on table public.site_navigation_items
to authenticated, service_role;

drop policy if exists "Public can read visible navigation items"
on public.site_navigation_items;
create policy "Public can read visible navigation items"
on public.site_navigation_items for select
to anon, authenticated
using (is_visible = true);

drop policy if exists "Admins can manage navigation items"
on public.site_navigation_items;
drop policy if exists "Admins can read all navigation items"
on public.site_navigation_items;
create policy "Admins can read all navigation items"
on public.site_navigation_items for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can insert navigation items"
on public.site_navigation_items;
create policy "Admins can insert navigation items"
on public.site_navigation_items for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update navigation items"
on public.site_navigation_items;
create policy "Admins can update navigation items"
on public.site_navigation_items for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- The table is populated as a shadow copy of today's menu. Deep-link
-- destinations remain hidden until they have been reviewed and enabled in V2.
insert into public.site_navigation_items (
  site_id,
  destination_key,
  is_visible,
  sort_order
)
select
  settings.id,
  destination.destination_key,
  case
    when settings.portfolio_type = 'actor' then
      destination.actor_default
      and not (
        coalesce(destination.legacy_page_slug, '') = any(
          coalesce(
            settings.hidden_nav_page_slugs_actor,
            '{}'::text[]
          )
        )
      )
    else
      destination.musician_default
      and not (
        coalesce(destination.legacy_page_slug, '') = any(
          coalesce(
            settings.hidden_nav_page_slugs_musician,
            '{}'::text[]
          )
        )
      )
  end,
  destination.sort_order
from public.site_settings as settings
cross join (
  values
    ('home', 10::smallint, 'home', true, true),
    ('home.about', 20::smallint, null, false, false),
    ('home.cnc', 30::smallint, null, false, false),
    ('home.stories', 40::smallint, null, false, false),
    ('bio', 50::smallint, 'bio', true, true),
    ('bio.resume', 60::smallint, null, false, false),
    ('gallery', 70::smallint, 'gallery', true, false),
    ('music', 80::smallint, 'music', false, true),
    ('music.platforms', 90::smallint, null, false, false),
    ('music.spotify', 100::smallint, null, false, false),
    ('music.soundcloud', 110::smallint, null, false, false),
    ('works', 120::smallint, 'video', true, true),
    ('contact', 130::smallint, 'booking', true, true)
) as destination(
  destination_key,
  sort_order,
  legacy_page_slug,
  actor_default,
  musician_default
)
on conflict (site_id, destination_key) do nothing;

comment on column public.site_settings.navigation_config_version is
  '0 reads the legacy profile navbar; 1 activates ordered site_navigation_items.';
comment on table public.site_navigation_items is
  'Ordered visibility for code-owned navbar destinations; hrefs and labels remain in the application registry.';
comment on column public.site_navigation_items.destination_key is
  'Stable key from the application navigation registry, never an arbitrary URL.';
