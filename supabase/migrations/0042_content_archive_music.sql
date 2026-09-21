-- Batch 13D.2: recoverable Music platforms and SoundCloud rows.
-- Requires 0041. Installs capabilities only: no existing content is moved,
-- published, rewritten or deleted. Storage objects are never deleted here.
begin;

do $$ begin
  if pg_catalog.to_regclass('public.content_archive_v2') is null
    or pg_catalog.to_regprocedure('public.mutate_navbar_shortcut_archive_v2(text,text,jsonb,uuid,timestamp with time zone)') is null
    or pg_catalog.to_regprocedure('public.save_music_platforms_v2(text,jsonb,jsonb)') is null
    or pg_catalog.to_regprocedure('public.save_music_soundcloud_v2(text,timestamp with time zone,jsonb,jsonb)') is null
    or not exists(select 1 from public.media_library_reference_registry_v2()
      where table_name = 'content_archive_v2' and columns = array['row_data'] and json_columns = array['row_data']) then
    raise exception 'music_archive_requires_0041' using errcode = '55000';
  end if;
end; $$;

-- Replace only the known pilot allowlist; retain its identity, RLS and media
-- guards. A rerun changes no archived payloads or existing active rows.
alter table public.content_archive_v2 drop constraint if exists content_archive_v2_collection_check;
alter table public.content_archive_v2 add constraint content_archive_v2_collection_check
  check (collection in ('navbar-shortcuts', 'music-platforms', 'music-soundcloud'));
alter table public.content_archive_v2 enable row level security;
revoke all on table public.content_archive_v2 from public, anon, authenticated, service_role;

create or replace function public.guard_archived_music_content_v2()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_collection text; begin
  v_collection := case tg_table_name
    when 'music_platform_links' then 'music-platforms'
    when 'soundcloud_tracks' then 'music-soundcloud' end;
  if v_collection is null or tg_table_schema <> 'public' then
    raise exception 'invalid_music_archive_guard_target' using errcode = '22023';
  end if;
  if exists(select 1 from public.content_archive_v2 archive
    where archive.collection = v_collection and archive.source_id = new.id) then
    raise exception 'music_content_is_archived' using errcode = '23514';
  end if;
  return new;
end; $$;
drop trigger if exists archived_music_content_guard_v2 on public.music_platform_links;
create trigger archived_music_content_guard_v2 before insert or update on public.music_platform_links
for each row execute function public.guard_archived_music_content_v2();
drop trigger if exists archived_music_content_guard_v2 on public.soundcloud_tracks;
create trigger archived_music_content_guard_v2 before insert or update on public.soundcloud_tracks
for each row execute function public.guard_archived_music_content_v2();

create or replace function public.get_music_content_archive_v2(p_section text, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_collection text; v_result jsonb; begin
  if p_section is null or p_section not in ('platforms', 'soundcloud')
    or p_offset is null or p_offset < 0 or p_offset > 1000000 or p_offset % 20 <> 0 then
    raise exception 'invalid_music_archive_page' using errcode = '22023';
  end if;
  v_collection := case p_section when 'platforms' then 'music-platforms' else 'music-soundcloud' end;
  select pg_catalog.jsonb_build_object(
    'items', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', item.source_id,
      'label', case when p_section = 'soundcloud' then coalesce(nullif(pg_catalog.btrim(item.row_data ->> 'title'), ''), 'Untitled mix') else item.row_data ->> 'title' end,
      'platform', case when p_section = 'soundcloud' then 'soundcloud' else item.row_data ->> 'icon_key' end,
      'archivedAt', item.archived_at, 'updatedAt', item.updated_at
    ) order by item.archived_at desc, item.source_id)
      from (select source_id, row_data, archived_at, updated_at from public.content_archive_v2
        where collection = v_collection order by archived_at desc, source_id limit 20 offset p_offset) item), '[]'::jsonb),
    'total', (select count(*) from public.content_archive_v2 where collection = v_collection),
    'offset', p_offset
  ) into v_result;
  return v_result;
end; $$;

