-- Independent, non-destructive crops for each NON-Hero photo placement.
-- Requires 0046. Original files and existing content/archive/media guards stay
-- untouched. The one explicit predecessor repair below fixes invalid SQL syntax.
-- The private sidecar contains no URL/media ownership reference. A source hash
-- binds a crop to the exact source at its placement; replacing a source ignores
-- the old crop. Archived IDs retain their crop for a later same-source restore.
begin;

do $$ begin
  if exists(select 1 from (values
    ('public.get_hero_editor_with_framing_v2(text,text)'),
    ('public.is_valid_hero_media_framing_v2(jsonb)'),
    ('public.save_home_section_v2(text,text,timestamp with time zone,jsonb)'),
    ('public.save_bio_biography_v2(text,timestamp with time zone,jsonb,jsonb,jsonb)'),
    ('public.save_music_platforms_v2(text,jsonb,jsonb)'),
    ('public.save_gallery_frames_v2(text,jsonb,jsonb)'),
    ('public.save_showreel_works_v2(text,jsonb,jsonb)'),
    ('public.mutate_visual_content_archive_v2(text,text,text,jsonb,uuid,timestamp with time zone)')
  ) required(signature) where pg_catalog.to_regprocedure(signature) is null)
    or (select count(*) from pg_catalog.pg_trigger where not tgisinternal
      and tgname = 'zz_media_library_reference_guard_v2' and tgenabled in ('O','A')
      and tgrelid in ('public.home_page_config'::regclass,'public.bio_gallery_images'::regclass,
        'public.music_platform_links'::regclass,'public.gallery_images'::regclass,'public.videos'::regclass)) <> 5
    or (select count(*) from pg_catalog.pg_trigger where not tgisinternal and tgenabled in ('O','A') and (
      (tgrelid = 'public.bio_gallery_images'::regclass and tgname = 'archived_bio_content_guard_v2')
      or (tgrelid = 'public.music_platform_links'::regclass and tgname = 'archived_music_content_guard_v2')
      or (tgrelid in ('public.gallery_images'::regclass,'public.videos'::regclass) and tgname = 'archived_visual_content_guard_v2'))) <> 4 then
    raise exception 'photo_framing_requires_0046_and_reference_guards' using errcode = '55000';
  end if;
end; $$;

-- Forward repair discovered by the real PostgreSQL crop-save test: 0032 used
-- pg_catalog.greatest as if it were a function. GREATEST is SQL syntax, so every
-- valid Showreel Works save reached undefined_function (42883). Repair only the
-- exact known predecessor body (or accept the exact already-repaired body).
-- CREATE OR REPLACE retains its OID and ACL; its definer/search_path are checked
-- before replaying the same definition. Unknown owner modifications fail closed.
do $$
declare v_body text; v_definition text; v_hash text; v_safe boolean;
begin
  select prosrc,pg_catalog.pg_get_functiondef(oid),prosecdef and proconfig @> array['search_path=""']
    into v_body,v_definition,v_safe from pg_catalog.pg_proc
    where oid = 'public.save_showreel_works_v2(text,jsonb,jsonb)'::regprocedure;
  v_hash := pg_catalog.md5(pg_catalog.replace(v_body,pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10)));
  if v_safe is distinct from true or v_hash not in ('46977223dce71aa5cd24d38c2ebcaab7','3c5b5f7e78b096cd14b047a5cf94e262') then
    raise exception 'photo_framing_requires_known_showreel_save_contract' using errcode = '55000';
  end if;
  if v_hash = '46977223dce71aa5cd24d38c2ebcaab7' then
    execute pg_catalog.replace(v_definition,'pg_catalog.greatest(120, v_current_count)','greatest(120, v_current_count)');
  end if;
end; $$;

create table if not exists public.photo_framings (
  placement text primary key,
  source_fingerprint text not null,
  framing jsonb not null,
  constraint photo_framings_placement_check check (
    pg_catalog.char_length(placement) between 1 and 550
    and placement !~ '[[:cntrl:]]'
    and (placement in ('home:about','home:feature:poster','home:story:0','home:story:1','home:story:2','home:story:3')
      or placement ~ '^(bio:image:|music:platform:|gallery:image:|showreel:thumbnail:).+$')),
  constraint photo_framings_source_check check (source_fingerprint ~ '^[0-9a-f]{32}$'),
  constraint photo_framings_shape_check check (public.is_valid_hero_media_framing_v2(framing))
);
alter table public.photo_framings enable row level security;
revoke all on table public.photo_framings from public, anon, authenticated, service_role;

