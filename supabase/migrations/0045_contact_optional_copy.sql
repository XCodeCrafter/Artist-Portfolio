-- Batch 13E: Contact location and introduction are optional, as in Appearance.
-- Requires the existing 0033 Contact editor and the main site-settings row.
-- Deployment changes capabilities only; it never rewrites existing content.
begin;

do $$ begin
  if pg_catalog.to_regprocedure('public.get_contact_page_v2_snapshot(text)') is null
    or pg_catalog.to_regprocedure('public.save_contact_hero_v2(text,timestamp with time zone,jsonb)') is null
    or pg_catalog.to_regprocedure('public.save_contact_details_v2(text,timestamp with time zone,jsonb)') is null
    or not exists(select 1 from public.site_settings where id = 'main') then
    raise exception 'contact_optional_copy_requires_0033_and_main_settings' using errcode = '55000';
  end if;
end; $$;

-- Keep the 0033 save boundary, validation, trimming, advisory lock, row lock,
-- shared settings-version CAS and response unchanged. Only the two minimum
-- lengths are removed; NULL/missing fields are not substitutes for empty text.
create or replace function public.save_contact_details_v2(
  p_site_id text,
  p_expected_updated_at timestamptz,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_version timestamptz;
  v_version timestamptz;
begin
  if p_site_id is distinct from 'main'
    or p_expected_updated_at is null
    or pg_catalog.jsonb_typeof(p_payload) is distinct from 'object'
    or not (p_payload ?& array['location', 'contactBlurb'])
    or exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_payload) as supplied(key)
      where supplied.key not in ('location', 'contactBlurb')
    )
    or pg_catalog.jsonb_typeof(p_payload -> 'location') is distinct from 'string'
    or pg_catalog.jsonb_typeof(p_payload -> 'contactBlurb') is distinct from 'string'
    or pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'location')) > 220
    or pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'contactBlurb')) > 1000
  then
    raise exception 'invalid_contact_details_payload'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('contact_page_v2:details:main', 0)
  );

  select settings.updated_at
  into v_current_version
  from public.site_settings as settings
  where settings.id = p_site_id
  for update;

  if not found then
    raise exception 'contact_page_snapshot_missing'
      using errcode = '23503';
  end if;
  if v_current_version is distinct from p_expected_updated_at then
    raise exception 'contact_details_changed'
      using errcode = '40001';
  end if;

  update public.site_settings
  set location = pg_catalog.btrim(p_payload ->> 'location'),
      contact_blurb = pg_catalog.btrim(p_payload ->> 'contactBlurb')
  where id = p_site_id
  returning updated_at into v_version;

  return pg_catalog.jsonb_build_object(
    'versions', pg_catalog.jsonb_build_object('updatedAt', v_version)
  );
end;
$$;

-- A narrow read-only capability avoids interpreting an unrelated validation
-- error as a missing migration. Failed/missing capability reads must not block
-- ordinary non-empty Contact edits or the independent Hero editor.
create or replace function public.get_contact_copy_capabilities_v2()
returns jsonb
language sql
immutable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object('optionalDetails', true);
$$;

revoke all on function public.save_contact_details_v2(text, timestamptz, jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.get_contact_copy_capabilities_v2()
from public, anon, authenticated, service_role;
grant execute on function public.save_contact_details_v2(text, timestamptz, jsonb)
to service_role;
grant execute on function public.get_contact_copy_capabilities_v2()
to service_role;

comment on function public.save_contact_details_v2(text, timestamptz, jsonb) is
  'Atomically saves optional Contact location and copy when the exact shared settings version still matches; empty strings hide optional copy, not the contact form.';
comment on function public.get_contact_copy_capabilities_v2() is
  'Read-only service capability for optional Contact details. Exposes no site content or identity.';
commit;
