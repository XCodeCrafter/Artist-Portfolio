-- Batch 5A: repair the Music editor bootstrap and add safe collection growth.
--
-- This migration is deliberately forward-only and non-destructive:
-- - an existing Music hero is never overwritten;
-- - existing Music and navbar-link rows must remain in every save payload;
-- - new row ids may be appended and all submitted rows may be edited/reordered;
-- - hiding a row is supported, while hard deletion remains outside these RPCs.

begin;

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
  'music',
  'MUSIC',
  'LISTEN',
  'SCROLL',
  '#music',
  '/images/music-hero.jpg',
  '',
  'image',
  40
)
on conflict (page_slug) do nothing;

create or replace function public.save_music_platforms_v2(
  p_site_id text,
  p_expected_versions jsonb,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_count integer;
  v_platform_count integer;
  v_versions jsonb;
  v_items jsonb;
  v_platforms jsonb;
begin
  if p_site_id is distinct from 'main'
    or pg_catalog.jsonb_typeof(p_expected_versions) is distinct from 'object'
    or pg_catalog.jsonb_typeof(p_payload) is distinct from 'object'
  then
    raise exception 'invalid_music_platforms_payload'
      using errcode = '22023';
  end if;

  if not (p_payload ? 'items')
    or exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_payload) as supplied(key)
      where supplied.key <> 'items'
    )
    or pg_catalog.jsonb_typeof(p_payload -> 'items') is distinct from 'array'
  then
    raise exception 'invalid_music_platforms_payload'
      using errcode = '22023';
  end if;

  v_platforms := p_payload -> 'items';
  v_platform_count := pg_catalog.jsonb_array_length(v_platforms);

  if v_platform_count > 32
    or exists (
      select 1
      from pg_catalog.jsonb_each(p_expected_versions) as expected(id, version)
      where pg_catalog.char_length(expected.id) not between 1 and 160
        or expected.id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
        or pg_catalog.jsonb_typeof(expected.version) is distinct from 'string'
        or pg_catalog.char_length(p_expected_versions ->> expected.id)
          not between 1 and 64
    )
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_platforms) as submitted(item)
      where pg_catalog.jsonb_typeof(submitted.item) is distinct from 'object'
    )
  then
    raise exception 'invalid_music_platforms_payload'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(v_platforms) as submitted(item)
    where not (submitted.item ?& array[
        'id',
        'title',
        'label',
        'href',
        'imageSrc',
        'iconKey',
        'isPublished'
      ])
      or exists (
        select 1
        from pg_catalog.jsonb_object_keys(submitted.item) as supplied(key)
        where supplied.key not in (
          'id',
          'title',
          'label',
          'href',
          'imageSrc',
          'iconKey',
          'isPublished'
        )
      )
      or pg_catalog.jsonb_typeof(submitted.item -> 'id')
        is distinct from 'string'
      or pg_catalog.jsonb_typeof(submitted.item -> 'title')
        is distinct from 'string'
      or pg_catalog.jsonb_typeof(submitted.item -> 'label')
        is distinct from 'string'
      or pg_catalog.jsonb_typeof(submitted.item -> 'href')
        is distinct from 'string'
      or pg_catalog.jsonb_typeof(submitted.item -> 'imageSrc')
        is distinct from 'string'
      or pg_catalog.jsonb_typeof(submitted.item -> 'iconKey')
        is distinct from 'string'
      or pg_catalog.jsonb_typeof(submitted.item -> 'isPublished')
        is distinct from 'boolean'
  ) then
    raise exception 'invalid_music_platforms_payload'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(v_platforms) as submitted(item)
    where pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'id'))
        not between 1 and 160
      or pg_catalog.btrim(submitted.item ->> 'id')
        !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
      or pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'title'))
        not between 1 and 220
      or pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'label'))
        > 220
      or pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'href'))
        not between 1 and 2048
      or not (
        pg_catalog.btrim(submitted.item ->> 'href')
          ~ '^#[A-Za-z][A-Za-z0-9_-]*$'
        or (
          pg_catalog.left(
            pg_catalog.btrim(submitted.item ->> 'href'),
            1
          ) = '/'
          and pg_catalog.left(
            pg_catalog.btrim(submitted.item ->> 'href'),
            2
          ) <> '//'
        )
        or (
          pg_catalog.btrim(submitted.item ->> 'href')
            ~* '^https://[^[:space:]]+$'
          and pg_catalog.btrim(submitted.item ->> 'href')
            !~* '^https://[^/?#]*@'
        )
      )
      or pg_catalog.left(
        pg_catalog.btrim(submitted.item ->> 'href'),
        2
      ) = '//'
      or pg_catalog.btrim(submitted.item ->> 'href') ~ '[[:cntrl:]]'
      or pg_catalog.strpos(
        pg_catalog.btrim(submitted.item ->> 'href'),
        pg_catalog.chr(92)
      ) > 0
      or pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'imageSrc'))
        not between 1 and 2048
      or not (
        (
          pg_catalog.left(
            pg_catalog.btrim(submitted.item ->> 'imageSrc'),
            1
          ) = '/'
          and pg_catalog.left(
            pg_catalog.btrim(submitted.item ->> 'imageSrc'),
            2
          ) <> '//'
        )
        or (
          pg_catalog.btrim(submitted.item ->> 'imageSrc')
            ~* '^https://[^[:space:]]+$'
          and pg_catalog.btrim(submitted.item ->> 'imageSrc')
            !~* '^https://[^/?#]*@'
        )
      )
      or pg_catalog.btrim(submitted.item ->> 'imageSrc') ~ '[[:cntrl:]]'
      or pg_catalog.strpos(
        pg_catalog.btrim(submitted.item ->> 'imageSrc'),
        pg_catalog.chr(92)
      ) > 0
      or pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'iconKey'))
        not between 1 and 64
      or pg_catalog.btrim(submitted.item ->> 'iconKey')
        !~ '^[a-z0-9][a-z0-9-]*$'
  ) then
    raise exception 'invalid_music_platforms_payload'
      using errcode = '22023';
  end if;

  if (
    select pg_catalog.count(distinct submitted.item ->> 'id')
    from pg_catalog.jsonb_array_elements(v_platforms) as submitted(item)
  ) <> v_platform_count then
    raise exception 'invalid_music_platforms_payload'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('music_page_v2:platforms:main', 0)
  );
  lock table public.music_platform_links in share row exclusive mode;

  select pg_catalog.count(*)::integer
  into v_current_count
  from public.music_platform_links;

  if (
    select pg_catalog.count(*)::integer
    from pg_catalog.jsonb_object_keys(p_expected_versions)
  ) <> v_current_count
    or exists (
      select 1
      from public.music_platform_links as current_platform
      where not (p_expected_versions ? current_platform.id)
    )
    or exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_expected_versions) as expected(id)
      where not exists (
        select 1
        from public.music_platform_links as current_platform
        where current_platform.id = expected.id
      )
    )
  then
    raise exception 'music_platforms_changed'
      using errcode = '40001';
  end if;

  begin
    if exists (
      select 1
      from public.music_platform_links as current_platform
      where current_platform.updated_at is distinct from
        (p_expected_versions ->> current_platform.id)::timestamptz
    ) then
      raise exception 'music_platforms_changed'
        using errcode = '40001';
    end if;
  exception
    when invalid_datetime_format or datetime_field_overflow then
      raise exception 'music_platforms_changed'
        using errcode = '40001';
  end;

  -- Omitting an existing id is never interpreted as deletion. The editor may
  -- hide it, and a separate explicit workflow can own destructive deletion.
  if exists (
    select 1
    from public.music_platform_links as current_platform
    where not exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_platforms) as submitted(item)
      where submitted.item ->> 'id' = current_platform.id
    )
  ) then
    raise exception 'invalid_music_platforms_payload'
      using errcode = '22023';
  end if;

  insert into public.music_platform_links (
    id,
    title,
    label,
    href,
    image_src,
    icon_key,
    is_published,
    sort_order
  )
  select
    pg_catalog.btrim(submitted.item ->> 'id'),
    pg_catalog.btrim(submitted.item ->> 'title'),
    pg_catalog.btrim(submitted.item ->> 'label'),
    pg_catalog.btrim(submitted.item ->> 'href'),
    pg_catalog.btrim(submitted.item ->> 'imageSrc'),
    pg_catalog.btrim(submitted.item ->> 'iconKey'),
    (submitted.item ->> 'isPublished')::boolean,
    (submitted.ordinality * 10)::integer
  from pg_catalog.jsonb_array_elements(v_platforms)
    with ordinality as submitted(item, ordinality)
  on conflict (id) do update set
    title = excluded.title,
    label = excluded.label,
    href = excluded.href,
    image_src = excluded.image_src,
    icon_key = excluded.icon_key,
    is_published = excluded.is_published,
    sort_order = excluded.sort_order;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', platform.id,
        'title', platform.title,
        'label', platform.label,
        'href', platform.href,
        'imageSrc', platform.image_src,
        'iconKey', platform.icon_key,
        'isPublished', platform.is_published,
        'updatedAt', platform.updated_at
      )
      order by platform.sort_order, platform.id
    ),
    '[]'::jsonb
  )
  into v_items
  from public.music_platform_links as platform;

  select coalesce(
    pg_catalog.jsonb_object_agg(
      platform.id,
      pg_catalog.to_jsonb(platform.updated_at)
      order by platform.id
    ),
    '{}'::jsonb
  )
  into v_versions
  from public.music_platform_links as platform;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'versions', pg_catalog.jsonb_build_object('items', v_versions)
  );
