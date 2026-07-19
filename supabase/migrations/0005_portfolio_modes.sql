-- Portfolio profile modes.
-- Run after 0001_initial_schema.sql.

alter table public.site_settings
  add column if not exists portfolio_type text not null default 'musician';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'site_settings_portfolio_type_check'
  ) then
    alter table public.site_settings
      add constraint site_settings_portfolio_type_check
      check (portfolio_type in ('musician', 'actor'));
  end if;
end $$;

update public.site_settings
set portfolio_type = 'musician'
where portfolio_type is null or portfolio_type not in ('musician', 'actor');
