-- Read-only checks after 0055. Every passed value must be true.
select 'home_editorial_rpc_service_only' as check_name,
  pg_catalog.has_function_privilege('service_role','public.save_home_editorial_section_v2(text,text,timestamptz,jsonb)','EXECUTE')
  and not pg_catalog.has_function_privilege('anon','public.save_home_editorial_section_v2(text,text,timestamptz,jsonb)','EXECUTE')
  and not pg_catalog.has_function_privilege('authenticated','public.save_home_editorial_section_v2(text,text,timestamptz,jsonb)','EXECUTE') as passed
union all
select 'home_editorial_helpers_private', not exists(select 1 from (values ('anon'),('authenticated'),('service_role')) caller(role_name)
  cross join (values ('public.is_safe_home_editorial_href_v2(text)'),
    ('public.validate_home_editorial_section_v2(text,jsonb,boolean)'),('public.guard_home_editorial_sections_v2()')) helper(signature)
  where pg_catalog.has_function_privilege(caller.role_name,helper.signature,'EXECUTE'))
union all
select 'home_editorial_fixed_search_paths', count(*) = 4 and bool_and(prosecdef and proconfig @> array['search_path=""'])
  from pg_catalog.pg_proc where oid in ('public.is_safe_home_editorial_href_v2(text)'::regprocedure,
    'public.validate_home_editorial_section_v2(text,jsonb,boolean)'::regprocedure,'public.guard_home_editorial_sections_v2()'::regprocedure,
    'public.save_home_editorial_section_v2(text,text,timestamptz,jsonb)'::regprocedure)
union all
select 'home_editorial_guards_enabled', count(*) = 2 and bool_and(tgenabled in ('O','A'))
  from pg_catalog.pg_trigger where tgrelid = 'public.home_page_config'::regclass and not tgisinternal
    and tgname in ('home_editorial_sections_guard_v2','zz_media_library_reference_guard_v2')
union all
select 'home_editorial_seven_layout_slots', count(*) = 1 and bool_and(
  public.validate_home_editorial_section_v2('layout',draft->'layout',false) = draft->'layout')
  from public.home_page_config where id = 'main'
union all
select 'home_editorial_sections_valid', count(*) = 1 and bool_and(
  public.validate_home_editorial_section_v2('release',draft->'release',false) = draft->'release'
  and public.validate_home_editorial_section_v2('work',draft->'work',false) = draft->'work'
  and public.validate_home_editorial_section_v2('press',draft->'press',false) = draft->'press')
  from public.home_page_config where id = 'main'
union all
select 'home_editorial_retired_layout_writes_blocked', pg_catalog.md5(pg_catalog.replace(prosrc,pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10))) = 'e4577d88a5313f14cea88d5c55bc0a78'
  from pg_catalog.pg_proc where oid = 'public.save_home_section_v2(text,text,timestamptz,jsonb)'::regprocedure
union all
select 'home_editorial_media_references_retained', exists(select 1 from public.media_library_reference_registry_v2()
  where table_name = 'home_page_config' and columns @> array['draft'] and json_columns @> array['draft'])
union all
select 'home_editorial_public_read_only_boundary',
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.home_page_config'::regclass)
  and pg_catalog.has_table_privilege('anon','public.home_page_config','SELECT')
  and pg_catalog.has_table_privilege('authenticated','public.home_page_config','SELECT')
  and not pg_catalog.has_table_privilege('anon','public.home_page_config','INSERT,UPDATE,DELETE,TRUNCATE')
  and not pg_catalog.has_table_privilege('authenticated','public.home_page_config','INSERT,UPDATE,DELETE,TRUNCATE');
