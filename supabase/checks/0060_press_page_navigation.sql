-- Read-only. Owner visibility/order choices are intentionally not asserted.
select 'press_destination_allowed' as check_name, exists (
  select 1 from pg_catalog.pg_constraint where conrelid = 'public.site_navigation_items'::regclass
    and conname = 'site_navigation_items_destination_key_valid'
    and pg_catalog.pg_get_constraintdef(oid) like '%''press''%'
) as passed
union all
select 'press_navigation_rpc_contract', exists (
  select 1 from pg_catalog.pg_proc where oid = 'public.save_site_navigation_v2(text,smallint,jsonb,jsonb)'::regprocedure
    and prosecdef and proconfig @> array['search_path=""']
    and pg_catalog.md5(pg_catalog.replace(prosrc,E'\r\n',E'\n')) = '731a6e75dd85b8680965d39473f917b7'
)
union all
select 'navigation_rpc_service_only',
  pg_catalog.has_function_privilege('service_role','public.save_site_navigation_v2(text,smallint,jsonb,jsonb)','EXECUTE')
  and not pg_catalog.has_function_privilege('anon','public.save_site_navigation_v2(text,smallint,jsonb,jsonb)','EXECUTE')
  and not pg_catalog.has_function_privilege('authenticated','public.save_site_navigation_v2(text,smallint,jsonb,jsonb)','EXECUTE')
union all
select 'navigation_direct_writes_still_revoked', not exists (
  select 1 from (values ('anon'),('authenticated'),('service_role')) roles(role_name)
  where pg_catalog.has_table_privilege(role_name,'public.site_navigation_items','INSERT,UPDATE,DELETE')
)
union all
select 'press_navigation_row_present', exists (
  select 1 from public.site_navigation_items where site_id = 'main' and destination_key = 'press'
)
union all
select 'legacy_profiles_allow_press', (
  select count(*) = 2 from pg_catalog.pg_constraint where conrelid = 'public.site_settings'::regclass
    and conname in ('site_settings_hidden_nav_page_slugs_actor_valid','site_settings_hidden_nav_page_slugs_musician_valid')
    and pg_catalog.pg_get_constraintdef(oid) like '%''press''%'
)
union all
select 'existing_press_media_guard_retained', exists (
  select 1 from pg_catalog.pg_trigger where tgrelid = 'public.home_page_config'::regclass
    and tgname = 'zz_media_library_reference_guard_v2' and not tgisinternal and tgenabled in ('O','A')
)
union all
select 'navigation_rls_retained', coalesce((
  select relrowsecurity from pg_catalog.pg_class where oid = 'public.site_navigation_items'::regclass
),false);
