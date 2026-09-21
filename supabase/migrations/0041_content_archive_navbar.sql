-- Batch 13D.1: recoverable CONTENT archive, initially Navbar shortcuts only.
-- Requires 0029 and 0040. This installs capabilities; it archives no existing
-- content and never deletes a storage object. Safe to rerun after verification.
begin;

do $$ begin
  if pg_catalog.to_regprocedure('public.get_navbar_social_links_v2_snapshot(text)') is null
    or pg_catalog.to_regprocedure('public.save_navbar_social_links_v2(text,jsonb,jsonb)') is null
    or pg_catalog.to_regprocedure('public.media_library_reference_registry_v2()') is null
    or pg_catalog.to_regprocedure('public.guard_media_library_references_v2()') is null
    or pg_catalog.to_regprocedure('public.mutate_media_asset_v2(text,timestamp with time zone,uuid,text,text,timestamp with time zone)') is null then
    raise exception 'content_archive_requires_0029_and_0040' using errcode = '55000';
  end if;
end; $$;

create table if not exists public.content_archive_v2 (
  id uuid primary key default gen_random_uuid(),
  collection text not null check (collection = 'navbar-shortcuts'),
  source_id text not null check (char_length(source_id) between 1 and 160 and source_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
  row_data jsonb not null check (jsonb_typeof(row_data) = 'object' and row_data ? 'id'
    and jsonb_typeof(row_data -> 'id') = 'string' and row_data ->> 'id' = source_id),
  archived_at timestamptz not null default pg_catalog.clock_timestamp(),
  archived_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (collection, source_id)
);
create index if not exists content_archive_v2_page_order on public.content_archive_v2 (collection, archived_at desc, source_id);
alter table public.content_archive_v2 enable row level security;
-- Even service_role receives no direct table access. The two narrow RPCs below
-- own this lifecycle; archived row JSON is not exposed by the read RPC.
revoke all on table public.content_archive_v2 from public, anon, authenticated, service_role;

-- The registry drives 0040 usage, replacement, write guards and lock ordering.
-- Include archived row JSON so its files remain protected and a replacement
-- also updates recoverable content. No separate URL registry can drift apart.
create or replace function public.media_library_reference_registry_v2()
returns table(table_name text, reference_label text, columns text[], json_columns text[])
language sql immutable security definer set search_path = '' as $$
  values
    ('about_home', 'Home about (Classic)', array['image_src','cta_href'], '{}'::text[]),
    ('actor_credits', 'Bio credit link', array['href'], '{}'::text[]),
    ('actor_resume', 'Bio resume download', array['resume_url'], '{}'::text[]),
    ('bio_gallery_images', 'Bio gallery', array['src'], '{}'::text[]),
    ('content_archive_v2', 'Archived content', array['row_data'], array['row_data']),
    ('gallery_images', 'Gallery', array['src'], '{}'::text[]),
    ('gallery_presentation', 'Gallery presentation', array['interlude_video_src','interlude_poster_src'], '{}'::text[]),
    ('home_page_config', 'Home V2 (including hidden sections)', array['draft'], array['draft']),
    ('home_updates', 'Home update (Classic)', array['avatar_src','href'], '{}'::text[]),
    ('media_assets', 'Saved media presentation', array['metadata'], array['metadata']),
    ('music_platform_links', 'Music platform', array['image_src','href'], '{}'::text[]),
    ('page_heroes', 'Page hero / button', array['background_src','poster_src','cta_href'], '{}'::text[]),
    ('site_settings', 'Site music / footer link', array['spotify_artist_url','spotify_embed_url','footer_content'], array['footer_content']),
    ('social_links', 'Navbar / social link', array['href'], '{}'::text[]),
    ('soundcloud_tracks', 'SoundCloud track', array['embed_url'], '{}'::text[]),
    ('videos', 'Showreel / video', array['thumbnail_src','embed_url'], '{}'::text[]);
$$;

drop trigger if exists zz_media_library_reference_guard_v2 on public.content_archive_v2;
create trigger zz_media_library_reference_guard_v2 before insert or update on public.content_archive_v2
for each row execute function public.guard_media_library_references_v2();

-- An old client cannot recreate an archived ID using INSERT / ON CONFLICT.
-- The archive RPC holds the source table lock while moving the row. Restore
-- removes the archive entry immediately before its hidden insert in the SAME
-- transaction; any validation/trigger failure rolls both steps back.
create or replace function public.guard_archived_navbar_shortcut_v2()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.content_archive_v2 archive
    where archive.collection = 'navbar-shortcuts' and archive.source_id = new.id) then
    raise exception 'navbar_shortcut_is_archived' using errcode = '23514';
  end if;
  return new;
