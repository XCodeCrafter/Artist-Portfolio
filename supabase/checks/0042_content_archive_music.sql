-- Read-only checks after 0042. All nine results must be true.
select 'music_archive_table_private_and_rls' as check_name,
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.content_archive_v2'::regclass)
  and not exists(select 1 from (values ('anon'), ('authenticated'), ('service_role')) role(name)
    where pg_catalog.has_table_privilege(role.name, 'public.content_archive_v2', 'SELECT,INSERT,UPDATE,DELETE')) as passed
union all
select 'music_archive_rpc_service_only', not exists(
  select 1 from (values
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
select 'music_archive_media_references_registered', exists(
  select 1 from public.media_library_reference_registry_v2()
  where table_name = 'content_archive_v2' and reference_label = 'Archived content'
    and columns = array['row_data'] and json_columns = array['row_data']
)
union all
select 'music_archive_media_guard_enabled', exists(
  select 1 from pg_catalog.pg_trigger where tgrelid = 'public.content_archive_v2'::regclass
    and tgname = 'zz_media_library_reference_guard_v2' and tgenabled = 'O' and not tgisinternal
)
union all
select 'music_archive_source_guards_enabled', not exists(
  select 1 from (values ('public.music_platform_links'::regclass), ('public.soundcloud_tracks'::regclass)) source(oid)
  where not exists(select 1 from pg_catalog.pg_trigger where tgrelid = source.oid
    and tgname = 'archived_music_content_guard_v2' and tgenabled = 'O' and not tgisinternal)
)
union all
select 'music_archive_internal_guard_private', not exists(
  select 1 from (values ('anon'), ('authenticated'), ('service_role')) role(name)
  where pg_catalog.has_function_privilege(role.name, 'public.guard_archived_music_content_v2()', 'EXECUTE')
)
union all
select 'music_archive_active_ids_do_not_overlap', not exists(
  select 1 from public.content_archive_v2 archive
  where (archive.collection = 'music-platforms' and exists(select 1 from public.music_platform_links item where item.id = archive.source_id))
    or (archive.collection = 'music-soundcloud' and exists(select 1 from public.soundcloud_tracks item where item.id = archive.source_id))
    or (archive.collection = 'navbar-shortcuts' and exists(select 1 from public.social_links item where item.id = archive.source_id))
)
union all
select 'music_archive_collections_enabled', exists(
  select 1 from pg_catalog.pg_constraint where conrelid = 'public.content_archive_v2'::regclass
    and conname = 'content_archive_v2_collection_check' and convalidated
    and pg_catalog.pg_get_constraintdef(oid) like '%navbar-shortcuts%'
    and pg_catalog.pg_get_constraintdef(oid) like '%music-platforms%'
    and pg_catalog.pg_get_constraintdef(oid) like '%music-soundcloud%'
)
union all
select 'music_archive_parent_and_navbar_guard_ready', exists(select 1 from public.music_presentation where id = 'main')
  and exists(select 1 from pg_catalog.pg_trigger where tgrelid = 'public.social_links'::regclass
    and tgname = 'archived_navbar_shortcut_guard_v2' and tgenabled = 'O' and not tgisinternal);
