-- Public events are announcements, never inferred private booking availability.
-- Additive, disabled-by-default singleton. No changes to inquiries or media.
begin;

create or replace function public.is_valid_booking_calendar_v2(p_payload jsonb)
returns boolean language plpgsql stable set search_path = '' as $$
declare
  v_settings jsonb;
  v_event jsonb;
  v_date date;
  v_ids text[] := array[]::text[];
  v_field text;
begin
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object'
    or pg_catalog.octet_length(p_payload::text) > 750000
    or not (p_payload ?& array['settings','events'])
    or exists (select 1 from pg_catalog.jsonb_object_keys(p_payload) k where k not in ('settings','events'))
    or pg_catalog.jsonb_typeof(p_payload->'settings') <> 'object'
    or pg_catalog.jsonb_typeof(p_payload->'events') <> 'array'
  then return false; end if;
  v_settings := p_payload->'settings';
  if not (v_settings ?& array['enabled','title','intro'])
    or exists (select 1 from pg_catalog.jsonb_object_keys(v_settings) k where k not in ('enabled','title','intro'))
    or pg_catalog.jsonb_typeof(v_settings->'enabled') <> 'boolean'
    or pg_catalog.jsonb_typeof(v_settings->'title') <> 'string'
    or pg_catalog.jsonb_typeof(v_settings->'intro') <> 'string'
    or pg_catalog.char_length(pg_catalog.btrim(v_settings->>'title')) not between 1 and 160
    or pg_catalog.char_length(v_settings->>'intro') > 600
    or pg_catalog.jsonb_array_length(p_payload->'events') > 250
  then return false; end if;
  foreach v_field in array array['title','intro'] loop
    if (v_settings->>v_field) ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]' then return false; end if;
  end loop;
  for v_event in select value from pg_catalog.jsonb_array_elements(p_payload->'events') loop
    if pg_catalog.jsonb_typeof(v_event) <> 'object'
      or not (v_event ?& array['id','title','description','date','time','timezone','city','venue','kind','ticketUrl','status','published'])
      or exists (select 1 from pg_catalog.jsonb_object_keys(v_event) k where k not in ('id','title','description','date','time','timezone','city','venue','kind','ticketUrl','status','published'))
      or pg_catalog.jsonb_typeof(v_event->'published') <> 'boolean'
      or exists (select 1 from pg_catalog.jsonb_each(v_event) f where f.key <> 'published' and pg_catalog.jsonb_typeof(f.value) <> 'string')
    then return false; end if;
    if (v_event->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or pg_catalog.lower(v_event->>'id') = any(v_ids)
      or pg_catalog.char_length(pg_catalog.btrim(v_event->>'title')) not between 1 and 160
      or pg_catalog.char_length(v_event->>'description') > 2000
      or pg_catalog.char_length(pg_catalog.btrim(v_event->>'city')) not between 1 and 120
      or pg_catalog.char_length(pg_catalog.btrim(v_event->>'venue')) not between 1 and 180
      or pg_catalog.char_length(pg_catalog.btrim(v_event->>'kind')) not between 1 and 80
      or pg_catalog.char_length(v_event->>'timezone') not between 1 and 80
      or pg_catalog.char_length(v_event->>'ticketUrl') > 2048
      or (v_event->>'status') not in ('scheduled','sold_out','cancelled')
      or (v_event->>'date') !~ '^(19|20|21)[0-9]{2}-[0-9]{2}-[0-9]{2}$'
      or (v_event->>'time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or ((v_event->>'timezone') <> 'UTC' and (v_event->>'timezone') !~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+)+$')
      or not exists (select 1 from pg_catalog.pg_timezone_names where name = v_event->>'timezone')
    then return false; end if;
    v_ids := pg_catalog.array_append(v_ids, pg_catalog.lower(v_event->>'id'));
    -- Cast rejects impossible leap days and normalizes no silently rolled dates.
    v_date := (v_event->>'date')::date;
    if pg_catalog.to_char(v_date, 'YYYY-MM-DD') <> v_event->>'date' then return false; end if;
    foreach v_field in array array['title','description','city','venue','kind','ticketUrl'] loop
      if (v_event->>v_field) ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]' then return false; end if;
    end loop;
    if (v_event->>'ticketUrl') <> '' and (
      (v_event->>'ticketUrl') !~ '^https://[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(:443)?([/?#][^[:space:]\\]*)?$'
      or (v_event->>'ticketUrl') ~* '^https://([^/?#]*\.)?(localhost|local|internal|test|invalid)(:443)?([/?#]|$)'
      or (v_event->>'ticketUrl') ~ '^https://([0-9]+\.){3}[0-9]+(:443)?([/?#]|$)'
    ) then return false; end if;
  end loop;
  return true;
