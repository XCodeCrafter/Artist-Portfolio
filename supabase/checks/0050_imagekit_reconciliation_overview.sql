-- Read-only deployment checks. No fixture administrator, lease, audit entry,
-- provider request, or media mutation is created by running this file.
select 'imagekit_overview_service_only' as check_name,
  pg_catalog.has_function_privilege('service_role',pg_catalog.to_regprocedure('public.get_imagekit_reconciliation_overview_v1(uuid,integer)'),'EXECUTE') is true
  and pg_catalog.has_function_privilege('anon',pg_catalog.to_regprocedure('public.get_imagekit_reconciliation_overview_v1(uuid,integer)'),'EXECUTE') is false
  and pg_catalog.has_function_privilege('authenticated',pg_catalog.to_regprocedure('public.get_imagekit_reconciliation_overview_v1(uuid,integer)'),'EXECUTE') is false as passed
union all
select 'imagekit_overview_read_only_boundary', exists(select 1 from pg_catalog.pg_proc
  where oid=pg_catalog.to_regprocedure('public.get_imagekit_reconciliation_overview_v1(uuid,integer)')
    and prokind='f' and prosecdef and provolatile='s' and prorettype=pg_catalog.to_regtype('pg_catalog.jsonb')
    and pronargs=2 and pronargdefaults=1 and proconfig @> array['search_path=""'])
union all
select 'imagekit_overview_parent_guards_ready',
  public.get_imagekit_upload_readiness_v1()='{"version":1,"ready":true}'::jsonb
union all
select 'imagekit_overview_sources_remain_private',
  (select count(*)=2 and bool_and(relrowsecurity) from pg_catalog.pg_class where oid in (
    pg_catalog.to_regclass('public.media_imagekit_upload_lifecycle'),
    pg_catalog.to_regclass('public.media_imagekit_file_bindings')))
  and not exists(select 1 from (values ('anon'),('authenticated'),('service_role')) caller(name)
    cross join (values ('public.media_imagekit_upload_lifecycle'),('public.media_imagekit_file_bindings')) source(name)
    where pg_catalog.has_table_privilege(caller.name,pg_catalog.to_regclass(source.name),'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') is distinct from false
      or pg_catalog.has_any_column_privilege(caller.name,pg_catalog.to_regclass(source.name),'SELECT,INSERT,UPDATE,REFERENCES') is distinct from false);
