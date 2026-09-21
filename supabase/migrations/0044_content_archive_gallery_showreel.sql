-- Batch 13D.4: recoverable Gallery frames and the complete Showreel catalog.
-- Requires 0043, 0031 and 0032. Installs capabilities; archives no content and
-- never deletes files. HOME freelance-story rows remain outside Gallery.
begin;

do $$ begin
  if pg_catalog.to_regprocedure('public.mutate_bio_content_archive_v2(text,text,text,jsonb,uuid,timestamp with time zone)') is null
    or pg_catalog.to_regprocedure('public.save_gallery_frames_v2(text,jsonb,jsonb)') is null
    or pg_catalog.to_regprocedure('public.save_showreel_works_v2(text,jsonb,jsonb)') is null
    or not exists(select 1 from public.media_library_reference_registry_v2()
      where table_name = 'content_archive_v2' and columns = array['row_data'] and json_columns = array['row_data']) then
    raise exception 'visual_archive_requires_0043_0031_and_0032' using errcode = '55000';
  end if;
end; $$;

alter table public.content_archive_v2 drop constraint if exists content_archive_v2_collection_check;
alter table public.content_archive_v2 add constraint content_archive_v2_collection_check
  check (collection in ('navbar-shortcuts', 'music-platforms', 'music-soundcloud',
    'bio-portraits', 'bio-paragraphs', 'bio-credits', 'gallery-frames', 'showreel-works'));
-- Only historical Showreel keys receive the wider contract from 0032. Every
-- other collection retains its original strict identifier format.
alter table public.content_archive_v2 drop constraint if exists content_archive_v2_source_id_check;
alter table public.content_archive_v2 add constraint content_archive_v2_source_id_check check (
  (collection = 'showreel-works' and char_length(source_id) between 1 and 512
    and btrim(source_id) <> '' and source_id !~ '[[:cntrl:]]')
  or (collection <> 'showreel-works' and char_length(source_id) between 1 and 160
    and source_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$')
);
alter table public.content_archive_v2 enable row level security;
revoke all on table public.content_archive_v2 from public, anon, authenticated, service_role;

-- Archiving a historical 150-row catalog must not shrink its restore capacity
-- to 149, then 148, etc. This private high-water mark never stores content.
create table if not exists public.visual_content_archive_limits_v2 (
  collection text primary key check (collection = 'showreel'),
  active_limit integer not null check (active_limit >= 120)
);
alter table public.visual_content_archive_limits_v2 enable row level security;
revoke all on table public.visual_content_archive_limits_v2 from public, anon, authenticated, service_role;
insert into public.visual_content_archive_limits_v2 as existing(collection, active_limit)
  values('showreel', greatest(120, (select count(*)::integer from public.videos)))
  on conflict (collection) do update set active_limit = greatest(existing.active_limit, excluded.active_limit);

create or replace function public.guard_archived_visual_content_v2()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_collection text; begin
  v_collection := case tg_table_name when 'gallery_images' then 'gallery-frames' when 'videos' then 'showreel-works' end;
  if v_collection is null or tg_table_schema <> 'public' then
    raise exception 'invalid_visual_archive_guard_target' using errcode = '22023';
  end if;
  -- Also prohibit reusing an archived Gallery ID for a HOME story: the global
  -- primary key would otherwise make the archived frame impossible to restore.
  if exists(select 1 from public.content_archive_v2 archive
    where archive.collection = v_collection and archive.source_id = new.id) then
    raise exception 'visual_content_is_archived' using errcode = '23514';
  end if;
  return new;
end; $$;
drop trigger if exists archived_visual_content_guard_v2 on public.gallery_images;
create trigger archived_visual_content_guard_v2 before insert or update on public.gallery_images
for each row execute function public.guard_archived_visual_content_v2();
drop trigger if exists archived_visual_content_guard_v2 on public.videos;
create trigger archived_visual_content_guard_v2 before insert or update on public.videos
for each row execute function public.guard_archived_visual_content_v2();

create or replace function public.get_visual_content_archive_v2(p_collection text, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_collection text; v_result jsonb; v_limit integer; begin
  if p_collection is null or p_collection not in ('gallery', 'showreel')
    or p_offset is null or p_offset < 0 or p_offset > 1000000 or p_offset % 20 <> 0 then
    raise exception 'invalid_visual_archive_page' using errcode = '22023';
  end if;
  v_collection := case p_collection when 'gallery' then 'gallery-frames' else 'showreel-works' end;
  v_limit := case p_collection when 'gallery' then 120 else greatest(120,
    coalesce((select active_limit from public.visual_content_archive_limits_v2 where collection = 'showreel'), 120),
    (select count(*)::integer from public.videos)) end;
  select pg_catalog.jsonb_build_object(
    'items', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', item.source_id,
      'label', coalesce(nullif(pg_catalog.left(pg_catalog.btrim(item.row_data ->> 'title'), 220), ''), 'Untitled item'),
      'platform', case p_collection when 'gallery' then 'frame' else coalesce(nullif(pg_catalog.left(item.row_data ->> 'platform', 80), ''), 'video') end,
      'archivedAt', item.archived_at, 'updatedAt', item.updated_at
    ) order by item.archived_at desc, item.source_id)
      from (select source_id, row_data, archived_at, updated_at from public.content_archive_v2
        where collection = v_collection order by archived_at desc, source_id limit 20 offset p_offset) item), '[]'::jsonb),
    'total', (select count(*) from public.content_archive_v2 where collection = v_collection),
    'offset', p_offset, 'activeLimit', v_limit
  ) into v_result;
  return v_result;
