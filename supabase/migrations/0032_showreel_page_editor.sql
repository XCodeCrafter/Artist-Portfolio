-- Admin V2 Showreel page editor.
--
-- The videos table is a shared historical catalog. This migration deliberately
-- keeps every row (including hidden and music_video items) in one atomic
-- editor and never interprets omission as deletion.

begin;

insert into public.media_assets as existing (
  id,
  label,
  src,
  alt,
  media_type,
  usage_key,
  sort_order,
  is_published,
  metadata
)
values (
  'showreel-studio-settings',
  'Showreel Studio settings',
  '/video',
  '',
  'document',
  'system:showreel-studio',
  0,
  true,
  pg_catalog.jsonb_build_object(
    'sectionEyebrow', 'SOCIAL',
    'sectionTitle', 'Showreel, scenes, and selected work',
    'sectionBody', 'Casting reels, performance clips, and screen work will appear here as the video library grows.',
    'featuredLabel', 'Featured showreel',
    'featuredFallback', 'Main reel for casting, agencies, and production teams.',
    'libraryEyebrow', 'Library',
    'libraryTitle', 'Scenes and Clips',
    'emptyText', 'Showreel and scenes are coming soon.'
  )
)
on conflict (id) do update set
  label = excluded.label,
  src = excluded.src,
  alt = excluded.alt,
  media_type = excluded.media_type,
  usage_key = excluded.usage_key,
  sort_order = excluded.sort_order,
  is_published = true,
  deleted_at = null,
  deleted_by = null,
  -- Existing editor copy wins, while missing keys receive safe defaults.
  metadata = excluded.metadata || coalesce(existing.metadata, '{}'::jsonb);

create or replace function public.get_showreel_page_v2_snapshot(
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
    raise exception 'invalid_showreel_page_site'
      using errcode = '22023';
  end if;

  -- One statement gives the editor a consistent hero, presentation, complete
  -- video catalog, and preview-only footer snapshot.
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
    'introduction', pg_catalog.jsonb_build_object(
      'sectionEyebrow', case
        when pg_catalog.jsonb_typeof(presentation.metadata -> 'sectionEyebrow') = 'string'
          then presentation.metadata ->> 'sectionEyebrow'
        else 'SOCIAL'
      end,
      'sectionTitle', case
        when pg_catalog.jsonb_typeof(presentation.metadata -> 'sectionTitle') = 'string'
          then presentation.metadata ->> 'sectionTitle'
        else 'Showreel, scenes, and selected work'
      end,
      'sectionBody', case
        when pg_catalog.jsonb_typeof(presentation.metadata -> 'sectionBody') = 'string'
          then presentation.metadata ->> 'sectionBody'
        else 'Casting reels, performance clips, and screen work will appear here as the video library grows.'
      end,
      'emptyText', case
        when pg_catalog.jsonb_typeof(presentation.metadata -> 'emptyText') = 'string'
          then presentation.metadata ->> 'emptyText'
        else 'Showreel and scenes are coming soon.'
      end,
      'updatedAt', presentation.updated_at
    ),
    'works', pg_catalog.jsonb_build_object(
      'items', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', video.id,
              'title', video.title,
              'description', video.description,
              'embedUrl', video.embed_url,
              'platform', video.platform,
              'thumbnailSrc', video.thumbnail_src,
              'videoType', video.video_type,
              'isFeatured', video.is_featured,
              'isPublished', video.is_published,
              'updatedAt', video.updated_at
            )
            order by video.sort_order, video.id
          )
          from public.videos as video
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
  cross join public.media_assets as presentation
  where settings.id = p_site_id
    and hero.page_slug = 'video'
    and presentation.id = 'showreel-studio-settings';

  if v_snapshot is null then
    raise exception 'showreel_page_snapshot_missing'
      using errcode = '23503';
  end if;

  return v_snapshot;
end;
$$;

