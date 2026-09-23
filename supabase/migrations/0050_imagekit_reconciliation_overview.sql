-- Read-only, bounded operational overview for Media V2. This does not issue an
-- upload, run a worker, contact ImageKit, or alter any existing lifecycle guard.
begin;

do $$ begin
  if pg_catalog.to_regprocedure('public.get_imagekit_upload_readiness_v1()') is null then
    raise exception 'imagekit_overview_requires_verified_0049' using errcode='55000';
  end if;
  if public.get_imagekit_upload_readiness_v1() is distinct from '{"version":1,"ready":true}'::jsonb then
    raise exception 'imagekit_overview_requires_verified_0049' using errcode='55000';
  end if;
end; $$;

create or replace function public.get_imagekit_reconciliation_overview_v1(
  p_actor_id uuid, p_limit integer default 20
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_result jsonb;
  v_invalid boolean;
begin
  -- Service-role execution is necessary, not sufficient. The server must supply
  -- an authenticated administrator; the UUID is never accepted from browser input.
  -- No FOR SHARE / mutating require-actor helper: this RPC stays truly read-only.
  if p_actor_id is null or not exists(select 1 from public.admin_profiles
    where user_id=p_actor_id and is_active and role in ('admin','owner')) then
    raise exception 'imagekit_overview_actor_not_active' using errcode='42501';
  end if;
  if p_limit is null or p_limit not between 1 and 50 then
    raise exception 'invalid_imagekit_overview_limit' using errcode='22023';
  end if;
  if pg_catalog.to_regprocedure('public.get_imagekit_upload_readiness_v1()') is null then
    raise exception 'imagekit_overview_not_ready' using errcode='55000';
  end if;
  if public.get_imagekit_upload_readiness_v1() is distinct from '{"version":1,"ready":true}'::jsonb then
    raise exception 'imagekit_overview_not_ready' using errcode='55000';
  end if;

  -- One statement snapshot supplies both the global counters and bounded list.
  -- Viewing an expired reservation must NOT resolve it, acquire a lease, write
  -- an audit log, or clear an observation. Unissued/consumed rows are not tasks.
  with eligible as materialized (
    select i.id, pg_catalog.btrim(i.asset_metadata->>'label') as label,
      i.expected_media_type as media_type, i.expected_byte_size as size_bytes,
      l.cleanup_attempts as attempts, l.last_cleanup_code as last_observation,
      greatest(i.updated_at,l.updated_at) as updated_at,
      case
        when l.cleanup_state='attention' then 'attention'
        when i.status='prepared' and i.expires_at>pg_catalog.statement_timestamp() then 'uploading'
        when i.status='prepared' then 'due'
        when l.cleanup_state='leased' and l.cleanup_lease_expires_at>pg_catalog.statement_timestamp() then 'checking'
        when l.cleanup_state='leased' then 'due'
        when l.cleanup_state='pending' and l.cleanup_after>pg_catalog.statement_timestamp() then 'waiting'
        when l.cleanup_state='pending' then 'due'
      end as stage,
      case
        when l.cleanup_state='attention' then null
        when i.status='prepared' then i.expires_at
        when l.cleanup_state='leased' then l.cleanup_lease_expires_at
        when l.cleanup_state='pending' then l.cleanup_after
      end as next_check_at,
      (i.storage_provider='imagekit'
        and i.expected_media_type in ('image','video')
        and i.expected_byte_size between 1 and (case when i.expected_media_type='image' then 10485760 else 95000000 end)
        and pg_catalog.jsonb_typeof(i.asset_metadata->'label')='string'
        and pg_catalog.char_length(pg_catalog.btrim(i.asset_metadata->>'label')) between 1 and 220
        and l.file_id is null and l.version_id is null and l.version_token is null and l.source_variant_id is null
        and ((i.status='prepared' and l.cleanup_state='not_needed')
          or (i.status in ('expired','cancelled','failed') and l.cleanup_state in ('pending','leased','attention')))
      ) is true as valid
    from public.media_upload_intents i
    join public.media_imagekit_upload_lifecycle l on l.intent_id=i.id
    where l.issued_at is not null and i.status in ('prepared','expired','cancelled','failed')
  ), summary as (
    select count(*)::integer as total,
      count(*) filter(where stage='uploading')::integer as uploading,
      count(*) filter(where stage='waiting')::integer as waiting,
      count(*) filter(where stage='due')::integer as due,
      count(*) filter(where stage='checking')::integer as checking,
      count(*) filter(where stage='attention')::integer as attention,
      coalesce(bool_or(not valid or stage is null),false) as invalid
    from eligible
  ), limited as (
    select *, case stage when 'attention' then 1 when 'due' then 2
      when 'checking' then 3 when 'waiting' then 4 when 'uploading' then 5 end as priority
    from eligible order by priority,updated_at,id limit p_limit
  )
  select pg_catalog.jsonb_build_object(
    'version',1,'generatedAt',pg_catalog.statement_timestamp(),'total',s.total,
    'counts',pg_catalog.jsonb_build_object('uploading',s.uploading,'waiting',s.waiting,
      'due',s.due,'checking',s.checking,'attention',s.attention),
    'items',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'intentId',id,'label',label,'mediaType',media_type,'sizeBytes',size_bytes,
      'stage',stage,'attempts',attempts,'lastObservation',last_observation,
      'nextCheckAt',next_check_at,'updatedAt',updated_at) order by priority,updated_at,id)
      from limited),'[]'::jsonb),
    'hasMore',s.total>(select count(*) from limited)),s.invalid into v_result,v_invalid
  from summary s;

  if v_invalid then
    raise exception 'imagekit_overview_state_unavailable' using errcode='55000';
  end if;
  return v_result;
end; $$;

revoke all on function public.get_imagekit_reconciliation_overview_v1(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.get_imagekit_reconciliation_overview_v1(uuid,integer) to service_role;
commit;
