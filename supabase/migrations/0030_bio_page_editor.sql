-- Admin V2 Bio page editor.
--
-- Four service-only save boundaries mirror the public page: Hero, Biography
-- (profile + portraits + paragraphs in one transaction), Resume, and Credits.
-- Collection saves may append, edit, reorder, hide, or restore rows. They never
-- delete a row, and every pre-existing id must remain in the submitted payload.

begin;

-- No content is seeded here. A missing singleton remains an explicit snapshot
-- or save error so applying this migration cannot change public visibility.

create or replace function public.get_bio_page_v2_snapshot(
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
    raise exception 'invalid_bio_page_site'
      using errcode = '22023';
  end if;

  -- One SQL statement gives the editor a transactionally consistent snapshot.
  -- Unpublished collection rows are intentionally included so V2 can restore
  -- them without ever pretending an omission means deletion.
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
    'biography', pg_catalog.jsonb_build_object(
      'topLabel', profile.top_label,
      'introText', profile.intro_text,
      'caption', profile.caption,
      'profileUpdatedAt', profile.updated_at,
      'galleryImages', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', image.id,
              'src', image.src,
              'alt', image.alt,
              'isPublished', image.is_published,
              'updatedAt', image.updated_at
            )
            order by image.sort_order, image.id
          )
          from public.bio_gallery_images as image
        ),
        '[]'::jsonb
      ),
      'paragraphs', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', paragraph.id,
              'body', paragraph.body,
              'revealDelay', paragraph.reveal_delay,
              'isPublished', paragraph.is_published,
              'updatedAt', paragraph.updated_at
            )
            order by paragraph.sort_order, paragraph.id
          )
          from public.bio_paragraphs as paragraph
        ),
        '[]'::jsonb
      )
    ),
    'resume', pg_catalog.jsonb_build_object(
      'headline', resume.headline,
      'summary', resume.summary,
      'location', resume.location,
      'playingAge', resume.playing_age,
      'height', resume.height,
      'eyes', resume.eyes,
      'hair', resume.hair,
      'languages', resume.languages,
      'skills', resume.skills,
      'representation', resume.representation,
      'resumeUrl', resume.resume_url,
      'updatedAt', resume.updated_at
    ),
    'credits', coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', credit.id,
            'creditType', credit.credit_type,
            'title', credit.title,
            'role', credit.role,
            'production', credit.production,
            'director', credit.director,
            'year', credit.year,
            'href', credit.href,
            'isPublished', credit.is_published,
            'updatedAt', credit.updated_at
          )
          order by credit.sort_order, credit.id
        )
        from public.actor_credits as credit
      ),
      '[]'::jsonb
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
    ),
    'hasResumeDetails', true
  )
  into v_snapshot
  from public.site_settings as settings
  cross join public.page_heroes as hero
  cross join public.bio_profile as profile
  cross join public.actor_resume as resume
  where settings.id = p_site_id
    and hero.page_slug = 'bio'
    and profile.id = p_site_id
    and resume.id = p_site_id;

  if v_snapshot is null then
    raise exception 'bio_page_snapshot_missing'
      using errcode = '23503';
  end if;

  return v_snapshot;
end;
$$;