create or replace function public.mutate_music_content_archive_v2(
  p_section text, p_operation text, p_item_id text, p_expected_versions jsonb, p_actor_id uuid,
  p_expected_presentation_updated_at timestamptz default null,
  p_expected_archive_updated_at timestamptz default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_collection text; v_table text; v_limit integer; v_current_count integer;
  v_source jsonb; v_archive public.content_archive_v2%rowtype;
  v_platform public.music_platform_links%rowtype; v_track public.soundcloud_tracks%rowtype;
  v_presentation public.music_presentation%rowtype;
  v_current_versions jsonb; v_items jsonb; v_versions jsonb; v_canonical jsonb; v_result text;
begin
  if p_section is null or p_section not in ('platforms', 'soundcloud')
    or p_operation is null or p_operation not in ('archive', 'restore')
    or p_item_id is null or char_length(p_item_id) not between 1 and 160
    or p_item_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
    or pg_catalog.jsonb_typeof(p_expected_versions) is distinct from 'object'
    or p_actor_id is null
    or not exists(select 1 from public.admin_profiles where user_id = p_actor_id and is_active)
    or (p_section = 'platforms' and p_expected_presentation_updated_at is not null)
    or (p_section = 'soundcloud' and p_expected_presentation_updated_at is null)
    or (p_operation = 'archive' and p_expected_archive_updated_at is not null)
    or (p_operation = 'restore' and p_expected_archive_updated_at is null) then
    raise exception 'invalid_music_archive_mutation' using errcode = '22023';
  end if;
  v_collection := case p_section when 'platforms' then 'music-platforms' else 'music-soundcloud' end;
  v_table := case p_section when 'platforms' then 'music_platform_links' else 'soundcloud_tracks' end;
  v_limit := case p_section when 'platforms' then 32 else 48 end;
  if (select count(*) from pg_catalog.jsonb_object_keys(p_expected_versions)) > v_limit
    or exists(select 1 from pg_catalog.jsonb_each(p_expected_versions) expected(id, version)
      where char_length(expected.id) not between 1 and 160
        or expected.id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
        or pg_catalog.jsonb_typeof(expected.version) is distinct from 'string'
        or char_length(p_expected_versions ->> expected.id) not between 1 and 64) then
    raise exception 'invalid_music_archive_mutation' using errcode = '22023';
  end if;

  -- Exact save locks, then the alphabetic Media-registry table order. The
  -- shared SoundCloud/Spotify parent is locked only after its source table,
  -- matching save_music_soundcloud_v2. Its heading and timestamp are NOT edited.
  if p_section = 'platforms' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('music_page_v2:platforms:main', 0));
  else
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('music_page_v2:soundcloud:main', 0));
  end if;
  lock table public.content_archive_v2 in share row exclusive mode;
  if p_section = 'platforms' then
    lock table public.music_platform_links in share row exclusive mode;
  else
    lock table public.soundcloud_tracks in share row exclusive mode;
    select * into v_presentation from public.music_presentation where id = 'main' for update;
    if not found then raise exception 'music_presentation_missing' using errcode = '23503'; end if;
    if v_presentation.updated_at is distinct from p_expected_presentation_updated_at then
      return pg_catalog.jsonb_build_object('outcome', 'conflict');
    end if;
  end if;
  -- Only allowlisted identifiers reach format(%I). Values remain parameters.
  execute pg_catalog.format('select count(*)::integer, coalesce(jsonb_object_agg(id,to_jsonb(updated_at)),''{}''::jsonb) from public.%I', v_table)
    into v_current_count, v_current_versions;
  if v_current_count <> (select count(*) from pg_catalog.jsonb_object_keys(p_expected_versions))
    or exists(select 1 from pg_catalog.jsonb_object_keys(v_current_versions) current_item(id)
      where not (p_expected_versions ? current_item.id))
    or exists(select 1 from pg_catalog.jsonb_object_keys(p_expected_versions) expected(id)
      where not (v_current_versions ? expected.id)) then
    return pg_catalog.jsonb_build_object('outcome', 'conflict');
  end if;
  begin
    if exists(select 1 from pg_catalog.jsonb_each_text(v_current_versions) current_item(id, version)
      where current_item.version::timestamptz is distinct from (p_expected_versions ->> current_item.id)::timestamptz) then
      return pg_catalog.jsonb_build_object('outcome', 'conflict');
    end if;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'invalid_music_archive_mutation' using errcode = '22023';
  end;
  select * into v_archive from public.content_archive_v2
    where collection = v_collection and source_id = p_item_id for update;
  if p_operation = 'archive' then
    if found then return pg_catalog.jsonb_build_object('outcome', 'conflict'); end if;
    execute pg_catalog.format('select to_jsonb(item) from public.%I item where id=$1 for update', v_table)
      into v_source using p_item_id;
    if v_source is null then return pg_catalog.jsonb_build_object('outcome', 'missing'); end if;
    insert into public.content_archive_v2 (collection, source_id, row_data, archived_by)
      values (v_collection, p_item_id, v_source, p_actor_id);
    execute pg_catalog.format('delete from public.%I where id=$1', v_table) using p_item_id;
    v_result := 'archived';
  else
    if not found then return pg_catalog.jsonb_build_object('outcome', 'missing'); end if;
    if v_archive.updated_at is distinct from p_expected_archive_updated_at then
      return pg_catalog.jsonb_build_object('outcome', 'conflict');
    end if;
    if v_current_versions ? p_item_id then return pg_catalog.jsonb_build_object('outcome', 'id_in_use'); end if;
    if v_current_count >= v_limit then return pg_catalog.jsonb_build_object('outcome', 'capacity'); end if;
    -- Keep every original field, including order, but never publish a restore.
    -- A strictly newer timestamp prevents pre-archive ABA snapshots reviving.
    if p_section = 'platforms' then
      select * into v_platform from pg_catalog.jsonb_populate_record(null::public.music_platform_links, v_archive.row_data);
      v_platform.is_published := false;
      v_platform.updated_at := greatest(pg_catalog.clock_timestamp(),
        v_platform.updated_at + interval '1 microsecond', v_archive.updated_at + interval '1 microsecond');
      delete from public.content_archive_v2 where id = v_archive.id;
      insert into public.music_platform_links select (v_platform).*;
    else
      select * into v_track from pg_catalog.jsonb_populate_record(null::public.soundcloud_tracks, v_archive.row_data);
      v_track.is_published := false;
      v_track.updated_at := greatest(pg_catalog.clock_timestamp(),
        v_track.updated_at + interval '1 microsecond', v_archive.updated_at + interval '1 microsecond');
      delete from public.content_archive_v2 where id = v_archive.id;
      insert into public.soundcloud_tracks select (v_track).*;
    end if;
    v_result := 'restored';
  end if;
  -- Build a confirmed canonical section while all source and parent locks are
  -- held, without depending on unrelated Hero or Settings singleton content.
  if p_section = 'platforms' then
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', item.id, 'title', item.title, 'label', item.label, 'href', item.href,
      'imageSrc', item.image_src, 'iconKey', item.icon_key, 'isPublished', item.is_published
    ) order by item.sort_order, item.id), '[]'::jsonb),
    coalesce(pg_catalog.jsonb_object_agg(item.id, pg_catalog.to_jsonb(item.updated_at)), '{}'::jsonb)
      into v_items, v_current_versions from public.music_platform_links item;
    v_canonical := pg_catalog.jsonb_build_object('items', v_items);
    v_versions := pg_catalog.jsonb_build_object('items', v_current_versions);
  else
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', item.id, 'title', item.title, 'embedUrl', item.embed_url, 'isPublished', item.is_published
    ) order by item.sort_order, item.id), '[]'::jsonb),
    coalesce(pg_catalog.jsonb_object_agg(item.id, pg_catalog.to_jsonb(item.updated_at)), '{}'::jsonb)
      into v_items, v_current_versions from public.soundcloud_tracks item;
    v_canonical := pg_catalog.jsonb_build_object('mixesHeading', v_presentation.mixes_heading, 'items', v_items);
    v_versions := pg_catalog.jsonb_build_object('presentationUpdatedAt', v_presentation.updated_at, 'items', v_current_versions);
  end if;
  return pg_catalog.jsonb_build_object('outcome', v_result, 'section', p_section,
    'canonicalSection', v_canonical, 'versions', v_versions,
    'archive', public.get_music_content_archive_v2(p_section, 0));
exception when deadlock_detected then
  raise exception 'music_archive_changed_retry' using errcode = '40001';
end; $$;

revoke all on function public.guard_archived_music_content_v2() from public, anon, authenticated, service_role;
revoke all on function public.get_music_content_archive_v2(text,integer) from public, anon, authenticated, service_role;
revoke all on function public.mutate_music_content_archive_v2(text,text,text,jsonb,uuid,timestamptz,timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.get_music_content_archive_v2(text,integer) to service_role;
grant execute on function public.mutate_music_content_archive_v2(text,text,text,jsonb,uuid,timestamptz,timestamptz) to service_role;
comment on table public.content_archive_v2 is
  'Private recoverable Navbar shortcuts, Music platforms and SoundCloud content. Not file Trash; archived media references remain protected.';
comment on function public.mutate_music_content_archive_v2(text,text,text,jsonb,uuid,timestamptz,timestamptz) is
  'Service-only active-admin whole-collection CAS archive / hidden restore, with shared SoundCloud presentation CAS and no storage deletion.';
commit;
