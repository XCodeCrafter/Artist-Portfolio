-- Batch 7A.2f.2: dormant ImageKit database lifecycle. No provider requests,
-- existing-media backfill, credential changes or upload cutover. Apply 0048
-- afterwards: publication deliberately refuses to run without its Trash guard.
begin;

do $$ begin
  if pg_catalog.to_regprocedure('public.save_hero_with_framing_v2(text,text,timestamp with time zone,jsonb)') is null
    or pg_catalog.to_regprocedure('public.mutate_media_asset_v2(text,timestamp with time zone,uuid,text,text,timestamp with time zone)') is null
    or pg_catalog.to_regclass('public.media_upload_intents') is null
    or not exists(select 1 from pg_catalog.pg_constraint where conrelid=pg_catalog.to_regclass('public.media_upload_intents')
      and conname='media_upload_intents_object_binding_fk' and convalidated)
    or not exists(select 1 from pg_catalog.pg_constraint where conrelid=pg_catalog.to_regclass('public.media_asset_variants')
      and conname='media_asset_variants_ready_object_fk' and convalidated)
    or (select count(*) from pg_catalog.pg_trigger where not tgisinternal and tgenabled in ('O','A')
      and tgqual is null and tgattr=''::pg_catalog.int2vector
      and (tgrelid,tgname,tgfoid,tgtype) in (
        (pg_catalog.to_regclass('public.media_physical_objects'),'media_physical_objects_integrity_guard',pg_catalog.to_regprocedure('public.guard_media_physical_object_v1()'),19),
        (pg_catalog.to_regclass('public.media_asset_variants'),'media_asset_variants_integrity_guard',pg_catalog.to_regprocedure('public.guard_media_asset_variant_v1()'),23),
        (pg_catalog.to_regclass('public.media_optimization_jobs'),'media_optimization_jobs_integrity_guard',pg_catalog.to_regprocedure('public.guard_media_optimization_job_v1()'),23))) <> 3
    or (select count(*) from pg_catalog.pg_constraint c where c.contype='f' and c.convalidated and not c.condeferrable
      and c.confrelid=pg_catalog.to_regclass('public.media_physical_objects')
      and ((c.conrelid=pg_catalog.to_regclass('public.media_upload_intents') and c.conname='media_upload_intents_object_binding_fk' and cardinality(c.conkey)=6)
        or (c.conrelid=pg_catalog.to_regclass('public.media_asset_variants') and c.conname='media_asset_variants_ready_object_fk' and cardinality(c.conkey)=2))
      and (select count(*) from pg_catalog.pg_trigger t where t.tgconstraint=c.oid and t.tgisinternal and t.tgenabled in ('O','A') and t.tgqual is null)=4)<>2
    or (select count(*) from pg_catalog.pg_class where relrowsecurity and oid in (
      pg_catalog.to_regclass('public.media_physical_objects'),pg_catalog.to_regclass('public.media_asset_variants'),
      pg_catalog.to_regclass('public.media_upload_intents'),pg_catalog.to_regclass('public.media_optimization_jobs')))<>4 then
    raise exception 'imagekit_lifecycle_requires_verified_0035_0036_0040_0046' using errcode='55000';
  end if;
end; $$;

