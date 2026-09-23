-- Batch 7A.2f.2: recoverable Trash for finalized ImageKit source-only assets.
-- Requires 0047. This installs capabilities only: no existing media, provider
-- object, placement, publication, or variant state is changed on deployment.
-- Ready means verified bytes, not an active portfolio placement. Source/object
-- readiness is retained in Trash; restore does not reattach old placements.
begin;

do $$ begin
  if pg_catalog.to_regclass('public.media_imagekit_upload_lifecycle') is null
    or pg_catalog.to_regclass('public.media_imagekit_file_bindings') is null
    or pg_catalog.to_regprocedure('public.mutate_media_asset_v2(text,timestamp with time zone,uuid,text,text,timestamp with time zone)') is null
    or pg_catalog.to_regprocedure('public.media_library_reference_registry_v2()') is null
    or not exists(select 1 from public.media_library_reference_registry_v2()
      where table_name = 'content_archive_v2' and columns = array['row_data']::text[])
    or exists(select 1 from public.media_library_reference_registry_v2() registry
      where not exists(select 1 from pg_catalog.pg_trigger installed
        where installed.tgrelid = pg_catalog.to_regclass('public.' || registry.table_name)
          and installed.tgname = 'zz_media_library_reference_guard_v2'
          and installed.tgfoid = pg_catalog.to_regprocedure('public.guard_media_library_references_v2()')
          and not installed.tgisinternal and installed.tgenabled in ('O','A')
          and installed.tgtype = 23 and installed.tgqual is null
          and installed.tgattr = ''::pg_catalog.int2vector))
    or exists(select 1 from (values ('public.media_imagekit_upload_lifecycle'),('public.media_imagekit_file_bindings')) as required(table_name)
      where not exists(select 1 from pg_catalog.pg_class
        where oid = pg_catalog.to_regclass(required.table_name) and relrowsecurity)
        or exists(select 1 from (values ('anon'),('authenticated'),('service_role')) as caller(role_name)
          where pg_catalog.has_table_privilege(caller.role_name,required.table_name,'SELECT,INSERT,UPDATE,DELETE'))) then
    raise exception 'imagekit_source_trash_requires_0047_and_archive_guards' using errcode = '55000';
  end if;
end; $$;

