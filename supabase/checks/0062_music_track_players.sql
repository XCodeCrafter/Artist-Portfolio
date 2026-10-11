-- Read-only verification after 0062. All 10 passed values must be true.
select 'music_tracks_save_contract_verified' as check_name,
  (select pg_catalog.md5(pg_catalog.replace(prosrc, E'\r\n', E'\n')) = 'f38bfe2379519ebeeefc80d0097c6e90'
    from pg_catalog.pg_proc where oid = 'public.save_music_tracks_v2(text,timestamptz,jsonb,jsonb)'::regprocedure) as passed
union all select 'music_tracks_legacy_save_unchanged',
  (select pg_catalog.md5(pg_catalog.replace(prosrc, E'\r\n', E'\n')) = '5914dddca8db8cf186050196d0db2780'
    from pg_catalog.pg_proc where oid = 'public.save_music_soundcloud_v2(text,timestamptz,jsonb,jsonb)'::regprocedure)
union all select 'music_tracks_snapshot_unchanged',
  (select pg_catalog.md5(pg_catalog.replace(prosrc, E'\r\n', E'\n')) = 'a65dc70af86a0a33c4cabb81b0571101'
    from pg_catalog.pg_proc where oid = 'public.get_music_page_v2_snapshot(text)'::regprocedure)
union all select 'music_tracks_archive_mutation_unchanged',
  (select pg_catalog.md5(pg_catalog.replace(prosrc, E'\r\n', E'\n')) = '15d729a274982f94ff6bff801df7300b'
    from pg_catalog.pg_proc where oid = 'public.mutate_music_content_archive_v2(text,text,text,jsonb,uuid,timestamptz,timestamptz)'::regprocedure)
union all select 'music_tracks_archive_provider_projection_verified',
  (select pg_catalog.md5(pg_catalog.replace(prosrc, E'\r\n', E'\n')) = '123b85675861964d311471d430ef5725'
    from pg_catalog.pg_proc where oid = 'public.get_music_content_archive_v2(text,integer)'::regprocedure)
union all select 'music_tracks_rpcs_service_only', not exists (
  select 1 from (values
    ('public.save_music_tracks_v2(text,timestamptz,jsonb,jsonb)'),
    ('public.save_music_soundcloud_v2(text,timestamptz,jsonb,jsonb)'),
    ('public.get_music_page_v2_snapshot(text)'),
    ('public.get_music_content_archive_v2(text,integer)'),
    ('public.mutate_music_content_archive_v2(text,text,text,jsonb,uuid,timestamptz,timestamptz)')
  ) rpc(signature)
  where not pg_catalog.has_function_privilege('service_role', rpc.signature, 'EXECUTE')
    or pg_catalog.has_function_privilege('anon', rpc.signature, 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated', rpc.signature, 'EXECUTE')
)
union all select 'music_tracks_definer_search_paths_fixed',
  (select count(*) = 5 from pg_catalog.pg_proc where oid in (
    'public.save_music_tracks_v2(text,timestamptz,jsonb,jsonb)'::regprocedure,
    'public.save_music_soundcloud_v2(text,timestamptz,jsonb,jsonb)'::regprocedure,
    'public.get_music_page_v2_snapshot(text)'::regprocedure,
    'public.get_music_content_archive_v2(text,integer)'::regprocedure,
    'public.mutate_music_content_archive_v2(text,text,text,jsonb,uuid,timestamptz,timestamptz)'::regprocedure
  ) and prosecdef and proconfig @> array['search_path=""'])
union all select 'music_tracks_archive_guard_preserved', exists (
  select 1 from pg_catalog.pg_trigger where tgrelid = 'public.soundcloud_tracks'::regclass
    and tgname = 'archived_music_content_guard_v2' and tgenabled in ('O','A') and not tgisinternal
)
union all select 'music_tracks_archive_private_and_rls',
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.content_archive_v2'::regclass)
  and not exists (select 1 from (values ('anon'), ('authenticated'), ('service_role')) role(name)
    where pg_catalog.has_table_privilege(role.name, 'public.content_archive_v2', 'SELECT,INSERT,UPDATE,DELETE'))
union all select 'music_tracks_active_and_archived_ids_distinct', not exists (
  select 1 from public.content_archive_v2 archive where archive.collection = 'music-soundcloud'
    and exists (select 1 from public.soundcloud_tracks item where item.id = archive.source_id)
);