create or replace function public.save_bio_biography_v2(
  p_site_id text,
  p_expected_profile_updated_at timestamptz,
  p_expected_gallery_versions jsonb,
  p_expected_paragraph_versions jsonb,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_profile_version timestamptz;
  v_profile_version timestamptz;
  v_gallery jsonb;
  v_paragraphs jsonb;
  v_gallery_count integer;
  v_paragraph_count integer;
  v_current_gallery_count integer;
  v_current_paragraph_count integer;
  v_gallery_versions jsonb;
  v_paragraph_versions jsonb;
begin
  if p_site_id is distinct from 'main'
    or p_expected_profile_updated_at is null
    or pg_catalog.jsonb_typeof(p_expected_gallery_versions) is distinct from 'object'
    or pg_catalog.jsonb_typeof(p_expected_paragraph_versions) is distinct from 'object'
    or pg_catalog.jsonb_typeof(p_payload) is distinct from 'object'
  then
    raise exception 'invalid_bio_biography_payload'
      using errcode = '22023';
  end if;

  if not (p_payload ?& array[
      'topLabel',
      'introText',
      'caption',
      'galleryImages',
      'paragraphs'
    ])
    or exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_payload) as supplied(key)
      where supplied.key not in (
        'topLabel',
        'introText',
        'caption',
        'galleryImages',
        'paragraphs'
      )
    )
    or pg_catalog.jsonb_typeof(p_payload -> 'topLabel') is distinct from 'string'
    or pg_catalog.jsonb_typeof(p_payload -> 'introText') is distinct from 'string'
    or pg_catalog.jsonb_typeof(p_payload -> 'caption') is distinct from 'string'
    or pg_catalog.jsonb_typeof(p_payload -> 'galleryImages') is distinct from 'array'
    or pg_catalog.jsonb_typeof(p_payload -> 'paragraphs') is distinct from 'array'
  then
    raise exception 'invalid_bio_biography_payload'
      using errcode = '22023';
  end if;

  v_gallery := p_payload -> 'galleryImages';
  v_paragraphs := p_payload -> 'paragraphs';
  v_gallery_count := pg_catalog.jsonb_array_length(v_gallery);
  v_paragraph_count := pg_catalog.jsonb_array_length(v_paragraphs);

  if pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'topLabel')) > 220
    or pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'introText')) > 6000
    or pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'caption')) > 220
    or v_gallery_count > 32
    or v_paragraph_count > 50
    or exists (
      select 1
      from pg_catalog.jsonb_each(p_expected_gallery_versions) as expected(id, version)
      where pg_catalog.char_length(expected.id) not between 1 and 160
        or expected.id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
        or pg_catalog.jsonb_typeof(expected.version) is distinct from 'string'
        or pg_catalog.char_length(p_expected_gallery_versions ->> expected.id)
          not between 1 and 64
    )
    or exists (
      select 1
      from pg_catalog.jsonb_each(p_expected_paragraph_versions) as expected(id, version)
      where pg_catalog.char_length(expected.id) not between 1 and 160
        or expected.id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
        or pg_catalog.jsonb_typeof(expected.version) is distinct from 'string'
        or pg_catalog.char_length(p_expected_paragraph_versions ->> expected.id)
          not between 1 and 64
    )
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_gallery) as submitted(item)
      where pg_catalog.jsonb_typeof(submitted.item) is distinct from 'object'
        or not (submitted.item ?& array['id', 'src', 'alt', 'isPublished'])
        or exists (
          select 1
          from pg_catalog.jsonb_object_keys(submitted.item) as supplied(key)
          where supplied.key not in ('id', 'src', 'alt', 'isPublished')
        )
        or pg_catalog.jsonb_typeof(submitted.item -> 'id') is distinct from 'string'
        or pg_catalog.jsonb_typeof(submitted.item -> 'src') is distinct from 'string'
        or pg_catalog.jsonb_typeof(submitted.item -> 'alt') is distinct from 'string'
        or pg_catalog.jsonb_typeof(submitted.item -> 'isPublished') is distinct from 'boolean'
    )
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_paragraphs) as submitted(item)
      where pg_catalog.jsonb_typeof(submitted.item) is distinct from 'object'
        or not (submitted.item ?& array['id', 'body', 'revealDelay', 'isPublished'])
        or exists (
          select 1
          from pg_catalog.jsonb_object_keys(submitted.item) as supplied(key)
          where supplied.key not in ('id', 'body', 'revealDelay', 'isPublished')
        )
        or pg_catalog.jsonb_typeof(submitted.item -> 'id') is distinct from 'string'
        or pg_catalog.jsonb_typeof(submitted.item -> 'body') is distinct from 'string'
        or pg_catalog.jsonb_typeof(submitted.item -> 'revealDelay') is distinct from 'number'
        or pg_catalog.jsonb_typeof(submitted.item -> 'isPublished') is distinct from 'boolean'
    )
  then
    raise exception 'invalid_bio_biography_payload'
      using errcode = '22023';
  end if;

  if exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_gallery) as submitted(item)
      where pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'id')) not between 1 and 160
        or pg_catalog.btrim(submitted.item ->> 'id') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
        or pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'src')) not between 1 and 2048
        or pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'alt')) > 220
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
        or pg_catalog.strpos(pg_catalog.btrim(submitted.item ->> 'src'), pg_catalog.chr(92)) > 0
    )
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_paragraphs) as submitted(item)
      where pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'id')) not between 1 and 160
        or pg_catalog.btrim(submitted.item ->> 'id') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
        or pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'body')) not between 1 and 6000
        or (submitted.item ->> 'revealDelay') !~ '^[0-9]+$'
        or (submitted.item ->> 'revealDelay')::numeric > 5000
    )
  then
    raise exception 'invalid_bio_biography_payload'
      using errcode = '22023';
  end if;

  if (
      select pg_catalog.count(distinct submitted.item ->> 'id')
      from pg_catalog.jsonb_array_elements(v_gallery) as submitted(item)
    ) <> v_gallery_count
    or (
      select pg_catalog.count(distinct submitted.item ->> 'id')
      from pg_catalog.jsonb_array_elements(v_paragraphs) as submitted(item)
    ) <> v_paragraph_count
  then
    raise exception 'invalid_bio_biography_payload'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('bio_page_v2:biography:main', 0)
  );
  lock table public.bio_gallery_images in share row exclusive mode;
  lock table public.bio_paragraphs in share row exclusive mode;

  select profile.updated_at
  into v_current_profile_version
  from public.bio_profile as profile
  where profile.id = p_site_id
  for update;

  if not found then
    raise exception 'bio_profile_missing'
      using errcode = '23503';
  end if;

  if v_current_profile_version is distinct from p_expected_profile_updated_at then
    raise exception 'bio_biography_changed'
      using errcode = '40001';
  end if;

  select pg_catalog.count(*)::integer
  into v_current_gallery_count
  from public.bio_gallery_images;

  select pg_catalog.count(*)::integer
  into v_current_paragraph_count
  from public.bio_paragraphs;

  if (
      select pg_catalog.count(*)::integer
      from pg_catalog.jsonb_object_keys(p_expected_gallery_versions)
    ) <> v_current_gallery_count
    or (
      select pg_catalog.count(*)::integer
      from pg_catalog.jsonb_object_keys(p_expected_paragraph_versions)
    ) <> v_current_paragraph_count
    or exists (
      select 1
      from public.bio_gallery_images as current_image
      where not (p_expected_gallery_versions ? current_image.id)
    )
    or exists (
      select 1
      from public.bio_paragraphs as current_paragraph
      where not (p_expected_paragraph_versions ? current_paragraph.id)
    )
    or exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_expected_gallery_versions) as expected(id)
      where not exists (
        select 1
        from public.bio_gallery_images as current_image
        where current_image.id = expected.id
      )
    )
    or exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_expected_paragraph_versions) as expected(id)
      where not exists (
        select 1
        from public.bio_paragraphs as current_paragraph
        where current_paragraph.id = expected.id
      )
    )
  then
    raise exception 'bio_biography_changed'
      using errcode = '40001';
  end if;

  begin
    if exists (
      select 1
      from public.bio_gallery_images as current_image
      where current_image.updated_at is distinct from
        (p_expected_gallery_versions ->> current_image.id)::timestamptz
    )
    or exists (
      select 1
      from public.bio_paragraphs as current_paragraph
      where current_paragraph.updated_at is distinct from
        (p_expected_paragraph_versions ->> current_paragraph.id)::timestamptz
    ) then
      raise exception 'bio_biography_changed'
        using errcode = '40001';
    end if;
  exception
    when invalid_datetime_format or datetime_field_overflow then
      raise exception 'invalid_bio_biography_payload'
        using errcode = '22023';
  end;

  if exists (
    select 1
    from public.bio_gallery_images as current_image
    where not exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_gallery) as submitted(item)
      where submitted.item ->> 'id' = current_image.id
    )
  )
  or exists (
    select 1
    from public.bio_paragraphs as current_paragraph
    where not exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_paragraphs) as submitted(item)
      where submitted.item ->> 'id' = current_paragraph.id
    )
  ) then
    raise exception 'invalid_bio_biography_payload'
      using errcode = '22023';
  end if;

  update public.bio_profile
  set
    top_label = pg_catalog.btrim(p_payload ->> 'topLabel'),
    intro_text = pg_catalog.btrim(p_payload ->> 'introText'),
    caption = pg_catalog.btrim(p_payload ->> 'caption')
  where id = p_site_id
  returning updated_at into v_profile_version;

  insert into public.bio_gallery_images (
    id,
    src,
    alt,
    sort_order,
    is_published
  )
  select
    pg_catalog.btrim(submitted.item ->> 'id'),
    pg_catalog.btrim(submitted.item ->> 'src'),
    pg_catalog.btrim(submitted.item ->> 'alt'),
    (submitted.ordinality * 10)::integer,
    (submitted.item ->> 'isPublished')::boolean
  from pg_catalog.jsonb_array_elements(v_gallery)
    with ordinality as submitted(item, ordinality)
  on conflict (id) do update set
    src = excluded.src,
    alt = excluded.alt,
    sort_order = excluded.sort_order,
    is_published = excluded.is_published;

  insert into public.bio_paragraphs (
    id,
    body,
    reveal_delay,
    sort_order,
    is_published
  )
  select
    pg_catalog.btrim(submitted.item ->> 'id'),
    pg_catalog.btrim(submitted.item ->> 'body'),
    (submitted.item ->> 'revealDelay')::integer,
    (submitted.ordinality * 10)::integer,
    (submitted.item ->> 'isPublished')::boolean
  from pg_catalog.jsonb_array_elements(v_paragraphs)
    with ordinality as submitted(item, ordinality)
  on conflict (id) do update set
    body = excluded.body,
    reveal_delay = excluded.reveal_delay,
    sort_order = excluded.sort_order,
    is_published = excluded.is_published;

  select coalesce(
    pg_catalog.jsonb_object_agg(
      image.id,
      pg_catalog.to_jsonb(image.updated_at)
      order by image.id
    ),
    '{}'::jsonb
  )
  into v_gallery_versions
  from public.bio_gallery_images as image;

  select coalesce(
    pg_catalog.jsonb_object_agg(
      paragraph.id,
      pg_catalog.to_jsonb(paragraph.updated_at)
      order by paragraph.id
    ),
    '{}'::jsonb
  )
  into v_paragraph_versions
  from public.bio_paragraphs as paragraph;

  return pg_catalog.jsonb_build_object(
    'versions', pg_catalog.jsonb_build_object(
      'profileUpdatedAt', v_profile_version,
      'galleryItems', v_gallery_versions,
      'paragraphItems', v_paragraph_versions
    )
  );
