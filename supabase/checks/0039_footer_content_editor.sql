-- Read-only. Expected: all rows have passed=true. No private data is returned.
select 'footer_column' as check_name, exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'site_settings'
    and column_name = 'footer_content' and data_type = 'jsonb' and is_nullable = 'NO'
) as passed
union all
select 'footer_constraint', exists (
  select 1 from pg_catalog.pg_constraint where conrelid = 'public.site_settings'::regclass
    and conname = 'site_settings_footer_content_v2_valid' and convalidated
)
union all
select 'footer_values_valid', coalesce((select bool_and(public.is_valid_footer_content_v2(footer_content)) from public.site_settings), false)
union all
select 'settings_rls_retained', coalesce((select relrowsecurity from pg_catalog.pg_class where oid = 'public.site_settings'::regclass), false)
union all
select 'version_trigger_retained', exists (
  select 1 from pg_catalog.pg_trigger where tgrelid = 'public.site_settings'::regclass
    and not tgisinternal and tgenabled <> 'D'
    and pg_catalog.pg_get_triggerdef(oid) ilike '%updated_at%'
);