end;
$$;

create or replace function public.save_music_soundcloud_v2(
  p_site_id text,
  p_expected_presentation_updated_at timestamptz,
  p_expected_versions jsonb,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_presentation_version timestamptz;
  v_current_count integer;
  v_track_count integer;
  v_presentation_version timestamptz;
  v_versions jsonb;
  v_items jsonb;
  v_tracks jsonb;
begin
  if p_site_id is distinct from 'main'
    or p_expected_presentation_updated_at is null
    or pg_catalog.jsonb_typeof(p_expected_versions) is distinct from 'object'
    or pg_catalog.jsonb_typeof(p_payload) is distinct from 'object'
  then
    raise exception 'invalid_music_soundcloud_payload'
      using errcode = '22023';
  end if;

  if not (p_payload ?& array['mixesHeading', 'items'])
    or exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_payload) as supplied(key)
      where supplied.key not in ('mixesHeading', 'items')
    )
    or pg_catalog.jsonb_typeof(p_payload -> 'mixesHeading')
      is distinct from 'string'
    or pg_catalog.jsonb_typeof(p_payload -> 'items') is distinct from 'array'
    or pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'mixesHeading'))
      not between 1 and 220
  then
    raise exception 'invalid_music_soundcloud_payload'
      using errcode = '22023';
  end if;

  v_tracks := p_payload -> 'items';
  v_track_count := pg_catalog.jsonb_array_length(v_tracks);

  if v_track_count > 48
    or exists (
      select 1
      from pg_catalog.jsonb_each(p_expected_versions) as expected(id, version)
      where pg_catalog.char_length(expected.id) not between 1 and 160
        or expected.id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
        or pg_catalog.jsonb_typeof(expected.version) is distinct from 'string'
        or pg_catalog.char_length(p_expected_versions ->> expected.id)
          not between 1 and 64
    )
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_tracks) as submitted(item)
      where pg_catalog.jsonb_typeof(submitted.item) is distinct from 'object'
    )
  then
    raise exception 'invalid_music_soundcloud_payload'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(v_tracks) as submitted(item)
    where not (submitted.item ?& array[
        'id',
        'title',
        'embedUrl',
        'isPublished'
      ])
      or exists (
        select 1
        from pg_catalog.jsonb_object_keys(submitted.item) as supplied(key)
        where supplied.key not in (
          'id',
          'title',
          'embedUrl',
          'isPublished'
        )
      )
      or pg_catalog.jsonb_typeof(submitted.item -> 'id')
        is distinct from 'string'
      or pg_catalog.jsonb_typeof(submitted.item -> 'title')
        is distinct from 'string'
      or pg_catalog.jsonb_typeof(submitted.item -> 'embedUrl')
        is distinct from 'string'
      or pg_catalog.jsonb_typeof(submitted.item -> 'isPublished')
        is distinct from 'boolean'
  ) then
    raise exception 'invalid_music_soundcloud_payload'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(v_tracks) as submitted(item)
    where pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'id'))
        not between 1 and 160
      or pg_catalog.btrim(submitted.item ->> 'id')
        !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
      or pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'title'))
        > 220
      or pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'embedUrl'))
        not between 1 and 2048
      or pg_catalog.btrim(submitted.item ->> 'embedUrl') !~*
        '^https://(api[.]soundcloud[.]com|soundcloud[.]com|www[.]soundcloud[.]com|on[.]soundcloud[.]com)(/[^[:space:]]*)?$'
      or pg_catalog.btrim(submitted.item ->> 'embedUrl') ~ '[[:cntrl:]]'
      or pg_catalog.strpos(
        pg_catalog.btrim(submitted.item ->> 'embedUrl'),
        pg_catalog.chr(92)
      ) > 0
  ) then
    raise exception 'invalid_music_soundcloud_payload'
      using errcode = '22023';
  end if;

  if (
    select pg_catalog.count(distinct submitted.item ->> 'id')
    from pg_catalog.jsonb_array_elements(v_tracks) as submitted(item)
  ) <> v_track_count then
    raise exception 'invalid_music_soundcloud_payload'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('music_page_v2:soundcloud:main', 0)
  );
  lock table public.soundcloud_tracks in share row exclusive mode;

  select presentation.updated_at
  into v_current_presentation_version
  from public.music_presentation as presentation
  where presentation.id = p_site_id
  for update;

  if not found then
    raise exception 'music_presentation_missing'
      using errcode = '23503';
  end if;

  if v_current_presentation_version
    is distinct from p_expected_presentation_updated_at
  then
    raise exception 'music_soundcloud_changed'
      using errcode = '40001';
  end if;

  select pg_catalog.count(*)::integer
  into v_current_count
  from public.soundcloud_tracks;

  if (
    select pg_catalog.count(*)::integer
    from pg_catalog.jsonb_object_keys(p_expected_versions)
  ) <> v_current_count
    or exists (
      select 1
      from public.soundcloud_tracks as current_track
      where not (p_expected_versions ? current_track.id)
    )
    or exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_expected_versions) as expected(id)
      where not exists (
        select 1
        from public.soundcloud_tracks as current_track
        where current_track.id = expected.id
      )
    )
  then
    raise exception 'music_soundcloud_changed'
      using errcode = '40001';
  end if;

  begin
    if exists (
      select 1
      from public.soundcloud_tracks as current_track
      where current_track.updated_at is distinct from
        (p_expected_versions ->> current_track.id)::timestamptz
    ) then
      raise exception 'music_soundcloud_changed'
        using errcode = '40001';
    end if;
  exception
    when invalid_datetime_format or datetime_field_overflow then
      raise exception 'music_soundcloud_changed'
        using errcode = '40001';
  end;

  if exists (
    select 1
    from public.soundcloud_tracks as current_track
    where not exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_tracks) as submitted(item)
      where submitted.item ->> 'id' = current_track.id
    )
  ) then
    raise exception 'invalid_music_soundcloud_payload'
      using errcode = '22023';
  end if;

  update public.music_presentation
  set mixes_heading = pg_catalog.btrim(p_payload ->> 'mixesHeading')
  where id = p_site_id
  returning updated_at into v_presentation_version;

  insert into public.soundcloud_tracks (
    id,
    title,
    embed_url,
    is_published,
    sort_order
  )
  select
    pg_catalog.btrim(submitted.item ->> 'id'),
    pg_catalog.btrim(submitted.item ->> 'title'),
    pg_catalog.btrim(submitted.item ->> 'embedUrl'),
    (submitted.item ->> 'isPublished')::boolean,
    (submitted.ordinality * 10)::integer
  from pg_catalog.jsonb_array_elements(v_tracks)
    with ordinality as submitted(item, ordinality)
  on conflict (id) do update set
    title = excluded.title,
    embed_url = excluded.embed_url,
    is_published = excluded.is_published,
    sort_order = excluded.sort_order;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', track.id,
        'title', track.title,
        'embedUrl', track.embed_url,
        'isPublished', track.is_published,
        'updatedAt', track.updated_at
      )
      order by track.sort_order, track.id
    ),
    '[]'::jsonb
  )
  into v_items
  from public.soundcloud_tracks as track;

  select coalesce(
    pg_catalog.jsonb_object_agg(
      track.id,
      pg_catalog.to_jsonb(track.updated_at)
      order by track.id
    ),
    '{}'::jsonb
  )
  into v_versions
  from public.soundcloud_tracks as track;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'versions', pg_catalog.jsonb_build_object(
      'presentationUpdatedAt', v_presentation_version,
      'items', v_versions
    )
  );
