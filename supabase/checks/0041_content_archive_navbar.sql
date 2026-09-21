-- Read-only deployment checks after 0041. Every passed value must be true.
select 'archive_table_private_and_rls' as check_name,
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.content_archive_v2'::regclass)
  and not exists(select 1 from (values ('anon'), ('authenticated'), ('service_role')) role(name)
    where pg_catalog.has_table_privilege(role.name, 'public.content_archive_v2', 'SELECT,INSERT,UPDATE,DELETE')) as passed
union all
select 'archive_rpc_service_only', not exists(
  select 1 from (values
    ('public.get_navbar_shortcut_archive_v2(integer)'),
    ('public.mutate_navbar_shortcut_archive_v2(text,text,jsonb,uuid,timestamp with time zone)')
  ) rpc(signature)
  where not pg_catalog.has_function_privilege('service_role', rpc.signature, 'EXECUTE')
    or pg_catalog.has_function_privilege('anon', rpc.signature, 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated', rpc.signature, 'EXECUTE')
)
union all
select 'archive_media_references_registered', exists(
  select 1 from public.media_library_reference_registry_v2()
  where table_name = 'content_archive_v2' and reference_label = 'Archived content'
    and columns = array['row_data'] and json_columns = array['row_data']
)
union all
select 'archive_media_guard_enabled', exists(
  select 1 from pg_catalog.pg_trigger where tgrelid = 'public.content_archive_v2'::regclass
    and tgname = 'zz_media_library_reference_guard_v2' and tgenabled = 'O' and not tgisinternal
)
union all
select 'archived_source_recreation_guard_enabled', exists(
  select 1 from pg_catalog.pg_trigger where tgrelid = 'public.social_links'::regclass
    and tgname = 'archived_navbar_shortcut_guard_v2' and tgenabled = 'O' and not tgisinternal
)
union all
select 'archive_internal_guard_private', not exists(
  select 1 from (values ('anon'), ('authenticated'), ('service_role')) role(name)
  where pg_catalog.has_function_privilege(role.name, 'public.guard_archived_navbar_shortcut_v2()', 'EXECUTE')
)
union all
select 'archive_active_ids_do_not_overlap', not exists(
  select 1 from public.content_archive_v2 archive join public.social_links social on social.id = archive.source_id
  where archive.collection = 'navbar-shortcuts'
);
