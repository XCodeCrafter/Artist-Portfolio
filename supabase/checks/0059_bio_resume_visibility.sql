-- Read-only. All checks should pass. Saved owner choices may be ON or OFF.
select 'bio_resume_visibility_boolean_not_null' as check_name, exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'site_settings'
    and column_name = 'bio_resume_credits_enabled' and data_type = 'boolean' and is_nullable = 'NO'
) as passed
union all
select 'bio_resume_visibility_default_on', exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'site_settings'
    and column_name = 'bio_resume_credits_enabled' and column_default = 'true'
)
union all
select 'settings_rls_retained', coalesce((
  select relrowsecurity from pg_catalog.pg_class where oid = 'public.site_settings'::regclass
), false)
union all
select 'settings_version_trigger_retained', exists (
  select 1 from pg_catalog.pg_trigger where tgrelid = 'public.site_settings'::regclass
    and not tgisinternal and tgenabled in ('O','A')
    and pg_catalog.pg_get_triggerdef(oid) ilike '%updated_at%'
);
