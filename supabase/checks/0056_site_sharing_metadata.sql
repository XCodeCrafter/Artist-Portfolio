-- Read-only checks after 0056. Every passed value must be true.
select 'site_sharing_table_private_and_rls' as check_name,
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.site_sharing_config'::regclass)
  and not exists(select 1 from (values ('anon'),('authenticated'),('service_role')) caller(role_name)
    where pg_catalog.has_table_privilege(caller.role_name,'public.site_sharing_config','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')) as passed
union all
select 'site_sharing_editor_service_only', not exists(select 1 from (values
  ('public.get_site_sharing_editor_v2(text)'),('public.save_site_sharing_v2(text,timestamptz,jsonb)')) rpc(signature)
  where not pg_catalog.has_function_privilege('service_role',rpc.signature,'EXECUTE')
    or pg_catalog.has_function_privilege('anon',rpc.signature,'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated',rpc.signature,'EXECUTE'))
union all
select 'site_sharing_helpers_private', not exists(select 1 from (values ('anon'),('authenticated'),('service_role')) caller(role_name)
  cross join (values ('public.is_valid_site_sharing_v2(jsonb)'),('public.is_available_site_sharing_image_v2(text)'),
    ('public.validate_site_sharing_v2(jsonb)'),('public.guard_site_sharing_v2()')) helper(signature)
  where pg_catalog.has_function_privilege(caller.role_name,helper.signature,'EXECUTE'))
union all
select 'site_sharing_fixed_search_paths', count(*) = 7 and bool_and(prosecdef and proconfig @> array['search_path=""'])
  from pg_catalog.pg_proc where oid in ('public.is_valid_site_sharing_v2(jsonb)'::regprocedure,
    'public.is_available_site_sharing_image_v2(text)'::regprocedure,'public.validate_site_sharing_v2(jsonb)'::regprocedure,
    'public.guard_site_sharing_v2()'::regprocedure,'public.get_site_sharing_editor_v2(text)'::regprocedure,
    'public.save_site_sharing_v2(text,timestamptz,jsonb)'::regprocedure,'public.get_public_site_sharing_v2()'::regprocedure)
union all
select 'site_sharing_guards_enabled', count(*) = 2 and bool_and(tgenabled in ('O','A'))
  from pg_catalog.pg_trigger where tgrelid = 'public.site_sharing_config'::regclass and not tgisinternal
    and tgname in ('site_sharing_guard_v2','zz_media_library_reference_guard_v2')
union all
select 'site_sharing_constraints_validated', count(*) >= 2 and bool_and(convalidated)
  from pg_catalog.pg_constraint where conrelid = 'public.site_sharing_config'::regclass and contype = 'c'
union all
select 'site_sharing_singleton_valid', count(*) = 1 and bool_and(id = 'main' and public.is_valid_site_sharing_v2(payload))
  from public.site_sharing_config
union all
select 'site_sharing_media_references_protected', exists(select 1 from public.media_library_reference_registry_v2()
  where table_name = 'site_sharing_config' and columns = array['payload'] and json_columns = array['payload'])
  and exists(select 1 from public.media_library_reference_registry_v2() where table_name = 'content_archive_v2')
union all
select 'site_sharing_public_exact_projection', public.get_public_site_sharing_v2() ?& array['title','description','imageSrc','imageAlt']
  and (public.get_public_site_sharing_v2() - array['title','description','imageSrc','imageAlt']) = '{}'::jsonb
  and public.is_available_site_sharing_image_v2(public.get_public_site_sharing_v2()->>'imageSrc')
union all
select 'site_sharing_public_read_only_rpc',
  pg_catalog.has_function_privilege('anon','public.get_public_site_sharing_v2()','EXECUTE')
  and pg_catalog.has_function_privilege('authenticated','public.get_public_site_sharing_v2()','EXECUTE')
  and pg_catalog.has_function_privilege('service_role','public.get_public_site_sharing_v2()','EXECUTE')
  and (select provolatile = 's' from pg_catalog.pg_proc where oid = 'public.get_public_site_sharing_v2()'::regprocedure);
