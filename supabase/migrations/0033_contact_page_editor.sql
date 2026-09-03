-- Admin V2 Contact page editor.
--
-- Contact keeps its established storage model: the booking hero lives in
-- page_heroes and the public location/copy live in site_settings. The two
-- service-only save boundaries reject stale snapshots and never delete or
-- reinterpret historical booking inquiries.

begin;

-- Repair only a missing singleton. Existing Contact copy and media always win.
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
)
values (
  'booking',
  'CONTACT',
  'LET''S WORK TOGETHER',
  'WRITE',
  '#form',
  '/images/booking-hero.jpg',
  '',
  'image',
  60
)
on conflict (page_slug) do nothing;

create or replace function public.get_contact_page_v2_snapshot(
  p_site_id text default 'main'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot jsonb;
begin
  if p_site_id is distinct from 'main' then
    raise exception 'invalid_contact_page_site'
      using errcode = '22023';
  end if;

  -- One statement keeps the two editor sections on one consistent snapshot.
  select pg_catalog.jsonb_build_object(
    'hero', pg_catalog.jsonb_build_object(
      'title', hero.title,
      'subtitle', hero.subtitle,
      'ctaLabel', hero.cta_label,
      'ctaHref', hero.cta_href,
      'backgroundSrc', hero.background_src,
      'posterSrc', hero.poster_src,
      'mediaType', hero.media_type,
      'updatedAt', hero.updated_at
    ),
    'details', pg_catalog.jsonb_build_object(
      'location', settings.location,
      'contactBlurb', settings.contact_blurb,
      'updatedAt', settings.updated_at
    )
  )
  into v_snapshot
  from public.site_settings as settings
  cross join public.page_heroes as hero
  where settings.id = p_site_id
    and hero.page_slug = 'booking';

  if v_snapshot is null then
    raise exception 'contact_page_snapshot_missing'
      using errcode = '23503';
  end if;

  return v_snapshot;
end;
$$;

create or replace function public.save_contact_hero_v2(
  p_site_id text,
  p_expected_updated_at timestamptz,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_version timestamptz;
  v_version timestamptz;
begin
  if p_site_id is distinct from 'main'
    or p_expected_updated_at is null
    or pg_catalog.jsonb_typeof(p_payload) is distinct from 'object'
    or not (p_payload ?& array[
      'title', 'subtitle', 'ctaLabel', 'ctaHref',
      'backgroundSrc', 'posterSrc', 'mediaType'
    ])
    or exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_payload) as supplied(key)
      where supplied.key not in (
        'title', 'subtitle', 'ctaLabel', 'ctaHref',
        'backgroundSrc', 'posterSrc', 'mediaType'
      )
    )
    or exists (
      select 1
      from pg_catalog.jsonb_each(p_payload) as supplied(key, value)
      where pg_catalog.jsonb_typeof(supplied.value) is distinct from 'string'
    )
  then
    raise exception 'invalid_contact_hero_payload'
      using errcode = '22023';
  end if;

  if pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'title')) not between 1 and 220
    or pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'subtitle')) > 220
    or pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'ctaLabel')) > 220
    or pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'ctaHref')) > 2048
    or pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'backgroundSrc')) not between 1 and 2048
    or pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'posterSrc')) > 2048
    or (p_payload ->> 'mediaType') not in ('image', 'video')
    or ((pg_catalog.btrim(p_payload ->> 'ctaLabel') = '') <>
        (pg_catalog.btrim(p_payload ->> 'ctaHref') = ''))
    or (
      pg_catalog.btrim(p_payload ->> 'ctaHref') <> ''
      and not (
        pg_catalog.btrim(p_payload ->> 'ctaHref') ~ '^#[A-Za-z][A-Za-z0-9_-]*$'
        or (
          pg_catalog.left(pg_catalog.btrim(p_payload ->> 'ctaHref'), 1) = '/'
          and pg_catalog.left(pg_catalog.btrim(p_payload ->> 'ctaHref'), 2) <> '//'
        )
        or (
          pg_catalog.btrim(p_payload ->> 'ctaHref')
            ~* '^https://[^[:space:]/?#:@]+(:443)?([/?#]|$)'
        )
      )
    )
    or not (
      (
        pg_catalog.left(pg_catalog.btrim(p_payload ->> 'backgroundSrc'), 1) = '/'
        and pg_catalog.left(pg_catalog.btrim(p_payload ->> 'backgroundSrc'), 2) <> '//'
      )
      or (
        pg_catalog.btrim(p_payload ->> 'backgroundSrc')
          ~* '^https://[^[:space:]/?#:@]+(:443)?([/?#]|$)'
        and exists (
          select 1
          from public.media_assets as background_asset
          where background_asset.src = pg_catalog.btrim(p_payload ->> 'backgroundSrc')
            and background_asset.media_type = p_payload ->> 'mediaType'
            and background_asset.deleted_at is null
        )
      )
    )
    or (
      pg_catalog.btrim(p_payload ->> 'posterSrc') <> ''
      and not (
        (
          pg_catalog.left(pg_catalog.btrim(p_payload ->> 'posterSrc'), 1) = '/'
          and pg_catalog.left(pg_catalog.btrim(p_payload ->> 'posterSrc'), 2) <> '//'
        )
        or (
          pg_catalog.btrim(p_payload ->> 'posterSrc')
            ~* '^https://[^[:space:]/?#:@]+(:443)?([/?#]|$)'
          and exists (
            select 1
            from public.media_assets as poster_asset
            where poster_asset.src = pg_catalog.btrim(p_payload ->> 'posterSrc')
              and poster_asset.media_type = 'image'
              and poster_asset.deleted_at is null
          )
        )
      )
    )
    or pg_catalog.concat_ws(
      '', p_payload ->> 'ctaHref', p_payload ->> 'backgroundSrc', p_payload ->> 'posterSrc'
    ) ~ '[[:cntrl:]]'
    or pg_catalog.strpos(
      pg_catalog.concat_ws(
        '', p_payload ->> 'ctaHref', p_payload ->> 'backgroundSrc', p_payload ->> 'posterSrc'
      ),
      pg_catalog.chr(92)
    ) > 0
  then
    raise exception 'invalid_contact_hero_payload'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('contact_page_v2:hero:main', 0)
  );

  -- Serialize publication with Media Library trashing. The trash RPC locks the
  -- same asset row before checking whether public content still references it.
  if pg_catalog.left(pg_catalog.btrim(p_payload ->> 'backgroundSrc'), 1) <> '/' then
    perform 1
    from public.media_assets as background_asset
    where background_asset.src = pg_catalog.btrim(p_payload ->> 'backgroundSrc')
      and background_asset.media_type = p_payload ->> 'mediaType'
      and background_asset.deleted_at is null
    for share;
    if not found then
      raise exception 'invalid_contact_hero_payload'
        using errcode = '22023';
    end if;
  end if;

  if pg_catalog.btrim(p_payload ->> 'posterSrc') <> ''
    and pg_catalog.left(pg_catalog.btrim(p_payload ->> 'posterSrc'), 1) <> '/'
  then
    perform 1
    from public.media_assets as poster_asset
    where poster_asset.src = pg_catalog.btrim(p_payload ->> 'posterSrc')
      and poster_asset.media_type = 'image'
      and poster_asset.deleted_at is null
    for share;
    if not found then
      raise exception 'invalid_contact_hero_payload'
        using errcode = '22023';
    end if;
  end if;

  select hero.updated_at
  into v_current_version
  from public.page_heroes as hero
  where hero.page_slug = 'booking'
  for update;

  if not found then
    raise exception 'contact_page_snapshot_missing'
      using errcode = '23503';
  end if;
  if v_current_version is distinct from p_expected_updated_at then
    raise exception 'contact_hero_changed'
      using errcode = '40001';
  end if;

  update public.page_heroes
  set title = pg_catalog.btrim(p_payload ->> 'title'),
      subtitle = pg_catalog.btrim(p_payload ->> 'subtitle'),
      cta_label = pg_catalog.btrim(p_payload ->> 'ctaLabel'),
      cta_href = pg_catalog.btrim(p_payload ->> 'ctaHref'),
      background_src = pg_catalog.btrim(p_payload ->> 'backgroundSrc'),
      poster_src = pg_catalog.btrim(p_payload ->> 'posterSrc'),
      media_type = p_payload ->> 'mediaType'
  where page_slug = 'booking'
  returning updated_at into v_version;

  return pg_catalog.jsonb_build_object(
    'versions', pg_catalog.jsonb_build_object('updatedAt', v_version)
  );
