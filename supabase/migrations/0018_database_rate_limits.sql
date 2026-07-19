-- Shared atomic rate limiting in Supabase PostgreSQL.
-- Only the server-side service role can inspect the buckets or consume slots.

create table if not exists public.security_rate_limits (
  bucket text not null,
  identifier_hash text not null,
  window_started_at timestamptz not null,
  expires_at timestamptz not null,
  request_count bigint not null default 1 check (request_count > 0),
  updated_at timestamptz not null default now(),
  primary key (bucket, identifier_hash),
  constraint security_rate_limits_bucket_length
    check (char_length(bucket) between 1 and 120),
  constraint security_rate_limits_bucket_format
    check (bucket ~ '^[a-z0-9:_-]+$'),
  constraint security_rate_limits_identifier_hash_format
    check (identifier_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists security_rate_limits_expires_at_idx
on public.security_rate_limits (expires_at);

alter table public.security_rate_limits enable row level security;
revoke all on table public.security_rate_limits from public, anon, authenticated;
grant all on table public.security_rate_limits to service_role;

create or replace function public.consume_security_rate_limit(
  p_bucket text,
  p_identifier_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_count bigint;
  v_expires_at timestamptz;
begin
  if p_bucket is null
    or p_bucket !~ '^[a-z0-9:_-]{1,120}$'
    or p_identifier_hash is null
    or p_identifier_hash !~ '^[0-9a-f]{64}$'
    or p_limit is null
    or p_limit not between 1 and 10000
    or p_window_seconds is null
    or p_window_seconds not between 1 and 604800
  then
    raise exception 'invalid rate limit parameters'
      using errcode = '22023';
  end if;

  insert into public.security_rate_limits (
    bucket,
    identifier_hash,
    window_started_at,
    expires_at,
    request_count,
    updated_at
  )
  values (
    p_bucket,
    p_identifier_hash,
    v_now,
    v_now + make_interval(secs => p_window_seconds),
    1,
    v_now
  )
  on conflict (bucket, identifier_hash) do update
  set
    request_count = case
      when public.security_rate_limits.expires_at <= excluded.window_started_at
        then 1
      else public.security_rate_limits.request_count + 1
    end,
    window_started_at = case
      when public.security_rate_limits.expires_at <= excluded.window_started_at
        then excluded.window_started_at
      else public.security_rate_limits.window_started_at
    end,
    expires_at = case
      when public.security_rate_limits.expires_at <= excluded.window_started_at
        then excluded.expires_at
      else public.security_rate_limits.expires_at
    end,
    updated_at = excluded.updated_at
  returning request_count, expires_at
  into v_count, v_expires_at;

  -- Keep abandoned identifiers bounded without requiring another service.
  if random() < 0.01 then
    delete from public.security_rate_limits
    where expires_at < v_now - interval '1 day';
  end if;

  return query
  select
    v_count <= p_limit,
    greatest(p_limit - least(v_count, p_limit)::integer, 0),
    greatest(ceil(extract(epoch from (v_expires_at - v_now)))::integer, 1);
end;
$$;

revoke all on function public.consume_security_rate_limit(text, text, integer, integer)
from public;
revoke execute on function public.consume_security_rate_limit(text, text, integer, integer)
from anon, authenticated;
grant execute on function public.consume_security_rate_limit(text, text, integer, integer)
to service_role;

comment on table public.security_rate_limits is
  'Server-only fixed-window counters keyed by HMAC-pseudonymized identifiers.';
comment on function public.consume_security_rate_limit(text, text, integer, integer) is
  'Atomically consumes a server-only security rate-limit slot.';
