-- Read-only. Expected: all rows have passed=true. No private data is returned.
select 'home_transitions_boolean_not_null' as check_name, exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'site_settings'
    and column_name = 'home_section_transitions_enabled'
    and data_type = 'boolean' and is_nullable = 'NO'
) as passed
union all
select 'home_transitions_default_off', exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'site_settings'
    and column_name = 'home_section_transitions_enabled' and column_default = 'false'
)
union all
select 'settings_rls_retained', coalesce((
  select relrowsecurity from pg_catalog.pg_class where oid = 'public.site_settings'::regclass
), false)
union all
select 'version_trigger_retained', exists (
  select 1 from pg_catalog.pg_trigger where tgrelid = 'public.site_settings'::regclass
    and not tgisinternal and tgenabled in ('O','A')
    and pg_catalog.pg_get_triggerdef(oid) ilike '%updated_at%'
);
