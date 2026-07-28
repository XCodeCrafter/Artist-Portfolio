-- Add a one-shot denial signal to the shared rate-limit RPC.
-- The application logs only the first denied request in each fixed window,
-- keeping security charts useful without creating attacker-amplified audit rows.

drop function if exists public.consume_security_rate_limit(text, text, integer, integer);

create function public.consume_security_rate_limit(
  p_bucket text,
  p_identifier_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer,
  first_denied boolean
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

  if random() < 0.01 then
    delete from public.security_rate_limits
    where expires_at < v_now - interval '1 day';
  end if;

  return query
  select
    v_count <= p_limit,
    greatest(p_limit - least(v_count, p_limit)::integer, 0),
    greatest(ceil(extract(epoch from (v_expires_at - v_now)))::integer, 1),
    v_count = p_limit + 1;
end;
$$;

revoke all on function public.consume_security_rate_limit(text, text, integer, integer)
from public;
revoke execute on function public.consume_security_rate_limit(text, text, integer, integer)
from anon, authenticated;
grant execute on function public.consume_security_rate_limit(text, text, integer, integer)
to service_role;

comment on function public.consume_security_rate_limit(text, text, integer, integer) is
  'Atomically consumes a server-only security rate-limit slot and marks the first denial in each window.';
