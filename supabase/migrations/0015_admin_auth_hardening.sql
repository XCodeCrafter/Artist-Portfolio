-- Harden admin authorization and add one-time password recovery challenges.
-- Apply after 0014_gallery_studio.sql.

create table if not exists public.admin_recovery_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  session_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists admin_recovery_user_expiry_idx
on public.admin_recovery_challenges (user_id, expires_at desc);

alter table public.admin_recovery_challenges enable row level security;
revoke all on table public.admin_recovery_challenges from anon, authenticated;
grant all on table public.admin_recovery_challenges to service_role;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    and exists (
      select 1
      from public.admin_profiles
      where user_id = auth.uid()
        and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and is_active = true
    );
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    and exists (
      select 1
      from public.admin_profiles
      where user_id = auth.uid()
        and role = 'owner'
        and is_active = true
    );
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.is_owner() from public;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.is_owner() to authenticated, service_role;

create or replace function public.revoke_admin_user_sessions(target_user_id uuid)
returns void
language sql
security definer
set search_path = auth, public
as $$
  delete from auth.sessions where user_id = target_user_id;
$$;

revoke all on function public.revoke_admin_user_sessions(uuid) from public;
grant execute on function public.revoke_admin_user_sessions(uuid) to service_role;
