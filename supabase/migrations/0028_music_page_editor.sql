-- Admin V2 Music page editor.
--
-- The headings are presentation content, not application copy, so they live in
-- their own singleton. The V2 editor writes through service-only RPCs that
-- preserve V1-owned identity fields and reject stale whole-section snapshots.

create table if not exists public.music_presentation (
  id text primary key default 'main',
  releases_heading text not null default 'LATEST RELEASES',
  mixes_heading text not null default 'LATEST MIXES',
  updated_at timestamptz not null default now(),
  constraint music_presentation_id_check check (id = 'main'),
  constraint music_presentation_releases_heading_check check (
    pg_catalog.char_length(pg_catalog.btrim(releases_heading)) >= 1
    and pg_catalog.char_length(releases_heading) <= 220
  ),
  constraint music_presentation_mixes_heading_check check (
    pg_catalog.char_length(pg_catalog.btrim(mixes_heading)) >= 1
    and pg_catalog.char_length(mixes_heading) <= 220
  )
);

insert into public.music_presentation (id)
values ('main')
on conflict (id) do nothing;

drop trigger if exists music_presentation_updated_at
on public.music_presentation;
create trigger music_presentation_updated_at
before update on public.music_presentation
for each row execute function public.set_updated_at();

alter table public.music_presentation enable row level security;

revoke all on table public.music_presentation
from public, anon, authenticated, service_role;
grant select on table public.music_presentation
to anon, authenticated, service_role;
grant insert, update, delete on table public.music_presentation
to service_role;

drop policy if exists "Public can read music presentation"
on public.music_presentation;
create policy "Public can read music presentation"
on public.music_presentation for select
to anon, authenticated
using (true);

create or replace function public.get_music_page_v2_snapshot(
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
    raise exception 'invalid_music_page_site'
      using errcode = '22023';
  end if;

  -- Build the complete preview payload in one statement so the editor never
  -- combines rows from different database snapshots.
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
    'spotify', pg_catalog.jsonb_build_object(
      'releasesHeading', presentation.releases_heading,
      'artistUrl', settings.spotify_artist_url,
      'embedUrl', settings.spotify_embed_url,
      'settingsUpdatedAt', settings.updated_at,
      'presentationUpdatedAt', presentation.updated_at
    ),
    'platforms', coalesce(
      (
        select pg_catalog.jsonb_agg(
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
        )
        from public.music_platform_links as platform
      ),
      '[]'::jsonb
    ),
    'soundcloud', pg_catalog.jsonb_build_object(
      'mixesHeading', presentation.mixes_heading,
      'presentationUpdatedAt', presentation.updated_at,
      'tracks', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', track.id,
              'title', track.title,
              'embedUrl', track.embed_url,
              'isPublished', track.is_published,
              'updatedAt', track.updated_at
            )
            order by track.sort_order, track.id
          )
          from public.soundcloud_tracks as track
        ),
        '[]'::jsonb
      )
    ),
    'footer', pg_catalog.jsonb_build_object(
      'artistName', settings.artist_name,
      'tagline', settings.tagline,
      'location', settings.location,
      'contactBlurb', settings.contact_blurb,
      'footerEffect', settings.footer_effect,
      'socialLinks', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', social.id,
              'label', social.label,
              'platform', social.platform,
              'href', social.href,
              'iconKey', social.icon_key
            )
            order by social.sort_order, social.id
          )
          from public.social_links as social
          where social.is_published = true
        ),
        '[]'::jsonb
      )
    )
  )
  into v_snapshot
  from public.site_settings as settings
  cross join public.page_heroes as hero
  cross join public.music_presentation as presentation
  where settings.id = p_site_id
    and hero.page_slug = 'music'
    and presentation.id = p_site_id;

  if v_snapshot is null then
    raise exception 'music_page_snapshot_missing'
      using errcode = '23503';
  end if;

  return v_snapshot;
end;
$$;

