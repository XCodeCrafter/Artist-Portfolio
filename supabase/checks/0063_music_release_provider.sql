-- Read-only verification after 0063. All 10 passed values must be true.
-- This intentionally supersedes 0062's historical snapshot_unchanged check.
select 'music_releases_save_contract_verified' as check_name,
  (select pg_catalog.md5(pg_catalog.replace(prosrc, E'\r\n', E'\n')) = '6e88f8975cdf4e4b5b9b24fa37958f0f'
    from pg_catalog.pg_proc where oid = 'public.save_music_releases_v2(text,timestamptz,timestamptz,jsonb)'::regprocedure) as passed
union all select 'music_releases_legacy_spotify_unchanged',
  (select pg_catalog.md5(pg_catalog.replace(prosrc, E'\r\n', E'\n')) = 'b19291306267b343b8c193a52c5c04b7'
    from pg_catalog.pg_proc where oid = 'public.save_music_spotify_v2(text,timestamptz,timestamptz,jsonb)'::regprocedure)
union all select 'music_releases_snapshot_verified',
  (select pg_catalog.md5(pg_catalog.replace(prosrc, E'\r\n', E'\n')) = 'ef4ab270718e5a45f233fb14c5fbd736'
    from pg_catalog.pg_proc where oid = 'public.get_music_page_v2_snapshot(text)'::regprocedure)
union all select 'music_releases_service_only',
  not exists (select 1 from (values
    ('public.save_music_releases_v2(text,timestamptz,timestamptz,jsonb)'),
    ('public.save_music_spotify_v2(text,timestamptz,timestamptz,jsonb)'),
    ('public.get_music_page_v2_snapshot(text)')
  ) rpc(signature)
  where not pg_catalog.has_function_privilege('service_role', rpc.signature, 'EXECUTE')
    or pg_catalog.has_function_privilege('anon', rpc.signature, 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated', rpc.signature, 'EXECUTE'))
union all select 'music_releases_fixed_search_paths',
  (select count(*) = 3 from pg_catalog.pg_proc where oid in (
    'public.save_music_releases_v2(text,timestamptz,timestamptz,jsonb)'::regprocedure,
    'public.save_music_spotify_v2(text,timestamptz,timestamptz,jsonb)'::regprocedure,
    'public.get_music_page_v2_snapshot(text)'::regprocedure
  ) and prosecdef and proconfig @> array['search_path=""'])
union all select 'music_releases_constraints_validated',
  (select count(*) = 2 from pg_catalog.pg_constraint
    where conrelid = 'public.music_presentation'::regclass and convalidated
      and conname in ('music_presentation_release_provider_check','music_presentation_soundcloud_playlist_check'))
union all select 'music_releases_columns_contract_verified',
  (select count(*) = 2 from pg_catalog.pg_attribute column_info
    join pg_catalog.pg_attrdef column_default
      on column_default.adrelid = column_info.attrelid and column_default.adnum = column_info.attnum
    where column_info.attrelid = 'public.music_presentation'::regclass
      and column_info.attname in ('release_provider','soundcloud_playlist_url')
      and column_info.atttypid = 'text'::regtype and column_info.atttypmod = -1
      and column_info.attnotnull and not column_info.attisdropped
      and column_info.attgenerated = '' and column_info.attidentity = ''
      and pg_catalog.pg_get_expr(column_default.adbin, column_default.adrelid) = case column_info.attname
        when 'release_provider' then '''spotify''::text' else '''''::text' end)
union all select 'music_releases_parent_guard_retained',
  exists (select 1 from pg_catalog.pg_trigger where tgrelid = 'public.music_presentation'::regclass
    and tgname = 'music_presentation_updated_at' and tgenabled in ('O','A') and not tgisinternal
    and tgtype = 19 and tgfoid = pg_catalog.to_regprocedure('public.set_updated_at()'))
union all select 'music_releases_rls_read_only_public',
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.music_presentation'::regclass)
  and not exists (select 1 from (values ('anon'),('authenticated')) role(name)
    where pg_catalog.has_table_privilege(role.name,'public.music_presentation','INSERT,UPDATE,DELETE'))
union all select 'music_releases_stored_configuration_valid',
  (select count(*) = 1 and bool_and(release_provider in ('spotify','soundcloud')
    and pg_catalog.char_length(soundcloud_playlist_url) <= 2048
    and (soundcloud_playlist_url = '' or soundcloud_playlist_url ~ '^https://soundcloud[.]com/[A-Za-z0-9_-]+/sets/[A-Za-z0-9_-]+/?$')
    and (release_provider <> 'soundcloud' or soundcloud_playlist_url <> ''))
    from public.music_presentation where id = 'main');
