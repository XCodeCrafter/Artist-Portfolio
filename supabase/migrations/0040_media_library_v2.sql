-- Media V2: atomic replacement + recoverable trash. No object is deleted from
-- Supabase/ImageKit/R2, no provider is activated, and no existing media is moved.
-- Requires 0039 (footer), 0037 (HOME) and the 0034-0036 pipeline foundation.
-- Safe to rerun.
begin;

do $$ begin
  if pg_catalog.to_regclass('public.home_page_config') is null
    or pg_catalog.to_regprocedure('public.save_home_section_v2(text,text,timestamp with time zone,jsonb)') is null
    or pg_catalog.to_regclass('public.media_upload_intents') is null
    or pg_catalog.to_regclass('public.media_optimization_jobs') is null
    or not exists(select 1 from pg_catalog.pg_attribute where attrelid = 'public.site_settings'::regclass
      and attname = 'footer_content' and not attisdropped and atttypid = 'jsonb'::regtype) then
    raise exception 'media_library_requires_0039_0037_and_pipeline_foundation' using errcode = '55000';
  end if;
end; $$;

-- One internal registry drives usage, replacements and write guards. Keep
-- dormant Classic fields and hidden sections: restore must never reveal a
-- missing file. Linked PDFs/other media count too, not just image columns.
create or replace function public.media_library_reference_registry_v2()
returns table(table_name text, reference_label text, columns text[], json_columns text[])
language sql immutable security definer set search_path = '' as $$
  values
    ('about_home', 'Home about (Classic)', array['image_src','cta_href'], '{}'::text[]),
    ('actor_credits', 'Bio credit link', array['href'], '{}'::text[]),
    ('actor_resume', 'Bio resume download', array['resume_url'], '{}'::text[]),
    ('bio_gallery_images', 'Bio gallery', array['src'], '{}'::text[]),
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

create or replace function public.media_library_json_contains_v2(p_value jsonb, p_src text)
returns boolean language sql immutable security definer set search_path = '' as $$
  select p_src is not null and p_src <> '' and coalesce(pg_catalog.jsonb_path_exists(
    p_value, '$.** ? (@ == $source)', pg_catalog.jsonb_build_object('source',p_src)
  ), false);
$$;

-- Exact JSON string values only. Never textual search/replace inside prose,
-- filenames, URL substrings, or serialized JSON.
create or replace function public.replace_media_library_source_v2(p_value jsonb, p_src text, p_replacement text)
returns jsonb language plpgsql immutable security definer set search_path = '' as $$
declare v_result jsonb; begin
  if p_value = pg_catalog.to_jsonb(p_src) then return pg_catalog.to_jsonb(p_replacement); end if;
  if pg_catalog.jsonb_typeof(p_value) = 'object' then
    select coalesce(pg_catalog.jsonb_object_agg(item.key,
      public.replace_media_library_source_v2(item.value,p_src,p_replacement)), '{}'::jsonb)
      into v_result from pg_catalog.jsonb_each(p_value) as item;
    return v_result;
  elsif pg_catalog.jsonb_typeof(p_value) = 'array' then
    select coalesce(pg_catalog.jsonb_agg(public.replace_media_library_source_v2(item.value,p_src,p_replacement)
      order by item.ordinality), '[]'::jsonb)
      into v_result from pg_catalog.jsonb_array_elements(p_value) with ordinality as item(value,ordinality);
    return v_result;
  end if;
  return p_value;
end; $$;

create or replace function public.media_asset_references(p_src text)
returns table(reference_label text, reference_count bigint)
language plpgsql stable security definer set search_path = '' as $$
declare v_entry record; v_fields text; v_count bigint; begin
  if p_src is null or p_src = '' then return; end if;
  for v_entry in select * from public.media_library_reference_registry_v2() loop
    select pg_catalog.string_agg(pg_catalog.format('pg_catalog.to_jsonb(content) -> %L', field), ',')
      into v_fields from pg_catalog.unnest(v_entry.columns) as field;
    execute pg_catalog.format('select count(*) from public.%I as content where public.media_library_json_contains_v2(pg_catalog.jsonb_build_array(%s),$1)',
      v_entry.table_name,v_fields) into v_count using p_src;
    if v_count > 0 then
      reference_label := v_entry.reference_label; reference_count := v_count; return next;
    end if;
  end loop;
