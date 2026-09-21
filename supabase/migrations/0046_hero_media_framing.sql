-- Per-placement Hero framing for HOME, BIO, Music, Gallery, Showreel and Contact.
-- Requires the six existing V2 editors and the 0040 media-reference guards.
-- NULL preserves the original automatic framing. No content is backfilled or
-- rewritten, no media files are changed, and old save RPCs remain untouched.
begin;

do $$ begin
  if exists(select 1 from (values
    ('public.get_home_page_v2_snapshot(text)'),
    ('public.get_bio_page_v2_snapshot(text)'),
    ('public.get_music_page_v2_snapshot(text)'),
    ('public.get_gallery_page_v2_snapshot(text)'),
    ('public.get_showreel_page_v2_snapshot(text)'),
    ('public.get_contact_page_v2_snapshot(text)'),
    ('public.save_home_section_v2(text,text,timestamp with time zone,jsonb)'),
    ('public.save_bio_hero_v2(text,timestamp with time zone,jsonb)'),
    ('public.save_music_hero_v2(text,timestamp with time zone,jsonb)'),
    ('public.save_gallery_hero_v2(text,timestamp with time zone,jsonb)'),
    ('public.save_showreel_hero_v2(text,timestamp with time zone,jsonb)'),
    ('public.save_contact_hero_v2(text,timestamp with time zone,jsonb)'),
    ('public.guard_media_library_references_v2()')
  ) required(signature) where pg_catalog.to_regprocedure(signature) is null)
    or (select count(*) from pg_catalog.pg_trigger
      where tgrelid in (pg_catalog.to_regclass('public.page_heroes'), pg_catalog.to_regclass('public.home_page_config'))
        and tgname = 'zz_media_library_reference_guard_v2'
        and tgenabled in ('O', 'A') and not tgisinternal) <> 2 then
    raise exception 'hero_framing_requires_all_v2_editors_and_0040_guards' using errcode = '55000';
  end if;
end; $$;

-- The bounded predicate protects RPC payloads; equivalent built-in-only column
-- checks protect direct writes without requiring callers to execute this helper.
-- JSON numbers are finite PostgreSQL numerics; booleans, strings and JSON null
-- are never coerced to numbers. NULL at the column level is the legacy mode.
create or replace function public.is_valid_hero_media_framing_v2(p_framing jsonb)
returns boolean language plpgsql immutable security definer set search_path = '' as $$
declare v_view jsonb; v_key text;
begin
  if p_framing is null or pg_catalog.jsonb_typeof(p_framing) is distinct from 'object'
    or pg_catalog.octet_length(p_framing::text) > 4096 then return false; end if;
  if not (p_framing ?& array['desktop', 'mobile'])
    or (select count(*) from pg_catalog.jsonb_object_keys(p_framing)) <> 2 then return false; end if;
  foreach v_key in array array['desktop', 'mobile'] loop
    v_view := p_framing -> v_key;
    if pg_catalog.jsonb_typeof(v_view) is distinct from 'object' then return false; end if;
    if not (v_view ?& array['fit', 'x', 'y', 'zoom'])
      or (select count(*) from pg_catalog.jsonb_object_keys(v_view)) <> 4
      or pg_catalog.jsonb_typeof(v_view -> 'fit') is distinct from 'string'
      or v_view ->> 'fit' not in ('cover', 'contain')
      or pg_catalog.jsonb_typeof(v_view -> 'x') is distinct from 'number'
      or pg_catalog.jsonb_typeof(v_view -> 'y') is distinct from 'number'
      or pg_catalog.jsonb_typeof(v_view -> 'zoom') is distinct from 'number' then return false; end if;
    if (v_view ->> 'x')::numeric not between 0 and 100
      or (v_view ->> 'y')::numeric not between 0 and 100
      or (v_view ->> 'zoom')::numeric not between 1 and 3 then return false; end if;
  end loop;
  return true;
end; $$;