end;
$$;

create or replace function public.save_bio_hero_v2(
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
    raise exception 'invalid_bio_hero_payload'
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
      where supplied.key in (
        'title',
        'subtitle',
        'ctaLabel',
        'ctaHref',
        'backgroundSrc',
        'posterSrc',
        'mediaType'
      )
        and pg_catalog.jsonb_typeof(supplied.value) is distinct from 'string'
    )
  then
    raise exception 'invalid_bio_hero_payload'
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
    or pg_catalog.strpos(pg_catalog.btrim(p_payload ->> 'ctaHref'), pg_catalog.chr(92)) > 0
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
    or pg_catalog.strpos(pg_catalog.btrim(p_payload ->> 'backgroundSrc'), pg_catalog.chr(92)) > 0
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
    or pg_catalog.strpos(pg_catalog.btrim(p_payload ->> 'posterSrc'), pg_catalog.chr(92)) > 0
  then
    raise exception 'invalid_bio_hero_payload'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('bio_page_v2:hero:main', 0)
  );

  select hero.updated_at
  into v_current_version
  from public.page_heroes as hero
  where hero.page_slug = 'bio'
  for update;

  if not found then
    raise exception 'bio_hero_missing'
      using errcode = '23503';
  end if;

  if v_current_version is distinct from p_expected_updated_at then
    raise exception 'bio_hero_changed'
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
  where page_slug = 'bio'
  returning updated_at into v_version;

  return pg_catalog.jsonb_build_object(
    'versions', pg_catalog.jsonb_build_object('updatedAt', v_version)
  );