end;
$$;

-- Navbar platform icons already use social_links in the public layout and in
-- the shared footer. These V2 RPCs therefore edit that one canonical source.
alter table public.social_links enable row level security;

create or replace function public.get_navbar_social_links_v2_snapshot(
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
    raise exception 'invalid_navbar_social_links_site'
      using errcode = '22023';
  end if;

  select pg_catalog.jsonb_build_object(
    'items', coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', social.id,
            'label', social.label,
            'platform', social.platform,
            'href', social.href,
            'iconKey', social.icon_key,
            'isPublished', social.is_published,
            'updatedAt', social.updated_at
          )
          order by social.sort_order, social.id
        )
        from public.social_links as social
      ),
      '[]'::jsonb
    )
  )
  into v_snapshot
  from public.site_settings as settings
  where settings.id = p_site_id;

  if v_snapshot is null then
    raise exception 'navbar_social_links_settings_missing'
      using errcode = '23503';
  end if;

  return v_snapshot;
end;
$$;

create or replace function public.save_navbar_social_links_v2(
  p_site_id text,
  p_expected_versions jsonb,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_count integer;
  v_item_count integer;
  v_items jsonb;
  v_versions jsonb;
begin
  if p_site_id is distinct from 'main'
    or pg_catalog.jsonb_typeof(p_expected_versions) is distinct from 'object'
    or pg_catalog.jsonb_typeof(p_items) is distinct from 'array'
  then
    raise exception 'invalid_navbar_social_links_payload'
      using errcode = '22023';
  end if;

  v_item_count := pg_catalog.jsonb_array_length(p_items);

  if v_item_count > 16
    or exists (
      select 1
      from pg_catalog.jsonb_each(p_expected_versions) as expected(id, version)
      where pg_catalog.char_length(expected.id) not between 1 and 160
        or expected.id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
        or pg_catalog.jsonb_typeof(expected.version) is distinct from 'string'
        or pg_catalog.char_length(p_expected_versions ->> expected.id)
          not between 1 and 64
    )
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_items) as submitted(item)
      where pg_catalog.jsonb_typeof(submitted.item) is distinct from 'object'
    )
  then
    raise exception 'invalid_navbar_social_links_payload'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_items) as submitted(item)
    where not (submitted.item ?& array[
        'id',
        'label',
        'platform',
        'href',
        'iconKey',
        'isPublished'
      ])
      or exists (
        select 1
        from pg_catalog.jsonb_object_keys(submitted.item) as supplied(key)
        where supplied.key not in (
          'id',
          'label',
          'platform',
          'href',
          'iconKey',
          'isPublished'
        )
      )
      or pg_catalog.jsonb_typeof(submitted.item -> 'id')
        is distinct from 'string'
      or pg_catalog.jsonb_typeof(submitted.item -> 'label')
        is distinct from 'string'
      or pg_catalog.jsonb_typeof(submitted.item -> 'platform')
        is distinct from 'string'
      or pg_catalog.jsonb_typeof(submitted.item -> 'href')
        is distinct from 'string'
      or pg_catalog.jsonb_typeof(submitted.item -> 'iconKey')
        is distinct from 'string'
      or pg_catalog.jsonb_typeof(submitted.item -> 'isPublished')
        is distinct from 'boolean'
  ) then
    raise exception 'invalid_navbar_social_links_payload'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_items) as submitted(item)
    where pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'id'))
        not between 1 and 160
      or pg_catalog.btrim(submitted.item ->> 'id')
        !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
      or pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'label'))
        not between 1 and 220
      or pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'platform'))
        not between 1 and 64
      or pg_catalog.btrim(submitted.item ->> 'platform')
        !~ '^[a-z0-9][a-z0-9-]*$'
      or pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'iconKey'))
        not between 1 and 64
      or pg_catalog.btrim(submitted.item ->> 'iconKey')
        !~ '^[a-z0-9][a-z0-9-]*$'
      or pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'href'))
        not between 1 and 2048
      or pg_catalog.btrim(submitted.item ->> 'href')
        !~* '^https://[^[:space:]]+$'
      or pg_catalog.btrim(submitted.item ->> 'href')
        ~* '^https://[^/?#]*@'
      or pg_catalog.btrim(submitted.item ->> 'href') ~ '[[:cntrl:]]'
      or pg_catalog.strpos(
        pg_catalog.btrim(submitted.item ->> 'href'),
        pg_catalog.chr(92)
      ) > 0
  ) then
    raise exception 'invalid_navbar_social_links_payload'
      using errcode = '22023';
  end if;

  if (
    select pg_catalog.count(distinct submitted.item ->> 'id')
    from pg_catalog.jsonb_array_elements(p_items) as submitted(item)
  ) <> v_item_count then
    raise exception 'invalid_navbar_social_links_payload'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('navbar_social_links_v2:main', 0)
  );
  lock table public.social_links in share row exclusive mode;

  if not exists (
    select 1
    from public.site_settings as settings
    where settings.id = p_site_id
  ) then
    raise exception 'navbar_social_links_settings_missing'
      using errcode = '23503';
  end if;

  select pg_catalog.count(*)::integer
  into v_current_count
  from public.social_links;

  if (
    select pg_catalog.count(*)::integer
    from pg_catalog.jsonb_object_keys(p_expected_versions)
  ) <> v_current_count
    or exists (
      select 1
      from public.social_links as current_social
      where not (p_expected_versions ? current_social.id)
    )
    or exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_expected_versions) as expected(id)
      where not exists (
        select 1
        from public.social_links as current_social
        where current_social.id = expected.id
      )
    )
  then
    raise exception 'navbar_social_links_changed'
      using errcode = '40001';
  end if;

  begin
    if exists (
      select 1
      from public.social_links as current_social
      where current_social.updated_at is distinct from
        (p_expected_versions ->> current_social.id)::timestamptz
    ) then
      raise exception 'navbar_social_links_changed'
        using errcode = '40001';
    end if;
  exception
    when invalid_datetime_format or datetime_field_overflow then
      raise exception 'navbar_social_links_changed'
        using errcode = '40001';
  end;

  if exists (
    select 1
    from public.social_links as current_social
    where not exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_items) as submitted(item)
      where submitted.item ->> 'id' = current_social.id
    )
  ) then
    raise exception 'invalid_navbar_social_links_payload'
      using errcode = '22023';
  end if;

  insert into public.social_links (
    id,
    label,
    platform,
    href,
    icon_key,
    is_published,
    sort_order
  )
  select
    pg_catalog.btrim(submitted.item ->> 'id'),
    pg_catalog.btrim(submitted.item ->> 'label'),
    pg_catalog.btrim(submitted.item ->> 'platform'),
    pg_catalog.btrim(submitted.item ->> 'href'),
    pg_catalog.btrim(submitted.item ->> 'iconKey'),
    (submitted.item ->> 'isPublished')::boolean,
    (submitted.ordinality * 10)::integer
  from pg_catalog.jsonb_array_elements(p_items)
    with ordinality as submitted(item, ordinality)
  on conflict (id) do update set
    label = excluded.label,
    platform = excluded.platform,
    href = excluded.href,
    icon_key = excluded.icon_key,
    is_published = excluded.is_published,
    sort_order = excluded.sort_order;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', social.id,
        'label', social.label,
        'platform', social.platform,
        'href', social.href,
        'iconKey', social.icon_key,
        'isPublished', social.is_published,
        'updatedAt', social.updated_at
      )
      order by social.sort_order, social.id
    ),
    '[]'::jsonb
  )
  into v_items
  from public.social_links as social;

  select coalesce(
    pg_catalog.jsonb_object_agg(
      social.id,
      pg_catalog.to_jsonb(social.updated_at)
      order by social.id
    ),
    '{}'::jsonb
  )
  into v_versions
  from public.social_links as social;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'expectedVersions', v_versions
  );
