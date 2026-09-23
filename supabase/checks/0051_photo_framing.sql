-- Read-only deployment checks after 0051. All nine results must be true.
select 'photo_framing_table_private_and_rls' as check_name,
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.photo_framings'::regclass)
  and not exists(select 1 from (values ('anon'),('authenticated'),('service_role')) caller(role_name)
    where pg_catalog.has_table_privilege(caller.role_name,'public.photo_framings','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) as passed
union all
select 'photo_framing_write_and_editor_service_only', not exists(select 1 from (values
  ('public.get_photo_editor_with_framing_v2(text,text)'),
  ('public.save_photo_section_with_framing_v2(text,text,text,jsonb,jsonb)')
) rpc(signature) where not pg_catalog.has_function_privilege('service_role',signature,'EXECUTE')
  or pg_catalog.has_function_privilege('anon',signature,'EXECUTE') or pg_catalog.has_function_privilege('authenticated',signature,'EXECUTE'))
union all
select 'photo_framing_helpers_private', not exists(select 1 from (values ('anon'),('authenticated'),('service_role')) caller(role_name)
  cross join (values ('public.photo_framing_for_source_v2(text,text)'),('public.set_photo_framing_for_source_v2(text,text,jsonb)'),
    ('public.apply_photo_framing_v2(text,jsonb)')) rpc(signature)
  where pg_catalog.has_function_privilege(caller.role_name,signature,'EXECUTE'))
union all
select 'photo_framing_fixed_search_paths', count(*) = 6 and bool_and(prosecdef and proconfig @> array['search_path=""'])
  from pg_catalog.pg_proc where oid in ('public.photo_framing_for_source_v2(text,text)'::regprocedure,
    'public.set_photo_framing_for_source_v2(text,text,jsonb)'::regprocedure,'public.apply_photo_framing_v2(text,jsonb)'::regprocedure,
    'public.get_photo_editor_with_framing_v2(text,text)'::regprocedure,'public.save_photo_section_with_framing_v2(text,text,text,jsonb,jsonb)'::regprocedure,
    'public.get_public_photo_framings_v1()'::regprocedure)
union all
select 'photo_framing_constraints_validated', count(*) = 3 and bool_and(convalidated)
  from pg_catalog.pg_constraint where conrelid = 'public.photo_framings'::regclass and contype = 'c'
union all
select 'photo_framing_public_read_only_projection', (select provolatile = 's' from pg_catalog.pg_proc where oid = 'public.get_public_photo_framings_v1()'::regprocedure)
  and not exists(select 1 from (values ('anon'),('authenticated'),('service_role')) caller(role_name)
    where not pg_catalog.has_function_privilege(caller.role_name,'public.get_public_photo_framings_v1()','EXECUTE'))
union all
select 'photo_framing_parent_guards_enabled', count(*) = 9 and bool_and(tgenabled in ('O','A'))
  from pg_catalog.pg_trigger where not tgisinternal and (
    (tgname = 'zz_media_library_reference_guard_v2' and tgrelid in ('public.home_page_config'::regclass,'public.bio_gallery_images'::regclass,
      'public.music_platform_links'::regclass,'public.gallery_images'::regclass,'public.videos'::regclass))
    or (tgrelid = 'public.bio_gallery_images'::regclass and tgname = 'archived_bio_content_guard_v2')
    or (tgrelid = 'public.music_platform_links'::regclass and tgname = 'archived_music_content_guard_v2')
    or (tgrelid in ('public.gallery_images'::regclass,'public.videos'::regclass) and tgname = 'archived_visual_content_guard_v2'))
union all
select 'photo_framing_bound_sources_only', not exists(select 1 from public.photo_framings
  where source_fingerprint !~ '^[0-9a-f]{32}$' or not public.is_valid_hero_media_framing_v2(framing))
union all
select 'photo_framing_showreel_capacity_fixed', pg_catalog.md5(pg_catalog.replace(prosrc,pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10))) = '3c5b5f7e78b096cd14b047a5cf94e262'
  from pg_catalog.pg_proc where oid = 'public.save_showreel_works_v2(text,jsonb,jsonb)'::regprocedure;
