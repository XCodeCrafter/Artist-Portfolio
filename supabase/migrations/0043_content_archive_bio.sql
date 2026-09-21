-- Batch 13D.3: recoverable BIO portraits, paragraphs and acting credits.
-- Requires 0042 and 0030. Deployment changes capabilities, never content.
-- Archived rows keep their Media references; this migration never deletes files.
begin;

do $$ begin
  if pg_catalog.to_regclass('public.content_archive_v2') is null
    or pg_catalog.to_regprocedure('public.mutate_music_content_archive_v2(text,text,text,jsonb,uuid,timestamp with time zone,timestamp with time zone)') is null
    or pg_catalog.to_regprocedure('public.save_bio_biography_v2(text,timestamp with time zone,jsonb,jsonb,jsonb)') is null
    or pg_catalog.to_regprocedure('public.save_bio_credits_v2(text,jsonb,jsonb)') is null
    or not exists(select 1 from public.media_library_reference_registry_v2()
      where table_name = 'content_archive_v2' and columns = array['row_data'] and json_columns = array['row_data']) then
    raise exception 'bio_archive_requires_0042_and_0030' using errcode = '55000';
  end if;
end; $$;

alter table public.content_archive_v2 drop constraint if exists content_archive_v2_collection_check;
alter table public.content_archive_v2 add constraint content_archive_v2_collection_check
  check (collection in ('navbar-shortcuts', 'music-platforms', 'music-soundcloud', 'bio-portraits', 'bio-paragraphs', 'bio-credits'));
alter table public.content_archive_v2 enable row level security;
revoke all on table public.content_archive_v2 from public, anon, authenticated, service_role;

create or replace function public.guard_archived_bio_content_v2()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_collection text; begin
  v_collection := case tg_table_name
    when 'bio_gallery_images' then 'bio-portraits'
    when 'bio_paragraphs' then 'bio-paragraphs'
    when 'actor_credits' then 'bio-credits' end;
  if v_collection is null or tg_table_schema <> 'public' then
    raise exception 'invalid_bio_archive_guard_target' using errcode = '22023';
  end if;
  if exists(select 1 from public.content_archive_v2 archive
    where archive.collection = v_collection and archive.source_id = new.id) then
    raise exception 'bio_content_is_archived' using errcode = '23514';
  end if;
  return new;
end; $$;
drop trigger if exists archived_bio_content_guard_v2 on public.bio_gallery_images;
create trigger archived_bio_content_guard_v2 before insert or update on public.bio_gallery_images
for each row execute function public.guard_archived_bio_content_v2();
drop trigger if exists archived_bio_content_guard_v2 on public.bio_paragraphs;
create trigger archived_bio_content_guard_v2 before insert or update on public.bio_paragraphs
for each row execute function public.guard_archived_bio_content_v2();
drop trigger if exists archived_bio_content_guard_v2 on public.actor_credits;
create trigger archived_bio_content_guard_v2 before insert or update on public.actor_credits
for each row execute function public.guard_archived_bio_content_v2();

create or replace function public.get_bio_content_archive_v2(p_collection text, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_collection text; v_result jsonb; begin
  if p_collection is null or p_collection not in ('portraits', 'paragraphs', 'credits')
    or p_offset is null or p_offset < 0 or p_offset > 1000000 or p_offset % 20 <> 0 then
    raise exception 'invalid_bio_archive_page' using errcode = '22023';
  end if;
  v_collection := 'bio-' || p_collection;
  select pg_catalog.jsonb_build_object(
    'items', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', item.source_id,
      'label', case p_collection
        when 'portraits' then pg_catalog.left(coalesce(nullif(pg_catalog.btrim(item.row_data ->> 'alt'), ''), 'Untitled portrait'), 220)
        when 'paragraphs' then coalesce(nullif(pg_catalog.left(pg_catalog.regexp_replace(pg_catalog.btrim(item.row_data ->> 'body'), '[[:space:]]+', ' ', 'g'), 120), ''), 'Untitled paragraph')
        else pg_catalog.left(item.row_data ->> 'title', 220) end,
      'platform', case p_collection when 'portraits' then 'portrait' when 'paragraphs' then 'paragraph' else item.row_data ->> 'credit_type' end,
      'archivedAt', item.archived_at, 'updatedAt', item.updated_at
    ) order by item.archived_at desc, item.source_id)
      from (select source_id, row_data, archived_at, updated_at from public.content_archive_v2
        where collection = v_collection order by archived_at desc, source_id limit 20 offset p_offset) item), '[]'::jsonb),
    'total', (select count(*) from public.content_archive_v2 where collection = v_collection),
    'offset', p_offset
  ) into v_result;
  return v_result;
