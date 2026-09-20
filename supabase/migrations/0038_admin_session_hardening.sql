-- Admin hardening after 0037. Apply manually, then run the matching checks.
-- No portfolio content, accounts, MFA factors, or active sessions are deleted.
-- Only older duplicate password-recovery challenges are retired; the newest
-- usable challenge per administrator is preserved before adding uniqueness.
begin;

do $$
begin
  if pg_catalog.to_regclass('public.admin_profiles') is null
    or pg_catalog.to_regclass('public.admin_recovery_challenges') is null
    or pg_catalog.to_regclass('auth.sessions') is null
    or not exists (
      select 1 from pg_catalog.pg_attribute
      where attrelid = pg_catalog.to_regclass('auth.sessions')
        and attname = 'not_after' and not attisdropped
        and atttypid = 'timestamp with time zone'::pg_catalog.regtype
    ) then
    raise exception 'admin_hardening_requires_auth_and_0015'
      using errcode = '55000';
  end if;
  if not pg_catalog.pg_has_role(current_user,
    (select relowner from pg_catalog.pg_class
      where oid = 'public.admin_recovery_challenges'::pg_catalog.regclass), 'MEMBER') then
    raise exception 'admin_hardening_requires_table_owner'
      using errcode = '42501';
  end if;
end;
$$;

-- Restrict all stored hashes to the server, including on a rerun.
alter table public.admin_recovery_challenges enable row level security;
revoke all on table public.admin_recovery_challenges from public, anon, authenticated;
grant select, insert, update, delete on table public.admin_recovery_challenges to service_role;

lock table public.admin_recovery_challenges in share row exclusive mode;
with ranked as (
  select id, row_number() over (
    partition by user_id
    order by (used_at is null and expires_at > pg_catalog.now()) desc,
      created_at desc, id desc
  ) as position
  from public.admin_recovery_challenges
)
delete from public.admin_recovery_challenges as challenge
using ranked where ranked.id = challenge.id and ranked.position > 1;

create unique index if not exists admin_recovery_one_per_user_idx
  on public.admin_recovery_challenges(user_id);

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_index
    where indexrelid = pg_catalog.to_regclass('public.admin_recovery_one_per_user_idx')
      and indrelid = 'public.admin_recovery_challenges'::pg_catalog.regclass
      and indisunique and indisvalid and indnkeyatts = 1 and indpred is null
      and indkey[0] = (select attnum from pg_catalog.pg_attribute
        where attrelid = 'public.admin_recovery_challenges'::pg_catalog.regclass
          and attname = 'user_id')
  ) then
    raise exception 'admin_recovery_unique_index_invalid' using errcode = '55000';
  end if;
end;
$$;

create or replace function public.is_admin_session_active(
  p_user_id uuid, p_session_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.sessions as session
    where session.id = p_session_id and session.user_id = p_user_id
      and (session.not_after is null or session.not_after > pg_catalog.now())
  );
$$;
revoke all on function public.is_admin_session_active(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.is_admin_session_active(uuid,uuid) to service_role;

-- Protect existing direct-table and Storage RLS paths as well as server actions.
-- Token signature, expiry and user identity are verified by Supabase before RLS.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    and exists (
      select 1 from public.admin_profiles as profile
      where profile.user_id = auth.uid() and profile.is_active = true
        and pg_catalog.lower(profile.email) = pg_catalog.lower(coalesce(auth.jwt() ->> 'email', ''))
    )
    and exists (
      select 1 from auth.sessions as session
      where session.user_id = auth.uid()
        and session.id::text = auth.jwt() ->> 'session_id'
        and (session.not_after is null or session.not_after > pg_catalog.now())
    );
$$;
revoke all on function public.is_admin() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated, service_role;

create or replace function public.issue_admin_recovery_challenge(
  p_user_id uuid, p_token_hash text, p_session_hash text, p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_user_id is null or p_token_hash is null or p_session_hash is null
    or p_token_hash !~ '^[0-9a-f]{64}$' or p_session_hash !~ '^[0-9a-f]{64}$'
    or p_expires_at is null or p_expires_at <= pg_catalog.clock_timestamp()
    or p_expires_at > pg_catalog.clock_timestamp() + interval '11 minutes' then
    raise exception 'invalid_admin_recovery_challenge' using errcode = '22023';
  end if;

  -- Lock a persistent per-user row so concurrent replacements serialize even
  -- when there was no previous challenge. Deactivation uses this same row lock.
  perform 1 from public.admin_profiles as profile
  join auth.users as account on account.id = profile.user_id
  where profile.user_id = p_user_id and profile.is_active = true
    and pg_catalog.lower(profile.email) = pg_catalog.lower(account.email)
  for update of profile;
  if not found then
    raise exception 'admin_recovery_profile_unavailable' using errcode = '42501';
  end if;

  delete from public.admin_recovery_challenges where user_id = p_user_id;
  insert into public.admin_recovery_challenges(user_id, token_hash, session_hash, expires_at)
    values (p_user_id, p_token_hash, p_session_hash, p_expires_at)
    returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.issue_admin_recovery_challenge(uuid,text,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.issue_admin_recovery_challenge(uuid,text,text,timestamptz)
  to service_role;

notify pgrst, 'reload schema';
commit;
