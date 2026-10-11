-- One ordered collection of SoundCloud and Spotify music players.
-- No row, archive payload, version, table shape or existing save RPC is changed.
-- Requires 0029 and 0042. Deploy compatible application code before publishing Spotify rows.
begin;

-- Copy only the verified save contract. Reject unknown owner modifications;
-- never silently replace their concurrency, validation or permission behavior.
do $$
declare v_hash text; v_safe boolean;
begin
  if pg_catalog.to_regprocedure('public.mutate_music_content_archive_v2(text,text,text,jsonb,uuid,timestamp with time zone,timestamp with time zone)') is null
    or not exists (select 1 from pg_catalog.pg_trigger
      where tgrelid = pg_catalog.to_regclass('public.soundcloud_tracks')
        and tgname = 'archived_music_content_guard_v2' and tgenabled in ('O','A') and not tgisinternal) then
    raise exception 'music_tracks_requires_0042_archive_guards' using errcode = '55000';
  end if;
  select pg_catalog.md5(pg_catalog.replace(prosrc, E'\r\n', E'\n')),
    prosecdef and proconfig @> array['search_path=""']
    into v_hash, v_safe from pg_catalog.pg_proc
    where oid = pg_catalog.to_regprocedure('public.save_music_soundcloud_v2(text,timestamp with time zone,jsonb,jsonb)');
  if v_safe is distinct from true or v_hash is distinct from '5914dddca8db8cf186050196d0db2780' then
    raise exception 'music_tracks_requires_known_0029_save_contract' using errcode = '55000';
  end if;
  if pg_catalog.to_regprocedure('public.save_music_tracks_v2(text,timestamp with time zone,jsonb,jsonb)') is not null then
    select pg_catalog.md5(pg_catalog.replace(prosrc, E'\r\n', E'\n')),
      prosecdef and proconfig @> array['search_path=""']
      into v_hash, v_safe from pg_catalog.pg_proc
      where oid = 'public.save_music_tracks_v2(text,timestamp with time zone,jsonb,jsonb)'::regprocedure;
    if v_safe is distinct from true or v_hash is distinct from 'f38bfe2379519ebeeefc80d0097c6e90' then
      raise exception 'music_tracks_existing_save_contract_changed' using errcode = '55000';
    end if;
  end if;
  select pg_catalog.md5(pg_catalog.replace(prosrc, E'\r\n', E'\n')),
    prosecdef and proconfig @> array['search_path=""']
    into v_hash, v_safe from pg_catalog.pg_proc
    where oid = pg_catalog.to_regprocedure('public.get_music_content_archive_v2(text,integer)');
  if v_safe is distinct from true or v_hash not in ('9ed21fc39984d46381fb9c2ac51fe0cf', '123b85675861964d311471d430ef5725') then
    raise exception 'music_tracks_requires_known_0042_archive_contract' using errcode = '55000';
  end if;
end $$;

