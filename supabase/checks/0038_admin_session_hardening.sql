-- Read-only verification after 0038. Expected: every check is true.
-- This does not expose sessions, recovery tokens, or private account data.
select 'session_rpc_private' as check_name,
  pg_catalog.has_function_privilege('service_role', 'public.is_admin_session_active(uuid,uuid)', 'EXECUTE')
  and not pg_catalog.has_function_privilege('anon', 'public.is_admin_session_active(uuid,uuid)', 'EXECUTE')
  and not pg_catalog.has_function_privilege('authenticated', 'public.is_admin_session_active(uuid,uuid)', 'EXECUTE') as passed
union all
select 'recovery_rpc_private',
  pg_catalog.has_function_privilege('service_role', 'public.issue_admin_recovery_challenge(uuid,text,text,timestamptz)', 'EXECUTE')
  and not pg_catalog.has_function_privilege('anon', 'public.issue_admin_recovery_challenge(uuid,text,text,timestamptz)', 'EXECUTE')
  and not pg_catalog.has_function_privilege('authenticated', 'public.issue_admin_recovery_challenge(uuid,text,text,timestamptz)', 'EXECUTE')
union all
select 'recovery_table_private',
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.admin_recovery_challenges'::pg_catalog.regclass)
  and not pg_catalog.has_table_privilege('anon', 'public.admin_recovery_challenges', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
  and not pg_catalog.has_table_privilege('authenticated', 'public.admin_recovery_challenges', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
union all
select 'single_recovery_per_user', exists (
  select 1 from pg_catalog.pg_index
  where indexrelid = pg_catalog.to_regclass('public.admin_recovery_one_per_user_idx')
    and indrelid = 'public.admin_recovery_challenges'::pg_catalog.regclass
    and indisunique and indisvalid and indnkeyatts = 1
    and indkey[0] = (select attnum from pg_catalog.pg_attribute
      where attrelid = 'public.admin_recovery_challenges'::pg_catalog.regclass and attname = 'user_id')
)
union all
select 'rls_checks_live_sessions',
  pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.is_admin()'::pg_catalog.regprocedure), 'auth.sessions') > 0
  and pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.is_admin()'::pg_catalog.regprocedure), 'session_id') > 0
union all
select 'rpc_search_paths_fixed', bool_and(prosecdef and proconfig @> array['search_path=""'])
  from pg_catalog.pg_proc where oid in (
    'public.is_admin_session_active(uuid,uuid)'::pg_catalog.regprocedure,
    'public.issue_admin_recovery_challenge(uuid,text,text,timestamptz)'::pg_catalog.regprocedure,
    'public.is_admin()'::pg_catalog.regprocedure
  );
