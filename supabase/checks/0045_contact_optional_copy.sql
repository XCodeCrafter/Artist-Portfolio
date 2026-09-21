-- Read-only deployment checks after 0045. All six results must be true.
select 'contact_optional_copy_parent_ready' as check_name,
  exists(select 1 from public.site_settings where id = 'main')
  and exists(select 1 from public.page_heroes where page_slug = 'booking') as passed
union all
select 'contact_optional_copy_capability_ready',
  public.get_contact_copy_capabilities_v2() = '{"optionalDetails":true}'::jsonb
union all
select 'contact_optional_copy_rpcs_service_only', not exists(
  select 1 from (values
    ('public.get_contact_copy_capabilities_v2()'),
    ('public.save_contact_details_v2(text,timestamp with time zone,jsonb)'),
    ('public.get_contact_page_v2_snapshot(text)'),
    ('public.save_contact_hero_v2(text,timestamp with time zone,jsonb)')
  ) rpc(signature)
  where not pg_catalog.has_function_privilege('service_role', rpc.signature, 'EXECUTE')
    or pg_catalog.has_function_privilege('anon', rpc.signature, 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated', rpc.signature, 'EXECUTE')
)
union all
select 'contact_optional_copy_fixed_search_paths', count(*) = 2
  and bool_and(prosecdef and proconfig @> array['search_path=""'])
from pg_catalog.pg_proc where oid in (
  'public.save_contact_details_v2(text,timestamp with time zone,jsonb)'::regprocedure,
  'public.get_contact_copy_capabilities_v2()'::regprocedure
)
union all
select 'contact_optional_copy_empty_text_and_limits',
  pg_catalog.strpos(prosrc, 'pg_catalog.char_length(pg_catalog.btrim(p_payload ->> ''location'')) > 220') > 0
  and pg_catalog.strpos(prosrc, 'pg_catalog.char_length(pg_catalog.btrim(p_payload ->> ''contactBlurb'')) > 1000') > 0
  and pg_catalog.strpos(prosrc, 'not between 1 and') = 0
  and pg_catalog.strpos(prosrc, 'where supplied.key not in (''location'', ''contactBlurb'')') > 0
  and pg_catalog.strpos(prosrc, 'pg_catalog.jsonb_typeof(p_payload -> ''location'') is distinct from ''string''') > 0
  and pg_catalog.strpos(prosrc, 'pg_catalog.jsonb_typeof(p_payload -> ''contactBlurb'') is distinct from ''string''') > 0
from pg_catalog.pg_proc where oid = 'public.save_contact_details_v2(text,timestamp with time zone,jsonb)'::regprocedure
union all
select 'contact_optional_copy_shared_settings_cas',
  pg_catalog.strpos(prosrc, 'contact_page_v2:details:main') > 0
  and pg_catalog.strpos(prosrc, 'from public.site_settings as settings') > 0
  and pg_catalog.strpos(prosrc, 'for update;') > 0
  and pg_catalog.strpos(prosrc, 'v_current_version is distinct from p_expected_updated_at') > 0
  and pg_catalog.strpos(prosrc, 'contact_details_changed') > 0
  and pg_catalog.strpos(prosrc, 'where id = p_site_id') > 0
from pg_catalog.pg_proc where oid = 'public.save_contact_details_v2(text,timestamp with time zone,jsonb)'::regprocedure;
