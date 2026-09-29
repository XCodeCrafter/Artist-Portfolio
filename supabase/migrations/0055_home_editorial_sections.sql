-- HOME editorial sections: Latest release, Selected work and Press & reviews.
-- Requires 0051 and the existing media-reference guards. No provider activation,
-- file deletion or invented releases/reviews. Retired stories stay in JSON for
-- recovery and reference protection, but cannot reappear in the public layout.
-- Home is public content: visibility controls presentation, not confidentiality.
begin;

do $$ begin
  if exists(select 1 from (values
    ('public.get_photo_editor_with_framing_v2(text,text)'),
    ('public.is_valid_hero_media_framing_v2(jsonb)'),
    ('public.save_home_section_v2(text,text,timestamp with time zone,jsonb)'),
    ('public.assert_home_media_source_v2(text,text)'),
    ('public.guard_media_library_references_v2()')
  ) required(signature) where pg_catalog.to_regprocedure(signature) is null)
    or not exists(select 1 from pg_catalog.pg_trigger where not tgisinternal
      and tgrelid = 'public.home_page_config'::regclass
      and tgname = 'zz_media_library_reference_guard_v2' and tgenabled in ('O','A'))
    or not exists(select 1 from public.media_library_reference_registry_v2()
      where table_name = 'home_page_config' and json_columns @> array['draft']) then
    raise exception 'home_editorial_requires_0051_and_reference_guards' using errcode = '55000';
  end if;
end; $$;

create or replace function public.is_safe_home_editorial_href_v2(p_value text)
returns boolean language sql immutable security definer set search_path = '' as $$
  select p_value is not null and pg_catalog.char_length(p_value) <= 2048
    and p_value !~ '[[:cntrl:]]' and pg_catalog.strpos(p_value,pg_catalog.chr(92)) = 0
    and (p_value = '' or p_value ~ '^#[A-Za-z][A-Za-z0-9_-]*$'
      or (pg_catalog.left(p_value,1) = '/' and pg_catalog.left(p_value,2) <> '//')
      or p_value ~* '^https://[^[:space:]/?#:@]+(:443)?([/?#][^[:space:]]*)?$');
$$;

