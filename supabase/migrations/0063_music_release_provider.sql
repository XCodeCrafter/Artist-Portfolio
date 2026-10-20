-- Main Music releases player: choose Spotify or a public SoundCloud playlist.
-- Existing Spotify URLs, headings, versions, tracks and photo framing are retained.
-- The old Spotify-only save keeps its exact contract and cannot change this choice.
begin;

do $$
declare v_hash text; v_safe boolean;
begin
  select pg_catalog.md5(pg_catalog.replace(prosrc, E'\r\n', E'\n')),
    prosecdef and proconfig @> array['search_path=""']
  into v_hash, v_safe from pg_catalog.pg_proc
  where oid = pg_catalog.to_regprocedure('public.save_music_spotify_v2(text,timestamp with time zone,timestamp with time zone,jsonb)');
  if v_safe is distinct from true or v_hash is distinct from 'b19291306267b343b8c193a52c5c04b7' then
    raise exception 'music_releases_requires_known_spotify_save' using errcode = '55000';
  end if;
  select pg_catalog.md5(pg_catalog.replace(prosrc, E'\r\n', E'\n')),
    prosecdef and proconfig @> array['search_path=""']
  into v_hash, v_safe from pg_catalog.pg_proc
  where oid = pg_catalog.to_regprocedure('public.get_music_page_v2_snapshot(text)');
  if v_safe is distinct from true or v_hash not in (
    'a65dc70af86a0a33c4cabb81b0571101', 'ef4ab270718e5a45f233fb14c5fbd736'
  ) then
    raise exception 'music_releases_requires_known_snapshot' using errcode = '55000';
  end if;
  if pg_catalog.to_regprocedure('public.save_music_releases_v2(text,timestamp with time zone,timestamp with time zone,jsonb)') is not null then
    select pg_catalog.md5(pg_catalog.replace(prosrc, E'\r\n', E'\n')),
      prosecdef and proconfig @> array['search_path=""']
    into v_hash, v_safe from pg_catalog.pg_proc
    where oid = 'public.save_music_releases_v2(text,timestamp with time zone,timestamp with time zone,jsonb)'::regprocedure;
    if v_safe is distinct from true or v_hash is distinct from '6e88f8975cdf4e4b5b9b24fa37958f0f' then
      raise exception 'music_releases_existing_save_contract_changed' using errcode = '55000';
    end if;
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger
    where tgrelid = pg_catalog.to_regclass('public.music_presentation')
      and tgname = 'music_presentation_updated_at' and tgenabled in ('O','A') and not tgisinternal
      and tgtype = 19 and tgfoid = pg_catalog.to_regprocedure('public.set_updated_at()'))
    or not exists (select 1 from pg_catalog.pg_class
      where oid = pg_catalog.to_regclass('public.music_presentation') and relrowsecurity) then
    raise exception 'music_releases_requires_parent_guards' using errcode = '55000';
  end if;
end $$;

alter table public.music_presentation
  add column if not exists release_provider text not null default 'spotify',
  add column if not exists soundcloud_playlist_url text not null default '';

