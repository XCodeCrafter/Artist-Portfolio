-- Read-only verification; run after migration 0053. Every passed value must be true.
select 'booking_calendar_table_private_and_rls' as check_name,
  exists (select 1 from pg_catalog.pg_class where oid = 'public.booking_calendar'::regclass and relrowsecurity)
  and not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'booking_calendar')
  and not pg_catalog.has_table_privilege('anon','public.booking_calendar','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
  and not pg_catalog.has_table_privilege('authenticated','public.booking_calendar','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
  and not pg_catalog.has_table_privilege('service_role','public.booking_calendar','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') as passed
union all select 'booking_calendar_admin_rpc_service_only',
  pg_catalog.has_function_privilege('service_role','public.get_booking_calendar_v2_snapshot()','EXECUTE')
  and pg_catalog.has_function_privilege('service_role','public.save_booking_calendar_v2(timestamptz,jsonb)','EXECUTE')
  and not pg_catalog.has_function_privilege('anon','public.get_booking_calendar_v2_snapshot()','EXECUTE')
  and not pg_catalog.has_function_privilege('authenticated','public.get_booking_calendar_v2_snapshot()','EXECUTE')
  and not pg_catalog.has_function_privilege('anon','public.save_booking_calendar_v2(timestamptz,jsonb)','EXECUTE')
  and not pg_catalog.has_function_privilege('authenticated','public.save_booking_calendar_v2(timestamptz,jsonb)','EXECUTE')
union all select 'booking_calendar_validator_private',
  not pg_catalog.has_function_privilege('anon','public.is_valid_booking_calendar_v2(jsonb)','EXECUTE')
  and not pg_catalog.has_function_privilege('authenticated','public.is_valid_booking_calendar_v2(jsonb)','EXECUTE')
  and not pg_catalog.has_function_privilege('service_role','public.is_valid_booking_calendar_v2(jsonb)','EXECUTE')
union all select 'booking_calendar_fixed_search_paths',
  (select count(*) = 4 from pg_catalog.pg_proc where oid in (
    'public.get_booking_calendar_v2_snapshot()'::regprocedure,
    'public.save_booking_calendar_v2(timestamptz,jsonb)'::regprocedure,
    'public.get_public_booking_calendar_v1()'::regprocedure,
    'public.is_valid_booking_calendar_v2(jsonb)'::regprocedure
  ) and proconfig @> array['search_path=""'])
union all select 'booking_calendar_public_read_only_projection',
  pg_catalog.has_function_privilege('anon','public.get_public_booking_calendar_v1()','EXECUTE')
  and pg_catalog.has_function_privilege('authenticated','public.get_public_booking_calendar_v1()','EXECUTE')
  and (select provolatile = 's' and prosecdef from pg_catalog.pg_proc where oid = 'public.get_public_booking_calendar_v1()'::regprocedure)
union all select 'booking_calendar_constraints_validated',
  (select count(*) = 1 from pg_catalog.pg_constraint where conrelid = 'public.booking_calendar'::regclass and conname = 'booking_calendar_valid_draft' and convalidated)
union all select 'booking_calendar_singleton_valid',
  (select count(*) = 1 and bool_and(public.is_valid_booking_calendar_v2(draft)) from public.booking_calendar where id = 'main')
union all select 'booking_calendar_public_never_exposes_drafts',
  not exists (select 1 from pg_catalog.jsonb_array_elements(coalesce(public.get_public_booking_calendar_v1()->'events','[]'::jsonb)) item where item->'published' <> 'true'::jsonb);
