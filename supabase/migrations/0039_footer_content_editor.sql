-- Additive: existing identity, fonts, public content and security policies remain intact.
-- Apply in SQL editor, then run checks/0039_footer_content_editor.sql.
begin;

alter table public.site_settings add column if not exists footer_content jsonb not null default
  '{"eyebrow":"Let''s make something","heading":"Ready for the next story","primaryLabel":"Work together","primaryHref":"/booking","secondaryLabel":"Showreel","secondaryHref":"/video","socialEyebrow":"Elsewhere","socialHeading":"Watch, listen & connect"}'::jsonb;

-- The JSON object stores text and destinations, never HTML, CSS or scripts.
-- Service actions additionally validate exact keys, field lengths and safe URLs.
create or replace function public.is_valid_footer_content_v2(p_content jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  v_key text;
  v_value text;
  v_keys constant text[] := array['eyebrow','heading','primaryLabel','primaryHref','secondaryLabel','secondaryHref','socialEyebrow','socialHeading'];
begin
  if p_content is null or pg_catalog.jsonb_typeof(p_content) <> 'object'
     or not (p_content ?& v_keys) or (p_content - v_keys) <> '{}'::jsonb then return false; end if;
  foreach v_key in array v_keys loop
    if pg_catalog.jsonb_typeof(p_content -> v_key) <> 'string' then return false; end if;
    v_value := p_content ->> v_key;
    if pg_catalog.length(v_value) > (case when v_key in ('primaryHref','secondaryHref') then 2048 else 220 end) then return false; end if;
    if v_key in ('primaryHref','secondaryHref') and v_value <> '' then
      if v_value ~ '[[:space:][:cntrl:]\\]' then return false; end if;
      if v_value !~ '^(/[^/]|/$|#[A-Za-z][A-Za-z0-9_-]*$|https://[^/@]+(/|$))' then return false; end if;
    end if;
  end loop;
  return pg_catalog.length(pg_catalog.btrim(p_content ->> 'heading')) > 0
    and ((p_content ->> 'primaryLabel' = '') = (p_content ->> 'primaryHref' = ''))
    and ((p_content ->> 'secondaryLabel' = '') = (p_content ->> 'secondaryHref' = ''));
end;
$$;

do $$ begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.site_settings'::regclass and conname = 'site_settings_footer_content_v2_valid') then
    alter table public.site_settings add constraint site_settings_footer_content_v2_valid
      check (public.is_valid_footer_content_v2(footer_content));
  end if;
end $$;

-- A pure validator confers no access to settings or other records.
comment on column public.site_settings.footer_content is 'Public footer copy and safe CTA destinations, edited with site_settings.updated_at compare-and-swap.';
notify pgrst, 'reload schema';
commit;
