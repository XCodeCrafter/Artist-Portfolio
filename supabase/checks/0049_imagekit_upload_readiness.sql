-- Read-only checks after 0049. This proves database schema readiness only;
-- it does not activate uploads or verify an ImageKit account/credentials.
select 'imagekit_upload_readiness_service_only' as check_name,
  pg_catalog.has_function_privilege('service_role',pg_catalog.to_regprocedure('public.get_imagekit_upload_readiness_v1()'),'EXECUTE') is true
  and pg_catalog.has_function_privilege('anon',pg_catalog.to_regprocedure('public.get_imagekit_upload_readiness_v1()'),'EXECUTE') is false
  and pg_catalog.has_function_privilege('authenticated',pg_catalog.to_regprocedure('public.get_imagekit_upload_readiness_v1()'),'EXECUTE') is false as passed
union all
select 'imagekit_upload_readiness_read_only_boundary', exists(select 1 from pg_catalog.pg_proc
  where oid=pg_catalog.to_regprocedure('public.get_imagekit_upload_readiness_v1()')
    and prokind='f' and prosecdef and provolatile='s' and prorettype=pg_catalog.to_regtype('pg_catalog.jsonb')
    and proconfig @> array['search_path=""'])
union all
select 'imagekit_upload_readiness_exact_contract',
  public.get_imagekit_upload_readiness_v1()='{"version":1,"ready":true}'::jsonb;
