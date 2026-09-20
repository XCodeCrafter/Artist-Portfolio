-- HOME V2: independent content, visibility and ordering for all five sections.
-- Run after 0036. Existing HOME content is copied once; rerunning never resets
-- an edited HOME. ImageKit authority changes will use a later migration number.
begin;

create table if not exists public.home_page_config (
  id text primary key default 'main' check (id = 'main'),
  draft jsonb not null check (pg_catalog.jsonb_typeof(draft) = 'object'),
  updated_at timestamptz not null default pg_catalog.clock_timestamp()
);
alter table public.home_page_config enable row level security;
revoke all on table public.home_page_config from public, anon, authenticated;
grant select on table public.home_page_config to anon, authenticated;
grant select, insert, update, delete on table public.home_page_config to service_role;
drop policy if exists "Public can read Home configuration" on public.home_page_config;
create policy "Public can read Home configuration"
on public.home_page_config for select to anon, authenticated using (id = 'main');

-- Match the existing public HOME precedence, including Gallery fallbacks.
do $$
declare
  v_hero jsonb;
  v_about jsonb;
  v_video jsonb;
  v_home jsonb := '{}'::jsonb;
  v_gallery jsonb;
  v_metadata jsonb;
  v_default_home jsonb := '{
    "featureTitle":"THE INTERLUDE",
    "featureBody":"Between the frames, the work keeps moving — a quiet study of process, presence, and motion.",
    "featureCtaLabel":"WATCH SHOWREEL","featureCtaHref":"/video","featureVideoSrc":"","featurePosterSrc":"",
    "storyTitle":"ARTIST FREELANCER LIFE",
    "storyBody":"Stay curious, protect the spark, and let the work speak before the noise.",
    "storyCtaLabel":"VIEW GALLERY","storyCtaHref":"/gallery",
    "storyImage1Src":"","storyImage1Title":"ARTIST FREELANCER LIFE","storyImage1Body":"Stay curious, protect the spark, and let the work speak before the noise.",
    "storyImage2Src":"","storyImage2Title":"FOLLOW THE INSTINCT","storyImage2Body":"Preparation creates the freedom to respond truthfully when the moment changes.",
    "storyImage3Src":"","storyImage3Title":"STAY PRESENT","storyImage3Body":"Every frame asks for attention — listen closely, then let the character lead.",
    "storyImage4Src":"","storyImage4Title":"KEEP THE SPARK","storyImage4Body":"Carry curiosity from one set to the next, and leave room for the unexpected."
  }'::jsonb;
  v_gallery_defaults jsonb := '{
    "interludeLabel":"The Interlude","interludeMeta":"Portfolio / In progress","interludeEyebrow":"A quiet study in motion",
    "interludeVideoSrc":"","interludePosterSrc":"","storyLabel":"Artist freelancer life",
    "storyScrollLabel":"Stay curious, protect the spark, and let the work speak before the noise."
  }'::jsonb;
  v_images jsonb := '[]'::jsonb;
  v_base_images jsonb;
  v_base jsonb;
  v_field record;
  v_position integer;