-- Private eligibility boundary. Callers must already own the sorted pipeline
-- and upload-intent asset advisory locks. Lock every existing variant, then its
-- object and consumed binding so eligibility cannot drift within a mutation.
-- Zero variants preserves legacy Supabase media behavior. Any derivative,
-- alternate delivery URL, unverified source, or unbound provider fails closed.
create or replace function public.is_imagekit_media_source_trashable_v1(p_asset_id text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_asset public.media_assets%rowtype;
  v_variant public.media_asset_variants%rowtype;
  v_object public.media_physical_objects%rowtype;
  v_intent public.media_upload_intents%rowtype;
  v_lifecycle public.media_imagekit_upload_lifecycle%rowtype;
  v_count bigint;
begin
  if p_asset_id is null or p_asset_id = '' then return false; end if;
  perform 1 from public.media_asset_variants where asset_id = p_asset_id order by id for share;
  select count(*) into v_count from public.media_asset_variants where asset_id = p_asset_id;
  if v_count = 0 then return true; end if;
  if v_count <> 1 then return false; end if;

  select * into v_asset from public.media_assets where id = p_asset_id for share;
  if not found then return false; end if;
  select * into v_variant from public.media_asset_variants where asset_id = p_asset_id;
  if v_variant.variant_kind <> 'source' or v_variant.preset_key <> 'source'
    or v_variant.source_variant_id is not null or v_variant.status <> 'ready'
    or v_variant.physical_object_id is null or v_variant.transformation_params <> '{}'::jsonb then
    return false;
  end if;
  select * into v_object from public.media_physical_objects where id = v_variant.physical_object_id for share;
  if not found or v_object.storage_provider <> 'imagekit' or v_object.status <> 'ready'
    or v_object.deleted_at is not null or v_object.provider_metadata <> '{}'::jsonb
    or v_object.delivery_url is distinct from v_asset.src
    or v_object.media_type is distinct from v_asset.media_type
    or v_object.mime_type is distinct from v_asset.mime_type
    or v_object.byte_size is distinct from v_asset.file_size then
    return false;
  end if;
  select * into v_intent from public.media_upload_intents
    where physical_object_id = v_object.id for share;
  if not found or v_intent.status <> 'consumed' or v_intent.resolved_at is null
    or v_intent.asset_id is distinct from p_asset_id
    or v_intent.storage_provider is distinct from v_object.storage_provider
    or v_intent.storage_container is distinct from v_object.storage_container
    or v_intent.object_key is distinct from v_object.object_key
    or v_intent.expected_media_type is distinct from v_object.media_type
    or v_intent.expected_mime_type is distinct from v_object.mime_type
    or v_intent.expected_byte_size is distinct from v_object.byte_size
    or v_intent.expected_checksum_sha256 is distinct from v_object.checksum_sha256 then
    return false;
  end if;
  select * into v_lifecycle from public.media_imagekit_upload_lifecycle
    where intent_id = v_intent.id for share;
  if not found or v_lifecycle.source_variant_id is distinct from v_variant.id
    or v_lifecycle.issued_at is null or v_lifecycle.authority_expires_at is null
    or v_lifecycle.authority_expires_at <= v_lifecycle.issued_at
    or v_lifecycle.file_id is null or v_lifecycle.file_id = ''
    or v_lifecycle.version_id is null or v_lifecycle.version_id = ''
    or v_lifecycle.version_token is null or v_lifecycle.version_token = ''
    or v_lifecycle.cleanup_state is distinct from 'not_needed' then
    return false;
  end if;
  -- Verify the account/file uniqueness fence too, rather than inferring it
  -- from a consumed lifecycle row. Missing or mismatched bindings fail closed.
  perform 1 from public.media_imagekit_file_bindings
    where storage_container = v_intent.storage_container
      and file_id = v_lifecycle.file_id and intent_id = v_intent.id for share;
  if not found then return false; end if;
  return true;
end; $$;

-- Preserve the established CAS, reference registry (including archived JSON),
-- replacement validation, lock ordering and Classic wrapper result contract.
-- The only broadened case is a proven ready ImageKit source with no aliases.
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
  for v_id in select distinct id from pg_catalog.unnest(array[p_asset_id,p_replacement_id]) as id where id is not null order by id loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('media_pipeline_v1:' || v_id,0));
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('media_upload_intent_v1:asset:' || v_id,0));
  end loop;
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
  -- Applies to restore as well as removal. Active work stays protected even
  -- when the logical asset is already in Trash. No provider object is deleted.
  if exists(select 1 from public.media_optimization_jobs where asset_id in (p_asset_id,p_replacement_id) and status in ('queued','running'))
    or exists(select 1 from public.media_upload_intents where asset_id in (p_asset_id,p_replacement_id) and status = 'prepared')
    or not public.is_imagekit_media_source_trashable_v1(p_asset_id)
    or (p_replacement_id is not null and not public.is_imagekit_media_source_trashable_v1(p_replacement_id)) then
    return pg_catalog.jsonb_build_object('outcome','pipeline_busy','referenceTotal',0,'updatedAt',v_asset.updated_at);
  end if;
  if p_operation = 'restore' then
    if v_asset.deleted_at is null then
      return pg_catalog.jsonb_build_object('outcome','conflict','referenceTotal',0,'updatedAt',v_asset.updated_at);
    end if;
    update public.media_assets set deleted_at = null, deleted_by = null, is_published = true
      where id = p_asset_id returning updated_at into v_version;
    return pg_catalog.jsonb_build_object('outcome','restored','referenceTotal',0,'updatedAt',v_version);
  end if;
  if v_asset.deleted_at is not null then
    return pg_catalog.jsonb_build_object('outcome','conflict','referenceTotal',0,'updatedAt',v_asset.updated_at);
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
  raise exception 'media_content_changed_retry' using errcode = '40001';
end; $$;

revoke all on function public.is_imagekit_media_source_trashable_v1(text) from public,anon,authenticated,service_role;
revoke all on function public.mutate_media_asset_v2(text,timestamptz,uuid,text,text,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.mutate_media_asset_v2(text,timestamptz,uuid,text,text,timestamptz) to service_role;
comment on function public.is_imagekit_media_source_trashable_v1(text) is
  'Private, lock-aware eligibility check for source-only consumed ImageKit uploads. Retains verified bytes and rejects derivatives or alternate URLs.';
comment on function public.mutate_media_asset_v2(text,timestamptz,uuid,text,text,timestamptz) is
  'Service-only CAS replacement/recoverable Trash for legacy assets and verified source-only ImageKit uploads. Never deletes provider objects or reattaches old placements.';
commit;
