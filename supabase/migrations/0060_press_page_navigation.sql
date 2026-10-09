-- Move the Press presentation to its own page without moving/copying its data.
-- Press stays in home_page_config.draft.press with the existing CAS/media guards.
begin;

-- Match the navigation RPC lock order before changing its catalog or constraints.
do $$ begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('site_navigation_items:main', 0));
  if pg_catalog.to_regprocedure('public.save_home_editorial_section_v2(text,text,timestamp with time zone,jsonb)') is null then
    raise exception 'press_page_requires_0055' using errcode = '55000';
  end if;
end $$;

alter table public.site_navigation_items drop constraint site_navigation_items_destination_key_valid;
alter table public.site_navigation_items add constraint site_navigation_items_destination_key_valid check (
  destination_key in ('home','home.about','home.cnc','home.stories','bio','bio.resume',
    'gallery','music','music.platforms','music.spotify','music.soundcloud','works','press','contact')
);

-- Legacy per-profile settings can hide the new page while preserving at least
-- one of the six primary destinations. Do not rewrite either stored array.
alter table public.site_settings drop constraint site_settings_hidden_nav_page_slugs_actor_valid;
alter table public.site_settings add constraint site_settings_hidden_nav_page_slugs_actor_valid check (
  hidden_nav_page_slugs_actor <@ array['home','bio','gallery','video','booking','press']::text[]
  and cardinality(hidden_nav_page_slugs_actor) < 6
);
alter table public.site_settings drop constraint site_settings_hidden_nav_page_slugs_musician_valid;
alter table public.site_settings add constraint site_settings_hidden_nav_page_slugs_musician_valid check (
  hidden_nav_page_slugs_musician <@ array['home','bio','music','video','booking','press']::text[]
  and cardinality(hidden_nav_page_slugs_musician) < 6
);

-- Change only the two curated key arrays in the known RPC. Its exact CAS,
-- future-row barriers, permissions and nonempty-navigation validation stay intact.
do $$
declare v_body text; v_definition text; v_hash text; v_safe boolean;
begin
  select prosrc, pg_catalog.pg_get_functiondef(oid), prosecdef and proconfig @> array['search_path=""']
    into v_body, v_definition, v_safe from pg_catalog.pg_proc
    where oid = 'public.save_site_navigation_v2(text,smallint,jsonb,jsonb)'::regprocedure;
  v_hash := pg_catalog.md5(pg_catalog.replace(v_body, E'\r\n', E'\n'));
  if v_safe is distinct from true or v_hash not in ('69ca46a9af838213d798648b63587355','731a6e75dd85b8680965d39473f917b7') then
    raise exception 'press_page_requires_known_navigation_save_contract' using errcode = '55000';
  end if;
  if v_hash = '69ca46a9af838213d798648b63587355' then
    v_definition := pg_catalog.replace(v_definition, E'\r\n', E'\n');
    execute pg_catalog.replace(v_definition,
      E'    ''works'',\n    ''contact''',
      E'    ''works'',\n    ''press'',\n    ''contact''');
  end if;
end $$;

-- Insert once just before the saved Contact destination, with the canonical
-- 125 slot as a fallback when no lower rank is available. Existing
-- destinations keep every stored value, version and relative position. Reruns
-- preserve an owner's later hidden/reordered Press choice.
do $$
declare v_order smallint; v_contact_order smallint;
begin
  if exists (select 1 from public.site_settings where id = 'main')
    and not exists (select 1 from public.site_navigation_items where site_id = 'main' and destination_key = 'press') then
    select sort_order into v_contact_order from public.site_navigation_items
      where site_id = 'main' and destination_key = 'contact';
    select candidate::smallint into v_order from pg_catalog.generate_series(10,9999) candidate
      where not exists (select 1 from public.site_navigation_items where site_id = 'main' and sort_order = candidate)
      order by case when candidate < v_contact_order then 0 else 1 end,
        case when candidate < v_contact_order then v_contact_order - candidate
          else pg_catalog.abs(candidate - 125) end,
        candidate limit 1;
    if v_order is null then raise exception 'press_page_navigation_order_unavailable' using errcode = '55000'; end if;
    insert into public.site_navigation_items(site_id,destination_key,is_visible,sort_order)
      values ('main','press',true,v_order);
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
