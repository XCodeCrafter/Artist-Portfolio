-- Read-only checks after 0040. Every passed value should be true.
select 'usage_rpc_service_only' as check_name,
  pg_catalog.has_function_privilege('service_role','public.get_media_library_v2_usage()','EXECUTE')
  and not pg_catalog.has_function_privilege('anon','public.get_media_library_v2_usage()','EXECUTE')
  and not pg_catalog.has_function_privilege('authenticated','public.get_media_library_v2_usage()','EXECUTE') as passed
union all
select 'mutation_rpc_service_only',
  pg_catalog.has_function_privilege('service_role','public.mutate_media_asset_v2(text,timestamptz,uuid,text,text,timestamptz)','EXECUTE')
  and not pg_catalog.has_function_privilege('anon','public.mutate_media_asset_v2(text,timestamptz,uuid,text,text,timestamptz)','EXECUTE')
  and not pg_catalog.has_function_privilege('authenticated','public.mutate_media_asset_v2(text,timestamptz,uuid,text,text,timestamptz)','EXECUTE')
union all
select 'all_reference_write_guards_installed', not exists(
  select 1 from public.media_library_reference_registry_v2() registry
  where not exists(select 1 from pg_catalog.pg_trigger trigger
    where trigger.tgrelid = pg_catalog.to_regclass('public.' || registry.table_name)
      and trigger.tgname = 'zz_media_library_reference_guard_v2'
      and trigger.tgenabled = 'O' and not trigger.tgisinternal)
)
union all
select 'internal_helpers_private', not exists(
  select 1 from (values
    ('public.media_library_reference_registry_v2()'),
    ('public.media_library_json_contains_v2(jsonb,text)'),
    ('public.replace_media_library_source_v2(jsonb,text,text)'),
    ('public.guard_media_library_references_v2()')
  ) as helper(signature)
  where pg_catalog.has_function_privilege('anon',helper.signature,'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated',helper.signature,'EXECUTE')
    or pg_catalog.has_function_privilege('service_role',helper.signature,'EXECUTE')
);
