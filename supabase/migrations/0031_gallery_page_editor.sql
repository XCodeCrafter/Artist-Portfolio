-- Admin V2 Gallery page editor.
--
-- Gallery frames historically doubled as HOME freelancer-story frames. The
-- split below gives every dual-use row a deterministic Gallery-only clone and
-- leaves the original row owned exclusively by the story. The V2 RPCs can then
-- edit Gallery without silently rewriting HOME.

begin;

-- Prevent a concurrent legacy Gallery write from landing between the clone and
-- ownership update. The reserved id is deterministic, while a collision fails
-- the transaction instead of overwriting an unrelated row.
lock table public.gallery_images in share row exclusive mode;

insert into public.gallery_images (
  id,
  title,
  src,
  alt,
  caption,
  category,
  sort_order,
  is_published,
  updated_at,
  is_mosaic,
  is_freelance_story,
  freelance_story_order
)
select
  'gallery-v2:' || pg_catalog.md5(image.id),
  image.title,
  image.src,
  image.alt,
  image.caption,
  image.category,
  image.sort_order,
  image.is_published,
  image.updated_at,
  true,
  false,
  0
from public.gallery_images as image
where image.is_mosaic = true
  and image.is_freelance_story = true;

update public.gallery_images
set is_mosaic = false
where is_mosaic = true
  and is_freelance_story = true;

-- Keep the ownership boundary true after the one-time split. Without this,
-- an older admin form could tick both placements again and create a row that
-- public Gallery renders but Gallery V2 intentionally cannot edit.
alter table public.gallery_images
  drop constraint if exists gallery_images_single_page_owner_check;

alter table public.gallery_images
  add constraint gallery_images_single_page_owner_check
  check (not (is_mosaic and is_freelance_story));

-- Keep the ownership boundary true after the one-time split. Without this,
-- an older admin form could tick both placements again and create a row that
-- public Gallery renders but Gallery V2 intentionally cannot edit.
alter table public.gallery_images
  drop constraint if exists gallery_images_single_page_owner_check;

alter table public.gallery_images
  add constraint gallery_images_single_page_owner_check
  check (not (is_mosaic and is_freelance_story));

create or replace function public.get_gallery_page_v2_snapshot(
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
    raise exception 'invalid_gallery_page_site'
      using errcode = '22023';
  end if;

  -- One statement keeps Hero, Introduction, Gallery frames, and Footer on the
  -- same database snapshot. Hidden, unpublished, and catalog-only Gallery rows
  -- are included; HOME story rows are intentionally outside this editor.
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
      'introEyebrow', presentation.intro_eyebrow,
      'introTitle', presentation.intro_title,
      'updatedAt', presentation.updated_at
    ),
    'frames', pg_catalog.jsonb_build_object(
      'items', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', image.id,
              'title', image.title,
              'src', image.src,
              'alt', image.alt,
              'caption', image.caption,
              'category', image.category,
              'isMosaic', image.is_mosaic,
              'isPublished', image.is_published,
              'updatedAt', image.updated_at
            )
            order by image.sort_order, image.id
          )
          from public.gallery_images as image
          where image.is_freelance_story = false
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
  cross join public.gallery_presentation as presentation
  where settings.id = p_site_id
    and hero.page_slug = 'gallery'
    and presentation.id = p_site_id;

  if v_snapshot is null then
    raise exception 'gallery_page_snapshot_missing'
      using errcode = '23503';
  end if;

  return v_snapshot;
end;
$$;