end; $$;

create or replace function public.mutate_bio_content_archive_v2(
  p_collection text, p_operation text, p_item_id text, p_expected_versions jsonb, p_actor_id uuid,
  p_expected_archive_updated_at timestamptz default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_collection text; v_table text; v_limit integer; v_current_count integer;
  v_tables text[]; v_keys text[]; v_limits integer[]; v_index integer;
  v_expected jsonb; v_current jsonb; v_current_versions jsonb;
  v_profile public.bio_profile%rowtype; v_profile_version timestamptz;
  v_source jsonb; v_archive public.content_archive_v2%rowtype;
  v_portrait public.bio_gallery_images%rowtype; v_paragraph public.bio_paragraphs%rowtype; v_credit public.actor_credits%rowtype;
  v_gallery jsonb; v_paragraphs jsonb; v_items jsonb; v_versions jsonb; v_canonical jsonb; v_result text;
begin
  if p_collection is null or p_collection not in ('portraits', 'paragraphs', 'credits')
    or p_operation is null or p_operation not in ('archive', 'restore')
    or p_item_id is null or char_length(p_item_id) not between 1 and 160
    or p_item_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
    or pg_catalog.jsonb_typeof(p_expected_versions) is distinct from 'object'
    or p_actor_id is null
    or not exists(select 1 from public.admin_profiles where user_id = p_actor_id and is_active)
    or (p_operation = 'archive' and p_expected_archive_updated_at is not null)
    or (p_operation = 'restore' and p_expected_archive_updated_at is null) then
    raise exception 'invalid_bio_archive_mutation' using errcode = '22023';
  end if;
  v_collection := 'bio-' || p_collection;
  v_table := case p_collection when 'portraits' then 'bio_gallery_images' when 'paragraphs' then 'bio_paragraphs' else 'actor_credits' end;
  v_limit := case p_collection when 'portraits' then 32 when 'paragraphs' then 50 else 100 end;
  if p_collection = 'credits' then
    if (select count(*) from pg_catalog.jsonb_object_keys(p_expected_versions)) <> 1
      or not (p_expected_versions ? 'items') then
      raise exception 'invalid_bio_archive_mutation' using errcode = '22023';
    end if;
    v_tables := array['actor_credits']; v_keys := array['items']; v_limits := array[100];
  else
    if (select count(*) from pg_catalog.jsonb_object_keys(p_expected_versions)) <> 3
      or not (p_expected_versions ?& array['profileUpdatedAt', 'galleryItems', 'paragraphItems'])
      or pg_catalog.jsonb_typeof(p_expected_versions -> 'profileUpdatedAt') is distinct from 'string'
      or char_length(p_expected_versions ->> 'profileUpdatedAt') not between 1 and 64 then
      raise exception 'invalid_bio_archive_mutation' using errcode = '22023';
    end if;
    begin
      v_profile_version := (p_expected_versions ->> 'profileUpdatedAt')::timestamptz;
      if not pg_catalog.isfinite(v_profile_version) then raise invalid_datetime_format; end if;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception 'invalid_bio_archive_mutation' using errcode = '22023';
    end;
    v_tables := array['bio_gallery_images', 'bio_paragraphs'];
    v_keys := array['galleryItems', 'paragraphItems']; v_limits := array[32, 50];
  end if;
  -- Validate every nested map before taking locks. No unexpected root keys,
  -- array-shaped maps, unbounded IDs, infinite timestamps or hidden omissions.
  for v_index in 1..pg_catalog.array_length(v_keys, 1) loop
    v_expected := p_expected_versions -> v_keys[v_index];
    if pg_catalog.jsonb_typeof(v_expected) is distinct from 'object' then
      raise exception 'invalid_bio_archive_mutation' using errcode = '22023';
    end if;
    if (select count(*) from pg_catalog.jsonb_object_keys(v_expected)) > v_limits[v_index]
      or exists(select 1 from pg_catalog.jsonb_each(v_expected) expected(id, version)
        where char_length(expected.id) not between 1 and 160
          or expected.id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
          or pg_catalog.jsonb_typeof(expected.version) is distinct from 'string'
          or char_length(v_expected ->> expected.id) not between 1 and 64) then
      raise exception 'invalid_bio_archive_mutation' using errcode = '22023';
    end if;
    begin
      if exists(select 1 from pg_catalog.jsonb_each_text(v_expected) expected(id, version)
        where not pg_catalog.isfinite(expected.version::timestamptz)) then raise invalid_datetime_format; end if;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception 'invalid_bio_archive_mutation' using errcode = '22023';
    end;
  end loop;

  -- Exact existing save locks. BIO source tables precede archive in the Media
  -- registry's alphabetical lock order. Biography always locks BOTH siblings.
  if p_collection = 'credits' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('bio_page_v2:credits:main', 0));
    lock table public.actor_credits in share row exclusive mode;
  else
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('bio_page_v2:biography:main', 0));
    lock table public.bio_gallery_images in share row exclusive mode;
    lock table public.bio_paragraphs in share row exclusive mode;
    select * into v_profile from public.bio_profile where id = 'main' for update;
    if not found then raise exception 'bio_profile_missing' using errcode = '23503'; end if;
    if v_profile.updated_at is distinct from v_profile_version then
      return pg_catalog.jsonb_build_object('outcome', 'conflict');
    end if;
  end if;
  lock table public.content_archive_v2 in share row exclusive mode;
  for v_index in 1..pg_catalog.array_length(v_keys, 1) loop
    -- Only static allowlisted table identifiers reach %I; user data is bound.
    execute pg_catalog.format('select coalesce(jsonb_object_agg(id,to_jsonb(updated_at)),''{}''::jsonb) from public.%I', v_tables[v_index]) into v_current;
    v_expected := p_expected_versions -> v_keys[v_index];
    if (select count(*) from pg_catalog.jsonb_object_keys(v_current)) <> (select count(*) from pg_catalog.jsonb_object_keys(v_expected))
      or exists(select 1 from pg_catalog.jsonb_object_keys(v_current) item(id) where not (v_expected ? item.id))
      or exists(select 1 from pg_catalog.jsonb_object_keys(v_expected) item(id) where not (v_current ? item.id))
      or exists(select 1 from pg_catalog.jsonb_each_text(v_current) item(id, version)
        where item.version::timestamptz is distinct from (v_expected ->> item.id)::timestamptz) then
      return pg_catalog.jsonb_build_object('outcome', 'conflict');
    end if;
    if v_tables[v_index] = v_table then v_current_versions := v_current; end if;
  end loop;
  v_current_count := (select count(*)::integer from pg_catalog.jsonb_object_keys(v_current_versions));
  select * into v_archive from public.content_archive_v2
    where collection = v_collection and source_id = p_item_id for update;
  if p_operation = 'archive' then
    if found then return pg_catalog.jsonb_build_object('outcome', 'conflict'); end if;
    execute pg_catalog.format('select to_jsonb(item) from public.%I item where id=$1 for update', v_table) into v_source using p_item_id;
    if v_source is null then return pg_catalog.jsonb_build_object('outcome', 'missing'); end if;
    insert into public.content_archive_v2(collection, source_id, row_data, archived_by)
      values(v_collection, p_item_id, v_source, p_actor_id);
    execute pg_catalog.format('delete from public.%I where id=$1', v_table) using p_item_id;
    v_result := 'archived';
  else
    if not found then return pg_catalog.jsonb_build_object('outcome', 'missing'); end if;
    if v_archive.updated_at is distinct from p_expected_archive_updated_at then
      return pg_catalog.jsonb_build_object('outcome', 'conflict');
    end if;
    if v_current_versions ? p_item_id then return pg_catalog.jsonb_build_object('outcome', 'id_in_use'); end if;
    if v_current_count >= v_limit then return pg_catalog.jsonb_build_object('outcome', 'capacity'); end if;
    -- Preserve every original field/order while forcing hidden and strictly
    -- advancing the version even in one transaction (no archive/restore ABA).
    if p_collection = 'portraits' then
      select * into v_portrait from pg_catalog.jsonb_populate_record(null::public.bio_gallery_images, v_archive.row_data);
      v_portrait.is_published := false;
      v_portrait.updated_at := greatest(pg_catalog.clock_timestamp(), v_portrait.updated_at + interval '1 microsecond', v_archive.updated_at + interval '1 microsecond');
      delete from public.content_archive_v2 where id = v_archive.id;
      insert into public.bio_gallery_images select (v_portrait).*;
    elsif p_collection = 'paragraphs' then
      select * into v_paragraph from pg_catalog.jsonb_populate_record(null::public.bio_paragraphs, v_archive.row_data);
      v_paragraph.is_published := false;
      v_paragraph.updated_at := greatest(pg_catalog.clock_timestamp(), v_paragraph.updated_at + interval '1 microsecond', v_archive.updated_at + interval '1 microsecond');
      delete from public.content_archive_v2 where id = v_archive.id;
      insert into public.bio_paragraphs select (v_paragraph).*;
    else
      select * into v_credit from pg_catalog.jsonb_populate_record(null::public.actor_credits, v_archive.row_data);
      v_credit.is_published := false;
      v_credit.updated_at := greatest(pg_catalog.clock_timestamp(), v_credit.updated_at + interval '1 microsecond', v_archive.updated_at + interval '1 microsecond');
      delete from public.content_archive_v2 where id = v_archive.id;
      insert into public.actor_credits select (v_credit).*;
    end if;
    v_result := 'restored';
  end if;

  -- Return the complete confirmed save boundary; no unrelated Hero/Resume
  -- singleton dependency and no writes to profile text or its timestamp.
  if p_collection = 'credits' then
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', item.id, 'creditType', item.credit_type, 'title', item.title, 'role', item.role,
      'production', item.production, 'director', item.director, 'year', item.year,
      'href', item.href, 'isPublished', item.is_published
    ) order by item.sort_order, item.id), '[]'::jsonb),
    coalesce(pg_catalog.jsonb_object_agg(item.id, pg_catalog.to_jsonb(item.updated_at)), '{}'::jsonb)
      into v_items, v_current_versions from public.actor_credits item;
    v_canonical := pg_catalog.jsonb_build_object('items', v_items);
    v_versions := pg_catalog.jsonb_build_object('items', v_current_versions);
  else
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', item.id, 'src', item.src, 'alt', item.alt, 'isPublished', item.is_published
    ) order by item.sort_order, item.id), '[]'::jsonb),
    coalesce(pg_catalog.jsonb_object_agg(item.id, pg_catalog.to_jsonb(item.updated_at)), '{}'::jsonb)
      into v_gallery, v_current_versions from public.bio_gallery_images item;
    v_versions := pg_catalog.jsonb_build_object('profileUpdatedAt', v_profile.updated_at, 'galleryItems', v_current_versions);
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', item.id, 'body', item.body, 'revealDelay', item.reveal_delay, 'isPublished', item.is_published
    ) order by item.sort_order, item.id), '[]'::jsonb),
    coalesce(pg_catalog.jsonb_object_agg(item.id, pg_catalog.to_jsonb(item.updated_at)), '{}'::jsonb)
      into v_paragraphs, v_current_versions from public.bio_paragraphs item;
    v_versions := v_versions || pg_catalog.jsonb_build_object('paragraphItems', v_current_versions);
    v_canonical := pg_catalog.jsonb_build_object('topLabel', v_profile.top_label, 'introText', v_profile.intro_text,
      'caption', v_profile.caption, 'galleryImages', v_gallery, 'paragraphs', v_paragraphs);
  end if;
  return pg_catalog.jsonb_build_object('outcome', v_result, 'collection', p_collection,
    'section', case when p_collection = 'credits' then 'credits' else 'biography' end,
    'canonicalSection', v_canonical, 'versions', v_versions,
    'archive', public.get_bio_content_archive_v2(p_collection, 0));
exception when deadlock_detected then
  raise exception 'bio_archive_changed_retry' using errcode = '40001';
end; $$;

revoke all on function public.guard_archived_bio_content_v2() from public, anon, authenticated, service_role;
revoke all on function public.get_bio_content_archive_v2(text,integer) from public, anon, authenticated, service_role;
revoke all on function public.mutate_bio_content_archive_v2(text,text,text,jsonb,uuid,timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.get_bio_content_archive_v2(text,integer) to service_role;
grant execute on function public.mutate_bio_content_archive_v2(text,text,text,jsonb,uuid,timestamptz) to service_role;
comment on table public.content_archive_v2 is
  'Private recoverable Navbar, Music and BIO content. Not file Trash; archived Media references remain protected.';
comment on function public.mutate_bio_content_archive_v2(text,text,text,jsonb,uuid,timestamptz) is
  'Service-only active-admin whole-save-boundary CAS archive / hidden restore; Biography includes profile and both sibling collections, without editing the parent or deleting files.';
commit;