create or replace function public.photo_framing_for_source_v2(p_placement text, p_src text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select framing from public.photo_framings
  where placement = p_placement and source_fingerprint = pg_catalog.md5(p_src) and p_src <> '';
$$;

-- Private helper, only called after the original source-save RPC succeeds.
create or replace function public.set_photo_framing_for_source_v2(p_placement text, p_src text, p_framing jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_framing is null or p_framing = 'null'::jsonb then
    delete from public.photo_framings where placement = p_placement;
    return;
  end if;
  if p_src is null or p_src = '' or not public.is_valid_hero_media_framing_v2(p_framing) then
    raise exception 'invalid_photo_framing_payload' using errcode = '22023';
  end if;
  insert into public.photo_framings(placement,source_fingerprint,framing)
  values(p_placement,pg_catalog.md5(p_src),p_framing)
  on conflict(placement) do update set source_fingerprint = excluded.source_fingerprint, framing = excluded.framing;
end; $$;

-- Enrich only the known snapshot paths, preserving the old snapshot contract.
create or replace function public.apply_photo_framing_v2(p_page text, p_snapshot jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_path text[]; v_prefix text; v_source text; v_items jsonb; v_item jsonb; v_index integer := 0;
begin
  if p_page = 'home' then
    p_snapshot := pg_catalog.jsonb_set(p_snapshot,'{draft,about,framing}',coalesce(public.photo_framing_for_source_v2('home:about',p_snapshot #>> '{draft,about,imageSrc}'),'null'::jsonb));
    p_snapshot := pg_catalog.jsonb_set(p_snapshot,'{draft,feature,posterFraming}',coalesce(public.photo_framing_for_source_v2('home:feature:poster',p_snapshot #>> '{draft,feature,posterSrc}'),'null'::jsonb));
    v_path := array['draft','stories','images']; v_prefix := 'home:story:'; v_source := 'src';
  elsif p_page = 'bio' then v_path := array['biography','galleryImages']; v_prefix := 'bio:image:'; v_source := 'src';
  elsif p_page = 'music' then v_path := array['platforms']; v_prefix := 'music:platform:'; v_source := 'imageSrc';
  elsif p_page = 'gallery' then v_path := array['frames','items']; v_prefix := 'gallery:image:'; v_source := 'src';
  elsif p_page = 'video' then v_path := array['works','items']; v_prefix := 'showreel:thumbnail:'; v_source := 'thumbnailSrc';
  else raise exception 'invalid_photo_framing_page' using errcode = '22023';
  end if;
  v_items := '[]'::jsonb;
  for v_item in select value from pg_catalog.jsonb_array_elements(p_snapshot #> v_path) loop
    v_items := v_items || pg_catalog.jsonb_build_array(v_item || pg_catalog.jsonb_build_object('framing',public.photo_framing_for_source_v2(
      v_prefix || case when p_page = 'home' then v_index::text else v_item ->> 'id' end, v_item ->> v_source)));
    v_index := v_index + 1;
  end loop;
  return pg_catalog.jsonb_set(p_snapshot,v_path,v_items) || '{"photoFramingAvailable":true}'::jsonb;
end; $$;

create or replace function public.get_photo_editor_with_framing_v2(p_page text, p_site_id text default 'main')
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if p_site_id is distinct from 'main' or p_page is null or p_page not in ('home','bio','music','gallery','video') then
    raise exception 'invalid_photo_framing_page' using errcode = '22023';
  end if;
  -- Collection writers and archive RPCs already take these locks first. They
  -- remain held through content + sidecar writes, giving one coherent read.
  case p_page
    when 'home' then perform 1 from public.home_page_config where id = p_site_id for share;
    when 'bio' then
      lock table public.bio_gallery_images in share mode;
      lock table public.bio_paragraphs in share mode;
      perform 1 from public.bio_profile where id = p_site_id for share;
    when 'music' then lock table public.music_platform_links in share mode;
    when 'gallery' then lock table public.gallery_images in share mode;
    when 'video' then lock table public.videos in share mode;
  end case;
  return public.apply_photo_framing_v2(p_page,public.get_hero_editor_with_framing_v2(p_page,p_site_id));
end; $$;

create or replace function public.save_photo_section_with_framing_v2(
  p_page text, p_section text, p_site_id text, p_payload jsonb, p_versions jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_payload jsonb := p_payload; v_result jsonb; v_item jsonb; v_clean jsonb := '[]'::jsonb;
  v_items jsonb; v_array_key text; v_field text := 'framing'; v_index integer := 0;
  v_placement text; v_src text; v_id text; v_framing jsonb; v_version timestamptz;
begin
  if p_site_id is distinct from 'main' or p_page is null or p_section is null
    or not ((p_page = 'home' and p_section in ('about','feature','stories'))
      or (p_page = 'bio' and p_section = 'biography') or (p_page = 'music' and p_section = 'platforms')
      or (p_page = 'gallery' and p_section = 'frames') or (p_page = 'video' and p_section = 'works'))
    or pg_catalog.jsonb_typeof(p_payload) is distinct from 'object'
    or pg_catalog.jsonb_typeof(p_versions) is distinct from 'object'
    -- Service ceiling, deliberately above the existing action's character
    -- limits (including multi-byte historical IDs and JSONB whitespace).
    or pg_catalog.octet_length(p_payload::text) > 12000000
    or pg_catalog.octet_length(p_versions::text) > 8000000 then
    raise exception 'invalid_photo_framing_payload' using errcode = '22023';
  end if;
  if p_page = 'home' then
    if not (p_versions ? 'updatedAt') or (select count(*) from pg_catalog.jsonb_object_keys(p_versions)) <> 1
      or pg_catalog.jsonb_typeof(p_versions -> 'updatedAt') is distinct from 'string' then
      raise exception 'invalid_photo_framing_versions' using errcode = '22023';
    end if;
    begin v_version := (p_versions ->> 'updatedAt')::timestamptz;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception 'invalid_photo_framing_versions' using errcode = '22023'; end;
  elsif p_page = 'bio' then
    if not (p_versions ?& array['profileUpdatedAt','galleryItems','paragraphItems'])
      or (select count(*) from pg_catalog.jsonb_object_keys(p_versions)) <> 3
      or pg_catalog.jsonb_typeof(p_versions -> 'profileUpdatedAt') is distinct from 'string'
      or pg_catalog.jsonb_typeof(p_versions -> 'galleryItems') is distinct from 'object'
      or pg_catalog.jsonb_typeof(p_versions -> 'paragraphItems') is distinct from 'object' then
      raise exception 'invalid_photo_framing_versions' using errcode = '22023';
    end if;
    begin v_version := (p_versions ->> 'profileUpdatedAt')::timestamptz;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception 'invalid_photo_framing_versions' using errcode = '22023'; end;
  elsif not (p_versions ? 'items') or (select count(*) from pg_catalog.jsonb_object_keys(p_versions)) <> 1
    or pg_catalog.jsonb_typeof(p_versions -> 'items') is distinct from 'object' then
    raise exception 'invalid_photo_framing_versions' using errcode = '22023';
  end if;
  if p_page = 'home' and p_section in ('about','feature') then
    if p_section = 'feature' then v_field := 'posterFraming'; end if;
    v_items := pg_catalog.jsonb_build_array(p_payload);
  else
    v_array_key := case when p_page = 'home' then 'images' when p_page = 'bio' then 'galleryImages' else 'items' end;
    if pg_catalog.jsonb_typeof(p_payload -> v_array_key) is distinct from 'array' then
      raise exception 'invalid_photo_framing_payload' using errcode = '22023';
    end if;
    v_items := p_payload -> v_array_key;
  end if;
  for v_item in select value from pg_catalog.jsonb_array_elements(v_items) loop
    if pg_catalog.jsonb_typeof(v_item) is distinct from 'object' or not (v_item ? v_field)
      or (v_item -> v_field <> 'null'::jsonb and not public.is_valid_hero_media_framing_v2(v_item -> v_field)) then
      raise exception 'invalid_photo_framing_payload' using errcode = '22023';
    end if;
    v_clean := v_clean || pg_catalog.jsonb_build_array(v_item - v_field);
  end loop;
  if v_array_key is null then v_payload := v_clean -> 0;
  else v_payload := pg_catalog.jsonb_set(p_payload,array[v_array_key],v_clean); end if;
  -- The unchanged predecessors own every source/content validation, CAS,
  -- archive recreation guard, collection lock and source-media lock.
  case p_page
    when 'home' then v_result := public.save_home_section_v2(p_site_id,p_section,v_version,v_payload);
    when 'bio' then v_result := public.save_bio_biography_v2(p_site_id,v_version,p_versions -> 'galleryItems',p_versions -> 'paragraphItems',v_payload);
    when 'music' then v_result := public.save_music_platforms_v2(p_site_id,p_versions -> 'items',v_payload);
    when 'gallery' then v_result := public.save_gallery_frames_v2(p_site_id,p_versions -> 'items',v_payload);
    when 'video' then v_result := public.save_showreel_works_v2(p_site_id,p_versions -> 'items',v_payload);
  end case;
  for v_item in select value from pg_catalog.jsonb_array_elements(v_items) loop
    v_id := case when p_page = 'video' then v_item ->> 'id' else pg_catalog.btrim(v_item ->> 'id') end;
    v_framing := v_item -> v_field;
    case p_page
      when 'home' then
        v_placement := case p_section when 'about' then 'home:about' when 'feature' then 'home:feature:poster' else 'home:story:' || v_index end;
        v_src := case p_section when 'about' then v_result #>> '{canonicalSection,imageSrc}'
          when 'feature' then v_result #>> '{canonicalSection,posterSrc}' else v_result #>> array['canonicalSection','images',v_index::text,'src'] end;
      when 'bio' then v_placement := 'bio:image:' || v_id; select src into v_src from public.bio_gallery_images where id = v_id;
      when 'music' then v_placement := 'music:platform:' || v_id; select image_src into v_src from public.music_platform_links where id = v_id;
      when 'gallery' then v_placement := 'gallery:image:' || v_id; select src into v_src from public.gallery_images where id = v_id and not is_freelance_story;
      when 'video' then v_placement := 'showreel:thumbnail:' || v_id; select thumbnail_src into v_src from public.videos where id = v_id;
    end case;
    perform public.set_photo_framing_for_source_v2(v_placement,v_src,v_framing);
    v_index := v_index + 1;
  end loop;
  if p_page = 'home' then
    v_result := pg_catalog.jsonb_set(v_result,'{canonicalSection}',
      public.apply_photo_framing_v2('home',public.get_home_page_v2_snapshot(p_site_id)) #> array['draft',p_section]);
  elsif p_page = 'music' then
    v_result := pg_catalog.jsonb_set(v_result,'{items}',
      public.apply_photo_framing_v2('music',pg_catalog.jsonb_build_object('platforms',v_result -> 'items')) -> 'platforms');
  end if;
  return v_result;
end; $$;

-- One public read statement exposes only a crop's CURRENT, published source,
-- never archived sidecar rows, unpublished URLs, or unmatched source hashes.
-- Clients also compare src with their content snapshot to handle read races.
create or replace function public.get_public_photo_framings_v1()
returns jsonb language sql stable security definer set search_path = '' as $$
  with active_sources(placement,src) as (
    select 'home:about',draft #>> '{about,imageSrc}' from public.home_page_config where id = 'main'
      and draft -> 'layout' @> '[{"id":"about","enabled":true}]'::jsonb
    union all select 'home:feature:poster',draft #>> '{feature,posterSrc}' from public.home_page_config where id = 'main'
      and draft -> 'layout' @> '[{"id":"feature","enabled":true}]'::jsonb
    union all select 'home:story:' || (image.position - 1),image.item ->> 'src'
      from public.home_page_config home cross join lateral pg_catalog.jsonb_array_elements(home.draft #> '{stories,images}') with ordinality image(item,position)
      where home.id = 'main' and home.draft -> 'layout' @> '[{"id":"stories","enabled":true}]'::jsonb and image.position between 1 and 4
    union all select 'bio:image:' || id,src from public.bio_gallery_images where is_published
    union all select 'music:platform:' || id,image_src from public.music_platform_links where is_published
    union all select 'gallery:image:' || id,src from public.gallery_images where is_published and not is_freelance_story
    union all select 'showreel:thumbnail:' || id,thumbnail_src from public.videos where is_published
  ) select coalesce(pg_catalog.jsonb_object_agg(source.placement,pg_catalog.jsonb_build_object('src',source.src,'framing',crop.framing)),'{}'::jsonb)
    from active_sources source join public.photo_framings crop on crop.placement = source.placement
      and crop.source_fingerprint = pg_catalog.md5(source.src) where source.src <> '';
$$;

revoke all on function public.photo_framing_for_source_v2(text,text) from public, anon, authenticated, service_role;
revoke all on function public.set_photo_framing_for_source_v2(text,text,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.apply_photo_framing_v2(text,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.get_photo_editor_with_framing_v2(text,text) from public, anon, authenticated, service_role;
revoke all on function public.save_photo_section_with_framing_v2(text,text,text,jsonb,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.get_public_photo_framings_v1() from public, anon, authenticated, service_role;
grant execute on function public.get_photo_editor_with_framing_v2(text,text) to service_role;
grant execute on function public.save_photo_section_with_framing_v2(text,text,text,jsonb,jsonb) to service_role;
grant execute on function public.get_public_photo_framings_v1() to anon, authenticated, service_role;
comment on table public.photo_framings is 'Private per-placement crops bound to a source hash. No media ownership reference; retained across archival of source IDs.';
comment on function public.save_photo_section_with_framing_v2(text,text,text,jsonb,jsonb) is 'Atomic non-Hero content + crop save through unchanged validated V2 CAS/media/archive boundaries.';
commit;
