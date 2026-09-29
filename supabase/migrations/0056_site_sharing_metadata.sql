-- Sharing & SEO is independent of hero headings and hidden Home sections.
-- This adds a published-only singleton; no existing copy or media is changed.
-- No provider is activated. Apply manually, then run checks/0056_site_sharing_metadata.sql.
begin;

do $$ begin
  if pg_catalog.to_regprocedure('public.media_library_reference_registry_v2()') is null
    or pg_catalog.to_regprocedure('public.guard_media_library_references_v2()') is null
    or not exists(select 1 from pg_catalog.pg_trigger where tgrelid = 'public.site_settings'::regclass
      and tgname = 'zz_media_library_reference_guard_v2' and not tgisinternal and tgenabled in ('O','A'))
    or not exists(select 1 from public.media_library_reference_registry_v2() where table_name = 'content_archive_v2') then
    raise exception 'site_sharing_requires_media_reference_guards' using errcode = '55000';
  end if;
end; $$;

create or replace function public.is_valid_site_sharing_v2(p_payload jsonb)
returns boolean language plpgsql immutable security definer set search_path = '' as $$
declare v_key text; v_text text; v_keys text[] := array['title','description','imageSrc','imageAlt'];
begin
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) is distinct from 'object'
    or not (p_payload ?& v_keys) or (p_payload - v_keys) <> '{}'::jsonb
    or pg_catalog.octet_length(p_payload::text) > 16000 then return false; end if;
  foreach v_key in array v_keys loop
    if pg_catalog.jsonb_typeof(p_payload->v_key) is distinct from 'string' then return false; end if;
    v_text := p_payload->>v_key;
    if v_text ~ '[[:cntrl:]]' or pg_catalog.char_length(v_text) > (case v_key when 'title' then 120
      when 'description' then 320 when 'imageSrc' then 2048 else 500 end) then return false; end if;
    if v_key = 'imageSrc' and v_text <> '' then
      if v_text ~ '[[:space:]]' or pg_catalog.strpos(v_text,pg_catalog.chr(92)) > 0 then return false; end if;
      if pg_catalog.left(v_text,1) = '/' then
        if v_text !~* '^/images/[A-Za-z0-9_./-]+\.(jpe?g|png|webp)$'
          or v_text ~ '(^|/)\.{1,2}(/|$)|//' then return false; end if;
      elsif v_text !~* '^https://[^[:space:]/?#:@]+(:443)?([/?#][^[:space:]]*)?$'
        or pg_catalog.strpos(v_text,'#') > 0 then return false;
      end if;
    end if;
  end loop;
  return true;
end; $$;

create table if not exists public.site_sharing_config (
  id text primary key default 'main' check (id = 'main'),
  payload jsonb not null default '{"title":"","description":"","imageSrc":"","imageAlt":""}'::jsonb
    constraint site_sharing_payload_valid check (public.is_valid_site_sharing_v2(payload)),
  updated_at timestamptz not null default pg_catalog.clock_timestamp()
);
alter table public.site_sharing_config enable row level security;
revoke all on table public.site_sharing_config from public, anon, authenticated, service_role;

