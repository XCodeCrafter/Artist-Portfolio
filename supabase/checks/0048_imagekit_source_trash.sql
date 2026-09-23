-- Read-only deployment checks after 0048. All results must be true.
select 'imagekit_source_trash_helper_private' as check_name, not exists(
  select 1 from (values ('anon'),('authenticated'),('service_role')) as caller(role_name)
  where pg_catalog.has_function_privilege(caller.role_name,'public.is_imagekit_media_source_trashable_v1(text)','EXECUTE')
) as passed
union all
select 'imagekit_source_trash_mutation_service_only',
  pg_catalog.has_function_privilege('service_role','public.mutate_media_asset_v2(text,timestamptz,uuid,text,text,timestamptz)','EXECUTE')
  and not pg_catalog.has_function_privilege('anon','public.mutate_media_asset_v2(text,timestamptz,uuid,text,text,timestamptz)','EXECUTE')
  and not pg_catalog.has_function_privilege('authenticated','public.mutate_media_asset_v2(text,timestamptz,uuid,text,text,timestamptz)','EXECUTE')
union all
select 'imagekit_source_trash_fixed_search_paths', count(*) = 2 and bool_and(prosecdef and proconfig @> array['search_path=""'])
from pg_catalog.pg_proc where oid in (
  'public.is_imagekit_media_source_trashable_v1(text)'::regprocedure,
  'public.mutate_media_asset_v2(text,timestamptz,uuid,text,text,timestamptz)'::regprocedure)
union all
select 'imagekit_source_trash_lifecycle_private',
  exists(select 1 from pg_catalog.pg_class where oid = 'public.media_imagekit_upload_lifecycle'::regclass and relrowsecurity)
  and not exists(select 1 from (values ('anon'),('authenticated'),('service_role')) as caller(role_name)
    where pg_catalog.has_table_privilege(caller.role_name,'public.media_imagekit_upload_lifecycle','SELECT,INSERT,UPDATE,DELETE'))
union all
select 'imagekit_source_trash_file_binding_private',
  exists(select 1 from pg_catalog.pg_class where oid = 'public.media_imagekit_file_bindings'::regclass and relrowsecurity)
  and not exists(select 1 from (values ('anon'),('authenticated'),('service_role')) as caller(role_name)
    where pg_catalog.has_table_privilege(caller.role_name,'public.media_imagekit_file_bindings','SELECT,INSERT,UPDATE,DELETE'))
  and exists(select 1 from pg_catalog.pg_constraint installed
    where installed.conrelid = 'public.media_imagekit_file_bindings'::regclass
      and installed.contype = 'p' and installed.convalidated
      and array(select attribute.attname from pg_catalog.unnest(installed.conkey) with ordinality as key(attnum,position)
        join pg_catalog.pg_attribute attribute on attribute.attrelid = installed.conrelid and attribute.attnum = key.attnum
        order by key.position) = array['storage_container','file_id']::pg_catalog.name[])
  and exists(select 1 from pg_catalog.pg_constraint installed
    where installed.conrelid = 'public.media_imagekit_file_bindings'::regclass
      and installed.contype = 'u' and installed.convalidated
      and array(select attribute.attname from pg_catalog.unnest(installed.conkey) with ordinality as key(attnum,position)
        join pg_catalog.pg_attribute attribute on attribute.attrelid = installed.conrelid and attribute.attnum = key.attnum
        order by key.position) = array['intent_id']::pg_catalog.name[])
union all
select 'imagekit_source_trash_archive_and_reference_guards',
  exists(select 1 from public.media_library_reference_registry_v2()
    where table_name = 'content_archive_v2' and columns = array['row_data']::text[])
  and not exists(select 1 from public.media_library_reference_registry_v2() registry
    where not exists(select 1 from pg_catalog.pg_trigger installed
      where installed.tgrelid = pg_catalog.to_regclass('public.' || registry.table_name)
        and installed.tgname = 'zz_media_library_reference_guard_v2'
        and installed.tgfoid = 'public.guard_media_library_references_v2()'::regprocedure
        and not installed.tgisinternal and installed.tgenabled in ('O','A')
        and installed.tgtype = 23 and installed.tgqual is null
        and installed.tgattr = ''::pg_catalog.int2vector))
union all
select 'imagekit_source_trash_ready_object_guard', exists(
  select 1 from pg_catalog.pg_constraint installed
  where installed.conrelid = 'public.media_asset_variants'::regclass
    and installed.conname = 'media_asset_variants_ready_object_fk'
    and installed.contype = 'f' and installed.convalidated
    and installed.confrelid = 'public.media_physical_objects'::regclass
    and not installed.condeferrable
    and (select count(*) from pg_catalog.pg_trigger enforcement
      where enforcement.tgconstraint = installed.oid and enforcement.tgisinternal
        and enforcement.tgenabled in ('O','A') and enforcement.tgqual is null) = 4
)
union all
select 'imagekit_source_trash_restore_protected',
  pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.mutate_media_asset_v2(text,timestamptz,uuid,text,text,timestamptz)'::regprocedure),
    'not public.is_imagekit_media_source_trashable_v1(p_asset_id)') > 0
  and pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.mutate_media_asset_v2(text,timestamptz,uuid,text,text,timestamptz)'::regprocedure),
    'not public.is_imagekit_media_source_trashable_v1(p_asset_id)')
    < pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.mutate_media_asset_v2(text,timestamptz,uuid,text,text,timestamptz)'::regprocedure),
      'if p_operation = ''restore'' then');