end;
$$;

revoke all on function public.save_music_platforms_v2(text, jsonb, jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.save_music_soundcloud_v2(text, timestamptz, jsonb, jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.get_navbar_social_links_v2_snapshot(text)
from public, anon, authenticated, service_role;
revoke all on function public.save_navbar_social_links_v2(text, jsonb, jsonb)
from public, anon, authenticated, service_role;

grant execute on function public.save_music_platforms_v2(text, jsonb, jsonb)
to service_role;
grant execute on function public.save_music_soundcloud_v2(text, timestamptz, jsonb, jsonb)
to service_role;
grant execute on function public.get_navbar_social_links_v2_snapshot(text)
to service_role;
grant execute on function public.save_navbar_social_links_v2(text, jsonb, jsonb)
to service_role;

comment on function public.save_music_platforms_v2(text, jsonb, jsonb) is
  'Atomically edits, reorders, and appends Music platform rows without deleting baseline ids.';
comment on function public.save_music_soundcloud_v2(text, timestamptz, jsonb, jsonb) is
  'Atomically edits, reorders, and appends SoundCloud rows without deleting baseline ids.';
comment on function public.get_navbar_social_links_v2_snapshot(text) is
  'Service-only Admin V2 snapshot of every navbar/footer social link, including hidden rows.';
comment on function public.save_navbar_social_links_v2(text, jsonb, jsonb) is
  'Atomically edits, reorders, hides, and appends navbar/footer social links without hard deletion.';

commit;