end;
$$;

create or replace function public.save_contact_details_v2(
  p_site_id text,
  p_expected_updated_at timestamptz,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_version timestamptz;
  v_version timestamptz;
begin
  if p_site_id is distinct from 'main'
    or p_expected_updated_at is null
    or pg_catalog.jsonb_typeof(p_payload) is distinct from 'object'
    or not (p_payload ?& array['location', 'contactBlurb'])
    or exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_payload) as supplied(key)
      where supplied.key not in ('location', 'contactBlurb')
    )
    or pg_catalog.jsonb_typeof(p_payload -> 'location') is distinct from 'string'
    or pg_catalog.jsonb_typeof(p_payload -> 'contactBlurb') is distinct from 'string'
    or pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'location')) not between 1 and 220
    or pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'contactBlurb')) not between 1 and 1000
  then
    raise exception 'invalid_contact_details_payload'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('contact_page_v2:details:main', 0)
  );

  select settings.updated_at
  into v_current_version
  from public.site_settings as settings
  where settings.id = p_site_id
  for update;

  if not found then
    raise exception 'contact_page_snapshot_missing'
      using errcode = '23503';
  end if;
  if v_current_version is distinct from p_expected_updated_at then
    raise exception 'contact_details_changed'
      using errcode = '40001';
  end if;

  update public.site_settings
  set location = pg_catalog.btrim(p_payload ->> 'location'),
      contact_blurb = pg_catalog.btrim(p_payload ->> 'contactBlurb')
  where id = p_site_id
  returning updated_at into v_version;

  return pg_catalog.jsonb_build_object(
    'versions', pg_catalog.jsonb_build_object('updatedAt', v_version)
  );
end;
$$;

revoke all on function public.get_contact_page_v2_snapshot(text)
from public, anon, authenticated, service_role;
revoke all on function public.save_contact_hero_v2(text, timestamptz, jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.save_contact_details_v2(text, timestamptz, jsonb)
from public, anon, authenticated, service_role;

grant execute on function public.get_contact_page_v2_snapshot(text)
to service_role;
grant execute on function public.save_contact_hero_v2(text, timestamptz, jsonb)
to service_role;
grant execute on function public.save_contact_details_v2(text, timestamptz, jsonb)
to service_role;

comment on function public.get_contact_page_v2_snapshot(text) is
  'Service-only consistent Contact hero and details snapshot for Admin V2.';
comment on function public.save_contact_hero_v2(text, timestamptz, jsonb) is
  'Atomically saves the Contact hero when its exact expected version still matches.';
comment on function public.save_contact_details_v2(text, timestamptz, jsonb) is
  'Atomically saves Contact location and copy when the exact settings version still matches.';

commit;