-- Historical soundcloud names in locks/errors identify the same saved collection.
-- Extend URL validation to canonical Spotify music embeds and HTTPS SoundCloud port 443.
create or replace function public.save_music_tracks_v2(
  p_site_id text,
  p_expected_presentation_updated_at timestamptz,
  p_expected_versions jsonb,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_presentation_version timestamptz;
  v_current_count integer;
  v_track_count integer;
  v_presentation_version timestamptz;
  v_versions jsonb;
  v_items jsonb;
  v_tracks jsonb;
begin
  if p_site_id is distinct from 'main'
    or p_expected_presentation_updated_at is null
    or pg_catalog.jsonb_typeof(p_expected_versions) is distinct from 'object'
    or pg_catalog.jsonb_typeof(p_payload) is distinct from 'object'
  then
    raise exception 'invalid_music_soundcloud_payload'
      using errcode = '22023';
  end if;

  if not (p_payload ?& array['mixesHeading', 'items'])
    or exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_payload) as supplied(key)
      where supplied.key not in ('mixesHeading', 'items')
    )
    or pg_catalog.jsonb_typeof(p_payload -> 'mixesHeading')
      is distinct from 'string'
    or pg_catalog.jsonb_typeof(p_payload -> 'items') is distinct from 'array'
    or pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'mixesHeading'))
      not between 1 and 220
  then
    raise exception 'invalid_music_soundcloud_payload'
      using errcode = '22023';
  end if;

  v_tracks := p_payload -> 'items';
  v_track_count := pg_catalog.jsonb_array_length(v_tracks);

  if v_track_count > 48
    or exists (
      select 1
      from pg_catalog.jsonb_each(p_expected_versions) as expected(id, version)
      where pg_catalog.char_length(expected.id) not between 1 and 160
        or expected.id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
        or pg_catalog.jsonb_typeof(expected.version) is distinct from 'string'
        or pg_catalog.char_length(p_expected_versions ->> expected.id)
          not between 1 and 64
    )
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_tracks) as submitted(item)
      where pg_catalog.jsonb_typeof(submitted.item) is distinct from 'object'
    )
  then
    raise exception 'invalid_music_soundcloud_payload'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(v_tracks) as submitted(item)
    where not (submitted.item ?& array[
        'id',
        'title',
        'embedUrl',
        'isPublished'
      ])
      or exists (
        select 1
        from pg_catalog.jsonb_object_keys(submitted.item) as supplied(key)
        where supplied.key not in (
          'id',
          'title',
          'embedUrl',
          'isPublished'
        )
      )
      or pg_catalog.jsonb_typeof(submitted.item -> 'id')
        is distinct from 'string'
      or pg_catalog.jsonb_typeof(submitted.item -> 'title')
        is distinct from 'string'
      or pg_catalog.jsonb_typeof(submitted.item -> 'embedUrl')
        is distinct from 'string'
      or pg_catalog.jsonb_typeof(submitted.item -> 'isPublished')
        is distinct from 'boolean'
  ) then
    raise exception 'invalid_music_soundcloud_payload'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(v_tracks) as submitted(item)
    where pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'id'))
        not between 1 and 160
      or pg_catalog.btrim(submitted.item ->> 'id')
        !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
      or pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'title'))
        > 220
      or pg_catalog.char_length(pg_catalog.btrim(submitted.item ->> 'embedUrl'))
        not between 1 and 2048
      or (
        pg_catalog.btrim(submitted.item ->> 'embedUrl') !~*
          '^https://(api[.]soundcloud[.]com|soundcloud[.]com|www[.]soundcloud[.]com|on[.]soundcloud[.]com)(:443)?([/?#][^[:space:]]*)?$'
        and pg_catalog.btrim(submitted.item ->> 'embedUrl') !~
          '^https://open[.]spotify[.]com/embed/(track|album|playlist)/[A-Za-z0-9]+([?#][^[:space:]]*)?$'
      )
      or pg_catalog.btrim(submitted.item ->> 'embedUrl') ~ '[[:cntrl:]]'
      or pg_catalog.strpos(
        pg_catalog.btrim(submitted.item ->> 'embedUrl'),
        pg_catalog.chr(92)
      ) > 0
  ) then
    raise exception 'invalid_music_soundcloud_payload'
      using errcode = '22023';
  end if;

  if (
    select pg_catalog.count(distinct submitted.item ->> 'id')
    from pg_catalog.jsonb_array_elements(v_tracks) as submitted(item)
  ) <> v_track_count then
    raise exception 'invalid_music_soundcloud_payload'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('music_page_v2:soundcloud:main', 0)
  );
  lock table public.soundcloud_tracks in share row exclusive mode;

  select presentation.updated_at
  into v_current_presentation_version
  from public.music_presentation as presentation
  where presentation.id = p_site_id
  for update;

  if not found then
    raise exception 'music_presentation_missing'
      using errcode = '23503';
  end if;

  if v_current_presentation_version
    is distinct from p_expected_presentation_updated_at
  then
    raise exception 'music_soundcloud_changed'
      using errcode = '40001';
  end if;

  select pg_catalog.count(*)::integer
  into v_current_count
  from public.soundcloud_tracks;

  if (
    select pg_catalog.count(*)::integer
    from pg_catalog.jsonb_object_keys(p_expected_versions)
  ) <> v_current_count
    or exists (
      select 1
      from public.soundcloud_tracks as current_track
      where not (p_expected_versions ? current_track.id)
    )
    or exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_expected_versions) as expected(id)
      where not exists (
        select 1
        from public.soundcloud_tracks as current_track
        where current_track.id = expected.id
      )
    )
  then
    raise exception 'music_soundcloud_changed'
      using errcode = '40001';
  end if;

  begin
    if exists (
      select 1
      from public.soundcloud_tracks as current_track
      where current_track.updated_at is distinct from
        (p_expected_versions ->> current_track.id)::timestamptz
    ) then
      raise exception 'music_soundcloud_changed'
        using errcode = '40001';
    end if;
  exception
    when invalid_datetime_format or datetime_field_overflow then
      raise exception 'music_soundcloud_changed'
        using errcode = '40001';
  end;

  if exists (
    select 1
    from public.soundcloud_tracks as current_track
    where not exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_tracks) as submitted(item)
      where submitted.item ->> 'id' = current_track.id
    )
  ) then
    raise exception 'invalid_music_soundcloud_payload'
      using errcode = '22023';
  end if;

  update public.music_presentation
  set mixes_heading = pg_catalog.btrim(p_payload ->> 'mixesHeading')
  where id = p_site_id
  returning updated_at into v_presentation_version;

  insert into public.soundcloud_tracks (
    id,
    title,
    embed_url,
    is_published,
    sort_order
  )
  select
    pg_catalog.btrim(submitted.item ->> 'id'),
    pg_catalog.btrim(submitted.item ->> 'title'),
    pg_catalog.btrim(submitted.item ->> 'embedUrl'),
    (submitted.item ->> 'isPublished')::boolean,
    (submitted.ordinality * 10)::integer
  from pg_catalog.jsonb_array_elements(v_tracks)
    with ordinality as submitted(item, ordinality)
  on conflict (id) do update set
    title = excluded.title,
    embed_url = excluded.embed_url,
    is_published = excluded.is_published,
    sort_order = excluded.sort_order;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', track.id,
        'title', track.title,
        'embedUrl', track.embed_url,
        'isPublished', track.is_published,
        'updatedAt', track.updated_at
      )
      order by track.sort_order, track.id
    ),
    '[]'::jsonb
  )
  into v_items
  from public.soundcloud_tracks as track;

  select coalesce(
    pg_catalog.jsonb_object_agg(
      track.id,
      pg_catalog.to_jsonb(track.updated_at)
      order by track.id
    ),
    '{}'::jsonb
  )
  into v_versions
  from public.soundcloud_tracks as track;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'versions', pg_catalog.jsonb_build_object(
      'presentationUpdatedAt', v_presentation_version,
      'items', v_versions
    )
  );