create or replace function public.save_music_hero_v2(
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
  then
    raise exception 'invalid_music_hero_payload'
      using errcode = '22023';
  end if;

  if not (p_payload ?& array[
      'title',
      'subtitle',
      'ctaLabel',
      'ctaHref',
      'backgroundSrc',
      'posterSrc',
      'mediaType'
    ])
    or exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_payload) as supplied(key)
      where supplied.key not in (
        'title',
        'subtitle',
        'ctaLabel',
        'ctaHref',
        'backgroundSrc',
        'posterSrc',
        'mediaType'
      )
    )
    or pg_catalog.jsonb_typeof(p_payload -> 'title') is distinct from 'string'
    or pg_catalog.jsonb_typeof(p_payload -> 'subtitle') is distinct from 'string'
    or pg_catalog.jsonb_typeof(p_payload -> 'ctaLabel') is distinct from 'string'
    or pg_catalog.jsonb_typeof(p_payload -> 'ctaHref') is distinct from 'string'
    or pg_catalog.jsonb_typeof(p_payload -> 'backgroundSrc') is distinct from 'string'
    or pg_catalog.jsonb_typeof(p_payload -> 'posterSrc') is distinct from 'string'
    or pg_catalog.jsonb_typeof(p_payload -> 'mediaType') is distinct from 'string'
  then
    raise exception 'invalid_music_hero_payload'
      using errcode = '22023';
  end if;

  if pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'title')) not between 1 and 220
    or pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'subtitle')) > 220
    or pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'ctaLabel')) > 220
    or pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'ctaHref')) > 2048
    or pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'backgroundSrc')) not between 1 and 2048
    or pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'posterSrc')) > 2048
    or (p_payload ->> 'mediaType') not in ('image', 'video')
    or (
      pg_catalog.btrim(p_payload ->> 'ctaHref') <> ''
      and not (
        (
          pg_catalog.btrim(p_payload ->> 'ctaHref') ~ '^#[A-Za-z][A-Za-z0-9_-]*$'
        )
        or (
          pg_catalog.left(pg_catalog.btrim(p_payload ->> 'ctaHref'), 1) = '/'
          and pg_catalog.left(pg_catalog.btrim(p_payload ->> 'ctaHref'), 2) <> '//'
        )
        or (
          pg_catalog.btrim(p_payload ->> 'ctaHref') ~* '^https://[^[:space:]]+$'
          and pg_catalog.btrim(p_payload ->> 'ctaHref') !~* '^https://[^/?#]*@'
        )
      )
    )
    or pg_catalog.left(pg_catalog.btrim(p_payload ->> 'ctaHref'), 2) = '//'
    or pg_catalog.btrim(p_payload ->> 'ctaHref') ~ '[[:cntrl:]]'
    or pg_catalog.strpos(
      pg_catalog.btrim(p_payload ->> 'ctaHref'),
      pg_catalog.chr(92)
    ) > 0
    or not (
      pg_catalog.left(pg_catalog.btrim(p_payload ->> 'backgroundSrc'), 1) = '/'
      or (
        pg_catalog.btrim(p_payload ->> 'backgroundSrc') ~* '^https://[^[:space:]]+$'
        and pg_catalog.btrim(p_payload ->> 'backgroundSrc') !~* '^https://[^/?#]*@'
      )
    )
    or pg_catalog.left(pg_catalog.btrim(p_payload ->> 'backgroundSrc'), 2) = '//'
    or pg_catalog.btrim(p_payload ->> 'backgroundSrc') ~ '[[:cntrl:]]'
    or pg_catalog.strpos(
      pg_catalog.btrim(p_payload ->> 'backgroundSrc'),
      pg_catalog.chr(92)
    ) > 0
    or (
      pg_catalog.btrim(p_payload ->> 'posterSrc') <> ''
      and not (
        pg_catalog.left(pg_catalog.btrim(p_payload ->> 'posterSrc'), 1) = '/'
        or (
          pg_catalog.btrim(p_payload ->> 'posterSrc') ~* '^https://[^[:space:]]+$'
          and pg_catalog.btrim(p_payload ->> 'posterSrc') !~* '^https://[^/?#]*@'
        )
      )
    )
    or pg_catalog.left(pg_catalog.btrim(p_payload ->> 'posterSrc'), 2) = '//'
    or pg_catalog.btrim(p_payload ->> 'posterSrc') ~ '[[:cntrl:]]'
    or pg_catalog.strpos(
      pg_catalog.btrim(p_payload ->> 'posterSrc'),
      pg_catalog.chr(92)
    ) > 0
  then
    raise exception 'invalid_music_hero_payload'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('music_page_v2:hero:main', 0)
  );

  select hero.updated_at
  into v_current_version
  from public.page_heroes as hero
  where hero.page_slug = 'music'
  for update;

  if not found then
    raise exception 'music_hero_missing'
      using errcode = '23503';
  end if;

  if v_current_version is distinct from p_expected_updated_at then
    raise exception 'music_hero_changed'
      using errcode = '40001';
  end if;

  update public.page_heroes
  set
    title = pg_catalog.btrim(p_payload ->> 'title'),
    subtitle = pg_catalog.btrim(p_payload ->> 'subtitle'),
    cta_label = pg_catalog.btrim(p_payload ->> 'ctaLabel'),
    cta_href = pg_catalog.btrim(p_payload ->> 'ctaHref'),
    background_src = pg_catalog.btrim(p_payload ->> 'backgroundSrc'),
    poster_src = pg_catalog.btrim(p_payload ->> 'posterSrc'),
    media_type = p_payload ->> 'mediaType'
  where page_slug = 'music'
  returning updated_at into v_version;

  return pg_catalog.jsonb_build_object(
    'versions', pg_catalog.jsonb_build_object('updatedAt', v_version)
  );