-- Only matching, live and published library images may become a social cover.
-- This read-only helper also removes a cover from projection if later unpublished.
create or replace function public.is_available_site_sharing_image_v2(p_src text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_src = '' or exists(select 1 from public.media_assets where src = p_src
    and media_type = 'image' and deleted_at is null and is_published
    and (mime_type in ('image/jpeg','image/png','image/webp')
      or (coalesce(mime_type,'') = '' and pg_catalog.split_part(pg_catalog.split_part(src,'?',1),'#',1) ~* '\.(jpe?g|png|webp)$')));
$$;

create or replace function public.validate_site_sharing_v2(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb; v_src text;
begin
  if not public.is_valid_site_sharing_v2(p_payload) then raise exception 'invalid_site_sharing_payload' using errcode = '22023'; end if;
  select pg_catalog.jsonb_object_agg(key,pg_catalog.btrim(value)) into v_result from pg_catalog.jsonb_each_text(p_payload);
  v_src := v_result->>'imageSrc';
  if v_src <> '' then
    perform 1 from public.media_assets where src = v_src and media_type = 'image' and deleted_at is null and is_published
      and (mime_type in ('image/jpeg','image/png','image/webp')
        or (coalesce(mime_type,'') = '' and pg_catalog.split_part(pg_catalog.split_part(src,'?',1),'#',1) ~* '\.(jpe?g|png|webp)$'))
      order by id for share;
    if not found then raise exception 'invalid_site_sharing_image' using errcode = '22023'; end if;
  end if;
  return v_result;
end; $$;

-- Extend the one registry used by usage reports, atomic replacement, trash and
-- deterministic lock ordering. Existing private archives remain protected.
create or replace function public.media_library_reference_registry_v2()
returns table(table_name text, reference_label text, columns text[], json_columns text[])
language sql immutable security definer set search_path = '' as $$
  values
    ('about_home', 'Home about (Classic)', array['image_src','cta_href'], '{}'::text[]),
    ('actor_credits', 'Bio credit link', array['href'], '{}'::text[]),
    ('actor_resume', 'Bio resume download', array['resume_url'], '{}'::text[]),
    ('bio_gallery_images', 'Bio gallery', array['src'], '{}'::text[]),
    ('content_archive_v2', 'Archived content', array['row_data'], array['row_data']),
    ('gallery_images', 'Gallery', array['src'], '{}'::text[]),
    ('gallery_presentation', 'Gallery presentation', array['interlude_video_src','interlude_poster_src'], '{}'::text[]),
    ('home_page_config', 'Home V2 (including hidden sections)', array['draft'], array['draft']),
    ('home_updates', 'Home update (Classic)', array['avatar_src','href'], '{}'::text[]),
    ('media_assets', 'Saved media presentation', array['metadata'], array['metadata']),
    ('music_platform_links', 'Music platform', array['image_src','href'], '{}'::text[]),
    ('page_heroes', 'Page hero / button', array['background_src','poster_src','cta_href'], '{}'::text[]),
    ('site_settings', 'Site music / footer link', array['spotify_artist_url','spotify_embed_url','footer_content'], array['footer_content']),
    ('site_sharing_config', 'Site sharing preview', array['payload'], array['payload']),
    ('social_links', 'Navbar / social link', array['href'], '{}'::text[]),
    ('soundcloud_tracks', 'SoundCloud track', array['embed_url'], '{}'::text[]),
    ('videos', 'Showreel / video', array['thumbnail_src','embed_url'], '{}'::text[]);
$$;

create or replace function public.guard_site_sharing_v2()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.payload is distinct from old.payload then
    new.payload := public.validate_site_sharing_v2(new.payload);
  end if;
  return new;
end; $$;
drop trigger if exists site_sharing_guard_v2 on public.site_sharing_config;
create trigger site_sharing_guard_v2 before insert or update on public.site_sharing_config
for each row execute function public.guard_site_sharing_v2();
drop trigger if exists zz_media_library_reference_guard_v2 on public.site_sharing_config;
create trigger zz_media_library_reference_guard_v2 before insert or update on public.site_sharing_config
for each row execute function public.guard_media_library_references_v2();

-- This owner's requested starting copy only. Never rewrite customized identity
-- copy, other owners, or a saved sharing configuration when the migration reruns.
insert into public.site_sharing_config(id,payload)
select 'main', pg_catalog.jsonb_build_object(
  'title',case when artist_name = 'Franky Fugazi' then 'Franky Fugazi | Cigar Box Blues' else '' end,
  'description',case when artist_name = 'Franky Fugazi' and (pg_catalog.btrim(description) = '' or description =
    'Official actor and musician portfolio featuring biography, headshots, acting credits, showreel, releases, videos, and contact information.')
    then 'Raw cigar box blues, garage and swamp sounds. Discover Franky Fugazi’s music, videos and live dates.'
    else '' end, 'imageSrc','', 'imageAlt','') from public.site_settings where id = 'main'
on conflict (id) do nothing;
insert into public.site_sharing_config(id) values('main') on conflict (id) do nothing;

create or replace function public.get_site_sharing_editor_v2(p_site_id text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if p_site_id is distinct from 'main' then raise exception 'invalid_site_sharing_id' using errcode = '22023'; end if;
  select pg_catalog.jsonb_build_object('draft',payload,'versions',pg_catalog.jsonb_build_object('updatedAt',updated_at))
    into v_result from public.site_sharing_config where id = 'main';
  return v_result;
end; $$;

create or replace function public.save_site_sharing_v2(p_site_id text,p_expected_updated_at timestamptz,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_current timestamptz; v_version timestamptz; v_payload jsonb;
begin
  if p_site_id is distinct from 'main' or p_expected_updated_at is null then raise exception 'invalid_site_sharing_payload' using errcode = '22023'; end if;
  -- Match the media replacement lock order: content table/row before media rows.
  lock table public.site_sharing_config in row exclusive mode;
  select updated_at into v_current from public.site_sharing_config where id = 'main' for update;
  if not found then raise exception 'site_sharing_snapshot_missing' using errcode = '23503'; end if;
  if v_current is distinct from p_expected_updated_at then raise exception 'site_sharing_changed' using errcode = '40001'; end if;
  v_payload := public.validate_site_sharing_v2(p_payload);
  update public.site_sharing_config set payload = v_payload,
    updated_at = greatest(pg_catalog.clock_timestamp(),v_current + interval '1 microsecond')
    where id = 'main' returning updated_at into v_version;
  return pg_catalog.jsonb_build_object('canonical',v_payload,'versions',pg_catalog.jsonb_build_object('updatedAt',v_version));
end; $$;

-- Exact public projection: no draft, version, asset row or private helper data.
create or replace function public.get_public_site_sharing_v2()
returns jsonb language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object('title',payload->>'title','description',payload->>'description',
    'imageSrc',case when public.is_available_site_sharing_image_v2(payload->>'imageSrc') then payload->>'imageSrc' else '' end,
    'imageAlt',case when payload->>'imageSrc' <> '' and public.is_available_site_sharing_image_v2(payload->>'imageSrc') then payload->>'imageAlt' else '' end)
  from public.site_sharing_config where id = 'main';
$$;

revoke all on function public.is_valid_site_sharing_v2(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.is_available_site_sharing_image_v2(text) from public, anon, authenticated, service_role;
revoke all on function public.validate_site_sharing_v2(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.guard_site_sharing_v2() from public, anon, authenticated, service_role;
revoke all on function public.get_site_sharing_editor_v2(text) from public, anon, authenticated, service_role;
revoke all on function public.save_site_sharing_v2(text,timestamptz,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.get_public_site_sharing_v2() from public, anon, authenticated, service_role;
grant execute on function public.get_site_sharing_editor_v2(text) to service_role;
grant execute on function public.save_site_sharing_v2(text,timestamptz,jsonb) to service_role;
grant execute on function public.get_public_site_sharing_v2() to anon, authenticated, service_role;
notify pgrst, 'reload schema';
commit;
