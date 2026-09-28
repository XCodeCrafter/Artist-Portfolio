-- Public Contact now combines live dates and the existing inquiry form.
-- Rename only known stock hero titles. Owner-written titles (including blanks),
-- media, framing, CTA, page IDs, inquiries and calendar publication stay intact.
begin;

do $$
declare
  v_title text;
  v_previous_version timestamptz;
  v_next_version timestamptz;
begin
  if pg_catalog.to_regclass('public.page_heroes') is null
    or not exists (
      select 1 from pg_catalog.pg_trigger
      where tgrelid = pg_catalog.to_regclass('public.page_heroes')
        and tgname = 'page_heroes_updated_at'
        and not tgisinternal
        and tgenabled in ('O', 'A')
        and tgtype = 19 -- BEFORE UPDATE, FOR EACH ROW
        and tgfoid = pg_catalog.to_regprocedure('public.set_updated_at()')
    ) then
    raise exception 'live_contact_copy_requires_hero_version_trigger'
      using errcode = '55000';
  end if;

  select title, updated_at into v_title, v_previous_version
  from public.page_heroes
  where page_slug = 'booking'
  for update;
  if not found then
    raise exception 'live_contact_copy_requires_contact_hero_0033'
      using errcode = '55000';
  end if;

  if pg_catalog.upper(pg_catalog.btrim(v_title)) not in ('CONTACT', 'BOOKING', 'BOOKINGS') then
    return;
  end if;

  update public.page_heroes
  set title = 'LIVE & CONTACT'
  where page_slug = 'booking'
  returning updated_at into v_next_version;

  -- Existing admin snapshots must conflict after a title change. Fail atomically
  -- if the existing trigger did not invalidate that snapshot's exact version.
  if v_next_version is not distinct from v_previous_version then
    raise exception 'live_contact_copy_version_not_invalidated'
      using errcode = '55000';
  end if;
end;
$$;

commit;