create or replace function public.save_gallery_hero_v2(
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
    raise exception 'invalid_gallery_hero_payload'
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
    or exists (
      select 1
      from pg_catalog.jsonb_each(p_payload) as supplied(key, value)
      where pg_catalog.jsonb_typeof(supplied.value) is distinct from 'string'
    )
  then
    raise exception 'invalid_gallery_hero_payload'
      using errcode = '22023';
  end if;

  if pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'title')) not between 1 and 220
    or pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'subtitle')) > 220
    or pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'ctaLabel')) > 220
    or pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'ctaHref')) > 2048
    or pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'backgroundSrc')) not between 1 and 2048
    or pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'posterSrc')) > 2048
    or (p_payload ->> 'mediaType') not in ('image', 'video')
    -- A half-configured CTA is rendered inconsistently across hero variants.
    or (
      (pg_catalog.btrim(p_payload ->> 'ctaLabel') = '')
      <> (pg_catalog.btrim(p_payload ->> 'ctaHref') = '')
    )
    or (
      pg_catalog.btrim(p_payload ->> 'ctaHref') <> ''
      and not (
        pg_catalog.btrim(p_payload ->> 'ctaHref') ~ '^#[A-Za-z][A-Za-z0-9_-]*$'
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
    or pg_catalog.btrim(p_payload ->> 'ctaHref') ~ '[[:cntrl:]]'
    or pg_catalog.strpos(
      pg_catalog.btrim(p_payload ->> 'ctaHref'),
      pg_catalog.chr(92)
    ) > 0
    or not (
      (
        pg_catalog.left(pg_catalog.btrim(p_payload ->> 'backgroundSrc'), 1) = '/'
        and pg_catalog.left(pg_catalog.btrim(p_payload ->> 'backgroundSrc'), 2) <> '//'
      )
      or (
        pg_catalog.btrim(p_payload ->> 'backgroundSrc') ~* '^https://[^[:space:]]+$'
        and pg_catalog.btrim(p_payload ->> 'backgroundSrc') !~* '^https://[^/?#]*@'
      )
    )
    or pg_catalog.btrim(p_payload ->> 'backgroundSrc') ~ '[[:cntrl:]]'
    or pg_catalog.strpos(
      pg_catalog.btrim(p_payload ->> 'backgroundSrc'),
      pg_catalog.chr(92)
    ) > 0
    or (
      pg_catalog.btrim(p_payload ->> 'posterSrc') <> ''
      and not (
        (
          pg_catalog.left(pg_catalog.btrim(p_payload ->> 'posterSrc'), 1) = '/'
          and pg_catalog.left(pg_catalog.btrim(p_payload ->> 'posterSrc'), 2) <> '//'
        )
        or (
          pg_catalog.btrim(p_payload ->> 'posterSrc') ~* '^https://[^[:space:]]+$'
          and pg_catalog.btrim(p_payload ->> 'posterSrc') !~* '^https://[^/?#]*@'
        )
      )
    )
    or pg_catalog.btrim(p_payload ->> 'posterSrc') ~ '[[:cntrl:]]'
    or pg_catalog.strpos(
      pg_catalog.btrim(p_payload ->> 'posterSrc'),
      pg_catalog.chr(92)
    ) > 0
  then
    raise exception 'invalid_gallery_hero_payload'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('gallery_page_v2:hero:main', 0)
  );

  select hero.updated_at
  into v_current_version
  from public.page_heroes as hero
  where hero.page_slug = 'gallery'
  for update;

  if not found then
    raise exception 'gallery_hero_missing'
      using errcode = '23503';
  end if;

  if v_current_version is distinct from p_expected_updated_at then
    raise exception 'gallery_hero_changed'
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
  where page_slug = 'gallery'
  returning updated_at into v_version;

  return pg_catalog.jsonb_build_object(
    'versions', pg_catalog.jsonb_build_object('updatedAt', v_version)
  );
end;
$$;

create or replace function public.save_gallery_introduction_v2(
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
    raise exception 'invalid_gallery_introduction_payload'
      using errcode = '22023';
  end if;

  if not (p_payload ?& array['introEyebrow', 'introTitle'])
    or exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_payload) as supplied(key)
      where supplied.key not in ('introEyebrow', 'introTitle')
    )
    or pg_catalog.jsonb_typeof(p_payload -> 'introEyebrow') is distinct from 'string'
    or pg_catalog.jsonb_typeof(p_payload -> 'introTitle') is distinct from 'string'
    or pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'introEyebrow')) not between 1 and 220
    or pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'introTitle')) not between 1 and 500
  then
    raise exception 'invalid_gallery_introduction_payload'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('gallery_page_v2:introduction:main', 0)
  );

  select presentation.updated_at
  into v_current_version
  from public.gallery_presentation as presentation
  where presentation.id = p_site_id
  for update;

  if not found then
    raise exception 'gallery_presentation_missing'
      using errcode = '23503';
  end if;

  if v_current_version is distinct from p_expected_updated_at then
    raise exception 'gallery_introduction_changed'
      using errcode = '40001';
  end if;

  update public.gallery_presentation
  set
    intro_eyebrow = pg_catalog.btrim(p_payload ->> 'introEyebrow'),
    intro_title = pg_catalog.btrim(p_payload ->> 'introTitle')
  where id = p_site_id
  returning updated_at into v_version;

  return pg_catalog.jsonb_build_object(
    'versions', pg_catalog.jsonb_build_object('updatedAt', v_version)
  );