end;
$$;

create or replace function public.save_music_spotify_v2(
  p_site_id text,
  p_expected_settings_updated_at timestamptz,
  p_expected_presentation_updated_at timestamptz,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_settings_version timestamptz;
  v_current_presentation_version timestamptz;
  v_settings_version timestamptz;
  v_presentation_version timestamptz;
begin
  if p_site_id is distinct from 'main'
    or p_expected_settings_updated_at is null
    or p_expected_presentation_updated_at is null
    or pg_catalog.jsonb_typeof(p_payload) is distinct from 'object'
  then
    raise exception 'invalid_music_spotify_payload'
      using errcode = '22023';
  end if;

  if not (p_payload ?& array['releasesHeading', 'artistUrl', 'embedUrl'])
    or exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_payload) as supplied(key)
      where supplied.key not in ('releasesHeading', 'artistUrl', 'embedUrl')
    )
    or pg_catalog.jsonb_typeof(p_payload -> 'releasesHeading') is distinct from 'string'
    or pg_catalog.jsonb_typeof(p_payload -> 'artistUrl') is distinct from 'string'
    or pg_catalog.jsonb_typeof(p_payload -> 'embedUrl') is distinct from 'string'
  then
    raise exception 'invalid_music_spotify_payload'
      using errcode = '22023';
  end if;

  if pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'releasesHeading')) not between 1 and 220
    or pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'artistUrl')) > 2048
    or pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'embedUrl')) > 2048
    or (
      pg_catalog.btrim(p_payload ->> 'artistUrl') <> ''
      and pg_catalog.btrim(p_payload ->> 'artistUrl') !~* '^https://open[.]spotify[.]com/artist/[A-Za-z0-9]+/?([?#][^[:space:]]*)?$'
    )
    or (
      pg_catalog.btrim(p_payload ->> 'embedUrl') <> ''
      and pg_catalog.btrim(p_payload ->> 'embedUrl') !~* '^https://open[.]spotify[.]com/embed/[^[:space:]]+$'
    )
  then
    raise exception 'invalid_music_spotify_payload'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('music_page_v2:spotify:main', 0)
  );

  select settings.updated_at
  into v_current_settings_version
  from public.site_settings as settings
  where settings.id = p_site_id
  for update;

  if not found then
    raise exception 'music_settings_missing'
      using errcode = '23503';
  end if;

  select presentation.updated_at
  into v_current_presentation_version
  from public.music_presentation as presentation
  where presentation.id = p_site_id
  for update;

  if not found then
    raise exception 'music_presentation_missing'
      using errcode = '23503';
  end if;

  if v_current_settings_version is distinct from p_expected_settings_updated_at
    or v_current_presentation_version is distinct from p_expected_presentation_updated_at
  then
    raise exception 'music_spotify_changed'
      using errcode = '40001';
  end if;

  update public.site_settings
  set
    spotify_artist_url = pg_catalog.btrim(p_payload ->> 'artistUrl'),
    spotify_embed_url = pg_catalog.btrim(p_payload ->> 'embedUrl')
  where id = p_site_id
  returning updated_at into v_settings_version;

  update public.music_presentation
  set releases_heading = pg_catalog.btrim(p_payload ->> 'releasesHeading')
  where id = p_site_id
  returning updated_at into v_presentation_version;

  return pg_catalog.jsonb_build_object(
    'versions', pg_catalog.jsonb_build_object(
      'settingsUpdatedAt', v_settings_version,
      'presentationUpdatedAt', v_presentation_version
    )
  );