-- Companion rows mark only NEW canonical ImageKit intents. Legacy 0036 rows
-- keep their immutable extensionless keys and are never adopted or rewritten.
create table if not exists public.media_imagekit_upload_lifecycle (
  intent_id uuid primary key references public.media_upload_intents(id) on delete restrict,
  issued_at timestamptz,
  authority_expires_at timestamptz,
  file_id text,
  version_id text,
  version_token text,
  source_variant_id uuid unique references public.media_asset_variants(id) on delete restrict,
  cleanup_state text not null default 'not_needed',
  cleanup_after timestamptz,
  cleanup_attempts smallint not null default 0,
  cleanup_lease_id uuid,
  cleanup_worker_id text,
  cleanup_lease_expires_at timestamptz,
  last_cleanup_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint imagekit_issuance_shape check (
    (issued_at is null and authority_expires_at is null) or
    (issued_at is not null and authority_expires_at is not null and authority_expires_at>issued_at
      and authority_expires_at<=issued_at+interval '5 minutes')),
  constraint imagekit_verified_binding_shape check (
    (file_id is null and version_id is null and version_token is null and source_variant_id is null) or
    (issued_at is not null and file_id is not null and version_id is not null and version_token is not null
      and source_variant_id is not null and file_id ~ '^[A-Za-z0-9_-]{1,128}$'
      and version_id ~ '^[A-Za-z0-9_-]{1,128}$' and version_token ~ '^[A-Za-z0-9_.-]+$' and char_length(version_token)<=256
      and cleanup_state='not_needed')),
  constraint imagekit_cleanup_shape check (
    cleanup_state in ('not_needed','pending','leased','attention')
    and cleanup_attempts between 0 and 5
    and (last_cleanup_code is null or last_cleanup_code in ('absent','retry','unsafe','exhausted'))
    and (cleanup_worker_id is null or cleanup_worker_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$')
    and ((cleanup_state='not_needed' and cleanup_after is null and cleanup_attempts=0
      and cleanup_lease_id is null and cleanup_worker_id is null and cleanup_lease_expires_at is null)
    or (cleanup_state in ('pending','attention') and cleanup_after is not null and issued_at is not null
      and cleanup_lease_id is null and cleanup_worker_id is null and cleanup_lease_expires_at is null)
    or (cleanup_state='leased' and cleanup_after is not null and issued_at is not null and cleanup_attempts>0
      and cleanup_lease_id is not null and cleanup_worker_id is not null and cleanup_lease_expires_at is not null)))
);
create index if not exists imagekit_cleanup_due_idx on public.media_imagekit_upload_lifecycle(cleanup_after,intent_id)
  where cleanup_state in ('pending','leased');
-- The provider account is read through the intent; use a separate immutable
-- binding index on the fixed endpoint/file pair in a private table below.
create table if not exists public.media_imagekit_file_bindings (
  storage_container text not null,
  file_id text not null,
  intent_id uuid not null unique references public.media_imagekit_upload_lifecycle(intent_id) on delete restrict,
  primary key(storage_container,file_id),
  constraint imagekit_file_binding_identity check (storage_container ~ '^[A-Za-z0-9_-]{1,128}$'
    and file_id ~ '^[A-Za-z0-9_-]{1,128}$')
);
alter table public.media_imagekit_upload_lifecycle enable row level security;
alter table public.media_imagekit_file_bindings enable row level security;
revoke all on public.media_imagekit_upload_lifecycle, public.media_imagekit_file_bindings from public,anon,authenticated,service_role;

create or replace function public.imagekit_mime_extension_v1(p_mime text)
returns text language sql immutable set search_path='' as $$
  select case p_mime when 'image/avif' then 'avif' when 'image/gif' then 'gif'
    when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp'
    when 'video/mp4' then 'mp4' when 'video/quicktime' then 'mov' when 'video/webm' then 'webm' end;
$$;

create or replace function public.require_imagekit_actor_v1(p_actor_id uuid)
returns void language plpgsql security definer set search_path='' as $$ begin
  perform 1 from public.admin_profiles where user_id=p_actor_id and is_active for share;
  if p_actor_id is null or not found then raise exception 'imagekit_actor_not_active' using errcode='42501'; end if;
end; $$;

-- Lock order: admin (when interactive), intent advisory, pipeline advisory,
-- asset advisory, parent row, companion row. Trash never takes the intent lock.
create or replace function public.lock_imagekit_upload_v1(p_intent_id uuid,p_actor_id uuid)
returns public.media_upload_intents language plpgsql security definer set search_path='' as $$
declare v_intent public.media_upload_intents%rowtype; begin
  select i.* into v_intent from public.media_upload_intents i
    join public.media_imagekit_upload_lifecycle l on l.intent_id=i.id where i.id=p_intent_id;
  if not found then raise exception 'imagekit_intent_missing' using errcode='23503'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('media_upload_intent_v1:id:'||p_intent_id::text,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('media_pipeline_v1:'||v_intent.asset_id,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('media_upload_intent_v1:asset:'||v_intent.asset_id,0));
  select * into v_intent from public.media_upload_intents where id=p_intent_id for update;
  perform 1 from public.media_imagekit_upload_lifecycle where intent_id=p_intent_id for update;
  if p_actor_id is not null and v_intent.actor_id is distinct from p_actor_id then
    raise exception 'imagekit_intent_owner_mismatch' using errcode='42501'; end if;
  return v_intent;
end; $$;

create or replace function public.imagekit_upload_snapshot_v1(p_intent_id uuid)
returns jsonb language sql security definer set search_path='' as $$
  select jsonb_build_object('intentId',i.id,'assetId',i.asset_id,'physicalObjectId',i.physical_object_id,
    'storageProvider',i.storage_provider,'storageContainer',i.storage_container,'objectKey',i.object_key,
    'mediaType',i.expected_media_type,'mimeType',i.expected_mime_type,'expectedByteSize',i.expected_byte_size,
    'expectedChecksumSha256',i.expected_checksum_sha256,'expiresAt',i.expires_at,'status',i.status,
    'issuedAt',l.issued_at,'authorityExpiresAt',l.authority_expires_at,'fileId',l.file_id,
    'versionId',l.version_id,'versionToken',l.version_token,'sourceVariantId',l.source_variant_id,
    'cleanupState',l.cleanup_state)
  from public.media_upload_intents i join public.media_imagekit_upload_lifecycle l on l.intent_id=i.id where i.id=p_intent_id;
$$;

create or replace function public.guard_imagekit_intent_v1()
returns trigger language plpgsql security definer set search_path='' as $$ begin
  if not exists(select 1 from public.media_imagekit_upload_lifecycle where intent_id=old.id) then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if tg_op='DELETE' then raise exception 'imagekit_intent_identity_is_immutable' using errcode='23514'; end if;
  -- Preserve auth.users ON DELETE SET NULL, not a bundled mutation.
  if old.actor_id is not null and new.actor_id is null and
    (to_jsonb(new)-'actor_id'-'updated_at')=(to_jsonb(old)-'actor_id'-'updated_at') then return new; end if;
  if (to_jsonb(new)-'status'-'resolved_at'-'updated_at') is distinct from
     (to_jsonb(old)-'status'-'resolved_at'-'updated_at') or old.status<>'prepared'
    or new.status not in ('prepared','consumed','expired','cancelled','failed') then
    raise exception 'imagekit_intent_identity_is_immutable' using errcode='23514'; end if;
  if new.status='consumed' and not exists(select 1 from public.media_imagekit_upload_lifecycle l
    join public.media_asset_variants v on v.id=l.source_variant_id and v.asset_id=new.asset_id
    join public.media_physical_objects o on o.id=v.physical_object_id and o.id=new.physical_object_id
    where l.intent_id=new.id and l.file_id is not null and l.issued_at is not null
      and v.status='ready' and o.status='ready') then
    raise exception 'imagekit_consumption_requires_verified_binding' using errcode='23514'; end if;
  return new;
end; $$;

-- Also covers expiry by the legacy prepare_v1 RPC: issued objects can never
-- silently disappear from the cleanup queue merely because another path expired them.
create or replace function public.sync_imagekit_upload_cleanup_v1()
returns trigger language plpgsql security definer set search_path='' as $$ begin
  if old.status='prepared' and new.status in ('expired','cancelled','failed')
    and exists(select 1 from public.media_imagekit_upload_lifecycle where intent_id=new.id) then
    update public.media_physical_objects set status='failed' where id=new.physical_object_id and status='pending';
    update public.media_imagekit_upload_lifecycle set cleanup_state='pending',
      cleanup_after=greatest(new.expires_at,pg_catalog.clock_timestamp())+interval '1 hour',updated_at=pg_catalog.clock_timestamp()
      where intent_id=new.id and issued_at is not null and cleanup_state='not_needed';
    insert into public.audit_logs(actor_id,action,table_name,record_id,metadata)
      values(new.actor_id,'imagekit_upload_closed','media_upload_intents',new.id::text,jsonb_build_object('status',new.status));
  end if;
  return new;
end; $$;

create or replace function public.guard_imagekit_lifecycle_v1()
returns trigger language plpgsql security definer set search_path='' as $$ begin
  if tg_op='DELETE' then raise exception 'imagekit_lifecycle_is_retained' using errcode='23514'; end if;
  if new.intent_id is distinct from old.intent_id or new.created_at is distinct from old.created_at
    or (old.issued_at is not null and (new.issued_at is distinct from old.issued_at or new.authority_expires_at is distinct from old.authority_expires_at))
    or (old.file_id is not null and (new.file_id is distinct from old.file_id or new.version_id is distinct from old.version_id
      or new.version_token is distinct from old.version_token or new.source_variant_id is distinct from old.source_variant_id)) then
    raise exception 'imagekit_lifecycle_identity_is_immutable' using errcode='23514'; end if;
  if new.cleanup_state<>'not_needed' and exists(select 1 from public.media_upload_intents where id=new.intent_id and status='consumed') then
    raise exception 'imagekit_consumed_object_cannot_be_cleaned' using errcode='23514'; end if;
  return new;
end; $$;

create or replace function public.guard_imagekit_ready_object_v1()
returns trigger language plpgsql security definer set search_path='' as $$ begin
  if exists(select 1 from public.media_upload_intents i join public.media_imagekit_upload_lifecycle l on l.intent_id=i.id
    where i.physical_object_id=old.id and i.status='consumed')
    and (tg_op='DELETE' or new.delivery_url is distinct from old.delivery_url or new.status is distinct from old.status
      or new.deleted_at is distinct from old.deleted_at or new.provider_metadata is distinct from old.provider_metadata) then
    raise exception 'imagekit_verified_delivery_is_immutable' using errcode='23514'; end if;
  if tg_op='DELETE' then return old; else return new; end if;
end; $$;

drop trigger if exists imagekit_intent_guard on public.media_upload_intents;
create trigger imagekit_intent_guard before update or delete on public.media_upload_intents for each row execute function public.guard_imagekit_intent_v1();
drop trigger if exists imagekit_intent_cleanup on public.media_upload_intents;
create trigger imagekit_intent_cleanup after update on public.media_upload_intents for each row execute function public.sync_imagekit_upload_cleanup_v1();
drop trigger if exists imagekit_lifecycle_guard on public.media_imagekit_upload_lifecycle;
create trigger imagekit_lifecycle_guard before update or delete on public.media_imagekit_upload_lifecycle for each row execute function public.guard_imagekit_lifecycle_v1();
drop trigger if exists imagekit_ready_object_guard on public.media_physical_objects;
create trigger imagekit_ready_object_guard before update or delete on public.media_physical_objects for each row execute function public.guard_imagekit_ready_object_v1();

create or replace function public.prepare_imagekit_upload_v1(
  p_intent_id uuid,p_asset_id text,p_asset_metadata jsonb,p_storage_container text,p_mime_type text,
  p_byte_size bigint,p_checksum_sha256 text,p_actor_id uuid,p_ttl_seconds integer default 600
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_old public.media_upload_intents%rowtype; v_object uuid; v_key text; v_ext text; v_now timestamptz; v_kind text; begin
  perform public.require_imagekit_actor_v1(p_actor_id);
  v_ext:=public.imagekit_mime_extension_v1(p_mime_type);
  v_kind:=case when p_mime_type like 'image/%' then 'image' else 'video' end;
  if p_intent_id is null or p_intent_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or p_asset_id is null or p_asset_id !~ '^[a-z0-9][a-z0-9_-]{0,99}$'
    or p_asset_id in ('home-studio-settings','gallery-studio-settings','showreel-studio-settings')
    or p_storage_container is null or p_storage_container !~ '^[A-Za-z0-9_-]{1,128}$'
    or v_ext is null or p_byte_size is null or p_byte_size<1
    or p_byte_size>(case when v_kind='image' then 10485760 else 95000000 end)
    or p_checksum_sha256 is null or p_checksum_sha256 !~ '^[0-9a-f]{64}$'
    or p_ttl_seconds is null or p_ttl_seconds not between 60 and 900 then
    raise exception 'invalid_imagekit_upload_request' using errcode='22023'; end if;
  -- Metadata is additionally checked by the existing strict 0036 table constraint.
  v_key:='media/source/'||p_asset_id||'/'||p_intent_id::text||'.'||v_ext;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('media_upload_intent_v1:id:'||p_intent_id::text,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('media_pipeline_v1:'||p_asset_id,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('media_upload_intent_v1:asset:'||p_asset_id,0));
  select * into v_old from public.media_upload_intents where id=p_intent_id for update;
  if found then
    if not exists(select 1 from public.media_imagekit_upload_lifecycle where intent_id=p_intent_id)
      or v_old.asset_id is distinct from p_asset_id or v_old.asset_metadata is distinct from p_asset_metadata
      or v_old.storage_container is distinct from p_storage_container or v_old.object_key is distinct from v_key
      or v_old.expected_mime_type is distinct from p_mime_type or v_old.expected_byte_size is distinct from p_byte_size
      or v_old.expected_checksum_sha256 is distinct from p_checksum_sha256 or v_old.actor_id is distinct from p_actor_id
      or v_old.ttl_seconds is distinct from p_ttl_seconds then
      raise exception 'imagekit_idempotency_conflict' using errcode='23505'; end if;
    if v_old.status='prepared' and v_old.expires_at<=pg_catalog.clock_timestamp() then
      update public.media_upload_intents set status='expired',resolved_at=pg_catalog.clock_timestamp() where id=p_intent_id;
    end if;
    return public.imagekit_upload_snapshot_v1(p_intent_id);
  end if;
  if exists(select 1 from public.media_assets where id=p_asset_id) then
    raise exception 'imagekit_asset_already_exists' using errcode='23505'; end if;
  if exists(select 1 from public.media_upload_intents where asset_id=p_asset_id and status='prepared') then
    raise exception 'imagekit_upload_already_active' using errcode='23505'; end if;
  v_object:=pg_catalog.gen_random_uuid(); v_now:=pg_catalog.clock_timestamp();
  insert into public.media_physical_objects(id,storage_provider,storage_container,object_key,media_type,mime_type,created_by)
    values(v_object,'imagekit',p_storage_container,v_key,v_kind,p_mime_type,p_actor_id);
  insert into public.media_upload_intents(id,asset_id,asset_metadata,physical_object_id,actor_id,storage_provider,
    storage_container,object_key,expected_media_type,expected_mime_type,expected_byte_size,expected_checksum_sha256,
    ttl_seconds,status,expires_at,created_at,updated_at)
    values(p_intent_id,p_asset_id,p_asset_metadata,v_object,p_actor_id,'imagekit',p_storage_container,v_key,v_kind,p_mime_type,
      p_byte_size,p_checksum_sha256,p_ttl_seconds,'prepared',v_now+pg_catalog.make_interval(secs=>p_ttl_seconds),v_now,v_now);
  insert into public.media_imagekit_upload_lifecycle(intent_id) values(p_intent_id);
  insert into public.audit_logs(actor_id,action,table_name,record_id,metadata)
    values(p_actor_id,'imagekit_upload_prepared','media_upload_intents',p_intent_id::text,
      jsonb_build_object('assetId',p_asset_id,'mediaType',v_kind,'byteSize',p_byte_size));
  return public.imagekit_upload_snapshot_v1(p_intent_id);
end; $$;

create or replace function public.resolve_imagekit_upload_v1(p_intent_id uuid,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_i public.media_upload_intents%rowtype; begin
  perform public.require_imagekit_actor_v1(p_actor_id);
  v_i:=public.lock_imagekit_upload_v1(p_intent_id,p_actor_id);
  if v_i.status='prepared' and v_i.expires_at<=pg_catalog.clock_timestamp() then
    update public.media_upload_intents set status='expired',resolved_at=pg_catalog.clock_timestamp() where id=p_intent_id;
  end if;
  return public.imagekit_upload_snapshot_v1(p_intent_id);
end; $$;

create or replace function public.claim_imagekit_upload_v1(p_intent_id uuid,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_i public.media_upload_intents%rowtype; v_issued timestamptz; v_now timestamptz; v_exp timestamptz; begin
  perform public.require_imagekit_actor_v1(p_actor_id);
  v_i:=public.lock_imagekit_upload_v1(p_intent_id,p_actor_id);
  if v_i.status<>'prepared' then return public.imagekit_upload_snapshot_v1(p_intent_id)||jsonb_build_object('outcome','terminal'); end if;
  v_now:=pg_catalog.clock_timestamp();
  if v_i.expires_at<=v_now then
    update public.media_upload_intents set status='expired',resolved_at=v_now where id=p_intent_id;
    return public.imagekit_upload_snapshot_v1(p_intent_id)||jsonb_build_object('outcome','terminal'); end if;
  select issued_at into v_issued from public.media_imagekit_upload_lifecycle where intent_id=p_intent_id;
  if v_issued is not null then return public.imagekit_upload_snapshot_v1(p_intent_id)||jsonb_build_object('outcome','already_issued'); end if;
  if exists(select 1 from public.media_assets where id=v_i.asset_id) then
    update public.media_upload_intents set status='cancelled',resolved_at=v_now where id=p_intent_id;
    return public.imagekit_upload_snapshot_v1(p_intent_id)||jsonb_build_object('outcome','terminal'); end if;
  -- Integer seconds match the payload-bound signer. Persist BEFORE returning;
  -- a lost response cannot safely reissue the one-shot authority.
  v_now:=pg_catalog.date_trunc('second',v_now);
  v_exp:=least(v_now+interval '5 minutes',pg_catalog.date_trunc('second',v_i.expires_at)-interval '2 seconds');
  if v_exp<v_now+interval '30 seconds' then
    update public.media_upload_intents set status='cancelled',resolved_at=pg_catalog.clock_timestamp() where id=p_intent_id;
    return public.imagekit_upload_snapshot_v1(p_intent_id)||jsonb_build_object('outcome','too_late'); end if;
  update public.media_imagekit_upload_lifecycle set issued_at=v_now,authority_expires_at=v_exp,updated_at=pg_catalog.clock_timestamp() where intent_id=p_intent_id;
  insert into public.audit_logs(actor_id,action,table_name,record_id,metadata)
    values(p_actor_id,'imagekit_upload_issued','media_upload_intents',p_intent_id::text,'{}');
  return public.imagekit_upload_snapshot_v1(p_intent_id)||jsonb_build_object('outcome','issued');
end; $$;

create or replace function public.close_imagekit_upload_v1(p_intent_id uuid,p_actor_id uuid,p_status text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_i public.media_upload_intents%rowtype; begin
  perform public.require_imagekit_actor_v1(p_actor_id);
  if p_status is null or p_status not in ('cancelled','failed') then raise exception 'invalid_imagekit_close_status' using errcode='22023'; end if;
  v_i:=public.lock_imagekit_upload_v1(p_intent_id,p_actor_id);
  if v_i.status='prepared' then
    update public.media_upload_intents set status=case when expires_at<=pg_catalog.clock_timestamp() then 'expired' else p_status end,
      resolved_at=pg_catalog.clock_timestamp() where id=p_intent_id;
  end if;
  return public.imagekit_upload_snapshot_v1(p_intent_id);
end; $$;

create or replace function public.finalize_imagekit_upload_v1(p_intent_id uuid,p_actor_id uuid,p_evidence jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_i public.media_upload_intents%rowtype; v_l public.media_imagekit_upload_lifecycle%rowtype;
  v_o public.media_physical_objects%rowtype; v_variant uuid; v_url text; v_key text; begin
  perform public.require_imagekit_actor_v1(p_actor_id);
  v_i:=public.lock_imagekit_upload_v1(p_intent_id,p_actor_id);
  select * into v_l from public.media_imagekit_upload_lifecycle where intent_id=p_intent_id;
  -- Only server-observed facts from the read-only verifier belong here. This
  -- RPC is service-only, not an alternative to AAL2/origin/verifier checks.
  if p_evidence is null or jsonb_typeof(p_evidence)<>'object' or not (p_evidence ?& array[
      'storageProvider','storageContainer','objectKey','fileId','versionId','versionToken','deliveryUrl','mimeType','byteSize','checksumSha256'])
    or (p_evidence-array['storageProvider','storageContainer','objectKey','fileId','versionId','versionToken','deliveryUrl','mimeType','byteSize','checksumSha256'])<>'{}'::jsonb then
    raise exception 'invalid_imagekit_evidence' using errcode='22023'; end if;
  foreach v_key in array array['storageProvider','storageContainer','objectKey','fileId','versionId','versionToken','deliveryUrl','mimeType','checksumSha256'] loop
    if jsonb_typeof(p_evidence->v_key) is distinct from 'string' then raise exception 'invalid_imagekit_evidence' using errcode='22023'; end if;
  end loop;
  v_url:='https://ik.imagekit.io/'||v_i.storage_container||'/'||v_i.object_key;
  if p_evidence->>'storageProvider'<>'imagekit' or p_evidence->>'storageContainer'<>v_i.storage_container
    or p_evidence->>'objectKey'<>v_i.object_key or p_evidence->>'deliveryUrl'<>v_url
    or p_evidence->>'mimeType'<>v_i.expected_mime_type or p_evidence->>'checksumSha256'<>v_i.expected_checksum_sha256
    or jsonb_typeof(p_evidence->'byteSize') is distinct from 'number'
    or p_evidence->'byteSize' is distinct from to_jsonb(v_i.expected_byte_size)
    or (p_evidence->>'fileId') !~ '^[A-Za-z0-9_-]{1,128}$'
    or (p_evidence->>'versionId') !~ '^[A-Za-z0-9_-]{1,128}$'
    or (p_evidence->>'versionToken') !~ '^[A-Za-z0-9_.-]+$' or char_length(p_evidence->>'versionToken')>256 then
    raise exception 'imagekit_evidence_mismatch' using errcode='23514'; end if;
  if v_i.status='consumed' then
    if v_l.file_id is distinct from p_evidence->>'fileId' or v_l.version_id is distinct from p_evidence->>'versionId'
      or v_l.version_token is distinct from p_evidence->>'versionToken' then
      raise exception 'imagekit_consumption_conflict' using errcode='23505'; end if;
    -- Never revive a trashed asset or overwrite edits when a response is lost.
    return public.imagekit_upload_snapshot_v1(p_intent_id)||jsonb_build_object('outcome','already_consumed');
  end if;
  if v_i.status<>'prepared' or v_i.expires_at<=pg_catalog.clock_timestamp() or v_l.issued_at is null
    or v_l.cleanup_state<>'not_needed' then raise exception 'imagekit_intent_not_finalizable' using errcode='55000'; end if;
  if pg_catalog.to_regprocedure('public.is_imagekit_media_source_trashable_v1(text)') is null then
    raise exception 'imagekit_publication_requires_0048' using errcode='55000'; end if;
  select * into v_o from public.media_physical_objects where id=v_i.physical_object_id for update;
  if not found or v_o.status<>'pending' or v_o.storage_provider<>'imagekit'
    or v_o.storage_container<>v_i.storage_container or v_o.object_key<>v_i.object_key
    or v_o.media_type<>v_i.expected_media_type or v_o.mime_type<>v_i.expected_mime_type then
    raise exception 'imagekit_reserved_object_changed' using errcode='23514'; end if;
  insert into public.media_imagekit_file_bindings(storage_container,file_id,intent_id)
    values(v_i.storage_container,p_evidence->>'fileId',p_intent_id);
  update public.media_physical_objects set delivery_url=v_url,byte_size=v_i.expected_byte_size,
    checksum_sha256=v_i.expected_checksum_sha256,status='ready' where id=v_i.physical_object_id;
  insert into public.media_assets(id,label,alt,src,media_type,usage_key,sort_order,is_published,storage_bucket,storage_path,file_size,mime_type,metadata)
    values(v_i.asset_id,v_i.asset_metadata->>'label',v_i.asset_metadata->>'alt',v_url,v_i.expected_media_type,
      v_i.asset_metadata->>'usageKey',(v_i.asset_metadata->>'sortOrder')::integer,(v_i.asset_metadata->>'isPublished')::boolean,
      '','',v_i.expected_byte_size,v_i.expected_mime_type,'{}');
  v_variant:=pg_catalog.gen_random_uuid();
  insert into public.media_asset_variants(id,asset_id,physical_object_id,variant_kind,preset_key,status,is_preferred,created_by)
    values(v_variant,v_i.asset_id,v_i.physical_object_id,'source','source','ready',true,p_actor_id);
  update public.media_imagekit_upload_lifecycle set file_id=p_evidence->>'fileId',version_id=p_evidence->>'versionId',
    version_token=p_evidence->>'versionToken',source_variant_id=v_variant,updated_at=pg_catalog.clock_timestamp() where intent_id=p_intent_id;
  -- Recheck after potentially blocking INSERT/trigger locks. Throwing rolls
  -- back ALL of the binding, asset, object and variant writes above.
  if v_i.expires_at<=pg_catalog.clock_timestamp() then raise exception 'imagekit_intent_expired_during_finalize' using errcode='55000'; end if;
  update public.media_upload_intents set status='consumed',resolved_at=pg_catalog.clock_timestamp() where id=p_intent_id;
  if not public.is_imagekit_media_source_trashable_v1(v_i.asset_id) then
    raise exception 'imagekit_publication_trash_contract_failed' using errcode='23514'; end if;
  insert into public.audit_logs(actor_id,action,table_name,record_id,metadata)
    values(p_actor_id,'imagekit_upload_consumed','media_upload_intents',p_intent_id::text,jsonb_build_object('assetId',v_i.asset_id));
  return public.imagekit_upload_snapshot_v1(p_intent_id)||jsonb_build_object('outcome','consumed');
end; $$;

-- A bounded worker poll also expires abandoned prepared intents. Skip busy
-- advisory/row locks; never turn a slow active upload into a cleanup candidate.
create or replace function public.claim_imagekit_upload_cleanup_v1(p_worker_id text,p_limit integer default 10)
returns setof jsonb language plpgsql security definer set search_path='' as $$
declare v_candidate record; v_i public.media_upload_intents%rowtype; v_l public.media_imagekit_upload_lifecycle%rowtype;
  v_now timestamptz; v_lease uuid; begin
  if p_worker_id is null or p_worker_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' or p_limit is null or p_limit not between 1 and 50 then
    raise exception 'invalid_imagekit_cleanup_request' using errcode='22023'; end if;
  for v_candidate in select i.id,i.asset_id from public.media_upload_intents i join public.media_imagekit_upload_lifecycle l on l.intent_id=i.id
    where (i.status='prepared' and i.expires_at<=pg_catalog.clock_timestamp()) or
      (i.status in ('expired','cancelled','failed') and l.cleanup_after<=pg_catalog.clock_timestamp()
        and (l.cleanup_state='pending' or (l.cleanup_state='leased' and l.cleanup_lease_expires_at<=pg_catalog.clock_timestamp())))
    order by i.expires_at,i.id limit p_limit loop
    if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('media_upload_intent_v1:id:'||v_candidate.id::text,0))
      or not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('media_pipeline_v1:'||v_candidate.asset_id,0))
      or not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('media_upload_intent_v1:asset:'||v_candidate.asset_id,0)) then continue; end if;
    select * into v_i from public.media_upload_intents where id=v_candidate.id for update skip locked;
    if not found then continue; end if;
    select * into v_l from public.media_imagekit_upload_lifecycle where intent_id=v_i.id for update skip locked;
    if not found then continue; end if;
    v_now:=pg_catalog.clock_timestamp();
    if v_i.status='prepared' and v_i.expires_at<=v_now then
      update public.media_upload_intents set status='expired',resolved_at=v_now where id=v_i.id;
      continue; -- Settling delay before observation; NOT proof of upload quiescence.
    end if;
    if v_i.status not in ('expired','cancelled','failed') or v_l.cleanup_after>v_now
      or v_l.cleanup_state not in ('pending','leased') or (v_l.cleanup_state='leased' and v_l.cleanup_lease_expires_at>v_now) then continue; end if;
    if v_l.cleanup_attempts>=5 or exists(select 1 from public.media_asset_variants where physical_object_id=v_i.physical_object_id)
      or exists(select 1 from public.media_physical_objects where id=v_i.physical_object_id and status in ('ready','retired'))
      or exists(select 1 from public.media_assets where src='https://ik.imagekit.io/'||v_i.storage_container||'/'||v_i.object_key)
      or exists(select 1 from public.media_asset_references('https://ik.imagekit.io/'||v_i.storage_container||'/'||v_i.object_key)) then
      update public.media_imagekit_upload_lifecycle set cleanup_state='attention',last_cleanup_code=case when v_l.cleanup_attempts>=5 then 'exhausted' else 'unsafe' end,
        cleanup_lease_id=null,cleanup_worker_id=null,cleanup_lease_expires_at=null,updated_at=v_now where intent_id=v_i.id;
      insert into public.audit_logs(action,table_name,record_id,metadata) values('imagekit_cleanup_attention','media_upload_intents',v_i.id::text,'{}');
      continue;
    end if;
    v_lease:=pg_catalog.gen_random_uuid();
    update public.media_imagekit_upload_lifecycle set cleanup_state='leased',cleanup_attempts=cleanup_attempts+1,
      cleanup_lease_id=v_lease,cleanup_worker_id=p_worker_id,cleanup_lease_expires_at=v_now+interval '5 minutes',updated_at=v_now where intent_id=v_i.id;
    insert into public.audit_logs(action,table_name,record_id,metadata) values('imagekit_cleanup_claimed','media_upload_intents',v_i.id::text,'{}');
    return next public.imagekit_upload_snapshot_v1(v_i.id)||jsonb_build_object('leaseId',v_lease,'leaseExpiresAt',v_now+interval '5 minutes');
  end loop;
end; $$;

-- This batch records observations only. There is deliberately NO successful
-- deletion/absence completion RPC until 7A.2f.3 proves provider-side ownership,
-- in-flight quiescence and immutable deletion identity. Absence is not proof.
create or replace function public.finish_imagekit_upload_cleanup_v1(p_intent_id uuid,p_lease_id uuid,p_worker_id text,p_result text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_i public.media_upload_intents%rowtype; v_l public.media_imagekit_upload_lifecycle%rowtype; v_now timestamptz; v_state text; begin
  if p_result is null or p_result not in ('absent','retry','unsafe') or p_lease_id is null or p_worker_id is null then
    raise exception 'invalid_imagekit_cleanup_result' using errcode='22023'; end if;
  v_i:=public.lock_imagekit_upload_v1(p_intent_id,null);
  select * into v_l from public.media_imagekit_upload_lifecycle where intent_id=p_intent_id;
  v_now:=pg_catalog.clock_timestamp();
  if v_i.status not in ('expired','cancelled','failed') or v_l.cleanup_state<>'leased'
    or v_l.cleanup_lease_id is distinct from p_lease_id or v_l.cleanup_worker_id is distinct from p_worker_id
    or v_l.cleanup_lease_expires_at<=v_now then raise exception 'imagekit_cleanup_lease_conflict' using errcode='40001'; end if;
  v_state:=case when p_result='unsafe' or v_l.cleanup_attempts>=5 then 'attention' else 'pending' end;
  update public.media_imagekit_upload_lifecycle set cleanup_state=v_state,last_cleanup_code=p_result,
    cleanup_after=v_now+pg_catalog.make_interval(secs=>case when p_result='absent' then 86400 else 300*v_l.cleanup_attempts end),
    cleanup_lease_id=null,cleanup_worker_id=null,cleanup_lease_expires_at=null,updated_at=v_now where intent_id=p_intent_id;
  insert into public.audit_logs(action,table_name,record_id,metadata)
    values('imagekit_cleanup_observed','media_upload_intents',p_intent_id::text,jsonb_build_object('result',p_result,'state',v_state));
  return public.imagekit_upload_snapshot_v1(p_intent_id);
end; $$;

-- Explicit ACLs, including for helpers: PostgreSQL's default PUBLIC execute is
-- not an API. Browser roles cannot inspect or mutate operational records.
revoke all on function public.imagekit_mime_extension_v1(text),public.require_imagekit_actor_v1(uuid),
  public.lock_imagekit_upload_v1(uuid,uuid),public.imagekit_upload_snapshot_v1(uuid),public.guard_imagekit_intent_v1(),
  public.sync_imagekit_upload_cleanup_v1(),public.guard_imagekit_lifecycle_v1(),public.guard_imagekit_ready_object_v1()
  from public,anon,authenticated,service_role;
revoke all on function public.prepare_imagekit_upload_v1(uuid,text,jsonb,text,text,bigint,text,uuid,integer),
  public.resolve_imagekit_upload_v1(uuid,uuid),public.claim_imagekit_upload_v1(uuid,uuid),public.close_imagekit_upload_v1(uuid,uuid,text),
  public.finalize_imagekit_upload_v1(uuid,uuid,jsonb),public.claim_imagekit_upload_cleanup_v1(text,integer),
  public.finish_imagekit_upload_cleanup_v1(uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.prepare_imagekit_upload_v1(uuid,text,jsonb,text,text,bigint,text,uuid,integer),
  public.resolve_imagekit_upload_v1(uuid,uuid),public.claim_imagekit_upload_v1(uuid,uuid),public.close_imagekit_upload_v1(uuid,uuid,text),
  public.finalize_imagekit_upload_v1(uuid,uuid,jsonb),public.claim_imagekit_upload_cleanup_v1(text,integer),
  public.finish_imagekit_upload_cleanup_v1(uuid,uuid,text,text) to service_role;

comment on table public.media_imagekit_upload_lifecycle is 'Private durable one-shot issuance, verified provider binding and bounded reconciliation state; never credentials or upload JWTs.';
comment on table public.media_imagekit_file_bindings is 'Private account/file uniqueness fence. Existing Supabase assets and legacy intents are not adopted.';
commit;