end; $$;
drop trigger if exists archived_navbar_shortcut_guard_v2 on public.social_links;
create trigger archived_navbar_shortcut_guard_v2 before insert or update on public.social_links
for each row execute function public.guard_archived_navbar_shortcut_v2();

create or replace function public.get_navbar_shortcut_archive_v2(p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb; begin
  if p_offset is null or p_offset < 0 or p_offset > 1000000 or p_offset % 20 <> 0 then
    raise exception 'invalid_navbar_archive_offset' using errcode = '22023';
  end if;
  select pg_catalog.jsonb_build_object(
    'items', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', item.source_id, 'label', item.row_data ->> 'label',
      'platform', item.row_data ->> 'platform', 'archivedAt', item.archived_at,
      'updatedAt', item.updated_at
    ) order by item.archived_at desc, item.source_id)
      from (select source_id, row_data, archived_at, updated_at
        from public.content_archive_v2 where collection = 'navbar-shortcuts'
        order by archived_at desc, source_id limit 20 offset p_offset) as item), '[]'::jsonb),
    'total', (select count(*) from public.content_archive_v2 where collection = 'navbar-shortcuts'),
    'offset', p_offset
  ) into v_result;
  return v_result;
end; $$;

create or replace function public.mutate_navbar_shortcut_archive_v2(
  p_operation text, p_item_id text, p_expected_versions jsonb, p_actor_id uuid,
  p_expected_archive_updated_at timestamptz default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_source public.social_links%rowtype;
  v_archive public.content_archive_v2%rowtype;
  v_current_count integer;
  v_result text;
begin
  if p_operation is null or p_operation not in ('archive', 'restore')
    or p_item_id is null or char_length(p_item_id) not between 1 and 160
    or p_item_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
    or pg_catalog.jsonb_typeof(p_expected_versions) is distinct from 'object'
    or p_actor_id is null
    or not exists(select 1 from public.admin_profiles where user_id = p_actor_id and is_active)
    or (p_operation = 'archive' and p_expected_archive_updated_at is not null)
    or (p_operation = 'restore' and p_expected_archive_updated_at is null) then
    raise exception 'invalid_navbar_archive_mutation' using errcode = '22023';
  end if;
  if (select count(*) from pg_catalog.jsonb_object_keys(p_expected_versions)) > 16
    or exists(select 1 from pg_catalog.jsonb_each(p_expected_versions) expected(id, version)
      where char_length(expected.id) not between 1 and 160
        or expected.id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
        or pg_catalog.jsonb_typeof(expected.version) is distinct from 'string'
        or char_length(p_expected_versions ->> expected.id) not between 1 and 64) then
    raise exception 'invalid_navbar_archive_mutation' using errcode = '22023';
  end if;

  -- Match 0029's save lock before content locks. The table order also matches
  -- 0040's alphabetic registry order. Never take a media row lock first.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('navbar_social_links_v2:main', 0));
  lock table public.content_archive_v2 in share row exclusive mode;
  lock table public.social_links in share row exclusive mode;
  select count(*)::integer into v_current_count from public.social_links;
  if v_current_count <> (select count(*) from pg_catalog.jsonb_object_keys(p_expected_versions))
    or exists(select 1 from public.social_links social where not (p_expected_versions ? social.id))
    or exists(select 1 from pg_catalog.jsonb_object_keys(p_expected_versions) expected(id)
      where not exists(select 1 from public.social_links social where social.id = expected.id)) then
    return pg_catalog.jsonb_build_object('outcome', 'conflict');
  end if;
  begin
    if exists(select 1 from public.social_links social
      where social.updated_at is distinct from (p_expected_versions ->> social.id)::timestamptz) then
      return pg_catalog.jsonb_build_object('outcome', 'conflict');
    end if;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'invalid_navbar_archive_mutation' using errcode = '22023';
  end;
  -- Test the required parent before any write so even a broken deployment
  -- cannot move data and then fail when producing the response snapshot.
  if not exists(select 1 from public.site_settings where id = 'main') then
    raise exception 'navbar_social_links_settings_missing' using errcode = '23503';
  end if;

  select * into v_archive from public.content_archive_v2
    where collection = 'navbar-shortcuts' and source_id = p_item_id for update;
  if p_operation = 'archive' then
    if found then return pg_catalog.jsonb_build_object('outcome', 'conflict'); end if;
    select * into v_source from public.social_links where id = p_item_id for update;
    if not found then return pg_catalog.jsonb_build_object('outcome', 'missing'); end if;
    insert into public.content_archive_v2 (collection, source_id, row_data, archived_by)
      values ('navbar-shortcuts', p_item_id, pg_catalog.to_jsonb(v_source), p_actor_id);
    delete from public.social_links where id = p_item_id;
    v_result := 'archived';
  else
    if not found then return pg_catalog.jsonb_build_object('outcome', 'missing'); end if;
    if v_archive.updated_at is distinct from p_expected_archive_updated_at then
      return pg_catalog.jsonb_build_object('outcome', 'conflict');
    end if;
    if exists(select 1 from public.social_links where id = p_item_id) then
      return pg_catalog.jsonb_build_object('outcome', 'id_in_use');
    end if;
    if v_current_count >= 16 then return pg_catalog.jsonb_build_object('outcome', 'capacity'); end if;
    select * into v_source from pg_catalog.jsonb_populate_record(null::public.social_links, v_archive.row_data);
    v_source.is_published := false;
    -- PostgreSQL timestamp precision matters: restoring must invalidate every
    -- pre-archive snapshot, including archive/restore within one transaction.
    v_source.updated_at := greatest(pg_catalog.clock_timestamp(),
      v_source.updated_at + interval '1 microsecond', v_archive.updated_at + interval '1 microsecond');
    delete from public.content_archive_v2 where id = v_archive.id;
    insert into public.social_links select (v_source).*;
    v_result := 'restored';
  end if;
  return pg_catalog.jsonb_build_object('outcome', v_result,
    'snapshot', public.get_navbar_social_links_v2_snapshot('main'),
    'archive', public.get_navbar_shortcut_archive_v2(0));
exception when deadlock_detected then
  raise exception 'navbar_archive_changed_retry' using errcode = '40001';
end; $$;

revoke all on function public.media_library_reference_registry_v2() from public, anon, authenticated, service_role;
revoke all on function public.guard_archived_navbar_shortcut_v2() from public, anon, authenticated, service_role;
revoke all on function public.get_navbar_shortcut_archive_v2(integer) from public, anon, authenticated, service_role;
revoke all on function public.mutate_navbar_shortcut_archive_v2(text,text,jsonb,uuid,timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.get_navbar_shortcut_archive_v2(integer) to service_role;
grant execute on function public.mutate_navbar_shortcut_archive_v2(text,text,jsonb,uuid,timestamptz) to service_role;

comment on table public.content_archive_v2 is
  'Private recoverable content rows, not Media file Trash. Navbar pilot only; archive references remain protected by the Media registry.';
comment on function public.mutate_navbar_shortcut_archive_v2(text,text,jsonb,uuid,timestamptz) is
  'Service-only, active-admin, whole-collection CAS archive/hidden restore. Does not delete storage objects or implicitly publish restored content.';
commit;
