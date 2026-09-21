-- Read-only deployment checks for 0044. All ten results must be true.
select 'visual_archive_tables_private_and_rls' as check_name, not exists(
  select 1 from (values ('public.content_archive_v2'), ('public.visual_content_archive_limits_v2')) object(name)
  where not (select relrowsecurity from pg_catalog.pg_class where oid = object.name::regclass)
    or exists(select 1 from (values ('anon'), ('authenticated'), ('service_role')) role(name)
      where pg_catalog.has_table_privilege(role.name, object.name, 'SELECT,INSERT,UPDATE,DELETE'))
) as passed
union all
select 'visual_archive_rpc_service_only', not exists(
  select 1 from (values
    ('public.get_visual_content_archive_v2(text,integer)'),
    ('public.mutate_visual_content_archive_v2(text,text,text,jsonb,uuid,timestamp with time zone)'),
    ('public.get_bio_content_archive_v2(text,integer)'),
    ('public.mutate_bio_content_archive_v2(text,text,text,jsonb,uuid,timestamp with time zone)'),
    ('public.get_music_content_archive_v2(text,integer)'),
    ('public.mutate_music_content_archive_v2(text,text,text,jsonb,uuid,timestamp with time zone,timestamp with time zone)'),
    ('public.get_navbar_shortcut_archive_v2(integer)'),
    ('public.mutate_navbar_shortcut_archive_v2(text,text,jsonb,uuid,timestamp with time zone)')
  ) rpc(signature)
  where not pg_catalog.has_function_privilege('service_role', rpc.signature, 'EXECUTE')
    or pg_catalog.has_function_privilege('anon', rpc.signature, 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated', rpc.signature, 'EXECUTE')
)
union all
select 'visual_archive_media_references_and_guard', exists(
  select 1 from public.media_library_reference_registry_v2()
  where table_name = 'content_archive_v2' and reference_label = 'Archived content'
    and columns = array['row_data'] and json_columns = array['row_data']
) and exists(select 1 from pg_catalog.pg_trigger where tgrelid = 'public.content_archive_v2'::regclass
    and tgname = 'zz_media_library_reference_guard_v2' and tgenabled = 'O' and not tgisinternal)
union all
select 'visual_archive_source_guards_enabled', not exists(
  select 1 from (values ('public.gallery_images'::regclass), ('public.videos'::regclass)) source(oid)
  where not exists(select 1 from pg_catalog.pg_trigger where tgrelid = source.oid
    and tgname = 'archived_visual_content_guard_v2' and tgenabled = 'O' and not tgisinternal)
)
union all
select 'visual_archive_internal_guard_private', not exists(
  select 1 from (values ('anon'), ('authenticated'), ('service_role')) role(name)
  where pg_catalog.has_function_privilege(role.name, 'public.guard_archived_visual_content_v2()', 'EXECUTE')
)
union all
select 'visual_archive_active_ids_and_home_ownership', not exists(
  select 1 from public.content_archive_v2 archive
  where (archive.collection = 'gallery-frames' and (
    (archive.row_data ->> 'is_freelance_story')::boolean is distinct from false
    or exists(select 1 from public.gallery_images item where item.id = archive.source_id)))
    or (archive.collection = 'showreel-works' and exists(select 1 from public.videos item where item.id = archive.source_id))
)
union all
select 'visual_archive_collections_enabled', exists(
  select 1 from pg_catalog.pg_constraint where conrelid = 'public.content_archive_v2'::regclass
    and conname = 'content_archive_v2_collection_check' and convalidated
    and pg_catalog.pg_get_constraintdef(oid) like '%navbar-shortcuts%'
    and pg_catalog.pg_get_constraintdef(oid) like '%music-platforms%'
    and pg_catalog.pg_get_constraintdef(oid) like '%music-soundcloud%'
    and pg_catalog.pg_get_constraintdef(oid) like '%bio-portraits%'
    and pg_catalog.pg_get_constraintdef(oid) like '%bio-paragraphs%'
    and pg_catalog.pg_get_constraintdef(oid) like '%bio-credits%'
    and pg_catalog.pg_get_constraintdef(oid) like '%gallery-frames%'
    and pg_catalog.pg_get_constraintdef(oid) like '%showreel-works%'
)
union all
select 'visual_archive_legacy_id_contract', exists(
  select 1 from pg_catalog.pg_constraint where conrelid = 'public.content_archive_v2'::regclass
    and conname = 'content_archive_v2_source_id_check' and convalidated
    and pg_catalog.pg_get_constraintdef(oid) like '%showreel-works%'
    and pg_catalog.pg_get_constraintdef(oid) like '%512%'
    and pg_catalog.pg_get_constraintdef(oid) like '%160%'
    and pg_catalog.pg_get_constraintdef(oid) like '%[:cntrl:]%'
)
union all
select 'visual_archive_showreel_restore_capacity', exists(
  select 1 from public.visual_content_archive_limits_v2 where collection = 'showreel'
    and active_limit between 120 and 10000
) and (select count(*) from public.videos) <= 10000
union all
select 'visual_archive_previous_guards_ready', not exists(select 1 from (values
  ('public.social_links'::regclass, 'archived_navbar_shortcut_guard_v2'),
  ('public.music_platform_links'::regclass, 'archived_music_content_guard_v2'),
  ('public.soundcloud_tracks'::regclass, 'archived_music_content_guard_v2'),
  ('public.bio_gallery_images'::regclass, 'archived_bio_content_guard_v2'),
  ('public.bio_paragraphs'::regclass, 'archived_bio_content_guard_v2'),
  ('public.actor_credits'::regclass, 'archived_bio_content_guard_v2')
) expected(source, name) where not exists(select 1 from pg_catalog.pg_trigger
  where tgrelid = expected.source and tgname = expected.name and tgenabled = 'O' and not tgisinternal));
