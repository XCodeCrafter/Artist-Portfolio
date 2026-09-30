-- Read-only checks after 0058. Every passed value must be true.
with expected(signature, expected_hash) as (values
  ('public.save_music_hero_v2(text,timestamp with time zone,jsonb)', 'a416704ff753e1ab6195b35cc647b69c'),
  ('public.save_bio_hero_v2(text,timestamp with time zone,jsonb)', '11901aa43d0aa929c676ed645e6054f5'),
  ('public.save_gallery_hero_v2(text,timestamp with time zone,jsonb)', '2f9d4b4629be3adb54268706ed61e4e1'),
  ('public.save_showreel_hero_v2(text,timestamp with time zone,jsonb)', '60c9fd307ebe02dd1ce2e18f671bea37'),
  ('public.save_contact_hero_v2(text,timestamp with time zone,jsonb)', 'ddcd253a7f0c23c3e0a21f1cdb5319dc'),
  ('public.validate_home_section_v2(text,jsonb)', 'a1af7dfa230247ccc2ee8344e9ab17d1')
), hero_writes(signature) as (values
  ('public.save_music_hero_v2(text,timestamp with time zone,jsonb)'),
  ('public.save_bio_hero_v2(text,timestamp with time zone,jsonb)'),
  ('public.save_gallery_hero_v2(text,timestamp with time zone,jsonb)'),
  ('public.save_showreel_hero_v2(text,timestamp with time zone,jsonb)'),
  ('public.save_contact_hero_v2(text,timestamp with time zone,jsonb)'),
  ('public.save_home_section_v2(text,text,timestamp with time zone,jsonb)'),
  ('public.save_hero_with_framing_v2(text,text,timestamp with time zone,jsonb)')
)
select 'hero_optional_titles_exact_contracts' as check_name,
  count(*) = 6 and coalesce(bool_and(
    pg_catalog.md5(pg_catalog.replace(p.prosrc, pg_catalog.chr(13) || pg_catalog.chr(10), pg_catalog.chr(10))) = expected.expected_hash
  ), false) as passed from expected join pg_catalog.pg_proc p on p.oid = pg_catalog.to_regprocedure(expected.signature)
union all
select 'hero_optional_titles_service_only', count(*) = 7 and coalesce(bool_and(
  pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
  and not pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
  and not pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
), false) from hero_writes join pg_catalog.pg_proc p on p.oid = pg_catalog.to_regprocedure(hero_writes.signature)
union all
select 'hero_optional_titles_helper_private', not exists (
  select 1 from (values ('anon'), ('authenticated'), ('service_role')) caller(role_name)
  where pg_catalog.has_function_privilege(caller.role_name, 'public.validate_home_section_v2(text,jsonb)', 'EXECUTE'))
union all
select 'hero_optional_titles_fixed_search_paths', count(*) = 8 and coalesce(bool_and(
  p.prosecdef and p.proconfig @> array['search_path=""']
), false) from pg_catalog.pg_proc p where p.oid in (
  select pg_catalog.to_regprocedure(signature) from hero_writes
  union select pg_catalog.to_regprocedure('public.validate_home_section_v2(text,jsonb)'))
union all
select 'hero_optional_titles_not_null_retained', exists (
  select 1 from pg_catalog.pg_attribute where attrelid = 'public.page_heroes'::regclass
    and attname = 'title' and not attisdropped and attnotnull and atttypid = 'text'::regtype)
union all
select 'hero_optional_titles_media_guards_retained', count(*) = 2 and bool_and(tgenabled in ('O', 'A'))
  from pg_catalog.pg_trigger where not tgisinternal and tgname = 'zz_media_library_reference_guard_v2'
    and tgrelid in ('public.page_heroes'::regclass, 'public.home_page_config'::regclass)
union all
select 'hero_optional_titles_version_trigger_retained', exists (
  select 1 from pg_catalog.pg_trigger where not tgisinternal and tgenabled in ('O', 'A')
    and tgrelid = 'public.page_heroes'::regclass and tgname = 'page_heroes_updated_at')
union all
select 'hero_optional_titles_rls_retained', count(*) = 2 and bool_and(relrowsecurity)
  from pg_catalog.pg_class where oid in ('public.page_heroes'::regclass, 'public.home_page_config'::regclass);
