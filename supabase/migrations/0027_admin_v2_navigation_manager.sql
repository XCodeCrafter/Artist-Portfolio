-- Admin V2 navigation manager.
--
-- The public navigation rows remain a code-owned catalogue. This migration
-- adds a consistent read snapshot and one atomic whole-collection writer. An
-- older application version must carry newer destination rows through a save;
-- it may neither delete them nor silently change their visibility.

create or replace function public.get_site_navigation_v2_snapshot(
  p_site_id text default 'main'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot jsonb;
begin
  if p_site_id is distinct from 'main' then
    raise exception 'invalid_site_navigation_site'
      using errcode = '22023';
  end if;

  select pg_catalog.jsonb_build_object(
    'siteId', settings.id,
    'artistName', settings.artist_name,
    'portfolioType', settings.portfolio_type,
    'hiddenNavPageSlugsActor', settings.hidden_nav_page_slugs_actor,
    'hiddenNavPageSlugsMusician', settings.hidden_nav_page_slugs_musician,
    'configVersion', settings.navigation_config_version,
    'items', coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'destination_key', item.destination_key,
            'is_visible', item.is_visible,
            'sort_order', item.sort_order,
            'updated_at', item.updated_at
          )
          order by item.sort_order, item.destination_key
        )
        from public.site_navigation_items as item
        where item.site_id = settings.id
      ),
      '[]'::jsonb
    )
  )
  into v_snapshot
  from public.site_settings as settings
  where settings.id = p_site_id;

  if v_snapshot is null then
    raise exception 'site_navigation_settings_missing'
      using errcode = '23503';
  end if;

  return v_snapshot;
end;
$$;