end;
$$;

create or replace function public.save_bio_resume_v2(
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
    raise exception 'invalid_bio_resume_payload'
      using errcode = '22023';
  end if;

  if not (p_payload ?& array[
      'headline',
      'summary',
      'location',
      'playingAge',
      'height',
      'eyes',
      'hair',
      'languages',
      'skills',
      'representation',
      'resumeUrl'
    ])
    or exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_payload) as supplied(key)
      where supplied.key not in (
        'headline',
        'summary',
        'location',
        'playingAge',
        'height',
        'eyes',
        'hair',
        'languages',
        'skills',
        'representation',
        'resumeUrl'
      )
    )
    or exists (
      select 1
      from pg_catalog.jsonb_each(p_payload) as supplied(key, value)
      where pg_catalog.jsonb_typeof(supplied.value) is distinct from 'string'
    )
  then
    raise exception 'invalid_bio_resume_payload'
      using errcode = '22023';
  end if;

  if pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'headline')) > 220
    or pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'summary')) > 6000
    or pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'location')) > 220
    or pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'playingAge')) > 220
    or pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'height')) > 220
    or pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'eyes')) > 220
    or pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'hair')) > 220
    or pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'languages')) > 1000
    or pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'skills')) > 1000
    or pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'representation')) > 220
    or pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'resumeUrl')) > 2048
    or (
      pg_catalog.btrim(p_payload ->> 'resumeUrl') <> ''
      and not (
        pg_catalog.btrim(p_payload ->> 'resumeUrl') ~ '^#[A-Za-z][A-Za-z0-9_-]*$'
        or (
          pg_catalog.left(pg_catalog.btrim(p_payload ->> 'resumeUrl'), 1) = '/'
          and pg_catalog.left(pg_catalog.btrim(p_payload ->> 'resumeUrl'), 2) <> '//'
        )
        or (
          pg_catalog.btrim(p_payload ->> 'resumeUrl') ~* '^https://[^[:space:]]+$'
          and pg_catalog.btrim(p_payload ->> 'resumeUrl') !~* '^https://[^/?#]*@'
        )
      )
    )
    or pg_catalog.btrim(p_payload ->> 'resumeUrl') ~ '[[:cntrl:]]'
    or pg_catalog.strpos(pg_catalog.btrim(p_payload ->> 'resumeUrl'), pg_catalog.chr(92)) > 0
  then
    raise exception 'invalid_bio_resume_payload'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('bio_page_v2:resume:main', 0)
  );

  select resume.updated_at
  into v_current_version
  from public.actor_resume as resume
  where resume.id = p_site_id
  for update;

  if not found then
    raise exception 'bio_resume_missing'
      using errcode = '23503';
  end if;

  if v_current_version is distinct from p_expected_updated_at then
    raise exception 'bio_resume_changed'
      using errcode = '40001';
  end if;

  update public.actor_resume
  set
    headline = pg_catalog.btrim(p_payload ->> 'headline'),
    summary = pg_catalog.btrim(p_payload ->> 'summary'),
    location = pg_catalog.btrim(p_payload ->> 'location'),
    playing_age = pg_catalog.btrim(p_payload ->> 'playingAge'),
    height = pg_catalog.btrim(p_payload ->> 'height'),
    eyes = pg_catalog.btrim(p_payload ->> 'eyes'),
    hair = pg_catalog.btrim(p_payload ->> 'hair'),
    languages = pg_catalog.btrim(p_payload ->> 'languages'),
    skills = pg_catalog.btrim(p_payload ->> 'skills'),
    representation = pg_catalog.btrim(p_payload ->> 'representation'),
    resume_url = pg_catalog.btrim(p_payload ->> 'resumeUrl')
  where id = p_site_id
  returning updated_at into v_version;

  return pg_catalog.jsonb_build_object(
    'versions', pg_catalog.jsonb_build_object('updatedAt', v_version)
  );