alter table public.page_heroes add column if not exists media_framing jsonb;
alter table public.home_page_config add column if not exists hero_media_framing jsonb;
alter table public.page_heroes drop constraint if exists page_heroes_media_framing_check;
alter table public.page_heroes add constraint page_heroes_media_framing_check
  check (media_framing is null or coalesce(pg_catalog.octet_length(media_framing::text) <= 4096 and
    pg_catalog.jsonb_path_match(media_framing, 'strict
      $.type() == "object" && !exists($.keyvalue() ? (@.key != "desktop" && @.key != "mobile"))
      && $.desktop.type() == "object" && $.mobile.type() == "object"
      && !exists($.desktop.keyvalue() ? (@.key != "fit" && @.key != "x" && @.key != "y" && @.key != "zoom"))
      && !exists($.mobile.keyvalue() ? (@.key != "fit" && @.key != "x" && @.key != "y" && @.key != "zoom"))
      && $.desktop.fit.type() == "string" && ($.desktop.fit == "cover" || $.desktop.fit == "contain")
      && $.mobile.fit.type() == "string" && ($.mobile.fit == "cover" || $.mobile.fit == "contain")
      && $.desktop.x.type() == "number" && $.desktop.x >= 0 && $.desktop.x <= 100
      && $.desktop.y.type() == "number" && $.desktop.y >= 0 && $.desktop.y <= 100
      && $.desktop.zoom.type() == "number" && $.desktop.zoom >= 1 && $.desktop.zoom <= 3
      && $.mobile.x.type() == "number" && $.mobile.x >= 0 && $.mobile.x <= 100
      && $.mobile.y.type() == "number" && $.mobile.y >= 0 && $.mobile.y <= 100
      && $.mobile.zoom.type() == "number" && $.mobile.zoom >= 1 && $.mobile.zoom <= 3', '{}'::jsonb, true), false));
alter table public.home_page_config drop constraint if exists home_page_config_hero_media_framing_check;
alter table public.home_page_config add constraint home_page_config_hero_media_framing_check
  check (hero_media_framing is null or coalesce(pg_catalog.octet_length(hero_media_framing::text) <= 4096 and
    pg_catalog.jsonb_path_match(hero_media_framing, 'strict
      $.type() == "object" && !exists($.keyvalue() ? (@.key != "desktop" && @.key != "mobile"))
      && $.desktop.type() == "object" && $.mobile.type() == "object"
      && !exists($.desktop.keyvalue() ? (@.key != "fit" && @.key != "x" && @.key != "y" && @.key != "zoom"))
      && !exists($.mobile.keyvalue() ? (@.key != "fit" && @.key != "x" && @.key != "y" && @.key != "zoom"))
      && $.desktop.fit.type() == "string" && ($.desktop.fit == "cover" || $.desktop.fit == "contain")
      && $.mobile.fit.type() == "string" && ($.mobile.fit == "cover" || $.mobile.fit == "contain")
      && $.desktop.x.type() == "number" && $.desktop.x >= 0 && $.desktop.x <= 100
      && $.desktop.y.type() == "number" && $.desktop.y >= 0 && $.desktop.y <= 100
      && $.desktop.zoom.type() == "number" && $.desktop.zoom >= 1 && $.desktop.zoom <= 3
      && $.mobile.x.type() == "number" && $.mobile.x >= 0 && $.mobile.x <= 100
      && $.mobile.y.type() == "number" && $.mobile.y >= 0 && $.mobile.y <= 100
      && $.mobile.zoom.type() == "number" && $.mobile.zoom >= 1 && $.mobile.zoom <= 3', '{}'::jsonb, true), false));

-- A parent-row SHARE lock keeps its framing and version consistent with the
-- existing complete editor snapshot, even when another admin is saving. There
-- is no second client read whose race could silently overwrite a newer crop.
create or replace function public.get_hero_editor_with_framing_v2(
  p_page text, p_site_id text default 'main'
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_framing jsonb; v_snapshot jsonb;
begin
  if p_site_id is distinct from 'main' or p_page is null
    or p_page not in ('home', 'bio', 'music', 'gallery', 'video', 'booking') then
    raise exception 'invalid_hero_framing_page' using errcode = '22023';
  end if;
  if p_page = 'home' then
    select hero_media_framing into v_framing from public.home_page_config where id = p_site_id for share;
  else
    select media_framing into v_framing from public.page_heroes where page_slug = p_page for share;
  end if;
  if not found then raise exception 'hero_framing_parent_missing' using errcode = '23503'; end if;
  v_snapshot := case p_page
    when 'home' then public.get_home_page_v2_snapshot(p_site_id)
    when 'bio' then public.get_bio_page_v2_snapshot(p_site_id)
    when 'music' then public.get_music_page_v2_snapshot(p_site_id)
    when 'gallery' then public.get_gallery_page_v2_snapshot(p_site_id)
    when 'video' then public.get_showreel_page_v2_snapshot(p_site_id)
    when 'booking' then public.get_contact_page_v2_snapshot(p_site_id)
  end;
  if p_page = 'home' then
    return pg_catalog.jsonb_set(v_snapshot, '{draft,hero,framing}', coalesce(v_framing, 'null'::jsonb), true);
  end if;
  return pg_catalog.jsonb_set(v_snapshot, '{hero,framing}', coalesce(v_framing, 'null'::jsonb), true);
end; $$;

-- Publish the existing Hero content and its framing in ONE transaction. The
-- unchanged old RPC still owns URL/CTA/media validation, advisory locks and CAS.
-- Any failure rolls both changes back. A second update runs the existing media
-- guard and advances the version again, so return only the FINAL saved version.
create or replace function public.save_hero_with_framing_v2(
  p_page text, p_site_id text, p_expected_updated_at timestamptz, p_payload jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_framing jsonb; v_payload jsonb; v_version timestamptz; v_home_result jsonb;
begin
  if p_site_id is distinct from 'main' or p_page is null
    or p_page not in ('home', 'bio', 'music', 'gallery', 'video', 'booking')
    or p_expected_updated_at is null
    or pg_catalog.jsonb_typeof(p_payload) is distinct from 'object'
    or pg_catalog.octet_length(p_payload::text) > 32000 then
    raise exception 'invalid_hero_framing_payload' using errcode = '22023';
  end if;
  if not (p_payload ?& array['title', 'subtitle', 'ctaLabel', 'ctaHref', 'backgroundSrc', 'posterSrc', 'mediaType', 'framing'])
    or (select count(*) from pg_catalog.jsonb_object_keys(p_payload)) <> 8 then
    raise exception 'invalid_hero_framing_payload' using errcode = '22023';
  end if;
  v_framing := p_payload -> 'framing';
  if v_framing = 'null'::jsonb then
    v_framing := null;
  elsif not public.is_valid_hero_media_framing_v2(v_framing) then
    raise exception 'invalid_hero_framing_payload' using errcode = '22023';
  end if;
  v_payload := p_payload - 'framing';
  case p_page
    when 'home' then v_home_result := public.save_home_section_v2(p_site_id, 'hero', p_expected_updated_at, v_payload);
    when 'bio' then perform public.save_bio_hero_v2(p_site_id, p_expected_updated_at, v_payload);
    when 'music' then perform public.save_music_hero_v2(p_site_id, p_expected_updated_at, v_payload);
    when 'gallery' then perform public.save_gallery_hero_v2(p_site_id, p_expected_updated_at, v_payload);
    when 'video' then perform public.save_showreel_hero_v2(p_site_id, p_expected_updated_at, v_payload);
    when 'booking' then perform public.save_contact_hero_v2(p_site_id, p_expected_updated_at, v_payload);
  end case;
  if p_page = 'home' then
    update public.home_page_config set hero_media_framing = v_framing where id = p_site_id returning updated_at into v_version;
  else
    update public.page_heroes set media_framing = v_framing where page_slug = p_page returning updated_at into v_version;
  end if;
  if not found then raise exception 'hero_framing_parent_missing' using errcode = '23503'; end if;
  if p_page = 'home' then
    return pg_catalog.jsonb_build_object(
      'canonicalSection', (v_home_result -> 'canonicalSection') || pg_catalog.jsonb_build_object('framing', v_framing),
      'versions', pg_catalog.jsonb_build_object('updatedAt', v_version));
  end if;
  return pg_catalog.jsonb_build_object('versions', pg_catalog.jsonb_build_object('updatedAt', v_version));
end; $$;

revoke all on function public.is_valid_hero_media_framing_v2(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.get_hero_editor_with_framing_v2(text, text) from public, anon, authenticated, service_role;
revoke all on function public.save_hero_with_framing_v2(text, text, timestamptz, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.get_hero_editor_with_framing_v2(text, text) to service_role;
grant execute on function public.save_hero_with_framing_v2(text, text, timestamptz, jsonb) to service_role;

comment on column public.page_heroes.media_framing is 'Optional per-placement desktop/mobile Hero framing. NULL retains legacy automatic rendering; never changes the original media file.';
comment on column public.home_page_config.hero_media_framing is 'HOME Hero framing independent of the legacy draft validator. NULL retains automatic rendering; old section saves preserve this setting.';
comment on function public.get_hero_editor_with_framing_v2(text, text) is 'Service-only complete V2 page snapshot with a locked, consistent Hero framing value. Success confirms 0046 capability.';
comment on function public.save_hero_with_framing_v2(text, text, timestamptz, jsonb) is 'Atomic Hero content and responsive framing save, preserving the old editor validation and CAS; returns the final parent-row version.';
commit;
