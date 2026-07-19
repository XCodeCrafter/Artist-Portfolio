-- Simple contact workflow metadata.
-- Run after 0001_initial_schema.sql.

alter table public.booking_inquiries
  add column if not exists portfolio_type text not null default 'musician',
  add column if not exists inquiry_type text not null default 'booking';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'booking_inquiries_portfolio_type_check'
      and conrelid = 'public.booking_inquiries'::regclass
  ) then
    alter table public.booking_inquiries
      add constraint booking_inquiries_portfolio_type_check
      check (portfolio_type in ('musician', 'actor'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'booking_inquiries_inquiry_type_check'
      and conrelid = 'public.booking_inquiries'::regclass
  ) then
    alter table public.booking_inquiries
      add constraint booking_inquiries_inquiry_type_check
      check (inquiry_type in ('booking', 'collaboration'));
  end if;
end $$;

create index if not exists booking_inquiries_type_created_at_idx
on public.booking_inquiries (portfolio_type, inquiry_type, created_at desc);
