-- Actor credits and resume foundation.
-- Run after 0001_initial_schema.sql.

create table if not exists public.actor_resume (
  id text primary key default 'main' check (id = 'main'),
  headline text not null default '',
  summary text not null default '',
  location text not null default '',
  playing_age text not null default '',
  height text not null default '',
  eyes text not null default '',
  hair text not null default '',
  languages text not null default '',
  skills text not null default '',
  representation text not null default '',
  resume_url text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.actor_credits (
  id text primary key,
  credit_type text not null default 'other',
  title text not null,
  role text not null default '',
  production text not null default '',
  director text not null default '',
  year text not null default '',
  href text not null default '',
  sort_order int not null default 0,
  is_published boolean not null default true,
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'actor_credits_credit_type_check'
      and conrelid = 'public.actor_credits'::regclass
  ) then
    alter table public.actor_credits
      add constraint actor_credits_credit_type_check
      check (
        credit_type in (
          'film',
          'television',
          'theatre',
          'commercial',
          'voiceover',
          'training',
          'other'
        )
      );
  end if;
end $$;

drop trigger if exists actor_resume_updated_at on public.actor_resume;
create trigger actor_resume_updated_at
before update on public.actor_resume
for each row execute function public.set_updated_at();

drop trigger if exists actor_credits_updated_at on public.actor_credits;
create trigger actor_credits_updated_at
before update on public.actor_credits
for each row execute function public.set_updated_at();

alter table public.actor_resume enable row level security;
alter table public.actor_credits enable row level security;

drop policy if exists "Public can read actor resume"
on public.actor_resume;
create policy "Public can read actor resume"
on public.actor_resume for select
to anon, authenticated
using (true);

drop policy if exists "Public can read published actor credits"
on public.actor_credits;
create policy "Public can read published actor credits"
on public.actor_credits for select
to anon, authenticated
using (is_published = true);

drop policy if exists "Admins can manage actor resume"
on public.actor_resume;
create policy "Admins can manage actor resume"
on public.actor_resume for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can manage actor credits"
on public.actor_credits;
create policy "Admins can manage actor credits"
on public.actor_credits for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create index if not exists actor_credits_type_order_idx
on public.actor_credits (credit_type, sort_order);

insert into public.actor_resume (
  id,
  headline,
  summary,
  location,
  playing_age,
  height,
  eyes,
  hair,
  languages,
  skills,
  representation,
  resume_url
) values (
  'main',
  'Screen and stage performer',
  'Actor profile foundation for casting directors, agencies, and production teams. Replace this text with a focused performer summary, casting range, and recent work highlights.',
  'Amsterdam, The Netherlands',
  '25-35',
  '',
  '',
  '',
  'English, Dutch',
  'Improvisation, movement, stage combat, guitar',
  '',
  ''
) on conflict (id) do nothing;

insert into public.actor_credits (
  id,
  credit_type,
  title,
  role,
  production,
  director,
  year,
  href,
  sort_order
) values
  (
    'credit-film-01',
    'film',
    'Short Film Title',
    'Lead',
    'Independent Production',
    'Director Name',
    '2026',
    '',
    10
  ),
  (
    'credit-theatre-01',
    'theatre',
    'Stage Production',
    'Supporting',
    'Theatre Company',
    'Director Name',
    '2025',
    '',
    20
  ),
  (
    'credit-commercial-01',
    'commercial',
    'Commercial Campaign',
    'Principal',
    'Brand / Agency',
    '',
    '2025',
    '',
    30
  )
on conflict (id) do nothing;
