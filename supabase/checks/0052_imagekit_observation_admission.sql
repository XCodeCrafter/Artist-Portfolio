-- Read-only schema checks. They never approve an account, acquire a lease,
-- issue an upload, contact ImageKit, or mutate existing media/content.
with rpc(signature) as (values
  ('public.approve_imagekit_observation_account_v1(uuid,text,text,text,timestamp with time zone)'),
  ('public.revoke_imagekit_observation_account_v1(uuid,text,uuid)'),
  ('public.get_imagekit_observation_approval_v1(uuid,text,text,text)'),
  ('public.claim_imagekit_observation_v1(uuid,text,text,text,uuid,text)'),
  ('public.finish_imagekit_observation_v1(uuid,text,text,text,uuid,text,uuid,uuid,text)')
), helper(signature) as (values ('public.lock_imagekit_observation_approval_v1(uuid,text,text,text,uuid,integer)'),('public.assert_imagekit_observation_registry_v1(boolean)'))
select 'imagekit_observation_accounts_private' as check_name,
  exists(select 1 from pg_catalog.pg_class where oid=pg_catalog.to_regclass('public.media_imagekit_observation_accounts') and relrowsecurity)
  and not exists(select 1 from pg_catalog.pg_policy where polrelid=pg_catalog.to_regclass('public.media_imagekit_observation_accounts'))
  and not exists(select 1 from (values ('anon'),('authenticated'),('service_role')) caller(name)
    where pg_catalog.has_table_privilege(caller.name,pg_catalog.to_regclass('public.media_imagekit_observation_accounts'),'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') is distinct from false
      or pg_catalog.has_any_column_privilege(caller.name,pg_catalog.to_regclass('public.media_imagekit_observation_accounts'),'SELECT,INSERT,UPDATE,REFERENCES') is distinct from false) as passed
union all
select 'imagekit_observation_rpc_service_only', not exists(select 1 from rpc where
  pg_catalog.has_function_privilege('service_role',pg_catalog.to_regprocedure(signature),'EXECUTE') is distinct from true
  or pg_catalog.has_function_privilege('anon',pg_catalog.to_regprocedure(signature),'EXECUTE') is distinct from false
  or pg_catalog.has_function_privilege('authenticated',pg_catalog.to_regprocedure(signature),'EXECUTE') is distinct from false)
union all
select 'imagekit_observation_helper_private', not exists(select 1 from helper cross join (values ('anon'),('authenticated'),('service_role')) caller(name)
  where pg_catalog.has_function_privilege(caller.name,pg_catalog.to_regprocedure(signature),'EXECUTE') is distinct from false)
union all
select 'imagekit_observation_fixed_search_paths', (select count(*)=7 and bool_and(prosecdef and prokind='f' and proconfig @> array['search_path=""'])
  from pg_catalog.pg_proc where oid in (select pg_catalog.to_regprocedure(signature) from rpc union all select pg_catalog.to_regprocedure(signature) from helper))
union all
select 'imagekit_observation_constraints_validated', (select count(*)=4 and bool_and(convalidated)
  from pg_catalog.pg_constraint where conrelid=pg_catalog.to_regclass('public.media_imagekit_observation_accounts') and contype in ('p','f','c'))
union all
select 'imagekit_observation_approval_read_only', exists(select 1 from pg_catalog.pg_proc
  where oid=pg_catalog.to_regprocedure('public.get_imagekit_observation_approval_v1(uuid,text,text,text)') and provolatile='s' and prorettype=pg_catalog.to_regtype('pg_catalog.jsonb'))
union all
select 'imagekit_observation_scoped_claim', exists(select 1 from pg_catalog.pg_proc
  where oid=pg_catalog.to_regprocedure('public.claim_imagekit_observation_v1(uuid,text,text,text,uuid,text)')
    and proretset and pronargs=6 and pronargdefaults=0
    and prosrc like '%i.storage_container=p_storage_container%'
    and prosrc like '%limit 1 loop%'
    and prosrc not like '%claim_imagekit_upload_cleanup_v1%')
union all
select 'imagekit_observation_revision_and_lease_fences', exists(select 1 from pg_catalog.pg_proc
  where oid=pg_catalog.to_regprocedure('public.lock_imagekit_observation_approval_v1(uuid,text,text,text,uuid,integer)')
    and prosrc like '%v_a.revision is distinct from p_approval_revision%' and prosrc like '%for share%')
  and exists(select 1 from pg_catalog.pg_proc where oid=pg_catalog.to_regprocedure('public.finish_imagekit_observation_v1(uuid,text,text,text,uuid,text,uuid,uuid,text)')
    and prosrc like '%public.finish_imagekit_upload_cleanup_v1(p_intent_id,p_lease_id,p_worker_id,p_result)%'
    and prosrc like '%v_i.storage_container is distinct from p_storage_container%')
union all
select 'imagekit_observation_parent_guards_ready', public.get_imagekit_upload_readiness_v1()='{"version":1,"ready":true}'::jsonb;