-- IF NOT EXISTS must not silently adopt a manually created, weaker column.
-- Accept only the exact original storage/default contract, including on reruns.
do $$
begin
  if (select count(*) from pg_catalog.pg_attribute column_info
    join pg_catalog.pg_attrdef column_default
      on column_default.adrelid = column_info.attrelid and column_default.adnum = column_info.attnum
    where column_info.attrelid = 'public.music_presentation'::regclass
      and column_info.attname in ('release_provider','soundcloud_playlist_url')
      and column_info.atttypid = 'text'::regtype and column_info.atttypmod = -1
      and column_info.attnotnull and not column_info.attisdropped
      and column_info.attgenerated = '' and column_info.attidentity = ''
      and pg_catalog.pg_get_expr(column_default.adbin, column_default.adrelid) = case column_info.attname
        when 'release_provider' then '''spotify''::text' else '''''::text' end) <> 2 then
    raise exception 'music_releases_columns_contract_changed' using errcode = '55000';
  end if;
end $$;

-- Validate both the selected and dormant provider configuration. No URL supplied
-- by an editor can turn the playlist iframe into a general-purpose embed.
alter table public.music_presentation drop constraint if exists music_presentation_release_provider_check;
alter table public.music_presentation add constraint music_presentation_release_provider_check
  check (release_provider in ('spotify', 'soundcloud'));
alter table public.music_presentation drop constraint if exists music_presentation_soundcloud_playlist_check;
alter table public.music_presentation add constraint music_presentation_soundcloud_playlist_check
  check (pg_catalog.char_length(soundcloud_playlist_url) <= 2048
    and (soundcloud_playlist_url = ''
      or soundcloud_playlist_url ~ '^https://soundcloud[.]com/[A-Za-z0-9_-]+/sets/[A-Za-z0-9_-]+/?$')
    and (release_provider <> 'soundcloud' or soundcloud_playlist_url <> ''));

-- Extend the existing single-statement snapshot rather than reading the new
-- columns separately. Hero/photo wrappers continue to call the same function.
-- The old 0062 snapshot-hash check is superseded by the exact 0063 check.
do $$
declare v_definition text; v_hash text;
begin
  select pg_catalog.pg_get_functiondef(oid),
    pg_catalog.md5(pg_catalog.replace(prosrc, E'\r\n', E'\n'))
  into v_definition, v_hash from pg_catalog.pg_proc
  where oid = 'public.get_music_page_v2_snapshot(text)'::regprocedure;
  if v_hash = 'a65dc70af86a0a33c4cabb81b0571101' then
    v_definition := pg_catalog.replace(pg_catalog.replace(v_definition, E'\r\n', E'\n'),
      E'      ''releasesHeading'', presentation.releases_heading,',
      E'      ''releasesHeading'', presentation.releases_heading,\n      ''provider'', presentation.release_provider,\n      ''soundcloudPlaylistUrl'', presentation.soundcloud_playlist_url,');
    execute v_definition;
  end if;
  if (select pg_catalog.md5(pg_catalog.replace(prosrc, E'\r\n', E'\n'))
    from pg_catalog.pg_proc where oid = 'public.get_music_page_v2_snapshot(text)'::regprocedure)
    is distinct from 'ef4ab270718e5a45f233fb14c5fbd736' then
    raise exception 'music_releases_snapshot_extension_failed' using errcode = '55000';
  end if;
end $$;

create or replace function public.save_music_releases_v2(
  p_site_id text,
  p_expected_settings_updated_at timestamptz,
  p_expected_presentation_updated_at timestamptz,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_settings_version timestamptz;
  v_current_presentation_version timestamptz;
  v_settings_version timestamptz;
  v_presentation_version timestamptz;
  v_section jsonb;
begin
  if p_site_id is distinct from 'main'
    or p_expected_settings_updated_at is null
    or p_expected_presentation_updated_at is null
    or pg_catalog.jsonb_typeof(p_payload) is distinct from 'object'
    or pg_catalog.octet_length(p_payload::text) > 24000 then
    raise exception 'invalid_music_releases_payload' using errcode = '22023';
  end if;
  if not (p_payload ?& array['releasesHeading','artistUrl','embedUrl','provider','soundcloudPlaylistUrl'])
    or (select count(*) from pg_catalog.jsonb_object_keys(p_payload)) <> 5
    or exists (select 1 from pg_catalog.jsonb_each(p_payload) field
      where pg_catalog.jsonb_typeof(field.value) is distinct from 'string') then
    raise exception 'invalid_music_releases_payload' using errcode = '22023';
  end if;
  if pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'releasesHeading')) not between 1 and 220
    or pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'artistUrl')) > 2048
    or pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'embedUrl')) > 2048
    or pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'soundcloudPlaylistUrl')) > 2048
    or p_payload ->> 'provider' not in ('spotify','soundcloud')
    or exists (select 1 from pg_catalog.jsonb_each_text(p_payload) field
      where field.key in ('artistUrl','embedUrl','soundcloudPlaylistUrl')
        and field.value ~ '[[:space:][:cntrl:]\\]')
    or (pg_catalog.btrim(p_payload ->> 'artistUrl') <> ''
      and pg_catalog.btrim(p_payload ->> 'artistUrl') !~* '^https://open[.]spotify[.]com/artist/[A-Za-z0-9]+/?([?#][^[:space:]]*)?$')
    or (pg_catalog.btrim(p_payload ->> 'embedUrl') <> ''
      and pg_catalog.btrim(p_payload ->> 'embedUrl') !~ '^https://open[.]spotify[.]com/embed/(artist|playlist|album|track|show|episode)/[A-Za-z0-9]+/?([?#][^[:space:][:cntrl:]\\]*)?$')
    or (pg_catalog.btrim(p_payload ->> 'soundcloudPlaylistUrl') <> ''
      and pg_catalog.btrim(p_payload ->> 'soundcloudPlaylistUrl') !~ '^https://soundcloud[.]com/[A-Za-z0-9_-]+/sets/[A-Za-z0-9_-]+/?$')
    or (p_payload ->> 'provider' = 'soundcloud'
      and pg_catalog.btrim(p_payload ->> 'soundcloudPlaylistUrl') = '') then
    raise exception 'invalid_music_releases_payload' using errcode = '22023';
  end if;

  -- Shared with the unchanged legacy Spotify endpoint, including row-lock order.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('music_page_v2:spotify:main', 0)
  );
  select settings.updated_at into v_current_settings_version
  from public.site_settings settings where settings.id = p_site_id for update;
  if not found then raise exception 'music_settings_missing' using errcode = '23503'; end if;
  select presentation.updated_at into v_current_presentation_version
  from public.music_presentation presentation where presentation.id = p_site_id for update;
  if not found then raise exception 'music_presentation_missing' using errcode = '23503'; end if;
  if v_current_settings_version is distinct from p_expected_settings_updated_at
    or v_current_presentation_version is distinct from p_expected_presentation_updated_at then
    raise exception 'music_spotify_changed' using errcode = '40001';
  end if;
  update public.site_settings set
    spotify_artist_url = pg_catalog.btrim(p_payload ->> 'artistUrl'),
    spotify_embed_url = pg_catalog.btrim(p_payload ->> 'embedUrl')
  where id = p_site_id returning updated_at into v_settings_version;
  update public.music_presentation set
    releases_heading = pg_catalog.btrim(p_payload ->> 'releasesHeading'),
    release_provider = p_payload ->> 'provider',
    soundcloud_playlist_url = pg_catalog.btrim(p_payload ->> 'soundcloudPlaylistUrl')
  where id = p_site_id returning updated_at into v_presentation_version;
  v_section := pg_catalog.jsonb_build_object(
    'releasesHeading', pg_catalog.btrim(p_payload ->> 'releasesHeading'),
    'artistUrl', pg_catalog.btrim(p_payload ->> 'artistUrl'),
    'embedUrl', pg_catalog.btrim(p_payload ->> 'embedUrl'),
    'provider', p_payload ->> 'provider',
    'soundcloudPlaylistUrl', pg_catalog.btrim(p_payload ->> 'soundcloudPlaylistUrl')
  );
  return pg_catalog.jsonb_build_object(
    'section', v_section,
    'versions', pg_catalog.jsonb_build_object(
      'settingsUpdatedAt', v_settings_version,
      'presentationUpdatedAt', v_presentation_version
    )
  );
end;
$$;

revoke all on function public.save_music_releases_v2(text,timestamptz,timestamptz,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.save_music_releases_v2(text,timestamptz,timestamptz,jsonb) to service_role;
-- CREATE OR REPLACE retains grants, but restate this boundary explicitly.
revoke all on function public.get_music_page_v2_snapshot(text) from public, anon, authenticated, service_role;
grant execute on function public.get_music_page_v2_snapshot(text) to service_role;

comment on function public.save_music_releases_v2(text,timestamptz,timestamptz,jsonb) is
  'Service-only main Music release-provider editor with shared legacy locks and dual version CAS. Retains both provider URLs.';
notify pgrst, 'reload schema';
commit;