exception when invalid_datetime_format or datetime_field_overflow or invalid_text_representation then
  return false;
end;
$$;

create table if not exists public.booking_calendar (
  id text primary key check (id = 'main'),
  draft jsonb not null,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint booking_calendar_valid_draft check (public.is_valid_booking_calendar_v2(draft))
);
alter table public.booking_calendar enable row level security;
revoke all on table public.booking_calendar from public, anon, authenticated, service_role;
revoke all on function public.is_valid_booking_calendar_v2(jsonb) from public, anon, authenticated, service_role;

insert into public.booking_calendar(id, draft) values ('main', '{"settings":{"enabled":false,"title":"See you out there.","intro":"Live shows, festivals, and special appearances. Find the next one near you."},"events":[]}'::jsonb)
on conflict (id) do nothing;

create or replace function public.get_booking_calendar_v2_snapshot()
returns jsonb language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object('draft', calendar.draft, 'updatedAt', calendar.updated_at)
  from public.booking_calendar calendar where id = 'main';
$$;

create or replace function public.save_booking_calendar_v2(p_expected_updated_at timestamptz, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_current timestamptz;
  v_version timestamptz;
  v_payload jsonb;
begin
  if p_expected_updated_at is null or not public.is_valid_booking_calendar_v2(p_payload) then
    raise exception 'invalid_booking_calendar_payload' using errcode = '22023';
  end if;
  select updated_at into v_current from public.booking_calendar where id = 'main' for update;
  if not found then raise exception 'booking_calendar_snapshot_missing' using errcode = '23503'; end if;
  if v_current is distinct from p_expected_updated_at then
    raise exception 'booking_calendar_changed' using errcode = '40001';
  end if;
  -- Stable ordering, with a strictly advancing microsecond CAS even in one transaction.
  select pg_catalog.jsonb_build_object('settings', p_payload->'settings', 'events', coalesce(
    pg_catalog.jsonb_agg(item order by item->>'date', item->>'time', item->>'id'), '[]'::jsonb))
    into v_payload from pg_catalog.jsonb_array_elements(p_payload->'events') item;
  v_version := greatest(pg_catalog.clock_timestamp(), v_current + interval '1 microsecond');
  update public.booking_calendar set draft = v_payload, updated_at = v_version where id = 'main';
  return pg_catalog.jsonb_build_object('draft', v_payload, 'updatedAt', v_version);
end;
$$;

create or replace function public.get_public_booking_calendar_v1()
returns jsonb language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'settings', pg_catalog.jsonb_build_object('enabled', true, 'title', calendar.draft->'settings'->>'title', 'intro', calendar.draft->'settings'->>'intro'),
    'events', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', item->>'id', 'title', item->>'title', 'description', item->>'description',
      'date', item->>'date', 'time', item->>'time', 'timezone', item->>'timezone',
      'city', item->>'city', 'venue', item->>'venue', 'kind', item->>'kind',
      'ticketUrl', item->>'ticketUrl', 'status', item->>'status', 'published', true
    ) order by item->>'date', item->>'time', item->>'id')
      from pg_catalog.jsonb_array_elements(calendar.draft->'events') item
      where item->'published' = 'true'::jsonb), '[]'::jsonb)
  ) from public.booking_calendar calendar
  where calendar.id = 'main' and calendar.draft->'settings'->'enabled' = 'true'::jsonb;
$$;

revoke all on function public.get_booking_calendar_v2_snapshot() from public, anon, authenticated, service_role;
revoke all on function public.save_booking_calendar_v2(timestamptz,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.get_public_booking_calendar_v1() from public, anon, authenticated, service_role;
grant execute on function public.get_booking_calendar_v2_snapshot() to service_role;
grant execute on function public.save_booking_calendar_v2(timestamptz,jsonb) to service_role;
grant execute on function public.get_public_booking_calendar_v1() to anon, authenticated, service_role;

commit;