create or replace function public.save_showreel_hero_v2(
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
    raise exception 'invalid_showreel_hero_payload'
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
    raise exception 'invalid_showreel_hero_payload'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('showreel_page_v2:hero:main', 0)
  );

  -- Keep Media Library trashing and content publication serializable. The
  -- trash RPC locks this same row before checking page references.
  if pg_catalog.left(pg_catalog.btrim(p_payload ->> 'backgroundSrc'), 1) <> '/' then
    perform 1
    from public.media_assets as background_asset
    where background_asset.src = pg_catalog.btrim(p_payload ->> 'backgroundSrc')
      and background_asset.media_type = p_payload ->> 'mediaType'
      and background_asset.deleted_at is null
    for share;
    if not found then
      raise exception 'invalid_showreel_hero_payload'
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
      raise exception 'invalid_showreel_hero_payload'
        using errcode = '22023';
    end if;
  end if;

  select hero.updated_at
  into v_current_version
  from public.page_heroes as hero
  where hero.page_slug = 'video'
  for update;

  if v_current_version is null then
    raise exception 'showreel_page_snapshot_missing'
      using errcode = '23503';
  end if;
  if v_current_version is distinct from p_expected_updated_at then
    raise exception 'showreel_hero_changed'
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
  where page_slug = 'video'
  returning updated_at into v_version;

  return pg_catalog.jsonb_build_object(
    'versions', pg_catalog.jsonb_build_object('updatedAt', v_version)
  );
end;
$$;

create or replace function public.save_showreel_introduction_v2(
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
      'sectionEyebrow', 'sectionTitle', 'sectionBody', 'emptyText'
    ])
    or exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_payload) as supplied(key)
      where supplied.key not in (
        'sectionEyebrow', 'sectionTitle', 'sectionBody', 'emptyText'
      )
    )
    or exists (
      select 1
      from pg_catalog.jsonb_each(p_payload) as supplied(key, value)
      where pg_catalog.jsonb_typeof(supplied.value) is distinct from 'string'
    )
  then
    raise exception 'invalid_showreel_introduction_payload'
      using errcode = '22023';
  end if;

  if pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'sectionEyebrow')) not between 1 and 220
    or pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'sectionTitle')) not between 1 and 500
    or pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'sectionBody')) > 1200
    or pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'emptyText')) not between 1 and 500
  then
    raise exception 'invalid_showreel_introduction_payload'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('showreel_page_v2:introduction:main', 0)
  );

  select asset.updated_at
  into v_current_version
  from public.media_assets as asset
  where asset.id = 'showreel-studio-settings'
  for update;

  if v_current_version is null then
    raise exception 'showreel_page_snapshot_missing'
      using errcode = '23503';
  end if;
  if v_current_version is distinct from p_expected_updated_at then
    raise exception 'showreel_introduction_changed'
      using errcode = '40001';
  end if;

  update public.media_assets
  set metadata = metadata || pg_catalog.jsonb_build_object(
        'sectionEyebrow', pg_catalog.btrim(p_payload ->> 'sectionEyebrow'),
        'sectionTitle', pg_catalog.btrim(p_payload ->> 'sectionTitle'),
        'sectionBody', pg_catalog.btrim(p_payload ->> 'sectionBody'),
        'emptyText', pg_catalog.btrim(p_payload ->> 'emptyText')
      )
  where id = 'showreel-studio-settings'
  returning updated_at into v_version;

  return pg_catalog.jsonb_build_object(
    'versions', pg_catalog.jsonb_build_object('updatedAt', v_version)
  );
end;
$$;

