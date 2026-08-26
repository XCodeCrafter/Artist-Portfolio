-- Long-form CNC programs shown in the interactive HOME code viewer.
-- Source stays as text: PostgreSQL TOAST handles large values without turning
-- a program into a pile of line records or a pretend media upload.

create table if not exists public.cnc_programs (
  id text primary key,
  file_name text not null,
  title text not null,
  description text not null default '',
  dialect text not null default 'siemens',
  source_code text not null,
  preview_line_count smallint not null default 6,
  sort_order integer not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cnc_programs_id_check
    check (id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$'),
  constraint cnc_programs_file_name_length_check
    check (char_length(btrim(file_name)) between 1 and 100),
  constraint cnc_programs_file_name_path_check
    check (file_name !~ E'[/\\\\]' and file_name !~ '[[:cntrl:]]'),
  constraint cnc_programs_title_length_check
    check (char_length(btrim(title)) between 1 and 220),
  constraint cnc_programs_description_length_check
    check (char_length(description) <= 1000),
  constraint cnc_programs_dialect_check
    check (dialect in ('heidenhain', 'iso', 'siemens')),
  constraint cnc_programs_source_length_check
    check (
      source_code ~ '[^[:space:]]'
      and position(E'\r' in source_code) = 0
      and char_length(source_code) <= 200000
      and octet_length(source_code) <= 500000
      and array_length(string_to_array(source_code, E'\n'), 1) <= 5000
    ),
  constraint cnc_programs_preview_line_count_check
    check (preview_line_count between 3 and 20),
  constraint cnc_programs_sort_order_check
    check (sort_order between 0 and 9999)
);

-- Every writer takes the same transaction-scoped lock before touching the
-- collection. This makes the optimistic version check in the replacement RPC
-- reliable even when two admins save at almost exactly the same time.
create or replace function public.lock_cnc_program_collection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cnc_programs_collection', 0)
  );
  return null;
end;
$$;

drop trigger if exists cnc_programs_serialize_writes on public.cnc_programs;
create trigger cnc_programs_serialize_writes
before insert or update or delete on public.cnc_programs
for each statement execute function public.lock_cnc_program_collection();

-- PostgreSQL can cheaply enforce aggregate size, but a row check cannot cap an
-- individual line. Keep that invariant next to the data instead of trusting a
-- textarea and good intentions.
create or replace function public.validate_cnc_program_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line text;
begin
  foreach v_line in array pg_catalog.string_to_array(new.source_code, E'\n')
  loop
    if pg_catalog.char_length(v_line) > 4000 then
      raise exception 'cnc_program_line_too_long'
        using errcode = '23514';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists cnc_programs_validate_source on public.cnc_programs;
create trigger cnc_programs_validate_source
before insert or update of source_code on public.cnc_programs
for each row execute function public.validate_cnc_program_source();

-- The check is deferred so a replace operation may briefly insert a new row
-- before deleting the old one while still enforcing the final collection.
create or replace function public.enforce_cnc_program_collection_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_program_count bigint;
  v_total_source_bytes numeric;
begin
  select
    pg_catalog.count(*),
    coalesce(pg_catalog.sum(pg_catalog.octet_length(source_code)), 0)
  into v_program_count, v_total_source_bytes
  from public.cnc_programs;

  if v_program_count > 3 then
    raise exception 'cnc_program_limit_exceeded'
      using errcode = '23514';
  end if;

  if v_total_source_bytes > 650000 then
    raise exception 'cnc_program_total_source_too_large'
      using errcode = '23514';
  end if;

  return null;
end;
$$;

drop trigger if exists cnc_programs_collection_limits on public.cnc_programs;
create constraint trigger cnc_programs_collection_limits
after insert or update on public.cnc_programs
deferrable initially deferred
for each row execute function public.enforce_cnc_program_collection_limits();

drop trigger if exists cnc_programs_updated_at on public.cnc_programs;
create trigger cnc_programs_updated_at
before update on public.cnc_programs
for each row execute function public.set_updated_at();