begin
  if exists (select 1 from public.home_page_config where id = 'main') then return; end if;

  select pg_catalog.jsonb_build_object(
    'title', title, 'subtitle', subtitle, 'ctaLabel', cta_label, 'ctaHref', cta_href,
    'backgroundSrc', background_src, 'posterSrc', poster_src, 'mediaType', media_type
  ) into v_hero from public.page_heroes where page_slug = 'home';
  v_hero := coalesce(v_hero, '{"title":"FRANKY FUGAZI","subtitle":"ACTOR / MUSIC / CREATIVE WORK","ctaLabel":"","ctaHref":"#home-about","backgroundSrc":"/images/hero.jpg","posterSrc":"","mediaType":"image"}'::jsonb);

  select pg_catalog.jsonb_build_object(
    'heading', heading, 'body', body, 'ctaLabel', cta_label, 'ctaHref', cta_href,
    'imageSrc', image_src, 'imageAlt', image_alt
  ) into v_about from public.about_home where id = 'main';
  v_about := coalesce(v_about, '{"heading":"ABOUT","body":"Guitarist with roots in England, now based in Amsterdam. I craft moody yet energetic indie rock - shimmering guitars, raw emotion, and melodies that linger long after the last chord fades. Come to a show and you will get a cinematic ride without unnecessary words - just sound, atmosphere, and honest intensity.","ctaLabel":"Find Out More","ctaHref":"/bio","imageSrc":"/images/about.jpg","imageAlt":"Artist portrait on stage"}'::jsonb);

  select pg_catalog.to_jsonb(hero) into v_video from public.page_heroes as hero where page_slug = 'video';
  select metadata into v_metadata from public.media_assets where id = 'home-studio-settings' and is_published = true and deleted_at is null;
  for v_field in select key, value from pg_catalog.jsonb_each(v_default_home) loop
    v_home := v_home || pg_catalog.jsonb_build_object(v_field.key,
      case when pg_catalog.jsonb_typeof(v_metadata -> v_field.key) = 'string' then v_metadata -> v_field.key else v_field.value end);
  end loop;
  if v_home ->> 'featureTitle' = 'SHOWREEL' then v_home := pg_catalog.jsonb_set(v_home, '{featureTitle}', v_default_home -> 'featureTitle'); end if;
  if v_home ->> 'featureBody' = 'Selected screen work, performance clips, and showreel material in one focused place.' then
    v_home := pg_catalog.jsonb_set(v_home, '{featureBody}', v_default_home -> 'featureBody');
  end if;

  select pg_catalog.jsonb_build_object(
    'interludeLabel', interlude_label, 'interludeMeta', interlude_meta, 'interludeEyebrow', interlude_eyebrow,
    'interludeVideoSrc', interlude_video_src, 'interludePosterSrc', interlude_poster_src,
    'storyLabel', story_label, 'storyScrollLabel', story_scroll_label
  ) into v_gallery from public.gallery_presentation where id = 'main';
  if v_gallery is null then
    select metadata into v_metadata from public.media_assets where id = 'gallery-studio-settings' and is_published = true and deleted_at is null;
    v_gallery := '{}'::jsonb;
    for v_field in select key, value from pg_catalog.jsonb_each(v_gallery_defaults) loop
      v_gallery := v_gallery || pg_catalog.jsonb_build_object(v_field.key,
        case when pg_catalog.jsonb_typeof(v_metadata -> v_field.key) = 'string' then v_metadata -> v_field.key else v_field.value end);
    end loop;
  elsif v_gallery ->> 'storyScrollLabel' = 'Scroll through the practice' then
    v_gallery := pg_catalog.jsonb_set(v_gallery, '{storyScrollLabel}', v_gallery_defaults -> 'storyScrollLabel');
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(frame) order by frame.freelance_story_order, frame.title), '[]'::jsonb)
  into v_base_images from (
    select src, title, alt, caption, freelance_story_order from public.gallery_images
    where is_published = true and is_freelance_story = true
    order by freelance_story_order, title limit 4
  ) as frame;
  for v_position in 1..4 loop
    v_base := v_base_images -> (v_position - 1);
    v_images := v_images || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'src', coalesce(nullif(v_home ->> ('storyImage' || v_position || 'Src'), ''), v_base ->> 'src', ''),
      'title', coalesce(nullif(v_home ->> ('storyImage' || v_position || 'Title'), ''), nullif(v_home ->> 'storyTitle', ''), nullif(v_base ->> 'title', ''), 'Artist story ' || v_position),
      'body', coalesce(nullif(v_home ->> ('storyImage' || v_position || 'Body'), ''), nullif(v_home ->> 'storyBody', ''), nullif(v_base ->> 'caption', ''), ''),
      'alt', coalesce(nullif(v_base ->> 'alt', ''), 'Artist story frame ' || v_position)
    ));
  end loop;

  insert into public.home_page_config(id, draft) values ('main', pg_catalog.jsonb_build_object(
    'layout', '[{"id":"hero","enabled":true},{"id":"about","enabled":true},{"id":"cnc","enabled":true},{"id":"feature","enabled":true},{"id":"stories","enabled":true}]'::jsonb,
    'hero', v_hero, 'about', v_about,
    'cnc', pg_catalog.jsonb_build_object('eyebrow', 'ENGINEERING DETAIL / 01', 'title', E'CODE, IN\nMOTION.',
      'body', 'The preview keeps HOME concise. The full viewer is built for long programs, including the main sequence, M30 boundary and R/Q-driven labels or subprograms below it.'),
    'feature', pg_catalog.jsonb_build_object(
      'title', v_home ->> 'featureTitle', 'body', v_home ->> 'featureBody',
      'ctaLabel', coalesce(nullif(v_home ->> 'featureCtaLabel', ''), 'WATCH SHOWREEL'),
      'ctaHref', coalesce(nullif(v_home ->> 'featureCtaHref', ''), '/video'),
      'videoSrc', coalesce(nullif(v_home ->> 'featureVideoSrc', ''), nullif(v_gallery ->> 'interludeVideoSrc', ''),
        case when v_video ->> 'media_type' = 'video' then v_video ->> 'background_src' else '/media/hero-loop.mp4' end),
      'posterSrc', coalesce(nullif(v_home ->> 'featurePosterSrc', ''), nullif(v_gallery ->> 'interludePosterSrc', ''), nullif(v_video ->> 'poster_src', ''), '/images/video-hero.jpg'),
      'label', v_gallery ->> 'interludeLabel', 'meta', v_gallery ->> 'interludeMeta', 'eyebrow', v_gallery ->> 'interludeEyebrow'
    ),
    'stories', pg_catalog.jsonb_build_object(
      'title', v_home ->> 'storyTitle', 'body', v_home ->> 'storyBody',
      'ctaLabel', coalesce(nullif(v_home ->> 'storyCtaLabel', ''), 'VIEW GALLERY'),
      'ctaHref', coalesce(nullif(v_home ->> 'storyCtaHref', ''), '/gallery'),
      'label', v_gallery ->> 'storyLabel', 'scrollLabel', v_gallery ->> 'storyScrollLabel', 'images', v_images
    )
  )) on conflict (id) do nothing;