end;
$$;

revoke all on function public.save_music_tracks_v2(text,timestamptz,jsonb,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.save_music_tracks_v2(text,timestamptz,jsonb,jsonb) to service_role;

-- Only the displayed platform is derived; original row_data and restore stay intact.
create or replace function public.get_music_content_archive_v2(p_section text, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_collection text; v_result jsonb; begin
  if p_section is null or p_section not in ('platforms', 'soundcloud')
    or p_offset is null or p_offset < 0 or p_offset > 1000000 or p_offset % 20 <> 0 then
    raise exception 'invalid_music_archive_page' using errcode = '22023';
  end if;
  v_collection := case p_section when 'platforms' then 'music-platforms' else 'music-soundcloud' end;
  select pg_catalog.jsonb_build_object(
    'items', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', item.source_id,
      'label', case when p_section = 'soundcloud' then coalesce(nullif(pg_catalog.btrim(item.row_data ->> 'title'), ''), 'Untitled mix') else item.row_data ->> 'title' end,
      'platform', case when p_section = 'soundcloud' then
        case when pg_catalog.btrim(item.row_data ->> 'embed_url')
          ~ '^https://open[.]spotify[.]com(:443)?/(embed/|intl-[a-zA-Z-]+/)?(track|album|playlist)/[A-Za-z0-9]+/?([?#][^[:space:]]*)?$'
          and pg_catalog.btrim(item.row_data ->> 'embed_url') !~ '[[:cntrl:]]'
          and pg_catalog.strpos(item.row_data ->> 'embed_url', pg_catalog.chr(92)) = 0
          then 'spotify' else 'soundcloud' end
        else item.row_data ->> 'icon_key' end,
      'archivedAt', item.archived_at, 'updatedAt', item.updated_at
    ) order by item.archived_at desc, item.source_id)
      from (select source_id, row_data, archived_at, updated_at from public.content_archive_v2
        where collection = v_collection order by archived_at desc, source_id limit 20 offset p_offset) item), '[]'::jsonb),
    'total', (select count(*) from public.content_archive_v2 where collection = v_collection),
    'offset', p_offset
  ) into v_result;
  return v_result;
end; $$;

revoke all on function public.get_music_content_archive_v2(text,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_music_content_archive_v2(text,integer) to service_role;

comment on function public.save_music_tracks_v2(text,timestamptz,jsonb,jsonb) is
  'Service-only shared music-player save: SoundCloud and canonical Spotify track/album/playlist embeds, exact collection/presentation CAS, existing archive locks and no implicit deletion.';
notify pgrst, 'reload schema';
commit;