end;
$$;

create or replace function public.save_bio_credits_v2(
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
  v_credits jsonb;
  v_credit_count integer;
  v_current_count integer;
  v_versions jsonb;
begin
  if p_site_id is distinct from 'main'
    or pg_catalog.jsonb_typeof(p_expected_versions) is distinct from 'object'
    or pg_catalog.jsonb_typeof(p_payload) is distinct from 'object'
  then
    raise exception 'invalid_bio_credits_payload'
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
    raise exception 'invalid_bio_credits_payload'
      using errcode = '22023';
  end if;

  v_credits := p_payload -> 'items';
  v_credit_count := pg_catalog.jsonb_array_length(v_credits);

  if v_credit_count > 100
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
      from pg_catalog.jsonb_array_elements(v_credits) as submitted(item)
      where pg_catalog.jsonb_typeof(submitted.item) is distinct from 'object'
        or not (submitted.item ?& array[
          'id',
          'creditType',
          'title',
          'role',
          'production',
          'director',
          'year',
          'href',
          'isPublished'
        ])
        or exists (
          select 1
          from pg_catalog.jsonb_object_keys(submitted.item) as supplied(key)
          where supplied.key not in (
            'id',
            'creditType',
            'title',
            'role',
            'production',
            'director',
            'year',
            'href',
            'isPublished'
          )
        )
        or exists (
          select 1
          from pg_catalog.jsonb_each(submitted.item) as field(key, value)
          where field.key in (
            'id',
            'creditType',
            'title',
            'role',
            'production',
            'director',
            'year',
            'href'
          )
            and pg_catalog.jsonb_typeof(field.value) is distinct from 'string'
        )
        or pg_catalog.jsonb_typeof(submitted.item -> 'isPublished') is distinct from 'boolean'
    )
  then
    raise exception 'invalid_bio_credits_payload'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(v_credits) as submitted(item)
    where pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'id')) not between 1 and 160
      or pg_catalog.btrim(submitted.item ->> 'id') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
      or (submitted.item ->> 'creditType') not in (
        'film',
        'television',
        'theatre',
        'commercial',
        'voiceover',
        'training',
        'other'
      )
      or pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'title')) not between 1 and 220
      or pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'role')) > 220
      or pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'production')) > 220
      or pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'director')) > 220
      or pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'year')) > 220
      or pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'href')) > 2048
      or (
        pg_catalog.btrim(submitted.item ->> 'href') <> ''
        and not (
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
      )
      or pg_catalog.btrim(submitted.item ->> 'href') ~ '[[:cntrl:]]'
      or pg_catalog.strpos(pg_catalog.btrim(submitted.item ->> 'href'), pg_catalog.chr(92)) > 0
  ) then
    raise exception 'invalid_bio_credits_payload'
      using errcode = '22023';
  end if;

  if (
    select pg_catalog.count(distinct submitted.item ->> 'id')
    from pg_catalog.jsonb_array_elements(v_credits) as submitted(item)
  ) <> v_credit_count then
    raise exception 'invalid_bio_credits_payload'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('bio_page_v2:credits:main', 0)
  );
  lock table public.actor_credits in share row exclusive mode;

  select pg_catalog.count(*)::integer
  into v_current_count
  from public.actor_credits;

  if (
      select pg_catalog.count(*)::integer
      from pg_catalog.jsonb_object_keys(p_expected_versions)
    ) <> v_current_count
    or exists (
      select 1
      from public.actor_credits as current_credit
      where not (p_expected_versions ? current_credit.id)
    )
    or exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_expected_versions) as expected(id)
      where not exists (
        select 1
        from public.actor_credits as current_credit
        where current_credit.id = expected.id
      )
    )
  then
    raise exception 'bio_credits_changed'
      using errcode = '40001';
  end if;

  begin
    if exists (
      select 1
      from public.actor_credits as current_credit
      where current_credit.updated_at is distinct from
        (p_expected_versions ->> current_credit.id)::timestamptz
    ) then
      raise exception 'bio_credits_changed'
        using errcode = '40001';
    end if;
  exception
    when invalid_datetime_format or datetime_field_overflow then
      raise exception 'invalid_bio_credits_payload'
        using errcode = '22023';
  end;

  if exists (
    select 1
    from public.actor_credits as current_credit
    where not exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_credits) as submitted(item)
      where submitted.item ->> 'id' = current_credit.id
    )
  ) then
    raise exception 'invalid_bio_credits_payload'
      using errcode = '22023';
  end if;

  insert into public.actor_credits (
    id,
    credit_type,
    title,
    role,
    production,
    director,
    year,
    href,
    sort_order,
    is_published
  )
  select
    pg_catalog.btrim(submitted.item ->> 'id'),
    submitted.item ->> 'creditType',
    pg_catalog.btrim(submitted.item ->> 'title'),
    pg_catalog.btrim(submitted.item ->> 'role'),
    pg_catalog.btrim(submitted.item ->> 'production'),
    pg_catalog.btrim(submitted.item ->> 'director'),
    pg_catalog.btrim(submitted.item ->> 'year'),
    pg_catalog.btrim(submitted.item ->> 'href'),
    (submitted.ordinality * 10)::integer,
    (submitted.item ->> 'isPublished')::boolean
  from pg_catalog.jsonb_array_elements(v_credits)
    with ordinality as submitted(item, ordinality)
  on conflict (id) do update set
    credit_type = excluded.credit_type,
    title = excluded.title,
    role = excluded.role,
    production = excluded.production,
    director = excluded.director,
    year = excluded.year,
    href = excluded.href,
    sort_order = excluded.sort_order,
    is_published = excluded.is_published;

  select coalesce(
    pg_catalog.jsonb_object_agg(
      credit.id,
      pg_catalog.to_jsonb(credit.updated_at)
      order by credit.id
    ),
    '{}'::jsonb
  )
  into v_versions
  from public.actor_credits as credit;

  return pg_catalog.jsonb_build_object(
    'versions', pg_catalog.jsonb_build_object('items', v_versions)
  );