end;
$$;

create or replace function public.save_gallery_frames_v2(
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
  v_frames jsonb;
  v_frame_count integer;
  v_current_count integer;
  v_versions jsonb;
begin
  if p_site_id is distinct from 'main'
    or pg_catalog.jsonb_typeof(p_expected_versions) is distinct from 'object'
    or pg_catalog.jsonb_typeof(p_payload) is distinct from 'object'
  then
    raise exception 'invalid_gallery_frames_payload'
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
    raise exception 'invalid_gallery_frames_payload'
      using errcode = '22023';
  end if;

  v_frames := p_payload -> 'items';
  v_frame_count := pg_catalog.jsonb_array_length(v_frames);

  if v_frame_count > 120
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
      from pg_catalog.jsonb_array_elements(v_frames) as submitted(item)
      where pg_catalog.jsonb_typeof(submitted.item) is distinct from 'object'
        or not (submitted.item ?& array[
          'id',
          'title',
          'src',
          'alt',
          'caption',
          'category',
          'isMosaic',
          'isPublished'
        ])
        or exists (
          select 1
          from pg_catalog.jsonb_object_keys(submitted.item) as supplied(key)
          where supplied.key not in (
            'id',
            'title',
            'src',
            'alt',
            'caption',
            'category',
            'isMosaic',
            'isPublished'
          )
        )
        or exists (
          select 1
          from pg_catalog.jsonb_each(submitted.item) as field(key, value)
          where field.key in (
            'id',
            'title',
            'src',
            'alt',
            'caption',
            'category'
          )
            and pg_catalog.jsonb_typeof(field.value) is distinct from 'string'
        )
        or pg_catalog.jsonb_typeof(submitted.item -> 'isMosaic') is distinct from 'boolean'
        or pg_catalog.jsonb_typeof(submitted.item -> 'isPublished') is distinct from 'boolean'
    )
  then
    raise exception 'invalid_gallery_frames_payload'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(v_frames) as submitted(item)
    where pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'id')) not between 1 and 160
      or pg_catalog.btrim(submitted.item ->> 'id') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
      or pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'title')) not between 1 and 180
      or pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'src')) not between 1 and 2048
      or pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'alt')) > 220
      or pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'caption')) > 600
      or pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'category')) > 80
      or not (
        (
          pg_catalog.left(pg_catalog.btrim(submitted.item ->> 'src'), 1) = '/'
          and pg_catalog.left(pg_catalog.btrim(submitted.item ->> 'src'), 2) <> '//'
        )
        or (
          pg_catalog.btrim(submitted.item ->> 'src') ~* '^https://[^[:space:]]+$'
          and pg_catalog.btrim(submitted.item ->> 'src') !~* '^https://[^/?#]*@'
        )
      )
      or pg_catalog.btrim(submitted.item ->> 'src') ~ '[[:cntrl:]]'
      or pg_catalog.strpos(
        pg_catalog.btrim(submitted.item ->> 'src'),
        pg_catalog.chr(92)
      ) > 0
  ) then
    raise exception 'invalid_gallery_frames_payload'
      using errcode = '22023';
  end if;

  if (
    select pg_catalog.count(distinct pg_catalog.btrim(submitted.item ->> 'id'))
    from pg_catalog.jsonb_array_elements(v_frames) as submitted(item)
  ) <> v_frame_count then
    raise exception 'invalid_gallery_frames_payload'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('gallery_page_v2:frames:main', 0)
  );
  lock table public.gallery_images in share row exclusive mode;

  select pg_catalog.count(*)::integer
  into v_current_count
  from public.gallery_images as image
  where image.is_freelance_story = false;

  if (
      select pg_catalog.count(*)::integer
      from pg_catalog.jsonb_object_keys(p_expected_versions)
    ) <> v_current_count
    or exists (
      select 1
      from public.gallery_images as current_image
      where current_image.is_freelance_story = false
        and not (p_expected_versions ? current_image.id)
    )
    or exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_expected_versions) as expected(id)
      where not exists (
        select 1
        from public.gallery_images as current_image
        where current_image.id = expected.id
          and current_image.is_freelance_story = false
      )
    )
  then
    raise exception 'gallery_frames_changed'
      using errcode = '40001';
  end if;

  begin
    if exists (
      select 1
      from public.gallery_images as current_image
      where current_image.is_freelance_story = false
        and current_image.updated_at is distinct from
          (p_expected_versions ->> current_image.id)::timestamptz
    ) then
      raise exception 'gallery_frames_changed'
        using errcode = '40001';
    end if;
  exception
    when invalid_datetime_format or datetime_field_overflow then
      raise exception 'invalid_gallery_frames_payload'
        using errcode = '22023';
  end;

  -- Baseline Gallery rows cannot disappear. Omission never means deletion.
  if exists (
    select 1
    from public.gallery_images as current_image
    where current_image.is_freelance_story = false
      and not exists (
        select 1
        from pg_catalog.jsonb_array_elements(v_frames) as submitted(item)
        where pg_catalog.btrim(submitted.item ->> 'id') = current_image.id
      )
  )
  -- A new Gallery id must not steal a HOME story row via ON CONFLICT.
  or exists (
    select 1
    from pg_catalog.jsonb_array_elements(v_frames) as submitted(item)
    join public.gallery_images as story_image
      on story_image.id = pg_catalog.btrim(submitted.item ->> 'id')
    where story_image.is_freelance_story = true
  ) then
    raise exception 'invalid_gallery_frames_payload'
      using errcode = '22023';
  end if;

  insert into public.gallery_images (
    id,
    title,
    src,
    alt,
    caption,
    category,
    sort_order,
    is_published,
    is_mosaic,
    is_freelance_story,
    freelance_story_order
  )
  select
    pg_catalog.btrim(submitted.item ->> 'id'),
    pg_catalog.btrim(submitted.item ->> 'title'),
    pg_catalog.btrim(submitted.item ->> 'src'),
    pg_catalog.btrim(submitted.item ->> 'alt'),
    pg_catalog.btrim(submitted.item ->> 'caption'),
    pg_catalog.btrim(submitted.item ->> 'category'),
    (submitted.ordinality * 10)::integer,
    (submitted.item ->> 'isPublished')::boolean,
    (submitted.item ->> 'isMosaic')::boolean,
    false,
    0
  from pg_catalog.jsonb_array_elements(v_frames)
    with ordinality as submitted(item, ordinality)
  on conflict (id) do update set
    title = excluded.title,
    src = excluded.src,
    alt = excluded.alt,
    caption = excluded.caption,
    category = excluded.category,
    sort_order = excluded.sort_order,
    is_published = excluded.is_published,
    is_mosaic = excluded.is_mosaic,
    is_freelance_story = false,
    freelance_story_order = 0;

  select coalesce(
    pg_catalog.jsonb_object_agg(
      image.id,
      pg_catalog.to_jsonb(image.updated_at)
      order by image.id
    ),
    '{}'::jsonb
  )
  into v_versions
  from public.gallery_images as image
  where image.is_freelance_story = false;

  return pg_catalog.jsonb_build_object(
    'versions', pg_catalog.jsonb_build_object('items', v_versions)
  );
