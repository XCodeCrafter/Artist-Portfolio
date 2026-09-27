-- Dormant, observation-only account admission. Applying this migration approves
-- NO account, starts NO worker, and grants NO upload or deletion authority.
begin;

do $$ begin
  if pg_catalog.to_regprocedure('public.get_imagekit_upload_readiness_v1()') is null then
    raise exception 'imagekit_observation_requires_verified_0049' using errcode='55000';
  end if;
  if public.get_imagekit_upload_readiness_v1() is distinct from '{"version":1,"ready":true}'::jsonb then
    raise exception 'imagekit_observation_requires_verified_0049' using errcode='55000';
  end if;
end; $$;

-- Validate an existing table BEFORE any REVOKE/ALTER can silently repair it.
-- This private helper is also called after initial creation. It never writes.
create or replace function public.assert_imagekit_observation_registry_v1(p_require_existing boolean)
returns void language plpgsql stable security definer set search_path='' set intervalstyle='postgres' as $$
declare v_table oid:=pg_catalog.to_regclass('public.media_imagekit_observation_accounts');
begin
  if v_table is null and p_require_existing is false then return; end if;
  if v_table is null or not exists(select 1 from pg_catalog.pg_class where oid=v_table and relkind='r' and relrowsecurity)
    or exists(select 1 from pg_catalog.pg_policy where polrelid=v_table)
    or (select count(*) from pg_catalog.pg_attribute where attrelid=v_table and attnum>0 and not attisdropped)<>8
    or exists(select 1 from (values
      ('storage_container','text',true),('url_endpoint','text',true),('credential_binding','text',true),('revision','uuid',true),
      ('approved_by','uuid',true),('created_at','timestamp with time zone',true),('expires_at','timestamp with time zone',true),('revoked_at','timestamp with time zone',false)
    ) expected(name,type_name,required) left join pg_catalog.pg_attribute a on a.attrelid=v_table and a.attname=expected.name and not a.attisdropped
      where a.attnum is null or a.atttypid<>pg_catalog.to_regtype(expected.type_name) or a.attnotnull is distinct from expected.required)
    or (select count(*) from pg_catalog.pg_constraint where conrelid=v_table and contype in ('p','f','c'))<>4
    or not exists(select 1 from pg_catalog.pg_constraint where conrelid=v_table and contype='p' and convalidated
      and conkey=array[(select attnum from pg_catalog.pg_attribute where attrelid=v_table and attname='storage_container')]::smallint[])
    or not exists(select 1 from pg_catalog.pg_constraint where conrelid=v_table and contype='f' and convalidated
      and confrelid=pg_catalog.to_regclass('public.admin_profiles')
      and conkey=array[(select attnum from pg_catalog.pg_attribute where attrelid=v_table and attname='approved_by')]::smallint[]
      and confkey=array[(select attnum from pg_catalog.pg_attribute where attrelid=pg_catalog.to_regclass('public.admin_profiles') and attname='user_id')]::smallint[])
    or exists(select 1 from (values
      ('imagekit_observation_account_identity',$identity$CHECK (((storage_container ~ '^[A-Za-z0-9_-]{1,128}$'::text) AND (url_endpoint = ('https://ik.imagekit.io/'::text || storage_container)) AND (credential_binding ~ '^[0-9a-f]{64}$'::text)))$identity$),
      ('imagekit_observation_account_lifetime',$lifetime$CHECK ((isfinite(created_at) AND isfinite(expires_at) AND (expires_at > created_at) AND (expires_at <= (created_at + '24:00:00'::interval)) AND ((revoked_at IS NULL) OR (isfinite(revoked_at) AND (revoked_at >= created_at)))))$lifetime$)
    ) expected(name,definition) left join pg_catalog.pg_constraint c on c.conrelid=v_table and c.conname=expected.name and c.contype='c'
      where c.oid is null or not c.convalidated or pg_catalog.pg_get_constraintdef(c.oid) is distinct from expected.definition)
    or exists(select 1 from (values ('anon'),('authenticated'),('service_role')) caller(name)
      where pg_catalog.has_table_privilege(caller.name,v_table,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') is distinct from false
        or pg_catalog.has_any_column_privilege(caller.name,v_table,'SELECT,INSERT,UPDATE,REFERENCES') is distinct from false) then
    raise exception 'imagekit_observation_registry_shape_or_privacy_mismatch' using errcode='55000';
  end if;
end; $$;
revoke all on function public.assert_imagekit_observation_registry_v1(boolean) from public,anon,authenticated,service_role;
select public.assert_imagekit_observation_registry_v1(false);

create table if not exists public.media_imagekit_observation_accounts (
  storage_container text primary key,
  url_endpoint text not null,
  credential_binding text not null,
  revision uuid not null,
  approved_by uuid not null references public.admin_profiles(user_id),
  created_at timestamptz not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint imagekit_observation_account_identity check (
    storage_container ~ '^[A-Za-z0-9_-]{1,128}$'
    and url_endpoint='https://ik.imagekit.io/'||storage_container
    and credential_binding ~ '^[0-9a-f]{64}$'),
  constraint imagekit_observation_account_lifetime check (
    pg_catalog.isfinite(created_at) and pg_catalog.isfinite(expires_at)
    and expires_at>created_at and expires_at<=created_at+interval '24 hours'
    and (revoked_at is null or (pg_catalog.isfinite(revoked_at) and revoked_at>=created_at)))
);
alter table public.media_imagekit_observation_accounts enable row level security;
revoke all on table public.media_imagekit_observation_accounts from public,anon,authenticated,service_role;

-- All mutations lock the approval row BEFORE administrator rows, then the
-- existing intent/asset/lifecycle locks. Reapproval/revocation cannot pass a
-- running claim/finish. This does not retract a provider GET already in flight.
create or replace function public.lock_imagekit_observation_approval_v1(
  p_actor_id uuid,p_storage_container text,p_url_endpoint text,p_credential_binding text,
  p_approval_revision uuid,p_minimum_seconds integer
) returns public.media_imagekit_observation_accounts language plpgsql security definer set search_path='' as $$
declare v_a public.media_imagekit_observation_accounts%rowtype;
begin
  if p_actor_id is null or p_storage_container is null or p_storage_container !~ '^[A-Za-z0-9_-]{1,128}$'
    or p_url_endpoint is distinct from 'https://ik.imagekit.io/'||p_storage_container
    or p_credential_binding is null or p_credential_binding !~ '^[0-9a-f]{64}$'
    or p_approval_revision is null or p_minimum_seconds is null or p_minimum_seconds not in (5,35) then
    raise exception 'invalid_imagekit_observation_admission' using errcode='22023';
  end if;
  select * into v_a from public.media_imagekit_observation_accounts where storage_container=p_storage_container for share;
  if not found then raise exception 'imagekit_observation_not_approved' using errcode='42501'; end if;
  perform user_id from public.admin_profiles where user_id in (p_actor_id,v_a.approved_by) order by user_id for share;
  if not exists(select 1 from public.admin_profiles where user_id=p_actor_id and is_active and role in ('owner','admin'))
    or not exists(select 1 from public.admin_profiles where user_id=v_a.approved_by and is_active and role='owner')
    or v_a.url_endpoint is distinct from p_url_endpoint or v_a.credential_binding is distinct from p_credential_binding
    or v_a.revision is distinct from p_approval_revision or v_a.revoked_at is not null
    or v_a.created_at>pg_catalog.clock_timestamp()
    or v_a.expires_at<=pg_catalog.clock_timestamp()+pg_catalog.make_interval(secs=>p_minimum_seconds) then
    raise exception 'imagekit_observation_not_approved' using errcode='42501';
  end if;
  if public.get_imagekit_upload_readiness_v1() is distinct from '{"version":1,"ready":true}'::jsonb then
    raise exception 'imagekit_observation_not_ready' using errcode='55000';
  end if;
  return v_a;
end; $$;

create or replace function public.approve_imagekit_observation_account_v1(
  p_actor_id uuid,p_storage_container text,p_url_endpoint text,p_credential_binding text,p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_now timestamptz; v_a public.media_imagekit_observation_accounts%rowtype;
begin
  if p_actor_id is null or p_storage_container is null or p_storage_container !~ '^[A-Za-z0-9_-]{1,128}$'
    or p_url_endpoint is distinct from 'https://ik.imagekit.io/'||p_storage_container
    or p_credential_binding is null or p_credential_binding !~ '^[0-9a-f]{64}$'
    or p_expires_at is null or not pg_catalog.isfinite(p_expires_at) then
    raise exception 'invalid_imagekit_observation_approval' using errcode='22023';
  end if;
  perform storage_container from public.media_imagekit_observation_accounts where storage_container=p_storage_container for update;
  perform user_id from public.admin_profiles where user_id=p_actor_id for share;
  if not exists(select 1 from public.admin_profiles where user_id=p_actor_id and is_active and role='owner') then
    raise exception 'imagekit_observation_owner_required' using errcode='42501';
  end if;
  v_now:=pg_catalog.clock_timestamp();
  if p_expires_at<=v_now+interval '35 seconds' or p_expires_at>v_now+interval '24 hours' then
    raise exception 'invalid_imagekit_observation_approval_lifetime' using errcode='22023';
  end if;
  if public.get_imagekit_upload_readiness_v1() is distinct from '{"version":1,"ready":true}'::jsonb then
    raise exception 'imagekit_observation_not_ready' using errcode='55000';
  end if;
  insert into public.media_imagekit_observation_accounts(storage_container,url_endpoint,credential_binding,revision,approved_by,created_at,expires_at,revoked_at)
    values(p_storage_container,p_url_endpoint,p_credential_binding,pg_catalog.gen_random_uuid(),p_actor_id,v_now,p_expires_at,null)
    on conflict(storage_container) do update set url_endpoint=excluded.url_endpoint,credential_binding=excluded.credential_binding,
      revision=excluded.revision,approved_by=excluded.approved_by,created_at=excluded.created_at,expires_at=excluded.expires_at,revoked_at=null
    returning * into v_a;
  -- An initial concurrent insert can wait at the unique constraint. Check again
  -- after that wait; never report an already-expired approval as successful.
  if v_a.expires_at<=pg_catalog.clock_timestamp()+interval '35 seconds' then
    raise exception 'invalid_imagekit_observation_approval_lifetime' using errcode='22023';
  end if;
  insert into public.audit_logs(actor_id,action,table_name,record_id,metadata)
    values(p_actor_id,'imagekit_observation_account_approved','media_imagekit_observation_accounts',v_a.revision::text,'{}');
  return pg_catalog.jsonb_build_object('version',1,'storageContainer',v_a.storage_container,'urlEndpoint',v_a.url_endpoint,
    'credentialBinding',v_a.credential_binding,'revision',v_a.revision,'expiresAt',v_a.expires_at);
end; $$;

create or replace function public.revoke_imagekit_observation_account_v1(
  p_actor_id uuid,p_storage_container text,p_approval_revision uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_a public.media_imagekit_observation_accounts%rowtype;
begin
  if p_actor_id is null or p_storage_container is null or p_storage_container !~ '^[A-Za-z0-9_-]{1,128}$' or p_approval_revision is null then
    raise exception 'invalid_imagekit_observation_revocation' using errcode='22023';
  end if;
  select * into v_a from public.media_imagekit_observation_accounts where storage_container=p_storage_container for update;
  perform user_id from public.admin_profiles where user_id=p_actor_id for share;
  if not exists(select 1 from public.admin_profiles where user_id=p_actor_id and is_active and role='owner') then
    raise exception 'imagekit_observation_owner_required' using errcode='42501';
  end if;
  if v_a.storage_container is null or v_a.revision is distinct from p_approval_revision then
    raise exception 'imagekit_observation_approval_conflict' using errcode='40001';
  end if;
  if v_a.revoked_at is null then
    update public.media_imagekit_observation_accounts set revoked_at=greatest(created_at,pg_catalog.clock_timestamp()) where storage_container=p_storage_container;
    insert into public.audit_logs(actor_id,action,table_name,record_id,metadata)
      values(p_actor_id,'imagekit_observation_account_revoked','media_imagekit_observation_accounts',v_a.revision::text,'{}');
  end if;
  return pg_catalog.jsonb_build_object('version',1,'revision',v_a.revision,'revoked',true);
end; $$;

create or replace function public.get_imagekit_observation_approval_v1(
  p_actor_id uuid,p_storage_container text,p_url_endpoint text,p_credential_binding text
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_a public.media_imagekit_observation_accounts%rowtype;
begin
  if p_actor_id is null or not exists(select 1 from public.admin_profiles where user_id=p_actor_id and is_active and role in ('owner','admin')) then
    raise exception 'imagekit_observation_actor_not_active' using errcode='42501';
  end if;
  if p_storage_container is null or p_storage_container !~ '^[A-Za-z0-9_-]{1,128}$'
    or p_url_endpoint is distinct from 'https://ik.imagekit.io/'||p_storage_container
    or p_credential_binding is null or p_credential_binding !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_imagekit_observation_admission' using errcode='22023';
  end if;
  select a.* into v_a from public.media_imagekit_observation_accounts a join public.admin_profiles p on p.user_id=a.approved_by
    where a.storage_container=p_storage_container and a.url_endpoint=p_url_endpoint and a.credential_binding=p_credential_binding
      and a.revoked_at is null and a.created_at<=pg_catalog.statement_timestamp() and a.expires_at>pg_catalog.statement_timestamp()
      and p.is_active and p.role='owner';
  if not found then return null; end if;
  return pg_catalog.jsonb_build_object('version',1,'storageContainer',v_a.storage_container,'urlEndpoint',v_a.url_endpoint,
    'credentialBinding',v_a.credential_binding,'revision',v_a.revision,'expiresAt',v_a.expires_at);
end; $$;

-- Account filtering happens BEFORE any expiry, attention, lease or audit write.
-- Never delegate to the global 0047 claim and filter its already-mutated result.
create or replace function public.claim_imagekit_observation_v1(
  p_actor_id uuid,p_storage_container text,p_url_endpoint text,p_credential_binding text,p_approval_revision uuid,p_worker_id text
) returns setof jsonb language plpgsql security definer set search_path='' as $$
declare v_a public.media_imagekit_observation_accounts%rowtype; v_candidate record;
  v_i public.media_upload_intents%rowtype; v_l public.media_imagekit_upload_lifecycle%rowtype; v_now timestamptz; v_lease uuid;
begin
  if p_worker_id is null or p_worker_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then
    raise exception 'invalid_imagekit_observation_worker' using errcode='22023';
  end if;
  v_a:=public.lock_imagekit_observation_approval_v1(p_actor_id,p_storage_container,p_url_endpoint,p_credential_binding,p_approval_revision,35);
  for v_candidate in select i.id,i.asset_id from public.media_upload_intents i join public.media_imagekit_upload_lifecycle l on l.intent_id=i.id
    where i.storage_provider='imagekit' and i.storage_container=p_storage_container and (
      (i.status='prepared' and i.expires_at<=pg_catalog.clock_timestamp()) or
      (i.status in ('expired','cancelled','failed') and l.cleanup_after<=pg_catalog.clock_timestamp()
        and (l.cleanup_state='pending' or (l.cleanup_state='leased' and l.cleanup_lease_expires_at<=pg_catalog.clock_timestamp()))))
    order by i.expires_at,i.id limit 1 loop
    if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('media_upload_intent_v1:id:'||v_candidate.id::text,0))
      or not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('media_pipeline_v1:'||v_candidate.asset_id,0))
      or not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('media_upload_intent_v1:asset:'||v_candidate.asset_id,0)) then continue; end if;
    select * into v_i from public.media_upload_intents where id=v_candidate.id for update skip locked;
    if not found then continue; end if;
    select * into v_l from public.media_imagekit_upload_lifecycle where intent_id=v_i.id for update skip locked;
    if not found then continue; end if;
    v_now:=pg_catalog.clock_timestamp();
    if v_a.expires_at<=v_now+interval '35 seconds' then raise exception 'imagekit_observation_not_approved' using errcode='42501'; end if;
    if v_i.storage_provider<>'imagekit' or v_i.storage_container is distinct from p_storage_container then continue; end if;
    if v_i.status='prepared' and v_i.expires_at<=v_now then
      update public.media_upload_intents set status='expired',resolved_at=v_now where id=v_i.id;
      continue; -- Settling is NOT proof of upload quiescence or safe deletion.
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
    return next public.imagekit_upload_snapshot_v1(v_i.id)||pg_catalog.jsonb_build_object('leaseId',v_lease,'leaseExpiresAt',v_now+interval '5 minutes');
  end loop;
  if v_a.expires_at<=pg_catalog.clock_timestamp()+interval '35 seconds' then
    raise exception 'imagekit_observation_not_approved' using errcode='42501';
  end if;
end; $$;

create or replace function public.finish_imagekit_observation_v1(
  p_actor_id uuid,p_storage_container text,p_url_endpoint text,p_credential_binding text,p_approval_revision uuid,
  p_worker_id text,p_intent_id uuid,p_lease_id uuid,p_result text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_a public.media_imagekit_observation_accounts%rowtype; v_i public.media_upload_intents%rowtype; v_result jsonb;
begin
  if p_intent_id is null or p_lease_id is null or p_worker_id is null or p_worker_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or p_result is null or p_result not in ('absent','retry','unsafe') then
    raise exception 'invalid_imagekit_observation_result' using errcode='22023';
  end if;
  v_a:=public.lock_imagekit_observation_approval_v1(p_actor_id,p_storage_container,p_url_endpoint,p_credential_binding,p_approval_revision,5);
  -- Read-only early scope check avoids even taking another account's intent lock.
  if not exists(select 1 from public.media_upload_intents where id=p_intent_id and storage_provider='imagekit' and storage_container=p_storage_container) then
    raise exception 'imagekit_observation_intent_scope' using errcode='42501';
  end if;
  v_i:=public.lock_imagekit_upload_v1(p_intent_id,null);
  if v_i.storage_provider<>'imagekit' or v_i.storage_container is distinct from p_storage_container then
    raise exception 'imagekit_observation_intent_scope' using errcode='42501';
  end if;
  if v_a.expires_at<=pg_catalog.clock_timestamp()+interval '5 seconds' then raise exception 'imagekit_observation_not_approved' using errcode='42501'; end if;
  v_result:=public.finish_imagekit_upload_cleanup_v1(p_intent_id,p_lease_id,p_worker_id,p_result);
  if v_a.expires_at<=pg_catalog.clock_timestamp()+interval '5 seconds' then raise exception 'imagekit_observation_not_approved' using errcode='42501'; end if;
  return v_result;
end; $$;

revoke all on function public.lock_imagekit_observation_approval_v1(uuid,text,text,text,uuid,integer),
  public.approve_imagekit_observation_account_v1(uuid,text,text,text,timestamptz),
  public.revoke_imagekit_observation_account_v1(uuid,text,uuid),public.get_imagekit_observation_approval_v1(uuid,text,text,text),
  public.claim_imagekit_observation_v1(uuid,text,text,text,uuid,text),
  public.finish_imagekit_observation_v1(uuid,text,text,text,uuid,text,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.approve_imagekit_observation_account_v1(uuid,text,text,text,timestamptz),
  public.revoke_imagekit_observation_account_v1(uuid,text,uuid),public.get_imagekit_observation_approval_v1(uuid,text,text,text),
  public.claim_imagekit_observation_v1(uuid,text,text,text,uuid,text),
  public.finish_imagekit_observation_v1(uuid,text,text,text,uuid,text,uuid,uuid,text) to service_role;

-- The transaction rolls back all DDL if the final registry is not exact/private.
select public.assert_imagekit_observation_registry_v1(true);
commit;
