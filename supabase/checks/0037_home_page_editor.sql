-- Read-only verification after applying 0037. Expected: every check is true.
-- Run in Supabase SQL Editor; this does not publish or modify HOME content.
select
  'home_table_rls' as check_name,
  coalesce((select relrowsecurity from pg_catalog.pg_class
    where oid = pg_catalog.to_regclass('public.home_page_config')), false) as passed
union all
select 'one_home_record', (select count(*) = 1 from public.home_page_config where id = 'main')
union all
select 'five_distinct_sections', coalesce((select
  pg_catalog.jsonb_array_length(draft -> 'layout') = 5
  and (select count(distinct item ->> 'id') = 5
    from pg_catalog.jsonb_array_elements(draft -> 'layout') as item)
  and exists(select 1 from pg_catalog.jsonb_array_elements(draft -> 'layout') as item
    where item -> 'enabled' = 'true'::jsonb)
  and draft ?& array['layout', 'hero', 'about', 'cnc', 'feature', 'stories']
  and pg_catalog.jsonb_array_length(draft #> '{stories,images}') = 4
  from public.home_page_config where id = 'main'), false)
union all
select 'anonymous_read_only',
  pg_catalog.has_table_privilege('anon', 'public.home_page_config', 'SELECT')
  and not pg_catalog.has_table_privilege('anon', 'public.home_page_config', 'INSERT,UPDATE,DELETE,TRUNCATE')
union all
select 'authenticated_read_only',
  pg_catalog.has_table_privilege('authenticated', 'public.home_page_config', 'SELECT')
  and not pg_catalog.has_table_privilege('authenticated', 'public.home_page_config', 'INSERT,UPDATE,DELETE,TRUNCATE')
union all
select 'service_save_access', pg_catalog.has_function_privilege('service_role',
  'public.save_home_section_v2(text,text,timestamp with time zone,jsonb)', 'EXECUTE')
union all
select 'save_rpc_private',
  not pg_catalog.has_function_privilege('anon', 'public.save_home_section_v2(text,text,timestamp with time zone,jsonb)', 'EXECUTE')
  and not pg_catalog.has_function_privilege('authenticated', 'public.save_home_section_v2(text,text,timestamp with time zone,jsonb)', 'EXECUTE')
union all
select 'snapshot_rpc_private',
  pg_catalog.has_function_privilege('service_role', 'public.get_home_page_v2_snapshot(text)', 'EXECUTE')
  and not pg_catalog.has_function_privilege('anon', 'public.get_home_page_v2_snapshot(text)', 'EXECUTE')
  and not pg_catalog.has_function_privilege('authenticated', 'public.get_home_page_v2_snapshot(text)', 'EXECUTE');

-- Inspect copied text, enabled flags and ordering without exposing private data.
select section.ordinality as position, section.item ->> 'id' as section,
  section.item ->> 'enabled' as enabled, home.updated_at
from public.home_page_config as home,
  lateral pg_catalog.jsonb_array_elements(home.draft -> 'layout')
    with ordinality as section(item, ordinality)
where home.id = 'main'
order by section.ordinality;