end;
$$;

revoke all on function public.get_gallery_page_v2_snapshot(text)
from public, anon, authenticated, service_role;
revoke all on function public.save_gallery_hero_v2(text, timestamptz, jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.save_gallery_introduction_v2(text, timestamptz, jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.save_gallery_frames_v2(text, jsonb, jsonb)
from public, anon, authenticated, service_role;

grant execute on function public.get_gallery_page_v2_snapshot(text)
to service_role;
grant execute on function public.save_gallery_hero_v2(text, timestamptz, jsonb)
to service_role;
grant execute on function public.save_gallery_introduction_v2(text, timestamptz, jsonb)
to service_role;
grant execute on function public.save_gallery_frames_v2(text, jsonb, jsonb)
to service_role;

comment on function public.get_gallery_page_v2_snapshot(text) is
  'Service-only consistent Admin V2 snapshot of Gallery-owned content, including hidden frames.';
comment on function public.save_gallery_hero_v2(text, timestamptz, jsonb) is
  'Optimistically updates the Gallery hero singleton with paired CTA validation.';
comment on function public.save_gallery_introduction_v2(text, timestamptz, jsonb) is
  'Optimistically updates only the Gallery introduction fields of the shared presentation singleton.';
comment on function public.save_gallery_frames_v2(text, jsonb, jsonb) is
  'Atomically edits, reorders, hides, and appends Gallery-owned frames without touching HOME story rows or deleting data.';

commit;