end; $$;

create or replace function public.get_media_library_v2_usage()
returns table(asset_id text, reference_label text, reference_count bigint)
language sql stable security definer set search_path = '' as $$
  select asset.id, usage.reference_label, usage.reference_count
  from public.media_assets as asset
  cross join lateral public.media_asset_references(asset.src) as usage
  where asset.id not in ('home-studio-settings','gallery-studio-settings','showreel-studio-settings');
$$;

-- A stale Classic form must not reintroduce an already trashed URL after the
-- replacement commits. SHARE row locks also close the write/trash race. Existing
-- bad rows are not rewritten on deployment; they surface when edited.
create or replace function public.guard_media_library_references_v2()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_columns text[]; v_field text; v_values jsonb := '[]'::jsonb; v_asset record; begin
  select registry.columns into v_columns from public.media_library_reference_registry_v2() registry
    where registry.table_name = tg_table_name;
  foreach v_field in array v_columns loop
    v_values := v_values || pg_catalog.jsonb_build_array(pg_catalog.to_jsonb(new) -> v_field);
  end loop;
  for v_asset in select asset.id, asset.src, asset.deleted_at from public.media_assets as asset
    where public.media_library_json_contains_v2(v_values,asset.src)
    order by asset.id for share loop
    if v_asset.deleted_at is not null and not exists(
      select 1 from public.media_assets active where active.src = v_asset.src and active.deleted_at is null
    ) then
      raise exception 'media_source_is_in_trash' using errcode = '23514';
    end if;
  end loop;
  -- Runs after legacy *_updated_at triggers. Guaranteed monotonic versions keep
  -- old editor snapshots from undoing a replacement, even within one transaction.
  if tg_op = 'UPDATE' then
    new.updated_at := greatest(pg_catalog.clock_timestamp(), old.updated_at + interval '1 microsecond', new.updated_at);
  end if;
  return new;
end; $$;

do $$ declare v_entry record; begin
  for v_entry in select * from public.media_library_reference_registry_v2() loop
    execute pg_catalog.format('drop trigger if exists zz_media_library_reference_guard_v2 on public.%I',v_entry.table_name);
    execute pg_catalog.format('create trigger zz_media_library_reference_guard_v2 before insert or update on public.%I for each row execute function public.guard_media_library_references_v2()',v_entry.table_name);
  end loop;
end; $$;