end;
$$;

revoke all on function public.get_bio_page_v2_snapshot(text)
from public, anon, authenticated, service_role;
revoke all on function public.save_bio_hero_v2(text, timestamptz, jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.save_bio_biography_v2(text, timestamptz, jsonb, jsonb, jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.save_bio_resume_v2(text, timestamptz, jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.save_bio_credits_v2(text, jsonb, jsonb)
from public, anon, authenticated, service_role;

grant execute on function public.get_bio_page_v2_snapshot(text)
to service_role;
grant execute on function public.save_bio_hero_v2(text, timestamptz, jsonb)
to service_role;
grant execute on function public.save_bio_biography_v2(text, timestamptz, jsonb, jsonb, jsonb)
to service_role;
grant execute on function public.save_bio_resume_v2(text, timestamptz, jsonb)
to service_role;
grant execute on function public.save_bio_credits_v2(text, jsonb, jsonb)
to service_role;

comment on function public.get_bio_page_v2_snapshot(text) is
  'Service-only consistent Admin V2 snapshot of Bio, Resume, and all saved collection rows.';
comment on function public.save_bio_hero_v2(text, timestamptz, jsonb) is
  'Optimistically updates the Bio hero singleton.';
comment on function public.save_bio_biography_v2(text, timestamptz, jsonb, jsonb, jsonb) is
  'Atomically edits the Bio profile, portraits, and paragraphs without deleting baseline ids.';
comment on function public.save_bio_resume_v2(text, timestamptz, jsonb) is
  'Optimistically updates the actor resume singleton without adding publication state.';
comment on function public.save_bio_credits_v2(text, jsonb, jsonb) is
  'Atomically edits, reorders, hides, and appends actor credits without hard deletion.';

commit;