create or replace function public.save_showreel_works_v2(
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
  v_works jsonb;
  v_work_count integer;
  v_current_count integer;
  v_versions jsonb;
begin
  if p_site_id is distinct from 'main'
    or pg_catalog.jsonb_typeof(p_expected_versions) is distinct from 'object'
    or pg_catalog.jsonb_typeof(p_payload) is distinct from 'object'
    or not (p_payload ? 'items')
    or exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_payload) as supplied(key)
      where supplied.key <> 'items'
    )
    or pg_catalog.jsonb_typeof(p_payload -> 'items') is distinct from 'array'
  then
    raise exception 'invalid_showreel_works_payload'
      using errcode = '22023';
  end if;

  v_works := p_payload -> 'items';
  v_work_count := pg_catalog.jsonb_array_length(v_works);

  if exists (
      select 1
      from pg_catalog.jsonb_each(p_expected_versions) as expected(id, version)
      where pg_catalog.char_length(expected.id) not between 1 and 512
        or expected.id ~ '[[:cntrl:]]'
        or pg_catalog.jsonb_typeof(expected.version) is distinct from 'string'
        or pg_catalog.char_length(p_expected_versions ->> expected.id)
          not between 1 and 64
    )
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_works) as submitted(item)
      where pg_catalog.jsonb_typeof(submitted.item) is distinct from 'object'
        or not (submitted.item ?& array[
          'id', 'title', 'description', 'embedUrl', 'platform',
          'thumbnailSrc', 'videoType', 'isFeatured', 'isPublished'
        ])
        or exists (
          select 1
          from pg_catalog.jsonb_object_keys(submitted.item) as supplied(key)
          where supplied.key not in (
            'id', 'title', 'description', 'embedUrl', 'platform',
            'thumbnailSrc', 'videoType', 'isFeatured', 'isPublished'
          )
        )
        or exists (
          select 1
          from pg_catalog.jsonb_each(submitted.item) as field(key, value)
          where field.key in (
            'id', 'title', 'description', 'embedUrl', 'platform',
            'thumbnailSrc', 'videoType'
          )
            and pg_catalog.jsonb_typeof(field.value) is distinct from 'string'
        )
        or pg_catalog.jsonb_typeof(submitted.item -> 'isFeatured') is distinct from 'boolean'
        or pg_catalog.jsonb_typeof(submitted.item -> 'isPublished') is distinct from 'boolean'
    )
  then
    raise exception 'invalid_showreel_works_payload'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(v_works) as submitted(item)
    where pg_catalog.char_length(submitted.item ->> 'id') not between 1 and 512
      or (submitted.item ->> 'id') ~ '[[:cntrl:]]'
      or pg_catalog.btrim(submitted.item ->> 'id') = ''
      or pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'title')) not between 1 and 220
      or pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'description')) > 1000
      or pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'embedUrl')) not between 1 and 1200
      or pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'platform')) not between 1 and 80
      or pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'thumbnailSrc')) > 1200
      or (submitted.item ->> 'videoType') not in (
        'showreel', 'scene', 'self_tape', 'interview',
        'music_video', 'behind_scenes', 'other'
      )
      or (
        (submitted.item ->> 'isPublished')::boolean
        and pg_catalog.btrim(submitted.item ->> 'thumbnailSrc') <> ''
        and not (
          (
            pg_catalog.left(pg_catalog.btrim(submitted.item ->> 'thumbnailSrc'), 1) = '/'
            and pg_catalog.left(pg_catalog.btrim(submitted.item ->> 'thumbnailSrc'), 2) <> '//'
          )
          or (
            pg_catalog.btrim(submitted.item ->> 'thumbnailSrc')
              ~* '^https://[^[:space:]/?#:@]+(:443)?([/?#]|$)'
            and exists (
              select 1
              from public.media_assets as thumbnail_asset
              where thumbnail_asset.src = pg_catalog.btrim(submitted.item ->> 'thumbnailSrc')
                and thumbnail_asset.media_type = 'image'
                and thumbnail_asset.deleted_at is null
            )
          )
        )
      )
      or pg_catalog.concat_ws(
        '', submitted.item ->> 'embedUrl', submitted.item ->> 'thumbnailSrc'
      ) ~ '[[:cntrl:]]'
      or pg_catalog.strpos(
        pg_catalog.concat_ws(
          '', submitted.item ->> 'embedUrl', submitted.item ->> 'thumbnailSrc'
        ),
        pg_catalog.chr(92)
      ) > 0
      or (
        (submitted.item ->> 'isPublished')::boolean
        and pg_catalog.lower(pg_catalog.btrim(submitted.item ->> 'platform'))
          in ('upload', 'direct', 'html5')
        and not (
          (
            pg_catalog.left(pg_catalog.btrim(submitted.item ->> 'embedUrl'), 1) = '/'
            and pg_catalog.left(pg_catalog.btrim(submitted.item ->> 'embedUrl'), 2) <> '//'
          )
          or (
            pg_catalog.btrim(submitted.item ->> 'embedUrl')
              ~* '^https://[^[:space:]/?#:@]+(:443)?([/?#]|$)'
            and exists (
              select 1
              from public.media_assets as video_asset
              where video_asset.src = pg_catalog.btrim(submitted.item ->> 'embedUrl')
                and video_asset.media_type = 'video'
                and video_asset.deleted_at is null
            )
          )
        )
      )
      or (
        (submitted.item ->> 'isPublished')::boolean
        and pg_catalog.lower(pg_catalog.btrim(submitted.item ->> 'platform'))
          not in ('upload', 'direct', 'html5')
        and pg_catalog.btrim(submitted.item ->> 'embedUrl') !~* (
          '^https://('
          || 'www[.]youtube[.]com|m[.]youtube[.]com|music[.]youtube[.]com|youtube[.]com|youtu[.]be|'
          || 'www[.]youtube-nocookie[.]com|youtube-nocookie[.]com|'
          || 'www[.]vimeo[.]com|player[.]vimeo[.]com|vimeo[.]com|'
          || 'open[.]spotify[.]com|w[.]soundcloud[.]com'
          || ')(:443)?([/?#]|$)'
        )
      )
      or (
        (submitted.item ->> 'isPublished')::boolean
        and pg_catalog.lower(pg_catalog.btrim(submitted.item ->> 'platform')) = 'youtube'
        and pg_catalog.btrim(submitted.item ->> 'embedUrl') !~* (
          '^https://(www[.]youtube[.]com|m[.]youtube[.]com|music[.]youtube[.]com|'
          || 'youtube[.]com|youtu[.]be|www[.]youtube-nocookie[.]com|'
          || 'youtube-nocookie[.]com)(:443)?([/?#]|$)'
        )
      )
      or (
        (submitted.item ->> 'isPublished')::boolean
        and pg_catalog.lower(pg_catalog.btrim(submitted.item ->> 'platform')) = 'vimeo'
        and pg_catalog.btrim(submitted.item ->> 'embedUrl')
          !~* '^https://(www[.]vimeo[.]com|player[.]vimeo[.]com|vimeo[.]com)(:443)?([/?#]|$)'
      )
      or (
        (submitted.item ->> 'isPublished')::boolean
        and pg_catalog.lower(pg_catalog.btrim(submitted.item ->> 'platform')) = 'spotify'
        and pg_catalog.btrim(submitted.item ->> 'embedUrl')
          !~* '^https://open[.]spotify[.]com(:443)?([/?#]|$)'
      )
      or (
        (submitted.item ->> 'isPublished')::boolean
        and pg_catalog.lower(pg_catalog.btrim(submitted.item ->> 'platform')) = 'soundcloud'
        and pg_catalog.btrim(submitted.item ->> 'embedUrl')
          !~* '^https://w[.]soundcloud[.]com(:443)?([/?#]|$)'
      )
  )
  or (
    select pg_catalog.count(distinct submitted.item ->> 'id')
    from pg_catalog.jsonb_array_elements(v_works) as submitted(item)
  ) <> v_work_count
  or (
    select pg_catalog.count(*)
    from pg_catalog.jsonb_array_elements(v_works) as submitted(item)
    where (submitted.item ->> 'isFeatured')::boolean
  ) > 1
  then
    raise exception 'invalid_showreel_works_payload'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('showreel_page_v2:works:main', 0)
  );
  lock table public.videos in share row exclusive mode;

  -- Lock every published Media Library source before the version check and
  -- upsert. A concurrent trash request either finishes first (and this save is
  -- rejected) or waits, then observes the newly committed video reference.
  perform 1
  from public.media_assets as locked_asset
  where locked_asset.deleted_at is null
    and locked_asset.src in (
      select pg_catalog.btrim(submitted.item ->> 'embedUrl')
      from pg_catalog.jsonb_array_elements(v_works) as submitted(item)
      where (submitted.item ->> 'isPublished')::boolean
        and pg_catalog.lower(pg_catalog.btrim(submitted.item ->> 'platform'))
          in ('upload', 'direct', 'html5')
        and pg_catalog.left(pg_catalog.btrim(submitted.item ->> 'embedUrl'), 1) <> '/'

      union

      select pg_catalog.btrim(submitted.item ->> 'thumbnailSrc')
      from pg_catalog.jsonb_array_elements(v_works) as submitted(item)
      where (submitted.item ->> 'isPublished')::boolean
        and pg_catalog.btrim(submitted.item ->> 'thumbnailSrc') <> ''
        and pg_catalog.left(pg_catalog.btrim(submitted.item ->> 'thumbnailSrc'), 1) <> '/'
    )
  for share;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(v_works) as submitted(item)
    where (submitted.item ->> 'isPublished')::boolean
      and (
        (
          pg_catalog.lower(pg_catalog.btrim(submitted.item ->> 'platform'))
            in ('upload', 'direct', 'html5')
          and pg_catalog.left(pg_catalog.btrim(submitted.item ->> 'embedUrl'), 1) <> '/'
          and not exists (
            select 1
            from public.media_assets as video_asset
            where video_asset.src = pg_catalog.btrim(submitted.item ->> 'embedUrl')
              and video_asset.media_type = 'video'
              and video_asset.deleted_at is null
          )
        )
        or (
          pg_catalog.btrim(submitted.item ->> 'thumbnailSrc') <> ''
          and pg_catalog.left(pg_catalog.btrim(submitted.item ->> 'thumbnailSrc'), 1) <> '/'
          and not exists (
            select 1
            from public.media_assets as thumbnail_asset
            where thumbnail_asset.src = pg_catalog.btrim(submitted.item ->> 'thumbnailSrc')
              and thumbnail_asset.media_type = 'image'
              and thumbnail_asset.deleted_at is null
          )
        )
      )
  ) then
    raise exception 'invalid_showreel_works_payload'
      using errcode = '22023';
  end if;

  select pg_catalog.count(*)::integer
  into v_current_count
  from public.videos;

  if (
      select pg_catalog.count(*)::integer
      from pg_catalog.jsonb_object_keys(p_expected_versions)
    ) <> v_current_count
    or exists (
      select 1
      from public.videos as current_video
      where not (p_expected_versions ? current_video.id)
    )
    or exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_expected_versions) as expected(id)
      where not exists (
        select 1 from public.videos as current_video
        where current_video.id = expected.id
      )
    )
  then
    raise exception 'showreel_works_changed'
      using errcode = '40001';
  end if;

  -- Existing catalogs above the current UI cap remain editable. Only appending
  -- past the greater of that historical size or 120 rows is rejected.
  if v_work_count > pg_catalog.greatest(120, v_current_count) then
    raise exception 'invalid_showreel_works_payload'
      using errcode = '22023';
  end if;

  -- Historical primary keys are preserved byte-for-byte. The stricter id
  -- format applies only to rows that are genuinely new to this snapshot.
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(v_works) as submitted(item)
    where not (p_expected_versions ? (submitted.item ->> 'id'))
      and (
        pg_catalog.char_length(submitted.item ->> 'id') not between 1 and 160
        or (submitted.item ->> 'id') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
      )
  ) then
    raise exception 'invalid_showreel_works_payload'
      using errcode = '22023';
  end if;

  begin
    if exists (
      select 1
      from public.videos as current_video
      where current_video.updated_at is distinct from
        (p_expected_versions ->> current_video.id)::timestamptz
    ) then
      raise exception 'showreel_works_changed'
        using errcode = '40001';
    end if;
  exception
    when invalid_datetime_format or datetime_field_overflow then
      raise exception 'invalid_showreel_works_payload'
        using errcode = '22023';
  end;

  -- Every saved row, including legacy music_video records, must remain in the
  -- submitted catalog. Omission is rejected instead of treated as deletion.
  if exists (
    select 1
    from public.videos as current_video
    where not exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_works) as submitted(item)
      where submitted.item ->> 'id' = current_video.id
    )
  ) then
    raise exception 'invalid_showreel_works_payload'
      using errcode = '22023';
  end if;

  -- Clear first so moving the single featured marker never races the partial
  -- unique index. The new marker is applied by the same transaction below.
  update public.videos
  set is_featured = false
  where is_featured = true;

  insert into public.videos (
    id,
    title,
    description,
    embed_url,
    platform,
    thumbnail_src,
    video_type,
    is_featured,
    sort_order,
    is_published
  )
  select
    submitted.item ->> 'id',
    pg_catalog.btrim(submitted.item ->> 'title'),
    pg_catalog.btrim(submitted.item ->> 'description'),
    pg_catalog.btrim(submitted.item ->> 'embedUrl'),
    pg_catalog.btrim(submitted.item ->> 'platform'),
    pg_catalog.btrim(submitted.item ->> 'thumbnailSrc'),
    submitted.item ->> 'videoType',
    (submitted.item ->> 'isFeatured')::boolean,
    (submitted.ordinality * 10)::integer,
    (submitted.item ->> 'isPublished')::boolean
  from pg_catalog.jsonb_array_elements(v_works)
    with ordinality as submitted(item, ordinality)
  on conflict (id) do update set
    title = excluded.title,
    description = excluded.description,
    embed_url = excluded.embed_url,
    platform = excluded.platform,
    thumbnail_src = excluded.thumbnail_src,
    video_type = excluded.video_type,
    is_featured = excluded.is_featured,
    sort_order = excluded.sort_order,
    is_published = excluded.is_published;

  select coalesce(
    pg_catalog.jsonb_object_agg(
      video.id,
      pg_catalog.to_jsonb(video.updated_at)
      order by video.id
    ),
    '{}'::jsonb
  )
  into v_versions
  from public.videos as video;

  return pg_catalog.jsonb_build_object(
    'versions', pg_catalog.jsonb_build_object('items', v_versions)
  );
