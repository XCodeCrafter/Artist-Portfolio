-- Read-only verification after 0054. All five values should be true.
-- Custom/blank hero titles are intentionally accepted, not overwritten.
select 'live_contact_stock_hero_title_updated' as check_name,
  exists (
    select 1 from public.page_heroes where page_slug = 'booking'
      and pg_catalog.upper(pg_catalog.btrim(title)) not in ('CONTACT', 'BOOKING', 'BOOKINGS')
  ) as passed
union all select 'live_contact_hero_version_trigger_retained',
  exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.page_heroes'::regclass
      and tgname = 'page_heroes_updated_at' and not tgisinternal
      and tgenabled in ('O', 'A') and tgtype = 19
      and tgfoid = pg_catalog.to_regprocedure('public.set_updated_at()')
  )
union all select 'live_contact_hero_rls_retained',
  exists (select 1 from pg_catalog.pg_class where oid = 'public.page_heroes'::regclass and relrowsecurity)
union all select 'live_contact_hero_editor_service_only',
  pg_catalog.has_function_privilege('service_role','public.get_contact_page_v2_snapshot(text)','EXECUTE')
  and pg_catalog.has_function_privilege('service_role','public.save_contact_hero_v2(text,timestamptz,jsonb)','EXECUTE')
  and not pg_catalog.has_function_privilege('anon','public.get_contact_page_v2_snapshot(text)','EXECUTE')
  and not pg_catalog.has_function_privilege('authenticated','public.get_contact_page_v2_snapshot(text)','EXECUTE')
  and not pg_catalog.has_function_privilege('anon','public.save_contact_hero_v2(text,timestamptz,jsonb)','EXECUTE')
  and not pg_catalog.has_function_privilege('authenticated','public.save_contact_hero_v2(text,timestamptz,jsonb)','EXECUTE')
union all select 'live_contact_calendar_privacy_retained',
  exists (select 1 from pg_catalog.pg_class where oid = 'public.booking_calendar'::regclass and relrowsecurity)
  and not pg_catalog.has_table_privilege('anon','public.booking_calendar','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
  and not pg_catalog.has_table_privilege('authenticated','public.booking_calendar','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
  and not pg_catalog.has_table_privilege('service_role','public.booking_calendar','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
  and not pg_catalog.has_function_privilege('anon','public.save_booking_calendar_v2(timestamptz,jsonb)','EXECUTE')
  and not pg_catalog.has_function_privilege('authenticated','public.save_booking_calendar_v2(timestamptz,jsonb)','EXECUTE');