-- One bounded, exact-key validator shared by the RPC and direct-write guard.
-- Image references use the original managed-media verifier and SHARE locks.
create or replace function public.validate_home_editorial_section_v2(p_section text, p_payload jsonb, p_lock_media boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_specs jsonb; v_result jsonb := '{}'::jsonb; v_field record; v_text text;
  v_item jsonb; v_items jsonb := '[]'::jsonb; v_ids text[] := array[]::text[];
  v_date date; v_kind text; v_url text; v_authority text[]; v_youtube_id text;
begin
  if p_payload is null or pg_catalog.octet_length(p_payload::text) > 640000 then
    raise exception 'invalid_home_editorial_payload' using errcode = '22023';
  end if;
  if p_section = 'layout' then
    if pg_catalog.jsonb_typeof(p_payload) is distinct from 'array' then
      raise exception 'invalid_home_editorial_layout' using errcode = '22023';
    end if;
    if pg_catalog.jsonb_array_length(p_payload) <> 7 then
      raise exception 'invalid_home_editorial_layout' using errcode = '22023';
    end if;
    for v_item in select value from pg_catalog.jsonb_array_elements(p_payload) loop
      if pg_catalog.jsonb_typeof(v_item) is distinct from 'object' then
        raise exception 'invalid_home_editorial_layout' using errcode = '22023';
      end if;
      if not (v_item ?& array['id','enabled'])
        or (select count(*) from pg_catalog.jsonb_object_keys(v_item)) <> 2
        or pg_catalog.jsonb_typeof(v_item->'id') is distinct from 'string'
        or v_item->>'id' not in ('hero','about','cnc','feature','release','work','press')
        or pg_catalog.jsonb_typeof(v_item->'enabled') is distinct from 'boolean'
        or v_item->>'id' = any(v_ids) then
        raise exception 'invalid_home_editorial_layout' using errcode = '22023';
      end if;
      v_ids := pg_catalog.array_append(v_ids,v_item->>'id');
    end loop;
    if not exists(select 1 from pg_catalog.jsonb_array_elements(p_payload) item where item->'enabled' = 'true'::jsonb) then
      raise exception 'invalid_home_editorial_layout' using errcode = '22023';
    end if;
    return p_payload;
  end if;
  v_specs := case p_section
    when 'release' then '{"eyebrow":220,"title":220,"subtitle":500,"body":2000,"background":0,"cover":0,"releaseTitle":220,"artist":220,"note":500,"playback":0,"primaryLabel":100,"primaryHref":2048,"secondaryLabel":100,"secondaryHref":2048}'::jsonb
    when 'work' then '{"eyebrow":220,"title":220,"body":2000,"note":500,"background":0,"cards":0}'::jsonb
    when 'press' then '{"eyebrow":220,"title":220,"body":2000,"buttonLabel":100,"background":0,"featuredId":36,"items":0}'::jsonb
    when '_image' then '{"src":2048,"alt":500,"framing":0}'::jsonb
    when '_work_card' then '{"id":20,"title":220,"body":1000,"href":2048,"image":0,"tone":4}'::jsonb
    when '_press_item' then '{"id":36,"kind":12,"title":220,"quote":1500,"publication":220,"date":10,"href":2048,"image":0,"visible":0}'::jsonb
    when '_playback' then '{"kind":7,"url":2048}'::jsonb
    else null end;
  if v_specs is null or pg_catalog.jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'invalid_home_editorial_payload' using errcode = '22023';
  end if;
  if (select count(*) from pg_catalog.jsonb_object_keys(p_payload)) <> (select count(*) from pg_catalog.jsonb_object_keys(v_specs))
    or exists(select 1 from pg_catalog.jsonb_object_keys(p_payload) supplied(key) where not (v_specs ? supplied.key)) then
    raise exception 'invalid_home_editorial_payload' using errcode = '22023';
  end if;
  for v_field in select key,value from pg_catalog.jsonb_each_text(v_specs) loop
    if v_field.value::integer = 0 then continue; end if;
    if pg_catalog.jsonb_typeof(p_payload->v_field.key) is distinct from 'string' then
      raise exception 'invalid_home_editorial_payload' using errcode = '22023';
    end if;
    v_text := pg_catalog.btrim(p_payload->>v_field.key);
    if pg_catalog.char_length(v_text) > v_field.value::integer then
      raise exception 'invalid_home_editorial_payload' using errcode = '22023';
    end if;
    if v_field.key in ('href','primaryHref','secondaryHref') and not public.is_safe_home_editorial_href_v2(v_text) then
      raise exception 'invalid_home_editorial_link' using errcode = '22023';
    end if;
    v_result := v_result || pg_catalog.jsonb_build_object(v_field.key,v_text);
  end loop;
  if p_section = '_image' then
    if p_payload->'framing' is distinct from 'null'::jsonb and
      (v_result->>'src' = '' or not public.is_valid_hero_media_framing_v2(p_payload->'framing')) then
      raise exception 'invalid_home_editorial_framing' using errcode = '22023';
    end if;
    if p_lock_media then
      perform public.assert_home_media_source_v2(v_result->>'src','image');
    elsif v_result->>'src' <> '' and (
      not public.is_safe_home_editorial_href_v2(v_result->>'src')
      or (pg_catalog.left(v_result->>'src',1) <> '/' and not exists(select 1 from public.media_assets
        where src = v_result->>'src' and media_type = 'image' and deleted_at is null))
    ) then raise exception 'invalid_home_media_source' using errcode = '22023'; end if;
    return v_result || pg_catalog.jsonb_build_object('framing',p_payload->'framing');
  end if;
  if p_section = '_playback' then
    v_kind := v_result->>'kind'; v_url := v_result->>'url';
    if v_kind = 'none' and v_url = '' then return v_result; end if;
    if v_kind = 'audio' and public.is_safe_home_editorial_href_v2(v_url)
      and (pg_catalog.left(v_url,1) = '/' or v_url ~* '^https://')
      and pg_catalog.split_part(pg_catalog.split_part(v_url,'?',1),'#',1) ~* '\.(mp3|m4a|ogg|wav)$' then
      return v_result;
    end if;
    if v_url ~ '[[:space:][:cntrl:]]' or pg_catalog.strpos(v_url,pg_catalog.chr(92)) > 0 then
      raise exception 'invalid_home_editorial_playback' using errcode = '22023';
    end if;
    -- URL() normalizes scheme/host casing in the application; preserve path/ID
    -- casing, since provider identifiers are case-sensitive.
    v_authority := pg_catalog.regexp_match(v_url,'^https://([^/?#]+)(.*)$','i');
    if v_authority is not null then v_url := 'https://' || pg_catalog.lower(v_authority[1]) || v_authority[2]; end if;
    if v_kind = 'spotify' and v_url ~ '^https://open\.spotify\.com(:443)?/(intl-[a-z]{2}/)?(embed/)?(track|album|playlist)/[A-Za-z0-9]{22}/?([?#].*)?$' then
      return v_result;
    end if;
    -- Match URLSearchParams.get: the FIRST v parameter wins. A second valid v
    -- or a fragment cannot make an invalid/missing first parameter playable.
    v_youtube_id := substring(pg_catalog.split_part(pg_catalog.split_part(v_url,'?',2),'#',1) from '(?:^|&)v=([^&]*)');
    if v_kind = 'youtube' and (
      v_url ~ '^https://youtu\.be(:443)?/[A-Za-z0-9_-]{11}([?#].*)?$'
      or v_url ~ '^https://(youtube\.com|www\.youtube\.com|m\.youtube\.com|www\.youtube-nocookie\.com)(:443)?/(embed|shorts)/[A-Za-z0-9_-]{11}/?([?#].*)?$'
      or (v_url ~ '^https://(youtube\.com|www\.youtube\.com|m\.youtube\.com|www\.youtube-nocookie\.com)(:443)?/watch\?'
        and v_youtube_id ~ '^[A-Za-z0-9_-]{11}$')
    ) then return v_result; end if;
    raise exception 'invalid_home_editorial_playback' using errcode = '22023';
  end if;
  foreach v_text in array array['background','cover','image'] loop
    if v_specs ? v_text then
      v_result := v_result || pg_catalog.jsonb_build_object(v_text,public.validate_home_editorial_section_v2('_image',p_payload->v_text,p_lock_media));
    end if;
  end loop;
  if p_section = 'release' then
    if (v_result->>'primaryLabel' <> '' and v_result->>'primaryHref' = '')
      or (v_result->>'secondaryLabel' <> '' and v_result->>'secondaryHref' = '') then
      raise exception 'invalid_home_editorial_link' using errcode = '22023';
    end if;
    v_result := v_result || pg_catalog.jsonb_build_object('playback',public.validate_home_editorial_section_v2('_playback',p_payload->'playback',p_lock_media));
  elsif p_section = '_work_card' then
    if v_result->>'id' not in ('music','photography','film','live') or v_result->>'tone' not in ('mono','red') then
      raise exception 'invalid_home_editorial_card' using errcode = '22023';
    end if;
  elsif p_section = 'work' then
    if pg_catalog.jsonb_typeof(p_payload->'cards') is distinct from 'array' then
      raise exception 'invalid_home_editorial_cards' using errcode = '22023';
    end if;
    if pg_catalog.jsonb_array_length(p_payload->'cards') <> 4 then
      raise exception 'invalid_home_editorial_cards' using errcode = '22023';
    end if;
    for v_item in select value from pg_catalog.jsonb_array_elements(p_payload->'cards') loop
      v_item := public.validate_home_editorial_section_v2('_work_card',v_item,p_lock_media);
      if v_item->>'id' = any(v_ids) then raise exception 'invalid_home_editorial_cards' using errcode = '22023'; end if;
      v_ids := pg_catalog.array_append(v_ids,v_item->>'id');
      v_items := v_items || pg_catalog.jsonb_build_array(v_item);
    end loop;
    v_result := v_result || pg_catalog.jsonb_build_object('cards',v_items);
  elsif p_section = '_press_item' then
    if (v_result->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and pg_catalog.lower(v_result->>'id') not in ('00000000-0000-0000-0000-000000000000','ffffffff-ffff-ffff-ffff-ffffffffffff'))
      or v_result->>'kind' not in ('review','interview','radio','feature')
      or v_result->>'title' = '' or v_result->>'publication' = ''
      or pg_catalog.jsonb_typeof(p_payload->'visible') is distinct from 'boolean'
      or (v_result->>'quote' = '' and v_result #>> '{image,src}' = '' and v_result->>'href' = '') then
      raise exception 'invalid_home_editorial_press_item' using errcode = '22023';
    end if;
    if v_result->>'date' <> '' then
      if v_result->>'date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        raise exception 'invalid_home_editorial_press_date' using errcode = '22023';
      end if;
      v_date := (v_result->>'date')::date;
      if pg_catalog.to_char(v_date,'YYYY-MM-DD') <> v_result->>'date' then
        raise exception 'invalid_home_editorial_press_date' using errcode = '22023';
      end if;
    end if;
    v_result := v_result || pg_catalog.jsonb_build_object('visible',p_payload->'visible');
  elsif p_section = 'press' then
    if pg_catalog.jsonb_typeof(p_payload->'items') is distinct from 'array' then
      raise exception 'invalid_home_editorial_press_items' using errcode = '22023';
    end if;
    if pg_catalog.jsonb_array_length(p_payload->'items') > 20 then
      raise exception 'invalid_home_editorial_press_items' using errcode = '22023';
    end if;
    for v_item in select value from pg_catalog.jsonb_array_elements(p_payload->'items') loop
      v_item := public.validate_home_editorial_section_v2('_press_item',v_item,p_lock_media);
      if v_item->>'id' = any(v_ids) then raise exception 'invalid_home_editorial_press_items' using errcode = '22023'; end if;
      v_ids := pg_catalog.array_append(v_ids,v_item->>'id');
      v_items := v_items || pg_catalog.jsonb_build_array(v_item);
    end loop;
    if v_result->>'featuredId' <> '' and not exists(select 1 from pg_catalog.jsonb_array_elements(v_items) item
      where item->>'id' = v_result->>'featuredId' and item->'visible' = 'true'::jsonb) then
      raise exception 'invalid_home_editorial_featured_item' using errcode = '22023';
    end if;
    v_result := v_result || pg_catalog.jsonb_build_object('items',v_items);
  end if;
  return v_result;
exception when invalid_datetime_format or datetime_field_overflow then
  raise exception 'invalid_home_editorial_press_date' using errcode = '22023';
end; $$;

-- Add only missing section objects. Replace the retired slot in place, retaining
-- the order and visibility of every unrelated section. Reruns do not bump CAS.
do $$
declare
  v_row public.home_page_config%rowtype; v_draft jsonb; v_layout jsonb := '[]'::jsonb;
  v_item jsonb; v_section text; v_defaults jsonb := '{
    "release":{"eyebrow":"LATEST RELEASE","title":"A SOUND OF ITS OWN.","subtitle":"","body":"","background":{"src":"/images/home-editorial/press.webp","alt":"Illustrative microphone backstage","framing":null},"cover":{"src":"/images/home-editorial/guitar.webp","alt":"Illustrative guitarist on stage","framing":null},"releaseTitle":"","artist":"","note":"Some songs sound better after dark.","playback":{"kind":"none","url":""},"primaryLabel":"","primaryHref":"","secondaryLabel":"ALL MUSIC","secondaryHref":"/music"},
    "work":{"eyebrow":"SELECTED WORK","title":"STORIES IN\nDIFFERENT\nFORMS.","body":"Music, images, film, live moments — different languages, same truth.","note":"SAME HUMAN.\nDIFFERENT STORIES.","background":{"src":"/images/home-editorial/studio.webp","alt":"Illustrative studio atmosphere","framing":null},"cards":[
      {"id":"music","title":"MUSIC","body":"Songs, sounds and everything in between.","href":"/music","image":{"src":"/images/home-editorial/guitar.webp","alt":"Illustrative live guitar performance","framing":{"desktop":{"fit":"cover","x":75,"y":50,"zoom":1},"mobile":{"fit":"cover","x":75,"y":50,"zoom":1}}},"tone":"mono"},
      {"id":"photography","title":"PHOTOGRAPHY","body":"People, places, and the in-between.","href":"/gallery","image":{"src":"/images/home-editorial/studio.webp","alt":"Illustrative studio portrait","framing":{"desktop":{"fit":"cover","x":75,"y":50,"zoom":1},"mobile":{"fit":"cover","x":75,"y":50,"zoom":1}}},"tone":"mono"},
      {"id":"film","title":"FILM & ACTING","body":"Other characters, same curiosity.","href":"/video","image":{"src":"/images/home-editorial/guitar.webp","alt":"Illustrative performer silhouette","framing":{"desktop":{"fit":"cover","x":75,"y":50,"zoom":1},"mobile":{"fit":"cover","x":75,"y":50,"zoom":1}}},"tone":"red"},
      {"id":"live","title":"LIVE","body":"A shared moment. Always different.","href":"/booking#events","image":{"src":"/images/home-editorial/live.webp","alt":"Illustrative performer facing an audience","framing":null},"tone":"mono"}]},
    "press":{"eyebrow":"PRESS & REVIEWS","title":"WORDS FROM\nELSEWHERE.","body":"Conversations, radio sessions and stories behind the music.","buttonLabel":"EXPLORE ALL PRESS","background":{"src":"/images/home-editorial/press.webp","alt":"Illustrative microphone backstage","framing":null},"featuredId":"","items":[]}
  }'::jsonb;
begin
  select * into v_row from public.home_page_config where id = 'main' for update;
  if not found then raise exception 'home_page_snapshot_missing' using errcode = '23503'; end if;
  v_draft := v_row.draft;
  foreach v_section in array array['release','work','press'] loop
    if not (v_draft ? v_section) then v_draft := v_draft || pg_catalog.jsonb_build_object(v_section,v_defaults->v_section); end if;
    perform public.validate_home_editorial_section_v2(v_section,v_draft->v_section);
  end loop;
  if exists(select 1 from pg_catalog.jsonb_array_elements(v_draft->'layout') item where item->>'id' = 'stories') then
    perform public.validate_home_section_v2('layout',v_draft->'layout');
    for v_item in select value from pg_catalog.jsonb_array_elements(v_draft->'layout') loop
      v_layout := v_layout || case when v_item->>'id' = 'stories' then
        '[{"id":"release","enabled":false},{"id":"work","enabled":true},{"id":"press","enabled":false}]'::jsonb
        else pg_catalog.jsonb_build_array(v_item) end;
    end loop;
    v_draft := pg_catalog.jsonb_set(v_draft,'{layout}',v_layout);
  end if;
  perform public.validate_home_editorial_section_v2('layout',v_draft->'layout');
  if v_draft is distinct from v_row.draft then
    update public.home_page_config set draft = v_draft,
      updated_at = greatest(pg_catalog.clock_timestamp(),v_row.updated_at + interval '1 microsecond') where id = 'main';
  end if;
end; $$;

-- Tiny guarded forward patch: keep old RPC identity, security and behavior for
-- the four surviving sections; reject old tabs attempting legacy layout/story
-- saves. Reference replacement may still rewrite retired media URLs safely.
do $$
declare v_body text; v_definition text; v_hash text; v_safe boolean;
begin
  select prosrc,pg_catalog.pg_get_functiondef(oid),prosecdef and proconfig @> array['search_path=""']
    into v_body,v_definition,v_safe from pg_catalog.pg_proc
    where oid = 'public.save_home_section_v2(text,text,timestamptz,jsonb)'::regprocedure;
  v_hash := pg_catalog.md5(pg_catalog.replace(v_body,pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10)));
  if v_safe is distinct from true or v_hash not in ('34b0ef1064e3fbace372da29fa097966','e4577d88a5313f14cea88d5c55bc0a78') then
    raise exception 'home_editorial_requires_known_home_save_contract' using errcode = '55000';
  end if;
  if v_hash = '34b0ef1064e3fbace372da29fa097966' then
    execute pg_catalog.replace(v_definition,
      $source$p_section not in ('layout', 'hero', 'about', 'cnc', 'feature', 'stories')$source$,
      $source$p_section not in ('hero', 'about', 'cnc', 'feature')$source$);
  end if;