create or replace function public.mutate_media_asset_v2(
  p_asset_id text, p_expected_updated_at timestamptz, p_actor_id uuid,
  p_operation text, p_replacement_id text default null,
  p_replacement_expected_updated_at timestamptz default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_asset public.media_assets%rowtype; v_replacement public.media_assets%rowtype;
  v_entry record; v_id text; v_fields text; v_updates text; v_column text;
  v_total bigint := 0; v_remaining bigint; v_version timestamptz;
begin
  if p_operation is null or p_operation not in ('trash','replace_and_trash','restore')
    or p_expected_updated_at is null or p_asset_id is null or p_asset_id = ''
    or p_asset_id in ('home-studio-settings','gallery-studio-settings','showreel-studio-settings')
    or p_actor_id is null or not exists(select 1 from public.admin_profiles where user_id = p_actor_id and is_active)
    or (p_operation <> 'replace_and_trash' and (p_replacement_id is not null or p_replacement_expected_updated_at is not null)) then
    raise exception 'invalid_media_library_mutation' using errcode = '22023';
  end if;
  -- Use the pipeline's established lock namespace before touching asset rows.
  for v_id in select distinct id from pg_catalog.unnest(array[p_asset_id,p_replacement_id]) as id where id is not null order by id loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('media_pipeline_v1:' || v_id,0));
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('media_upload_intent_v1:asset:' || v_id,0));
  end loop;
  -- Content tables first: HOME and legacy writers acquire their content locks
  -- before checking media. This also serializes collection replacement/insert.
  -- Readers remain unblocked. Rare admin deletion deliberately favors safety.
  for v_entry in select * from public.media_library_reference_registry_v2() order by table_name loop
    if v_entry.table_name <> 'media_assets' then
      execute pg_catalog.format('lock table public.%I in share row exclusive mode',v_entry.table_name);
    end if;
  end loop;
  lock table public.media_assets in share row exclusive mode;
  select * into v_asset from public.media_assets where id = p_asset_id for update;
  if not found then return pg_catalog.jsonb_build_object('outcome','missing','referenceTotal',0,'updatedAt',null); end if;
  if v_asset.updated_at is distinct from p_expected_updated_at then
    return pg_catalog.jsonb_build_object('outcome','conflict','referenceTotal',0,'updatedAt',v_asset.updated_at);
  end if;
  if p_operation = 'restore' then
    if v_asset.deleted_at is null then
      return pg_catalog.jsonb_build_object('outcome','conflict','referenceTotal',0,'updatedAt',v_asset.updated_at);
    end if;
    -- Restore makes the file available to page editors. It never reattaches old
    -- placements or reverses the replacement made when it entered Trash.
    update public.media_assets set deleted_at = null, deleted_by = null, is_published = true
      where id = p_asset_id returning updated_at into v_version;
    return pg_catalog.jsonb_build_object('outcome','restored','referenceTotal',0,'updatedAt',v_version);
  end if;
  if v_asset.deleted_at is not null then
    return pg_catalog.jsonb_build_object('outcome','conflict','referenceTotal',0,'updatedAt',v_asset.updated_at);
  end if;
  -- Provider variants can have delivery URL aliases different from asset.src.
  -- Their retirement/publication lifecycle belongs to the pending provider
  -- rollout, so this library deliberately refuses every linked variant rather
  -- than leave a ready/retired alias pointing to a trashed logical asset.
  if exists(select 1 from public.media_optimization_jobs where asset_id in (p_asset_id,p_replacement_id) and status in ('queued','running'))
    or exists(select 1 from public.media_asset_variants where asset_id in (p_asset_id,p_replacement_id))
    or exists(select 1 from public.media_upload_intents where asset_id in (p_asset_id,p_replacement_id) and status = 'prepared') then
    return pg_catalog.jsonb_build_object('outcome','pipeline_busy','referenceTotal',0,'updatedAt',v_asset.updated_at);
  end if;
  select coalesce(sum(reference_count),0) into v_total from public.media_asset_references(v_asset.src);
  if p_operation = 'trash' and v_total > 0 then
    return pg_catalog.jsonb_build_object('outcome','in_use','referenceTotal',v_total,'updatedAt',v_asset.updated_at);
  end if;
  if p_operation = 'replace_and_trash' then
    select * into v_replacement from public.media_assets where id = p_replacement_id for share;
    if not found or v_replacement.id = v_asset.id or v_replacement.src = v_asset.src
      or v_replacement.id in ('home-studio-settings','gallery-studio-settings','showreel-studio-settings')
      or v_replacement.media_type <> v_asset.media_type or v_replacement.deleted_at is not null
      or not v_replacement.is_published or v_replacement.src = '' or pg_catalog.length(v_replacement.src) > 2048
      or v_replacement.src ~ '[[:cntrl:]]' or pg_catalog.strpos(v_replacement.src,pg_catalog.chr(92)) > 0
      or not ((pg_catalog.left(v_replacement.src,1) = '/' and pg_catalog.left(v_replacement.src,2) <> '//')
        or v_replacement.src ~* '^https://[^[:space:]/?#:@]+(:443)?([/?#]|$)') then
      return pg_catalog.jsonb_build_object('outcome','invalid_replacement','referenceTotal',v_total,'updatedAt',v_asset.updated_at);
    end if;
    -- The service first validates the candidate URL against the application's
    -- configured media origins. Lock and compare that exact candidate snapshot
    -- so an intervening edit cannot substitute a different, unapproved URL.
    if p_replacement_expected_updated_at is null or v_replacement.updated_at is distinct from p_replacement_expected_updated_at then
      return pg_catalog.jsonb_build_object('outcome','conflict','referenceTotal',v_total,'updatedAt',v_asset.updated_at);
    end if;
    for v_entry in select * from public.media_library_reference_registry_v2() order by table_name loop
      v_updates := ''; v_fields := '';
      foreach v_column in array v_entry.columns loop
        if v_updates <> '' then v_updates := v_updates || ','; v_fields := v_fields || ','; end if;
        v_fields := v_fields || pg_catalog.format('pg_catalog.to_jsonb(content) -> %L',v_column);
        if v_column = any(v_entry.json_columns) then
          v_updates := v_updates || pg_catalog.format('%I = public.replace_media_library_source_v2(%I,$1,$2)',v_column,v_column);
        else
          v_updates := v_updates || pg_catalog.format('%I = case when %I = $1 then $2 else %I end',v_column,v_column,v_column);
        end if;
      end loop;
      execute pg_catalog.format('update public.%I as content set %s where public.media_library_json_contains_v2(pg_catalog.jsonb_build_array(%s),$1)',v_entry.table_name,v_updates,v_fields)
        using v_asset.src,v_replacement.src;
    end loop;
    select coalesce(sum(reference_count),0) into v_remaining from public.media_asset_references(v_asset.src);
    if v_remaining > 0 then raise exception 'media_replacement_incomplete' using errcode = '23514'; end if;
  end if;
  update public.media_assets set deleted_at = pg_catalog.clock_timestamp(), deleted_by = p_actor_id, is_published = false
    where id = p_asset_id returning updated_at into v_version;
  return pg_catalog.jsonb_build_object('outcome',case when p_operation = 'replace_and_trash' then 'replaced_and_trashed' else 'trashed' end,
    'referenceTotal',v_total,'updatedAt',v_version);
