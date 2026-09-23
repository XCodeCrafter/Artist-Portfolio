-- Batch 7A.2f.3b: bounded, read-only schema capability proof for the dormant
-- ImageKit coordinator. This is NOT provider/account/credential readiness.
-- No content, upload, provider object or previous migration is changed.
begin;

create or replace function public.get_imagekit_upload_readiness_v1()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_ready boolean;
  v_mutation text;
  v_finalize text;
  v_trash text;
begin
  -- Resolve names to OIDs before checking privileges. Name-form privilege
  -- helpers throw for absent objects; an incomplete deployment is simply not
  -- ready, and must never accidentally become a signing capability.
  with required(signature, service_access, definer) as (values
    ('public.prepare_imagekit_upload_v1(uuid,text,jsonb,text,text,bigint,text,uuid,integer)',true,true),
    ('public.resolve_imagekit_upload_v1(uuid,uuid)',true,true),
    ('public.claim_imagekit_upload_v1(uuid,uuid)',true,true),
    ('public.close_imagekit_upload_v1(uuid,uuid,text)',true,true),
    ('public.finalize_imagekit_upload_v1(uuid,uuid,jsonb)',true,true),
    ('public.claim_imagekit_upload_cleanup_v1(text,integer)',true,true),
    ('public.finish_imagekit_upload_cleanup_v1(uuid,uuid,text,text)',true,true),
    ('public.imagekit_mime_extension_v1(text)',false,false),
    ('public.require_imagekit_actor_v1(uuid)',false,true),
    ('public.lock_imagekit_upload_v1(uuid,uuid)',false,true),
    ('public.imagekit_upload_snapshot_v1(uuid)',false,true),
    ('public.guard_imagekit_intent_v1()',false,true),
    ('public.sync_imagekit_upload_cleanup_v1()',false,true),
    ('public.guard_imagekit_lifecycle_v1()',false,true),
    ('public.guard_imagekit_ready_object_v1()',false,true),
    ('public.is_imagekit_media_source_trashable_v1(text)',false,true),
    ('public.mutate_media_asset_v2(text,timestamp with time zone,uuid,text,text,timestamp with time zone)',true,true),
    ('public.media_library_reference_registry_v2()',false,true),
    ('public.guard_media_library_references_v2()',false,true),
    ('public.media_asset_references(text)',true,true),
    ('public.guard_media_physical_object_v1()',false,true),
    ('public.guard_media_asset_variant_v1()',false,true),
    ('public.guard_media_optimization_job_v1()',false,true)
  )
  select not exists(select 1 from required r left join pg_catalog.pg_proc p
    on p.oid=pg_catalog.to_regprocedure(r.signature)
    where p.oid is null or p.prokind<>'f' or p.prosecdef is distinct from r.definer
      or (r.signature='public.media_library_reference_registry_v2()' and p.provolatile<>'i')
      or not coalesce(p.proconfig @> array['search_path=""'],false)
      or pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE') is distinct from r.service_access
      or pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') is distinct from false
      or pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') is distinct from false)
    into v_ready;
  if not v_ready then return pg_catalog.jsonb_build_object('version',1,'ready',false); end if;

  -- Companion/binding/archive tables must remain private even to direct
  -- service-role access. Column grants are checked as well as table grants.
  with private_table(name) as (values ('public.media_imagekit_upload_lifecycle'),
    ('public.media_imagekit_file_bindings'),('public.content_archive_v2'))
  select not exists(select 1 from private_table t left join pg_catalog.pg_class c
    on c.oid=pg_catalog.to_regclass(t.name)
    where c.oid is null or c.relkind<>'r' or not c.relrowsecurity
      or exists(select 1 from pg_catalog.pg_policy where polrelid=c.oid)
      or exists(select 1 from (values ('anon'),('authenticated'),('service_role')) caller(name)
        where pg_catalog.has_table_privilege(caller.name,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') is distinct from false
          or pg_catalog.has_any_column_privilege(caller.name,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') is distinct from false))
    and (select count(*) from pg_catalog.pg_class where relrowsecurity and relkind='r' and oid in (
      pg_catalog.to_regclass('public.media_physical_objects'),pg_catalog.to_regclass('public.media_asset_variants'),
      pg_catalog.to_regclass('public.media_upload_intents'),pg_catalog.to_regclass('public.media_optimization_jobs')))=4
    into v_ready;
  if not v_ready then return pg_catalog.jsonb_build_object('version',1,'ready',false); end if;

  with required(relation_name,trigger_name,signature,trigger_type) as (values
    ('public.media_upload_intents','imagekit_intent_guard','public.guard_imagekit_intent_v1()',27),
    ('public.media_upload_intents','imagekit_intent_cleanup','public.sync_imagekit_upload_cleanup_v1()',17),
    ('public.media_imagekit_upload_lifecycle','imagekit_lifecycle_guard','public.guard_imagekit_lifecycle_v1()',27),
    ('public.media_physical_objects','imagekit_ready_object_guard','public.guard_imagekit_ready_object_v1()',27),
    ('public.media_physical_objects','media_physical_objects_integrity_guard','public.guard_media_physical_object_v1()',19),
    ('public.media_asset_variants','media_asset_variants_integrity_guard','public.guard_media_asset_variant_v1()',23),
    ('public.media_optimization_jobs','media_optimization_jobs_integrity_guard','public.guard_media_optimization_job_v1()',23)
  ) select not exists(select 1 from required r where not exists(select 1 from pg_catalog.pg_trigger t
    where t.tgrelid=pg_catalog.to_regclass(r.relation_name) and t.tgname=r.trigger_name
      and t.tgfoid=pg_catalog.to_regprocedure(r.signature) and t.tgtype=r.trigger_type
      and not t.tgisinternal and t.tgenabled in ('O','A') and t.tgqual is null
      and t.tgattr=''::pg_catalog.int2vector)) into v_ready;
  if not v_ready then return pg_catalog.jsonb_build_object('version',1,'ready',false); end if;

  with required(relation_name,constraint_name) as (values
    ('public.media_imagekit_upload_lifecycle','imagekit_issuance_shape'),
    ('public.media_imagekit_upload_lifecycle','imagekit_verified_binding_shape'),
    ('public.media_imagekit_upload_lifecycle','imagekit_cleanup_shape'),
    ('public.media_imagekit_file_bindings','imagekit_file_binding_identity'),
    ('public.media_upload_intents','media_upload_intents_asset_metadata_check'),
    ('public.media_upload_intents','media_upload_intents_lifecycle_check'),
    ('public.media_upload_intents','media_upload_intents_expected_sha256_check'),
    ('public.media_physical_objects','media_physical_objects_metadata_check'),
    ('public.media_physical_objects','media_physical_objects_ready_check')
  ) select not exists(select 1 from required r where not exists(select 1 from pg_catalog.pg_constraint c
    where c.conrelid=pg_catalog.to_regclass(r.relation_name) and c.conname=r.constraint_name
      and c.contype='c' and c.convalidated and not c.connoinherit and cardinality(c.conkey)>0)) into v_ready;
  if not v_ready then return pg_catalog.jsonb_build_object('version',1,'ready',false); end if;

  -- Check the actual key columns, referential action and live enforcement,
  -- not merely a same-named FK or an unrelated unique constraint.
  with required(relation_name,target_name,source_columns,target_columns) as (values
    ('public.media_upload_intents','public.media_physical_objects',
      array['physical_object_id','storage_provider','storage_container','object_key','expected_media_type','expected_mime_type'],
      array['id','storage_provider','storage_container','object_key','media_type','mime_type']),
    ('public.media_asset_variants','public.media_physical_objects',array['physical_object_id','required_physical_object_status'],array['id','status']),
    ('public.media_imagekit_upload_lifecycle','public.media_upload_intents',array['intent_id'],array['id']),
    ('public.media_imagekit_upload_lifecycle','public.media_asset_variants',array['source_variant_id'],array['id']),
    ('public.media_imagekit_file_bindings','public.media_imagekit_upload_lifecycle',array['intent_id'],array['intent_id'])
  ) select not exists(select 1 from required r where not exists(select 1 from pg_catalog.pg_constraint c
    where c.conrelid=pg_catalog.to_regclass(r.relation_name) and c.confrelid=pg_catalog.to_regclass(r.target_name)
      and c.contype='f' and c.convalidated and not c.condeferrable and not c.condeferred
      and c.confmatchtype='s' and c.confupdtype='a' and c.confdeltype='r'
      and array(select a.attname::text from pg_catalog.unnest(c.conkey) with ordinality k(num,pos)
        join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.num order by k.pos)=r.source_columns
      and array(select a.attname::text from pg_catalog.unnest(c.confkey) with ordinality k(num,pos)
        join pg_catalog.pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.num order by k.pos)=r.target_columns
      and (select count(*) from pg_catalog.pg_trigger t where t.tgconstraint=c.oid and t.tgisinternal
        and t.tgenabled in ('O','A') and t.tgqual is null)=4)) into v_ready;
  if not v_ready then return pg_catalog.jsonb_build_object('version',1,'ready',false); end if;

  with required(relation_name,key_columns) as (values
    ('public.media_imagekit_file_bindings',array['storage_container','file_id']),
    ('public.media_imagekit_file_bindings',array['intent_id']),
    ('public.media_imagekit_upload_lifecycle',array['intent_id']),
    ('public.media_imagekit_upload_lifecycle',array['source_variant_id']),
    ('public.media_upload_intents',array['id']),
    ('public.media_upload_intents',array['physical_object_id']),
    ('public.media_upload_intents',array['storage_provider','storage_container','object_key']),
    ('public.media_asset_variants',array['physical_object_id']),
    ('public.media_physical_objects',array['storage_provider','storage_container','object_key'])
  ) select not exists(select 1 from required r where not exists(select 1 from pg_catalog.pg_index i
    where i.indrelid=pg_catalog.to_regclass(r.relation_name) and i.indisunique and i.indisvalid and i.indisready
      and i.indimmediate and i.indpred is null and i.indexprs is null and i.indnatts=i.indnkeyatts
      and array(select a.attname::text from pg_catalog.unnest(i.indkey) with ordinality k(num,pos)
        join pg_catalog.pg_attribute a on a.attrelid=i.indrelid and a.attnum=k.num order by k.pos)=r.key_columns)) into v_ready;
  if not v_ready then return pg_catalog.jsonb_build_object('version',1,'ready',false); end if;

  if not exists(select 1 from pg_catalog.pg_index i
    where i.indexrelid=pg_catalog.to_regclass('public.media_upload_intents_active_asset_idx')
      and i.indrelid=pg_catalog.to_regclass('public.media_upload_intents')
      and i.indisunique and i.indisvalid and i.indisready and i.indimmediate
      and i.indexprs is null and i.indnatts=1 and i.indnkeyatts=1
      and array(select a.attname::text from pg_catalog.unnest(i.indkey) k(num)
        join pg_catalog.pg_attribute a on a.attrelid=i.indrelid and a.attnum=k.num)=array['asset_id']::text[]
      and pg_catalog.regexp_replace(pg_catalog.pg_get_expr(i.indpred,i.indrelid),'[[:space:]()]','','g')='status=''prepared''::text') then
    return pg_catalog.jsonb_build_object('version',1,'ready',false);
  end if;

  -- Ready-object FK is conditional on this stored generated column. Do not
  -- accept a regular writable column merely because the FK remains present.
  if not exists(select 1 from pg_catalog.pg_attribute a join pg_catalog.pg_attrdef d
    on d.adrelid=a.attrelid and d.adnum=a.attnum
    where a.attrelid=pg_catalog.to_regclass('public.media_asset_variants')
      and a.attname='required_physical_object_status' and a.attgenerated='s'
      and a.atttypid=pg_catalog.to_regtype('pg_catalog.text') and not a.attisdropped
      and pg_catalog.regexp_replace(pg_catalog.pg_get_expr(d.adbin,d.adrelid),'[[:space:]()]','','g')
        = 'CASEWHENstatus=''ready''::textTHEN''ready''::textELSENULL::textEND') then
    return pg_catalog.jsonb_build_object('version',1,'ready',false);
  end if;

  -- The registry is an immutable VALUES helper, so this remains bounded by
  -- schema size rather than media/content row count. Missing columns fail too.
  select exists(select 1 from public.media_library_reference_registry_v2()
    where table_name='content_archive_v2' and columns=array['row_data']::text[] and json_columns=array['row_data']::text[])
    and not exists(select 1 from public.media_library_reference_registry_v2() r
      where not exists(select 1 from pg_catalog.pg_trigger t
        where t.tgrelid=pg_catalog.to_regclass('public.'||r.table_name)
          and t.tgname='zz_media_library_reference_guard_v2'
          and t.tgfoid=pg_catalog.to_regprocedure('public.guard_media_library_references_v2()')
          and not t.tgisinternal and t.tgenabled in ('O','A') and t.tgtype=23
          and t.tgqual is null and t.tgattr=''::pg_catalog.int2vector)
        or exists(select 1 from pg_catalog.unnest(r.columns) col(name) where not exists(
          select 1 from pg_catalog.pg_attribute a where a.attrelid=pg_catalog.to_regclass('public.'||r.table_name)
            and a.attname=col.name and a.attnum>0 and not a.attisdropped))) into v_ready;
  if not v_ready then return pg_catalog.jsonb_build_object('version',1,'ready',false); end if;

  -- Integration contracts supplement the catalog checks: restore must not
  -- bypass source eligibility; finalization must assert the consumed binding.
  select pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(
    'public.mutate_media_asset_v2(text,timestamp with time zone,uuid,text,text,timestamp with time zone)')) into v_mutation;
  select pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure('public.finalize_imagekit_upload_v1(uuid,uuid,jsonb)')) into v_finalize;
  select pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure('public.is_imagekit_media_source_trashable_v1(text)')) into v_trash;
  v_ready:=pg_catalog.strpos(v_mutation,'not public.is_imagekit_media_source_trashable_v1(p_asset_id)')>0
    and pg_catalog.strpos(v_mutation,'not public.is_imagekit_media_source_trashable_v1(p_asset_id)')
      <pg_catalog.strpos(v_mutation,'if p_operation = ''restore'' then')
    and pg_catalog.strpos(v_finalize,'not public.is_imagekit_media_source_trashable_v1(v_i.asset_id)')>0
    and pg_catalog.strpos(v_trash,'public.media_imagekit_file_bindings')>0;
  return pg_catalog.jsonb_build_object('version',1,'ready',coalesce(v_ready,false));
exception when others then
  -- No catalog diagnostics or credential/account information crosses this
  -- narrow boundary. The server may report only an unavailable capability.
  return pg_catalog.jsonb_build_object('version',1,'ready',false);
end; $$;

revoke all on function public.get_imagekit_upload_readiness_v1() from public,anon,authenticated,service_role;
do $$ begin
  if public.get_imagekit_upload_readiness_v1() is distinct from '{"version":1,"ready":true}'::jsonb then
    raise exception 'imagekit_readiness_requires_verified_0047_0048' using errcode='55000';
  end if;
end; $$;
grant execute on function public.get_imagekit_upload_readiness_v1() to service_role;
commit;