create or replace function public.save_site_navigation_v2(
  p_site_id text,
  p_expected_config_version smallint,
  p_expected_versions jsonb,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_config_version smallint;
  v_current_count integer;
  v_item_count integer;
  v_known_keys constant text[] := array[
    'home',
    'home.about',
    'home.cnc',
    'home.stories',
    'bio',
    'bio.resume',
    'gallery',
    'music',
    'music.platforms',
    'music.spotify',
    'music.soundcloud',
    'works',
    'contact'
  ];
  v_unconditionally_renderable_keys constant text[] := array[
    'home',
    'home.about',
    'home.stories',
    'bio',
    'gallery',
    'music',
    'music.platforms',
    'music.spotify',
    'music.soundcloud',
    'works',
    'contact'
  ];
  v_versions jsonb;
begin
  if p_site_id is distinct from 'main'
    or p_expected_config_version is null
    or p_expected_config_version not in (0, 1)
    or pg_catalog.jsonb_typeof(p_expected_versions) is distinct from 'object'
    or pg_catalog.jsonb_typeof(p_items) is distinct from 'array'
  then
    raise exception 'invalid_site_navigation_payload'
      using errcode = '22023';
  end if;

  -- This must be the same lock as the table-level mutation trigger in 0025.
  -- It deliberately happens before either expected state is read.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('site_navigation_items:main', 0)
  );

  select settings.navigation_config_version
  into v_current_config_version
  from public.site_settings as settings
  where settings.id = p_site_id
  for update;

  if not found then
    raise exception 'site_navigation_settings_missing'
      using errcode = '23503';
  end if;

  if v_current_config_version <> p_expected_config_version then
    raise exception 'site_navigation_changed'
      using errcode = '40001';
  end if;

  select pg_catalog.count(*)::integer
  into v_current_count
  from public.site_navigation_items as current_item
  where current_item.site_id = p_site_id;

  if (
    select pg_catalog.count(*)::integer
    from pg_catalog.jsonb_object_keys(p_expected_versions)
  ) <> v_current_count
    or exists (
      select 1
      from public.site_navigation_items as current_item
      where current_item.site_id = p_site_id
        and not (p_expected_versions ? current_item.destination_key)
    )
    or exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_expected_versions) as expected(destination_key)
      where not exists (
        select 1
        from public.site_navigation_items as current_item
        where current_item.site_id = p_site_id
          and current_item.destination_key = expected.destination_key
      )
    )
  then
    raise exception 'site_navigation_changed'
      using errcode = '40001';
  end if;

  begin
    if exists (
      select 1
      from public.site_navigation_items as current_item
      where current_item.site_id = p_site_id
        and current_item.updated_at is distinct from
          (p_expected_versions ->> current_item.destination_key)::timestamptz
    ) then
      raise exception 'site_navigation_changed'
        using errcode = '40001';
    end if;
  exception
    when invalid_datetime_format or datetime_field_overflow then
      raise exception 'site_navigation_changed'
        using errcode = '40001';
  end;

  v_item_count := pg_catalog.jsonb_array_length(p_items);
  if v_item_count < pg_catalog.array_length(v_known_keys, 1)
    or v_item_count > 999
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_items) as submitted(item)
      where pg_catalog.jsonb_typeof(submitted.item) is distinct from 'object'
        or pg_catalog.jsonb_typeof(submitted.item -> 'destinationKey')
          is distinct from 'string'
        or pg_catalog.jsonb_typeof(submitted.item -> 'isVisible')
          is distinct from 'boolean'
        or pg_catalog.char_length(submitted.item ->> 'destinationKey') not between 1 and 120
    )
    or (
      select pg_catalog.count(distinct (submitted.item ->> 'destinationKey'))
      from pg_catalog.jsonb_array_elements(p_items) as submitted(item)
    ) <> v_item_count
  then
    raise exception 'invalid_site_navigation_payload'
      using errcode = '22023';
  end if;

  -- Every key known by this build must be present exactly once. Missing known
  -- rows are therefore repaired by the upsert instead of being mistaken for a
  -- deletion request.
  if exists (
    select 1
    from pg_catalog.unnest(v_known_keys) as known(destination_key)
    where not exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_items) as submitted(item)
      where submitted.item ->> 'destinationKey' = known.destination_key
    )
  ) then
    raise exception 'invalid_site_navigation_payload'
      using errcode = '22023';
  end if;

  -- The payload may contain a destination unknown to this build only when that
  -- exact row already exists. This preserves future rows without turning the
  -- RPC into an arbitrary URL/key insertion endpoint.
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_items) as submitted(item)
    where not ((submitted.item ->> 'destinationKey') = any(v_known_keys))
      and not exists (
        select 1
        from public.site_navigation_items as current_item
        where current_item.site_id = p_site_id
          and current_item.destination_key = submitted.item ->> 'destinationKey'
      )
  ) or exists (
    select 1
    from public.site_navigation_items as current_item
    where current_item.site_id = p_site_id
      and not exists (
        select 1
        from pg_catalog.jsonb_array_elements(p_items) as submitted(item)
        where submitted.item ->> 'destinationKey' = current_item.destination_key
      )
  ) then
    raise exception 'invalid_site_navigation_payload'
      using errcode = '22023';
  end if;

  -- Unknown rows are immovable barriers in an older editor. Preserve their
  -- exact barrier membership among rows that already exist, even if a
  -- tampered payload swaps known destinations across an unknown row while
  -- leaving its absolute rank unchanged. Missing known rows that the upsert
  -- will repair are deliberately excluded from both position windows.
  if exists (
    with current_positions as (
      select
        current_item.destination_key,
        pg_catalog.row_number() over (
          order by current_item.sort_order, current_item.destination_key
        ) as position
      from public.site_navigation_items as current_item
      where current_item.site_id = p_site_id
    ),
    submitted_existing_positions as (
      select
        submitted.item ->> 'destinationKey' as destination_key,
        pg_catalog.row_number() over (order by submitted.ordinality) as position
      from pg_catalog.jsonb_array_elements(p_items)
        with ordinality as submitted(item, ordinality)
      where exists (
        select 1
        from public.site_navigation_items as current_item
        where current_item.site_id = p_site_id
          and current_item.destination_key =
            submitted.item ->> 'destinationKey'
      )
    )
    select 1
    from current_positions as unknown_current
    join submitted_existing_positions as unknown_submitted
      using (destination_key)
    cross join current_positions as peer_current
    join submitted_existing_positions as peer_submitted
      on peer_submitted.destination_key = peer_current.destination_key
    where not (unknown_current.destination_key = any(v_known_keys))
      and (peer_current.position < unknown_current.position) is distinct from
        (peer_submitted.position < unknown_submitted.position)
  ) then
    raise exception 'invalid_site_navigation_payload'
      using errcode = '22023';
  end if;

  -- A future or content-conditional visible row must not satisfy the older app
  -- while every destination this build can render unconditionally is hidden.
  if not exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_items) as submitted(item)
    where (submitted.item ->> 'destinationKey') = any(
      v_unconditionally_renderable_keys
    )
      and (submitted.item ->> 'isVisible')::boolean = true
  ) then
    raise exception 'site_navigation_empty'
      using errcode = '23514';
  end if;

  insert into public.site_navigation_items (
    site_id,
    destination_key,
    is_visible,
    sort_order
  )
  select
    p_site_id,
    submitted.item ->> 'destinationKey',
    case
      when (submitted.item ->> 'destinationKey') = any(v_known_keys)
        then (submitted.item ->> 'isVisible')::boolean
      else current_item.is_visible
    end,
    (submitted.ordinality * 10)::smallint
  from pg_catalog.jsonb_array_elements(p_items)
    with ordinality as submitted(item, ordinality)
  left join public.site_navigation_items as current_item
    on current_item.site_id = p_site_id
    and current_item.destination_key = submitted.item ->> 'destinationKey'
  on conflict (site_id, destination_key) do update set
    is_visible = excluded.is_visible,
    sort_order = excluded.sort_order;

  update public.site_settings
  set navigation_config_version = 1
  where id = p_site_id;

  select coalesce(
    pg_catalog.jsonb_object_agg(
      current_item.destination_key,
      pg_catalog.to_jsonb(current_item.updated_at)
      order by current_item.destination_key
    ),
    '{}'::jsonb
  )
  into v_versions
  from public.site_navigation_items as current_item
  where current_item.site_id = p_site_id;

  return pg_catalog.jsonb_build_object(
    'configVersion', 1,
    'expectedVersions', v_versions
  );
end;
$$;

-- Browser clients may read through RLS, but all writes go through the server
-- action and the atomic service-role RPC above.
revoke insert, update, delete on table public.site_navigation_items
from authenticated, service_role;

drop policy if exists "Admins can insert navigation items"
on public.site_navigation_items;
drop policy if exists "Admins can update navigation items"
on public.site_navigation_items;

revoke all on function public.get_site_navigation_v2_snapshot(text)
from public, anon, authenticated, service_role;
revoke all on function public.save_site_navigation_v2(text, smallint, jsonb, jsonb)
from public, anon, authenticated, service_role;

grant execute on function public.get_site_navigation_v2_snapshot(text)
to service_role;
grant execute on function public.save_site_navigation_v2(text, smallint, jsonb, jsonb)
to service_role;

comment on function public.get_site_navigation_v2_snapshot(text) is
  'Consistent service-only snapshot used by the Admin V2 navigation editor.';
comment on function public.save_site_navigation_v2(text, smallint, jsonb, jsonb) is
  'Atomically validates, reorders, and activates the complete navbar without deleting future rows.';