end; $$;

create or replace function public.guard_home_editorial_sections_v2()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_section text;
begin
  foreach v_section in array array['layout','release','work','press'] loop
    if tg_op = 'INSERT' or (new.draft->v_section) is distinct from (old.draft->v_section) then
      -- Store the canonical trimmed shape for direct service-role writes too.
      new.draft := pg_catalog.jsonb_set(new.draft,array[v_section],
        public.validate_home_editorial_section_v2(v_section,new.draft->v_section),false);
    end if;
  end loop;
  return new;
end; $$;
drop trigger if exists home_editorial_sections_guard_v2 on public.home_page_config;
create trigger home_editorial_sections_guard_v2 before insert or update on public.home_page_config
  for each row execute function public.guard_home_editorial_sections_v2();

create or replace function public.save_home_editorial_section_v2(
  p_site_id text, p_section text, p_expected_updated_at timestamptz, p_payload jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_current_version timestamptz; v_version timestamptz; v_payload jsonb;
begin
  if p_site_id is distinct from 'main' or p_expected_updated_at is null
    or p_section is null or p_section not in ('layout','release','work','press') then
    raise exception 'invalid_home_editorial_payload' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('home_page_v2:main',0));
  v_payload := public.validate_home_editorial_section_v2(p_section,p_payload);
  select updated_at into v_current_version from public.home_page_config where id = p_site_id for update;
  if not found then raise exception 'home_page_snapshot_missing' using errcode = '23503'; end if;
  if v_current_version is distinct from p_expected_updated_at then
    raise exception 'home_page_changed' using errcode = '40001';
  end if;
  update public.home_page_config set draft = pg_catalog.jsonb_set(draft,array[p_section],v_payload,false),
    updated_at = greatest(pg_catalog.clock_timestamp(),v_current_version + interval '1 microsecond')
    where id = p_site_id returning updated_at into v_version;
  return pg_catalog.jsonb_build_object('canonicalSection',v_payload,'versions',pg_catalog.jsonb_build_object('updatedAt',v_version));
end; $$;

revoke all on function public.is_safe_home_editorial_href_v2(text) from public, anon, authenticated, service_role;
revoke all on function public.validate_home_editorial_section_v2(text,jsonb,boolean) from public, anon, authenticated, service_role;
revoke all on function public.guard_home_editorial_sections_v2() from public, anon, authenticated, service_role;
revoke all on function public.save_home_editorial_section_v2(text,text,timestamptz,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_home_editorial_section_v2(text,text,timestamptz,jsonb) to service_role;
comment on function public.save_home_editorial_section_v2(text,text,timestamptz,jsonb) is
  'Service-only HOME editorial publication with exact schemas, source locks, inline independent crops and page CAS. Visibility is not private storage.';
commit;