end;
$$;

revoke all on function public.get_showreel_page_v2_snapshot(text)
from public, anon, authenticated, service_role;
revoke all on function public.save_showreel_hero_v2(text, timestamptz, jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.save_showreel_introduction_v2(text, timestamptz, jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.save_showreel_works_v2(text, jsonb, jsonb)
from public, anon, authenticated, service_role;

grant execute on function public.get_showreel_page_v2_snapshot(text)
to service_role;
grant execute on function public.save_showreel_hero_v2(text, timestamptz, jsonb)
to service_role;
grant execute on function public.save_showreel_introduction_v2(text, timestamptz, jsonb)
to service_role;
grant execute on function public.save_showreel_works_v2(text, jsonb, jsonb)
to service_role;

comment on function public.get_showreel_page_v2_snapshot(text) is
  'Service-only consistent Admin V2 snapshot of the Showreel page and every video row.';
comment on function public.save_showreel_hero_v2(text, timestamptz, jsonb) is
  'Optimistically updates the Showreel hero singleton.';
comment on function public.save_showreel_introduction_v2(text, timestamptz, jsonb) is
  'Optimistically updates only public Showreel presentation fields while preserving legacy metadata.';
comment on function public.save_showreel_works_v2(text, jsonb, jsonb) is
  'Atomically edits, reorders, hides, and appends all Showreel and legacy music-video rows without deletion.';

commit;
