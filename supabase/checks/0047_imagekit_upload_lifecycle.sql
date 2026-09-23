-- Read-only checks after 0047; run 0048 and its checks before any pilot wiring.
with rpc(signature) as (values
  ('public.prepare_imagekit_upload_v1(uuid,text,jsonb,text,text,bigint,text,uuid,integer)'),
  ('public.resolve_imagekit_upload_v1(uuid,uuid)'),('public.claim_imagekit_upload_v1(uuid,uuid)'),
  ('public.close_imagekit_upload_v1(uuid,uuid,text)'),('public.finalize_imagekit_upload_v1(uuid,uuid,jsonb)'),
  ('public.claim_imagekit_upload_cleanup_v1(text,integer)'),('public.finish_imagekit_upload_cleanup_v1(uuid,uuid,text,text)')
), helper(signature) as (values
  ('public.imagekit_mime_extension_v1(text)'),('public.require_imagekit_actor_v1(uuid)'),
  ('public.lock_imagekit_upload_v1(uuid,uuid)'),('public.imagekit_upload_snapshot_v1(uuid)'),
  ('public.guard_imagekit_intent_v1()'),('public.sync_imagekit_upload_cleanup_v1()'),
  ('public.guard_imagekit_lifecycle_v1()'),('public.guard_imagekit_ready_object_v1()')
)
select 'imagekit_lifecycle_tables_private' as check_name,
  (select count(*)=2 and bool_and(relrowsecurity) from pg_catalog.pg_class
    where oid in ('public.media_imagekit_upload_lifecycle'::regclass,'public.media_imagekit_file_bindings'::regclass))
  and not exists(select 1 from (values ('anon'),('authenticated'),('service_role')) caller(role_name)
    cross join (values ('public.media_imagekit_upload_lifecycle'),('public.media_imagekit_file_bindings')) target(table_name)
    where pg_catalog.has_table_privilege(caller.role_name,target.table_name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
  and not exists(select 1 from pg_catalog.pg_policy where polrelid in
    ('public.media_imagekit_upload_lifecycle'::regclass,'public.media_imagekit_file_bindings'::regclass)) as passed
union all
select 'imagekit_lifecycle_rpcs_service_only', not exists(select 1 from rpc where
  not pg_catalog.has_function_privilege('service_role',signature,'EXECUTE')
  or pg_catalog.has_function_privilege('anon',signature,'EXECUTE')
  or pg_catalog.has_function_privilege('authenticated',signature,'EXECUTE'))
union all
select 'imagekit_lifecycle_helpers_private', not exists(select 1 from helper
  cross join (values ('anon'),('authenticated'),('service_role')) caller(role_name)
  where pg_catalog.has_function_privilege(caller.role_name,signature,'EXECUTE'))
union all
select 'imagekit_lifecycle_fixed_search_paths', (select count(*)=15 and bool_and(proconfig @> array['search_path=""'])
  and bool_and(prosecdef or oid='public.imagekit_mime_extension_v1(text)'::regprocedure)
  from pg_catalog.pg_proc where oid in (select signature::regprocedure from rpc union all select signature::regprocedure from helper))
union all
select 'imagekit_lifecycle_guards_enabled', count(*)=4 and bool_and(not tgisinternal and tgenabled in ('O','A') and tgqual is null and tgattr=''::int2vector)
from pg_catalog.pg_trigger where (tgrelid,tgname,tgfoid,tgtype) in (
  ('public.media_upload_intents'::regclass,'imagekit_intent_guard','public.guard_imagekit_intent_v1()'::regprocedure,27),
  ('public.media_upload_intents'::regclass,'imagekit_intent_cleanup','public.sync_imagekit_upload_cleanup_v1()'::regprocedure,17),
  ('public.media_imagekit_upload_lifecycle'::regclass,'imagekit_lifecycle_guard','public.guard_imagekit_lifecycle_v1()'::regprocedure,27),
  ('public.media_physical_objects'::regclass,'imagekit_ready_object_guard','public.guard_imagekit_ready_object_v1()'::regprocedure,27))
union all
select 'imagekit_lifecycle_constraints_validated', count(*)=4 and bool_and(convalidated)
from pg_catalog.pg_constraint where (conrelid,conname) in (
  ('public.media_imagekit_upload_lifecycle'::regclass,'imagekit_issuance_shape'),
  ('public.media_imagekit_upload_lifecycle'::regclass,'imagekit_verified_binding_shape'),
  ('public.media_imagekit_upload_lifecycle'::regclass,'imagekit_cleanup_shape'),
  ('public.media_imagekit_file_bindings'::regclass,'imagekit_file_binding_identity'))
union all
select 'imagekit_lifecycle_unique_provider_binding', count(*)=2 and bool_and(convalidated and contype in ('p','u'))
from pg_catalog.pg_constraint where conrelid='public.media_imagekit_file_bindings'::regclass and contype in ('p','u')
union all
select 'imagekit_lifecycle_canonical_mimes', public.imagekit_mime_extension_v1('image/jpeg')='jpg'
  and public.imagekit_mime_extension_v1('video/quicktime')='mov'
  and public.imagekit_mime_extension_v1('image/svg+xml') is null
union all
select 'imagekit_lifecycle_consumed_integrity', not exists(
  select 1 from public.media_upload_intents i join public.media_imagekit_upload_lifecycle l on l.intent_id=i.id
  left join public.media_imagekit_file_bindings b on b.intent_id=i.id
  left join public.media_asset_variants v on v.id=l.source_variant_id
  left join public.media_physical_objects o on o.id=i.physical_object_id
  where i.storage_provider<>'imagekit' or i.object_key is distinct from
    'media/source/'||i.asset_id||'/'||i.id::text||'.'||public.imagekit_mime_extension_v1(i.expected_mime_type)
    or (i.status='consumed' and (l.file_id is null or l.issued_at is null or l.cleanup_state<>'not_needed'
      or b.storage_container is distinct from i.storage_container or b.file_id is distinct from l.file_id
      or v.physical_object_id is distinct from i.physical_object_id or v.asset_id is distinct from i.asset_id
      or v.status is distinct from 'ready' or o.status is distinct from 'ready'
      or o.delivery_url is distinct from 'https://ik.imagekit.io/'||i.storage_container||'/'||i.object_key))
    or (i.status in ('expired','failed','cancelled') and l.issued_at is not null and l.cleanup_state='not_needed'));