end;
$$;

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

  if exists (
    select 1
    from pg_catalog.jsonb_each(p_expected_versions) as expected(id, version)
    where pg_catalog.jsonb_typeof(expected.version) is distinct from 'string'
      or pg_catalog.char_length(p_expected_versions ->> expected.id) not between 1 and 64
  ) then
    raise exception 'invalid_music_platforms_payload'
      using errcode = '22023';
  end if;

  v_platform_count := pg_catalog.jsonb_array_length(v_platforms);
  if exists (
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
    where not (submitted.item ?& array['id', 'title', 'label', 'href', 'imageSrc', 'isPublished'])
      or exists (
        select 1
        from pg_catalog.jsonb_object_keys(submitted.item) as supplied(key)
        where supplied.key not in ('id', 'title', 'label', 'href', 'imageSrc', 'isPublished')
      )
      or pg_catalog.jsonb_typeof(submitted.item -> 'id') is distinct from 'string'
      or pg_catalog.jsonb_typeof(submitted.item -> 'title') is distinct from 'string'
      or pg_catalog.jsonb_typeof(submitted.item -> 'label') is distinct from 'string'
      or pg_catalog.jsonb_typeof(submitted.item -> 'href') is distinct from 'string'
      or pg_catalog.jsonb_typeof(submitted.item -> 'imageSrc') is distinct from 'string'
      or pg_catalog.jsonb_typeof(submitted.item -> 'isPublished') is distinct from 'boolean'
  ) then
    raise exception 'invalid_music_platforms_payload'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(v_platforms) as submitted(item)
    where pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'id')) not between 1 and 160
      or pg_catalog.btrim(submitted.item ->> 'id') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
      or pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'title')) not between 1 and 220
      or pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'label')) > 220
      or pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'href')) not between 1 and 2048
      or not (
        pg_catalog.btrim(submitted.item ->> 'href') ~ '^#[A-Za-z][A-Za-z0-9_-]*$'
        or (
          pg_catalog.left(pg_catalog.btrim(submitted.item ->> 'href'), 1) = '/'
          and pg_catalog.left(pg_catalog.btrim(submitted.item ->> 'href'), 2) <> '//'
        )
        or (
          pg_catalog.btrim(submitted.item ->> 'href') ~* '^https://[^[:space:]]+$'
          and pg_catalog.btrim(submitted.item ->> 'href') !~* '^https://[^/?#]*@'
        )
      )
      or pg_catalog.left(pg_catalog.btrim(submitted.item ->> 'href'), 2) = '//'
      or pg_catalog.btrim(submitted.item ->> 'href') ~ '[[:cntrl:]]'
      or pg_catalog.strpos(
        pg_catalog.btrim(submitted.item ->> 'href'),
        pg_catalog.chr(92)
      ) > 0
      or pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'imageSrc')) not between 1 and 2048
      or not (
        pg_catalog.left(pg_catalog.btrim(submitted.item ->> 'imageSrc'), 1) = '/'
        or (
          pg_catalog.btrim(submitted.item ->> 'imageSrc') ~* '^https://[^[:space:]]+$'
          and pg_catalog.btrim(submitted.item ->> 'imageSrc') !~* '^https://[^/?#]*@'
        )
      )
      or pg_catalog.left(pg_catalog.btrim(submitted.item ->> 'imageSrc'), 2) = '//'
      or pg_catalog.btrim(submitted.item ->> 'imageSrc') ~ '[[:cntrl:]]'
      or pg_catalog.strpos(
        pg_catalog.btrim(submitted.item ->> 'imageSrc'),
        pg_catalog.chr(92)
      ) > 0
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

  if v_platform_count <> v_current_count
    or (
      select pg_catalog.count(*)::integer
      from pg_catalog.jsonb_object_keys(p_expected_versions)
    ) <> v_current_count
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_platforms) as submitted(item)
      where not exists (
        select 1
        from public.music_platform_links as current_platform
        where current_platform.id = submitted.item ->> 'id'
      )
    )
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

  with submitted as (
    select item, ordinality
    from pg_catalog.jsonb_array_elements(v_platforms)
      with ordinality as value(item, ordinality)
  )
  update public.music_platform_links as platform
  set
    title = pg_catalog.btrim(submitted.item ->> 'title'),
    label = pg_catalog.btrim(submitted.item ->> 'label'),
    href = pg_catalog.btrim(submitted.item ->> 'href'),
    image_src = pg_catalog.btrim(submitted.item ->> 'imageSrc'),
    is_published = (submitted.item ->> 'isPublished')::boolean,
    sort_order = (submitted.ordinality * 10)::integer
  from submitted
  where platform.id = submitted.item ->> 'id';

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
    or pg_catalog.jsonb_typeof(p_payload -> 'mixesHeading') is distinct from 'string'
    or pg_catalog.jsonb_typeof(p_payload -> 'items') is distinct from 'array'
    or pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'mixesHeading')) not between 1 and 220
  then
    raise exception 'invalid_music_soundcloud_payload'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_each(p_expected_versions) as expected(id, version)
    where pg_catalog.jsonb_typeof(expected.version) is distinct from 'string'
      or pg_catalog.char_length(p_expected_versions ->> expected.id) not between 1 and 64
  ) then
    raise exception 'invalid_music_soundcloud_payload'
      using errcode = '22023';
  end if;

  v_tracks := p_payload -> 'items';
  v_track_count := pg_catalog.jsonb_array_length(v_tracks);
  if exists (
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
    where not (submitted.item ?& array['id', 'title', 'embedUrl', 'isPublished'])
      or exists (
        select 1
        from pg_catalog.jsonb_object_keys(submitted.item) as supplied(key)
        where supplied.key not in ('id', 'title', 'embedUrl', 'isPublished')
      )
      or pg_catalog.jsonb_typeof(submitted.item -> 'id') is distinct from 'string'
      or pg_catalog.jsonb_typeof(submitted.item -> 'title') is distinct from 'string'
      or pg_catalog.jsonb_typeof(submitted.item -> 'embedUrl') is distinct from 'string'
      or pg_catalog.jsonb_typeof(submitted.item -> 'isPublished') is distinct from 'boolean'
  ) then
    raise exception 'invalid_music_soundcloud_payload'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(v_tracks) as submitted(item)
    where pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'id')) not between 1 and 160
      or pg_catalog.btrim(submitted.item ->> 'id') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
      or pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'title')) > 220
      or pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'embedUrl')) not between 1 and 2048
      or pg_catalog.btrim(submitted.item ->> 'embedUrl') !~* '^https://(api[.]soundcloud[.]com|soundcloud[.]com|www[.]soundcloud[.]com)(/[^[:space:]]*)?$'
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

  if v_current_presentation_version is distinct from p_expected_presentation_updated_at then
    raise exception 'music_soundcloud_changed'
      using errcode = '40001';
  end if;

  select pg_catalog.count(*)::integer
  into v_current_count
  from public.soundcloud_tracks;

  if v_track_count <> v_current_count
    or (
      select pg_catalog.count(*)::integer
      from pg_catalog.jsonb_object_keys(p_expected_versions)
    ) <> v_current_count
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_tracks) as submitted(item)
      where not exists (
        select 1
        from public.soundcloud_tracks as current_track
        where current_track.id = submitted.item ->> 'id'
      )
    )
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

  update public.music_presentation
  set mixes_heading = pg_catalog.btrim(p_payload ->> 'mixesHeading')
  where id = p_site_id
  returning updated_at into v_presentation_version;

  with submitted as (
    select item, ordinality
    from pg_catalog.jsonb_array_elements(v_tracks)
      with ordinality as value(item, ordinality)
  )
  update public.soundcloud_tracks as track
  set
    title = pg_catalog.btrim(submitted.item ->> 'title'),
    embed_url = pg_catalog.btrim(submitted.item ->> 'embedUrl'),
    is_published = (submitted.item ->> 'isPublished')::boolean,
    sort_order = (submitted.ordinality * 10)::integer
  from submitted
  where track.id = submitted.item ->> 'id';

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
    'versions', pg_catalog.jsonb_build_object(
      'presentationUpdatedAt', v_presentation_version,
      'items', v_versions
    )
  );
