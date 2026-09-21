-- Read-only deployment checks after 0046. All eight results must be true.
select 'hero_framing_columns_ready' as check_name, count(*) = 2 and bool_and(
  atttypid = 'jsonb'::regtype and not attnotnull and not atthasdef
) as passed from pg_catalog.pg_attribute where not attisdropped and (
  (attrelid = 'public.page_heroes'::regclass and attname = 'media_framing')
  or (attrelid = 'public.home_page_config'::regclass and attname = 'hero_media_framing'))
union all
select 'hero_framing_constraints_validated', count(*) = 2 and bool_and(convalidated)
from pg_catalog.pg_constraint where contype = 'c' and (
  (conrelid = 'public.page_heroes'::regclass and conname = 'page_heroes_media_framing_check')
  or (conrelid = 'public.home_page_config'::regclass and conname = 'home_page_config_hero_media_framing_check'))
union all
select 'hero_framing_rpcs_service_only', not exists(select 1 from (values
  ('public.get_hero_editor_with_framing_v2(text,text)'),
  ('public.save_hero_with_framing_v2(text,text,timestamp with time zone,jsonb)')
) rpc(signature) where not pg_catalog.has_function_privilege('service_role', rpc.signature, 'EXECUTE')
  or pg_catalog.has_function_privilege('anon', rpc.signature, 'EXECUTE')
  or pg_catalog.has_function_privilege('authenticated', rpc.signature, 'EXECUTE'))
union all
select 'hero_framing_validator_private', not exists(select 1 from (values ('anon'), ('authenticated'), ('service_role')) caller(role_name)
  where pg_catalog.has_function_privilege(caller.role_name, 'public.is_valid_hero_media_framing_v2(jsonb)', 'EXECUTE'))
union all
select 'hero_framing_fixed_search_paths', count(*) = 3 and bool_and(prosecdef and proconfig @> array['search_path=""'])
from pg_catalog.pg_proc where oid in (
  'public.is_valid_hero_media_framing_v2(jsonb)'::regprocedure,
  'public.get_hero_editor_with_framing_v2(text,text)'::regprocedure,
  'public.save_hero_with_framing_v2(text,text,timestamp with time zone,jsonb)'::regprocedure)
union all
select 'hero_framing_parent_guards_enabled', count(*) = 2 and bool_and(tgenabled in ('O', 'A'))
from pg_catalog.pg_trigger where not tgisinternal and tgname = 'zz_media_library_reference_guard_v2'
  and tgrelid in ('public.page_heroes'::regclass, 'public.home_page_config'::regclass)
union all
select 'hero_framing_shape_and_limits',
  public.is_valid_hero_media_framing_v2('{"desktop":{"fit":"cover","x":0,"y":100,"zoom":1},"mobile":{"fit":"contain","x":50.5,"y":0,"zoom":3}}'::jsonb)
  and not public.is_valid_hero_media_framing_v2('{"desktop":{"fit":"cover","x":0,"y":100,"zoom":1}}'::jsonb)
  and not public.is_valid_hero_media_framing_v2('{"desktop":{"fit":"cover","x":0,"y":100,"zoom":0.9},"mobile":{"fit":"contain","x":50,"y":0,"zoom":3}}'::jsonb)
  and not public.is_valid_hero_media_framing_v2('{"desktop":{"fit":"cover","x":0,"y":100,"zoom":1},"mobile":{"fit":"contain","x":101,"y":0,"zoom":3}}'::jsonb)
  and not public.is_valid_hero_media_framing_v2('null'::jsonb)
union all
select 'hero_framing_all_six_editors_ready', not exists(select 1 from (values
  ('public.get_home_page_v2_snapshot(text)'), ('public.save_home_section_v2(text,text,timestamp with time zone,jsonb)'),
  ('public.get_bio_page_v2_snapshot(text)'), ('public.save_bio_hero_v2(text,timestamp with time zone,jsonb)'),
  ('public.get_music_page_v2_snapshot(text)'), ('public.save_music_hero_v2(text,timestamp with time zone,jsonb)'),
  ('public.get_gallery_page_v2_snapshot(text)'), ('public.save_gallery_hero_v2(text,timestamp with time zone,jsonb)'),
  ('public.get_showreel_page_v2_snapshot(text)'), ('public.save_showreel_hero_v2(text,timestamp with time zone,jsonb)'),
  ('public.get_contact_page_v2_snapshot(text)'), ('public.save_contact_hero_v2(text,timestamp with time zone,jsonb)')
) rpc(signature) where pg_catalog.to_regprocedure(rpc.signature) is null);