exception when deadlock_detected then
  -- Older multi-section writers may acquire their tables in another order.
  -- PostgreSQL has rolled this entire function back; ask for a fresh snapshot
  -- using the same conflict channel as optimistic-version rejection.
  raise exception 'media_content_changed_retry' using errcode = '40001';
end; $$;

-- Existing Classic clients still receive their established result shape, but
-- cannot bypass the new atomic locking/reference rules.
create or replace function public.trash_media_asset(p_asset_id text,p_actor_id uuid)
returns table(outcome text,reference_total bigint,storage_bucket text,storage_path text)
language plpgsql security definer set search_path = '' as $$
declare v_asset public.media_assets%rowtype; v_result jsonb; begin
  select * into v_asset from public.media_assets where id = p_asset_id;
  if not found then return query select 'missing'::text,0::bigint,''::text,''::text; return; end if;
  if v_asset.deleted_at is not null then
    return query select 'already_trashed'::text,0::bigint,v_asset.storage_bucket,v_asset.storage_path; return;
  end if;
  v_result := public.mutate_media_asset_v2(p_asset_id,v_asset.updated_at,p_actor_id,'trash');
  if v_result ->> 'outcome' in ('conflict','pipeline_busy') then raise exception 'media_asset_changed' using errcode = '40001'; end if;
  return query select v_result ->> 'outcome',(v_result ->> 'referenceTotal')::bigint,v_asset.storage_bucket,v_asset.storage_path;
end; $$;

revoke all on function public.media_library_reference_registry_v2() from public,anon,authenticated,service_role;
revoke all on function public.media_library_json_contains_v2(jsonb,text) from public,anon,authenticated,service_role;
revoke all on function public.replace_media_library_source_v2(jsonb,text,text) from public,anon,authenticated,service_role;
revoke all on function public.guard_media_library_references_v2() from public,anon,authenticated,service_role;
revoke all on function public.media_asset_references(text) from public,anon,authenticated,service_role;
revoke all on function public.get_media_library_v2_usage() from public,anon,authenticated,service_role;
revoke all on function public.mutate_media_asset_v2(text,timestamptz,uuid,text,text,timestamptz) from public,anon,authenticated,service_role;
revoke all on function public.trash_media_asset(text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.media_asset_references(text) to service_role;
grant execute on function public.get_media_library_v2_usage() to service_role;
grant execute on function public.mutate_media_asset_v2(text,timestamptz,uuid,text,text,timestamptz) to service_role;
grant execute on function public.trash_media_asset(text,uuid) to service_role;

comment on function public.mutate_media_asset_v2(text,timestamptz,uuid,text,text,timestamptz) is
  'Service-only CAS media replacement and recoverable trash. Preserves storage objects; restore makes media selectable again without undoing replacements.';
commit;