end; $$;

create or replace function public.mutate_visual_content_archive_v2(
  p_collection text, p_operation text, p_item_id text, p_expected_versions jsonb, p_actor_id uuid,
  p_expected_archive_updated_at timestamptz default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_collection text; v_limit integer; v_current_count integer;
  v_expected jsonb; v_current jsonb; v_source jsonb; v_result text;
  v_archive public.content_archive_v2%rowtype;
  v_frame public.gallery_images%rowtype; v_work public.videos%rowtype;
  v_items jsonb; v_versions jsonb;
begin
  if p_collection is null or p_collection not in ('gallery', 'showreel')
    or p_operation is null or p_operation not in ('archive', 'restore')
    or p_item_id is null
    or (p_collection = 'gallery' and (char_length(p_item_id) not between 1 and 160 or p_item_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'))
    or (p_collection = 'showreel' and (char_length(p_item_id) not between 1 and 512 or btrim(p_item_id) = '' or p_item_id ~ '[[:cntrl:]]'))
    or pg_catalog.jsonb_typeof(p_expected_versions) is distinct from 'object'
    or p_actor_id is null
    or not exists(select 1 from public.admin_profiles where user_id = p_actor_id and is_active)
    or (p_operation = 'archive' and p_expected_archive_updated_at is not null)
    or (p_operation = 'restore' and (p_expected_archive_updated_at is null or not pg_catalog.isfinite(p_expected_archive_updated_at))) then
    raise exception 'invalid_visual_archive_mutation' using errcode = '22023';
  end if;
  if (select count(*) from pg_catalog.jsonb_object_keys(p_expected_versions)) <> 1
    or pg_catalog.jsonb_typeof(p_expected_versions -> 'items') is distinct from 'object' then
    raise exception 'invalid_visual_archive_mutation' using errcode = '22023';
  end if;
  v_expected := p_expected_versions -> 'items';
  if (select count(*) from pg_catalog.jsonb_object_keys(v_expected)) > 10000
    or (p_collection = 'gallery' and (select count(*) from pg_catalog.jsonb_object_keys(v_expected)) > 120)
    or exists(select 1 from pg_catalog.jsonb_each(v_expected) expected(id, version)
      where (p_collection = 'gallery' and (char_length(expected.id) not between 1 and 160 or expected.id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'))
        or (p_collection = 'showreel' and (char_length(expected.id) not between 1 and 512 or btrim(expected.id) = '' or expected.id ~ '[[:cntrl:]]'))
        or pg_catalog.jsonb_typeof(expected.version) is distinct from 'string'
        or char_length(v_expected ->> expected.id) not between 1 and 64) then
    raise exception 'invalid_visual_archive_mutation' using errcode = '22023';
  end if;
  begin
    if exists(select 1 from pg_catalog.jsonb_each_text(v_expected) expected(id, version)
      where not pg_catalog.isfinite(expected.version::timestamptz)) then raise invalid_datetime_format; end if;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'invalid_visual_archive_mutation' using errcode = '22023';
  end;

  v_collection := case p_collection when 'gallery' then 'gallery-frames' else 'showreel-works' end;
  -- Match the ordinary-save advisory lock. Then archive precedes Gallery or
  -- videos, matching the Media registry's alphabetical table-lock order.
  if p_collection = 'gallery' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('gallery_page_v2:frames:main', 0));
  else
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('showreel_page_v2:works:main', 0));
  end if;
  lock table public.content_archive_v2 in share row exclusive mode;
  if p_collection = 'gallery' then
    lock table public.gallery_images in share row exclusive mode;
    select coalesce(pg_catalog.jsonb_object_agg(id,pg_catalog.to_jsonb(updated_at)), '{}'::jsonb)
      into v_current from public.gallery_images where is_freelance_story = false;
    v_limit := 120;
  else
    lock table public.videos in share row exclusive mode;
    select coalesce(pg_catalog.jsonb_object_agg(id,pg_catalog.to_jsonb(updated_at)), '{}'::jsonb)
      into v_current from public.videos;
    v_limit := greatest(120, coalesce((select active_limit from public.visual_content_archive_limits_v2 where collection = 'showreel'), 120),
      (select count(*)::integer from public.videos));
    if v_limit > 10000 then
      raise exception 'visual_archive_catalog_too_large' using errcode = '22023';
    end if;
  end if;
  if (select count(*) from pg_catalog.jsonb_object_keys(v_current)) <> (select count(*) from pg_catalog.jsonb_object_keys(v_expected))
    or exists(select 1 from pg_catalog.jsonb_object_keys(v_current) item(id) where not (v_expected ? item.id))
    or exists(select 1 from pg_catalog.jsonb_object_keys(v_expected) item(id) where not (v_current ? item.id))
    or exists(select 1 from pg_catalog.jsonb_each_text(v_current) item(id, version)
      where item.version::timestamptz is distinct from (v_expected ->> item.id)::timestamptz) then
    return pg_catalog.jsonb_build_object('outcome', 'conflict');
  end if;
  v_current_count := (select count(*)::integer from pg_catalog.jsonb_object_keys(v_current));
  select * into v_archive from public.content_archive_v2
    where collection = v_collection and source_id = p_item_id for update;
  if p_operation = 'archive' then
    if found then return pg_catalog.jsonb_build_object('outcome', 'conflict'); end if;
    if p_collection = 'gallery' then
      select pg_catalog.to_jsonb(item) into v_source from public.gallery_images item
        where id = p_item_id and is_freelance_story = false for update;
    else
      select pg_catalog.to_jsonb(item) into v_source from public.videos item where id = p_item_id for update;
    end if;
    if v_source is null then return pg_catalog.jsonb_build_object('outcome', 'missing'); end if;
    insert into public.content_archive_v2(collection, source_id, row_data, archived_by)
      values(v_collection, p_item_id, v_source, p_actor_id);
    if p_collection = 'gallery' then
      delete from public.gallery_images where id = p_item_id and is_freelance_story = false;
    else
      delete from public.videos where id = p_item_id;
    end if;
    v_result := 'archived';
  else
    if not found then return pg_catalog.jsonb_build_object('outcome', 'missing'); end if;
    if v_archive.updated_at is distinct from p_expected_archive_updated_at then
      return pg_catalog.jsonb_build_object('outcome', 'conflict');
    end if;
    if v_current ? p_item_id or (p_collection = 'gallery' and exists(select 1 from public.gallery_images where id = p_item_id)) then
      return pg_catalog.jsonb_build_object('outcome', 'id_in_use');
    end if;
    if v_current_count >= v_limit then return pg_catalog.jsonb_build_object('outcome', 'capacity'); end if;
    if p_collection = 'gallery' then
      select * into v_frame from pg_catalog.jsonb_populate_record(null::public.gallery_images, v_archive.row_data);
      if v_frame.is_freelance_story is distinct from false then
        raise exception 'invalid_gallery_archive_ownership' using errcode = '23514';
      end if;
      v_frame.is_published := false;
      v_frame.updated_at := greatest(pg_catalog.clock_timestamp(), v_frame.updated_at + interval '1 microsecond', v_archive.updated_at + interval '1 microsecond');
      delete from public.content_archive_v2 where id = v_archive.id;
      insert into public.gallery_images select (v_frame).*;
    else
      select * into v_work from pg_catalog.jsonb_populate_record(null::public.videos, v_archive.row_data);
      -- 0032 permits only ONE featured flag across the whole catalog, including
      -- hidden legacy music videos. Do not silently erase that saved intent.
      if v_work.is_featured and exists(select 1 from public.videos where is_featured) then
        return pg_catalog.jsonb_build_object('outcome', 'featured_conflict');
      end if;
      v_work.is_published := false;
      v_work.updated_at := greatest(pg_catalog.clock_timestamp(), v_work.updated_at + interval '1 microsecond', v_archive.updated_at + interval '1 microsecond');
      delete from public.content_archive_v2 where id = v_archive.id;
      insert into public.videos select (v_work).*;
    end if;
    v_result := 'restored';
  end if;

  if p_collection = 'showreel' then
    insert into public.visual_content_archive_limits_v2 as existing(collection, active_limit)
      values('showreel', v_limit)
      on conflict (collection) do update set active_limit = greatest(existing.active_limit, excluded.active_limit);
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', item.id, 'title', item.title, 'description', item.description, 'embedUrl', item.embed_url,
      'platform', item.platform, 'thumbnailSrc', item.thumbnail_src, 'videoType', item.video_type,
      'isFeatured', item.is_featured, 'isPublished', item.is_published
    ) order by item.sort_order, item.id), '[]'::jsonb),
    coalesce(pg_catalog.jsonb_object_agg(item.id, pg_catalog.to_jsonb(item.updated_at)), '{}'::jsonb)
      into v_items, v_versions from public.videos item;
  else
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', item.id, 'title', item.title, 'src', item.src, 'alt', item.alt, 'caption', item.caption,
      'category', item.category, 'isMosaic', item.is_mosaic, 'isPublished', item.is_published
    ) order by item.sort_order, item.id), '[]'::jsonb),
    coalesce(pg_catalog.jsonb_object_agg(item.id, pg_catalog.to_jsonb(item.updated_at)), '{}'::jsonb)
      into v_items, v_versions from public.gallery_images item where is_freelance_story = false;
  end if;
  return pg_catalog.jsonb_build_object('outcome', v_result, 'collection', p_collection,
    'section', case p_collection when 'gallery' then 'frames' else 'works' end,
    'canonicalSection', pg_catalog.jsonb_build_object('items', v_items),
    'versions', pg_catalog.jsonb_build_object('items', v_versions),
    'archive', public.get_visual_content_archive_v2(p_collection, 0));
exception when deadlock_detected then
  raise exception 'visual_archive_changed_retry' using errcode = '40001';
end; $$;

revoke all on function public.guard_archived_visual_content_v2() from public, anon, authenticated, service_role;
revoke all on function public.get_visual_content_archive_v2(text,integer) from public, anon, authenticated, service_role;
revoke all on function public.mutate_visual_content_archive_v2(text,text,text,jsonb,uuid,timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.get_visual_content_archive_v2(text,integer) to service_role;
grant execute on function public.mutate_visual_content_archive_v2(text,text,text,jsonb,uuid,timestamptz) to service_role;
comment on table public.content_archive_v2 is
  'Private recoverable Navbar, Music, BIO, Gallery and Showreel content. Not file Trash; archived Media references remain protected.';
comment on table public.visual_content_archive_limits_v2 is
  'Private nondecreasing historical Showreel capacity, so archiving never reduces restoration capacity.';
comment on function public.mutate_visual_content_archive_v2(text,text,text,jsonb,uuid,timestamptz) is
  'Service-only active-admin complete-catalog CAS archive and hidden original-order restore. Excludes HOME stories; preserves historical Showreel IDs/capacity and refuses featured conflicts.';
commit;