end;
$$;

revoke all on function public.get_music_page_v2_snapshot(text)
from public, anon, authenticated, service_role;
revoke all on function public.save_music_hero_v2(text, timestamptz, jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.save_music_spotify_v2(text, timestamptz, timestamptz, jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.save_music_platforms_v2(text, jsonb, jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.save_music_soundcloud_v2(text, timestamptz, jsonb, jsonb)
from public, anon, authenticated, service_role;

grant execute on function public.get_music_page_v2_snapshot(text)
to service_role;
grant execute on function public.save_music_hero_v2(text, timestamptz, jsonb)
to service_role;
grant execute on function public.save_music_spotify_v2(text, timestamptz, timestamptz, jsonb)
to service_role;
grant execute on function public.save_music_platforms_v2(text, jsonb, jsonb)
to service_role;
grant execute on function public.save_music_soundcloud_v2(text, timestamptz, jsonb, jsonb)
to service_role;

comment on table public.music_presentation is
  'Singleton public presentation copy for the Music page.';
comment on function public.get_music_page_v2_snapshot(text) is
  'Service-only complete Music preview snapshot for Admin V2.';
comment on function public.save_music_hero_v2(text, timestamptz, jsonb) is
  'Atomically saves the Music hero when its exact expected version still matches.';
comment on function public.save_music_spotify_v2(text, timestamptz, timestamptz, jsonb) is
  'Atomically saves Spotify copy and destinations using settings and presentation versions.';
comment on function public.save_music_platforms_v2(text, jsonb, jsonb) is
  'Atomically edits and reorders the exact existing Music platform collection without changing row identity or icon ownership.';
comment on function public.save_music_soundcloud_v2(text, timestamptz, jsonb, jsonb) is
  'Atomically saves SoundCloud copy and the exact existing ordered track collection.';
