-- Security center indexes and owner policy.
-- Run after 0001_initial_schema.sql.

create index if not exists audit_logs_created_at_idx
on public.audit_logs (created_at desc);

create index if not exists audit_logs_actor_created_at_idx
on public.audit_logs (actor_id, created_at desc);

create index if not exists admin_profiles_email_idx
on public.admin_profiles (lower(email));

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_profiles
    where user_id = auth.uid()
      and role = 'owner'
      and is_active = true
  );
$$;

drop policy if exists "Owners can manage admin profiles" on public.admin_profiles;
create policy "Owners can manage admin profiles"
on public.admin_profiles for all
to authenticated
using (public.is_owner())
with check (public.is_owner());