end;
$$;

-- A local asset is trusted by path. Remote assets must be live, have the right
-- type, and are locked against the Media Library trash RPC until publication.
create or replace function public.assert_home_media_source_v2(p_src text, p_media_type text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_src = '' then return; end if;
  if p_src is null or pg_catalog.char_length(p_src) > 2048
    or p_src ~ '[[:cntrl:]]' or pg_catalog.strpos(p_src, pg_catalog.chr(92)) > 0 then
    raise exception 'invalid_home_media_source' using errcode = '22023';
  end if;
  if pg_catalog.left(p_src, 1) = '/' and pg_catalog.left(p_src, 2) <> '//' then return; end if;
  if p_src !~* '^https://[^[:space:]/?#:@]+(:443)?([/?#]|$)' then
    raise exception 'invalid_home_media_source' using errcode = '22023';
  end if;
  perform 1 from public.media_assets
  where src = p_src and media_type = p_media_type and deleted_at is null
  order by id for share;
  if not found then raise exception 'invalid_home_media_source' using errcode = '22023'; end if;
end;
$$;

create or replace function public.validate_home_section_v2(p_section text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_specs jsonb;
  v_result jsonb := '{}'::jsonb;
  v_field record;
  v_text text;
  v_image jsonb;
  v_images jsonb := '[]'::jsonb;
begin
  if p_section = 'layout' then
    if pg_catalog.jsonb_typeof(p_payload) is distinct from 'array' then
      raise exception 'invalid_home_layout_payload' using errcode = '22023';
    end if;
    if pg_catalog.jsonb_array_length(p_payload) <> 5 then
      raise exception 'invalid_home_layout_payload' using errcode = '22023';
    end if;
    for v_image in select value from pg_catalog.jsonb_array_elements(p_payload) loop
      if pg_catalog.jsonb_typeof(v_image) is distinct from 'object' then
        raise exception 'invalid_home_layout_payload' using errcode = '22023';
      end if;
      if not (v_image ?& array['id', 'enabled'])
        or (select count(*) from pg_catalog.jsonb_object_keys(v_image)) <> 2
        or pg_catalog.jsonb_typeof(v_image -> 'id') is distinct from 'string'
        or (v_image ->> 'id') not in ('hero', 'about', 'cnc', 'feature', 'stories')
        or pg_catalog.jsonb_typeof(v_image -> 'enabled') is distinct from 'boolean' then
        raise exception 'invalid_home_layout_payload' using errcode = '22023';
      end if;
    end loop;
    if (select count(distinct value ->> 'id') from pg_catalog.jsonb_array_elements(p_payload)) <> 5
      or not exists(select 1 from pg_catalog.jsonb_array_elements(p_payload) where value -> 'enabled' = 'true'::jsonb) then
      raise exception 'invalid_home_layout_payload' using errcode = '22023';
    end if;
    return p_payload;
  end if;

  v_specs := case p_section
    when 'hero' then '{"title":220,"subtitle":500,"ctaLabel":220,"ctaHref":2048,"backgroundSrc":2048,"posterSrc":2048,"mediaType":5}'::jsonb
    when 'about' then '{"heading":500,"body":10000,"ctaLabel":220,"ctaHref":2048,"imageSrc":2048,"imageAlt":1000}'::jsonb
    when 'cnc' then '{"eyebrow":500,"title":500,"body":10000}'::jsonb
    when 'feature' then '{"title":500,"body":10000,"ctaLabel":220,"ctaHref":2048,"videoSrc":2048,"posterSrc":2048,"label":500,"meta":500,"eyebrow":500}'::jsonb
    when 'stories' then '{"title":500,"body":10000,"ctaLabel":220,"ctaHref":2048,"label":500,"scrollLabel":1000,"images":0}'::jsonb
    when '_story_image' then '{"src":2048,"title":500,"body":10000,"alt":1000}'::jsonb
    else null end;
  if v_specs is null or pg_catalog.jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'invalid_home_section_payload' using errcode = '22023';
  end if;
  if (select count(*) from pg_catalog.jsonb_object_keys(p_payload)) <> (select count(*) from pg_catalog.jsonb_object_keys(v_specs))
    or exists(select 1 from pg_catalog.jsonb_object_keys(p_payload) as supplied(key) where not (v_specs ? supplied.key)) then
    raise exception 'invalid_home_section_payload' using errcode = '22023';
  end if;
  for v_field in select key, value from pg_catalog.jsonb_each_text(v_specs) loop
    if v_field.key = 'images' then continue; end if;
    if pg_catalog.jsonb_typeof(p_payload -> v_field.key) is distinct from 'string' then
      raise exception 'invalid_home_section_payload' using errcode = '22023';
    end if;
    v_text := pg_catalog.btrim(p_payload ->> v_field.key);
    if pg_catalog.char_length(v_text) > v_field.value::integer then
      raise exception 'invalid_home_section_payload' using errcode = '22023';
    end if;
    v_result := v_result || pg_catalog.jsonb_build_object(v_field.key, v_text);
  end loop;
  if p_section = 'hero' and (
    v_result ->> 'title' = '' or v_result ->> 'backgroundSrc' = '' or v_result ->> 'mediaType' not in ('image', 'video')
  ) then raise exception 'invalid_home_section_payload' using errcode = '22023'; end if;
  if v_result ? 'ctaHref' then
    v_text := v_result ->> 'ctaHref';
    if (v_result ->> 'ctaLabel' <> '' and v_text = '')
      or v_text ~ '[[:cntrl:]]' or pg_catalog.strpos(v_text, pg_catalog.chr(92)) > 0
      or (v_text <> '' and not (
        v_text ~ '^#[A-Za-z][A-Za-z0-9_-]*$'
        or (pg_catalog.left(v_text, 1) = '/' and pg_catalog.left(v_text, 2) <> '//')
        or v_text ~* '^https://[^[:space:]/?#:@]+(:443)?([/?#]|$)'
      )) then raise exception 'invalid_home_section_payload' using errcode = '22023'; end if;
  end if;
  if p_section = 'hero' then
    perform public.assert_home_media_source_v2(v_result ->> 'backgroundSrc', v_result ->> 'mediaType');
    perform public.assert_home_media_source_v2(v_result ->> 'posterSrc', 'image');
  elsif p_section = 'about' then
    perform public.assert_home_media_source_v2(v_result ->> 'imageSrc', 'image');
  elsif p_section = 'feature' then
    perform public.assert_home_media_source_v2(v_result ->> 'videoSrc', 'video');
    perform public.assert_home_media_source_v2(v_result ->> 'posterSrc', 'image');
  elsif p_section = '_story_image' then
    perform public.assert_home_media_source_v2(v_result ->> 'src', 'image');
  elsif p_section = 'stories' then
    if pg_catalog.jsonb_typeof(p_payload -> 'images') is distinct from 'array' then
      raise exception 'invalid_home_section_payload' using errcode = '22023';
    end if;
    if pg_catalog.jsonb_array_length(p_payload -> 'images') <> 4 then
      raise exception 'invalid_home_section_payload' using errcode = '22023';
    end if;
    for v_image in select value from pg_catalog.jsonb_array_elements(p_payload -> 'images') loop
      v_images := v_images || pg_catalog.jsonb_build_array(public.validate_home_section_v2('_story_image', v_image));
    end loop;
    v_result := v_result || pg_catalog.jsonb_build_object('images', v_images);
  end if;
  return v_result;
end;
$$;

create or replace function public.get_home_page_v2_snapshot(p_site_id text default 'main')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_snapshot jsonb;
begin
  if p_site_id is distinct from 'main' then raise exception 'invalid_home_page_site' using errcode = '22023'; end if;
  select pg_catalog.jsonb_build_object('draft', draft, 'versions', pg_catalog.jsonb_build_object('updatedAt', updated_at))
  into v_snapshot from public.home_page_config where id = p_site_id;
  if v_snapshot is null then raise exception 'home_page_snapshot_missing' using errcode = '23503'; end if;
  return v_snapshot;
end;
$$;

create or replace function public.save_home_section_v2(
  p_site_id text, p_section text, p_expected_updated_at timestamptz, p_payload jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_current_version timestamptz;
  v_version timestamptz;
  v_payload jsonb;
begin
  if p_site_id is distinct from 'main' or p_expected_updated_at is null
    or p_section is null or p_section not in ('layout', 'hero', 'about', 'cnc', 'feature', 'stories')
    or p_payload is null or pg_catalog.octet_length(p_payload::text) > 640000 then
    raise exception 'invalid_home_section_payload' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('home_page_v2:main', 0));
  v_payload := public.validate_home_section_v2(p_section, p_payload);
  select updated_at into v_current_version from public.home_page_config where id = p_site_id for update;
  if not found then raise exception 'home_page_snapshot_missing' using errcode = '23503'; end if;
  if v_current_version is distinct from p_expected_updated_at then
    raise exception 'home_page_changed' using errcode = '40001';
  end if;
  update public.home_page_config
  set draft = pg_catalog.jsonb_set(draft, array[p_section], v_payload, false),
      updated_at = greatest(pg_catalog.clock_timestamp(), v_current_version + interval '1 microsecond')
  where id = p_site_id returning updated_at into v_version;
  return pg_catalog.jsonb_build_object('canonicalSection', v_payload, 'versions', pg_catalog.jsonb_build_object('updatedAt', v_version));
end;
$$;

-- Retain all existing reference protection and include hidden HOME sections:
-- disabling a section preserves its content and the assets needed to restore it.
create or replace function public.media_asset_references(p_src text)
returns table(reference_label text, reference_count bigint)
language sql stable security definer set search_path = '' as $$
  select 'Page hero', count(*)::bigint from public.page_heroes
  where (background_src = p_src or poster_src = p_src)
    and (page_slug <> 'home' or not exists(select 1 from public.home_page_config where id = 'main'))
  having count(*) > 0
  union all
  select 'Home update', count(*)::bigint from public.home_updates where avatar_src = p_src having count(*) > 0
  union all
  select 'Home about', count(*)::bigint from public.about_home where image_src = p_src
    and not exists(select 1 from public.home_page_config where id = 'main') having count(*) > 0
  union all
  select 'Home presentation', count(*)::bigint from public.media_assets where id = 'home-studio-settings'
    and not exists(select 1 from public.home_page_config where id = 'main') and (
    metadata ->> 'updatesImageSrc' = p_src or metadata ->> 'featureImageSrc' = p_src
    or metadata ->> 'featureVideoSrc' = p_src or metadata ->> 'featurePosterSrc' = p_src
    or metadata ->> 'storyImage1Src' = p_src or metadata ->> 'storyImage2Src' = p_src
    or metadata ->> 'storyImage3Src' = p_src or metadata ->> 'storyImage4Src' = p_src
  ) having count(*) > 0
  union all
  select 'Home V2', count(*)::bigint from public.home_page_config where
    draft #>> '{hero,backgroundSrc}' = p_src or draft #>> '{hero,posterSrc}' = p_src
    or draft #>> '{about,imageSrc}' = p_src or draft #>> '{feature,videoSrc}' = p_src
    or draft #>> '{feature,posterSrc}' = p_src
    or exists(select 1 from pg_catalog.jsonb_array_elements(draft #> '{stories,images}') as image where image ->> 'src' = p_src)
  having count(*) > 0
  union all
  select 'Music platform', count(*)::bigint from public.music_platform_links where image_src = p_src having count(*) > 0
  union all
  select 'Bio gallery', count(*)::bigint from public.bio_gallery_images where src = p_src having count(*) > 0
  union all
  select 'Gallery', count(*)::bigint from public.gallery_images where src = p_src having count(*) > 0
  union all
  select 'Gallery presentation', count(*)::bigint from public.gallery_presentation where interlude_video_src = p_src or interlude_poster_src = p_src having count(*) > 0
  union all
  select 'Video', count(*)::bigint from public.videos where thumbnail_src = p_src or embed_url = p_src having count(*) > 0;
$$;

revoke all on function public.assert_home_media_source_v2(text, text) from public, anon, authenticated, service_role;
revoke all on function public.validate_home_section_v2(text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.get_home_page_v2_snapshot(text) from public, anon, authenticated, service_role;
revoke all on function public.save_home_section_v2(text, text, timestamptz, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.media_asset_references(text) from public, anon, authenticated, service_role;
grant execute on function public.get_home_page_v2_snapshot(text) to service_role;
grant execute on function public.save_home_section_v2(text, text, timestamptz, jsonb) to service_role;
grant execute on function public.media_asset_references(text) to service_role;

comment on table public.home_page_config is 'Public HOME content, section visibility and order. Admin V2 writes one section at a time using optimistic page versions.';
comment on function public.save_home_section_v2(text, text, timestamptz, jsonb) is 'Service-only validated HOME section publication; locks referenced media and rejects stale page snapshots.';
commit;