-- Replace the complete 0-3 program collection atomically. Expected timestamps
-- make a stale browser tab fail cleanly instead of becoming an accidental
-- delete button with excellent typography.
create or replace function public.replace_cnc_programs(
  p_expected_versions jsonb,
  p_programs jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected_count bigint;
  v_program_count integer;
  v_total_source_bytes numeric;
begin
  if pg_catalog.jsonb_typeof(p_expected_versions) is distinct from 'object'
    or pg_catalog.jsonb_typeof(p_programs) is distinct from 'array'
  then
    raise exception 'invalid_cnc_program_payload'
      using errcode = '22023';
  end if;

  v_program_count := pg_catalog.jsonb_array_length(p_programs);

  if v_program_count > 3 then
    raise exception 'cnc_program_limit_exceeded'
      using errcode = '23514';
  end if;

  select
    coalesce(
      pg_catalog.sum(pg_catalog.octet_length(program.source_code)),
      0
    )
  into v_total_source_bytes
  from pg_catalog.jsonb_to_recordset(p_programs) as program(source_code text);

  if v_total_source_bytes > 650000 then
    raise exception 'cnc_program_total_source_too_large'
      using errcode = '23514';
  end if;

  if v_program_count <> (
    select pg_catalog.count(distinct program.id)
    from pg_catalog.jsonb_to_recordset(p_programs) as program(id text)
  ) then
    raise exception 'duplicate_or_missing_cnc_program_id'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cnc_programs_collection', 0)
  );

  select pg_catalog.count(*)
  into v_expected_count
  from pg_catalog.jsonb_object_keys(p_expected_versions);

  if v_expected_count <> (select pg_catalog.count(*) from public.cnc_programs)
    or exists (
      select 1
      from public.cnc_programs as current_program
      where (p_expected_versions ->> current_program.id)::timestamptz
        is distinct from current_program.updated_at
    )
  then
    raise exception 'cnc_programs_changed'
      using errcode = '40001';
  end if;

  insert into public.cnc_programs (
    id,
    file_name,
    title,
    description,
    dialect,
    source_code,
    preview_line_count,
    sort_order,
    is_published
  )
  select
    program.id,
    program.file_name,
    program.title,
    program.description,
    program.dialect,
    program.source_code,
    program.preview_line_count,
    program.sort_order,
    program.is_published
  from pg_catalog.jsonb_to_recordset(p_programs) as program(
    id text,
    file_name text,
    title text,
    description text,
    dialect text,
    source_code text,
    preview_line_count smallint,
    sort_order integer,
    is_published boolean
  )
  on conflict (id) do update set
    file_name = excluded.file_name,
    title = excluded.title,
    description = excluded.description,
    dialect = excluded.dialect,
    source_code = excluded.source_code,
    preview_line_count = excluded.preview_line_count,
    sort_order = excluded.sort_order,
    is_published = excluded.is_published;

  delete from public.cnc_programs as current_program
  where not exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_programs) as program(id text)
    where program.id = current_program.id
  );
end;
$$;

revoke all on function public.lock_cnc_program_collection()
from public, anon, authenticated;
revoke all on function public.validate_cnc_program_source()
from public, anon, authenticated;
revoke all on function public.enforce_cnc_program_collection_limits()
from public, anon, authenticated;
revoke all on function public.replace_cnc_programs(jsonb, jsonb)
from public, anon, authenticated;
grant execute on function public.replace_cnc_programs(jsonb, jsonb)
to service_role;

create index if not exists cnc_programs_published_order_idx
on public.cnc_programs (sort_order, id)
where is_published = true;

alter table public.cnc_programs enable row level security;

revoke all on table public.cnc_programs
from public, anon, authenticated, service_role;
grant select on table public.cnc_programs
to anon;
grant select, insert, update, delete on table public.cnc_programs
to authenticated, service_role;

drop policy if exists "Public can read published CNC programs"
on public.cnc_programs;
create policy "Public can read published CNC programs"
on public.cnc_programs for select
to anon, authenticated
using (is_published = true);

drop policy if exists "Admins can manage CNC programs"
on public.cnc_programs;
create policy "Admins can manage CNC programs"
on public.cnc_programs for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

insert into public.cnc_programs (
  id,
  file_name,
  title,
  description,
  dialect,
  source_code,
  preview_line_count,
  sort_order,
  is_published
)
values (
  'demo-01',
  'DEMO_01.NC',
  'Tool change & first move',
  'A temporary ISO-style sample. Replace this source with the complete program when it is ready for the portfolio.',
  'siemens',
  E'T06 M06,\nM3 S1500\nG00 X100 Y-50\nG01 Z3 F900',
  6,
  10,
  true
)
on conflict (id) do nothing;

comment on table public.cnc_programs is
  'CNC source programs rendered by the HOME viewer; the Site editor manages a maximum of three.';
comment on column public.cnc_programs.source_code is
  'Verbatim CNC source with normalized LF newlines; never copied into audit metadata.';
