-- Operational hardening for the admin workspace.
-- Adds a recoverable media trash and a server-only reference lookup used to
-- prevent assets that are still present on the public portfolio from being
-- removed accidentally.

alter table public.media_assets
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

create index if not exists media_assets_deleted_at_idx
on public.media_assets (deleted_at)
where deleted_at is not null;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'media_assets_trash_not_published_check'
      and conrelid = 'public.media_assets'::regclass
  ) then
    alter table public.media_assets
      add constraint media_assets_trash_not_published_check
      check (deleted_at is null or is_published = false);
  end if;
end;
$$;

create or replace function public.media_asset_references(p_src text)
returns table (
  reference_label text,
  reference_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select 'Page hero', count(*)::bigint
  from public.page_heroes
  where background_src = p_src or poster_src = p_src
  having count(*) > 0

  union all

  select 'Home update', count(*)::bigint
  from public.home_updates
  where avatar_src = p_src
  having count(*) > 0

  union all

  select 'Home about', count(*)::bigint
  from public.about_home
  where image_src = p_src
  having count(*) > 0

  union all

  select 'Home presentation', count(*)::bigint
  from public.media_assets
  where id = 'home-studio-settings'
    and (
      metadata ->> 'updatesImageSrc' = p_src
      or metadata ->> 'featureImageSrc' = p_src
      or metadata ->> 'featureVideoSrc' = p_src
      or metadata ->> 'featurePosterSrc' = p_src
      or metadata ->> 'storyImage1Src' = p_src
      or metadata ->> 'storyImage2Src' = p_src
      or metadata ->> 'storyImage3Src' = p_src
      or metadata ->> 'storyImage4Src' = p_src
    )
  having count(*) > 0

  union all

  select 'Music platform', count(*)::bigint
  from public.music_platform_links
  where image_src = p_src
  having count(*) > 0

  union all

  select 'Bio gallery', count(*)::bigint
  from public.bio_gallery_images
  where src = p_src
  having count(*) > 0

  union all

  select 'Gallery', count(*)::bigint
  from public.gallery_images
  where src = p_src
  having count(*) > 0

  union all

  select 'Gallery presentation', count(*)::bigint
  from public.gallery_presentation
  where interlude_video_src = p_src or interlude_poster_src = p_src
  having count(*) > 0

  union all

  select 'Video', count(*)::bigint
  from public.videos
  where thumbnail_src = p_src or embed_url = p_src
  having count(*) > 0;
$$;

revoke all on function public.media_asset_references(text)
from public, anon, authenticated;
grant execute on function public.media_asset_references(text)
to service_role;

comment on column public.media_assets.deleted_at is
  'Soft-delete timestamp. Storage objects remain intact so an admin can restore the asset.';
comment on function public.media_asset_references(text) is
  'Service-role-only lookup used to fail closed before moving a media asset to trash.';

create or replace function public.trash_media_asset(
  p_asset_id text,
  p_actor_id uuid
)
returns table (
  outcome text,
  reference_total bigint,
  storage_bucket text,
  storage_path text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asset public.media_assets%rowtype;
  v_reference_total bigint := 0;
begin
  select *
  into v_asset
  from public.media_assets
  where id = p_asset_id
  for update;

  if not found then
    return query select 'missing'::text, 0::bigint, ''::text, ''::text;
    return;
  end if;

  if v_asset.deleted_at is not null then
    return query select
      'already_trashed'::text,
      0::bigint,
      coalesce(v_asset.storage_bucket, ''),
      coalesce(v_asset.storage_path, '');
    return;
  end if;

  select coalesce(sum(found.reference_count), 0)
  into v_reference_total
  from public.media_asset_references(v_asset.src) as found;

  if v_reference_total > 0 then
    return query select
      'in_use'::text,
      v_reference_total,
      coalesce(v_asset.storage_bucket, ''),
      coalesce(v_asset.storage_path, '');
    return;
  end if;

  update public.media_assets
  set
    deleted_at = clock_timestamp(),
    deleted_by = p_actor_id,
    is_published = false
  where id = p_asset_id;

  return query select
    'trashed'::text,
    0::bigint,
    coalesce(v_asset.storage_bucket, ''),
    coalesce(v_asset.storage_path, '');
end;
$$;

revoke all on function public.trash_media_asset(text, uuid)
from public, anon, authenticated;
grant execute on function public.trash_media_asset(text, uuid)
to service_role;

comment on function public.trash_media_asset(text, uuid) is
  'Locks an asset, checks all known portfolio references, and moves it to recoverable trash in one transaction.';

-- Keep owner management safe even when mutations bypass the admin UI. The
-- transaction-scoped advisory lock serializes competing owner removals.
create or replace function public.protect_last_active_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_removes_owner boolean;
begin
  if tg_op = 'DELETE' then
    v_removes_owner := old.role = 'owner' and old.is_active = true;
  else
    v_removes_owner := old.role = 'owner'
      and old.is_active = true
      and (new.role <> 'owner' or new.is_active = false);
  end if;

  if v_removes_owner then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('admin_profiles_active_owner_guard', 0)
    );

    if not exists (
      select 1
      from public.admin_profiles
      where user_id <> old.user_id
        and role = 'owner'
        and is_active = true
    ) then
      raise exception 'At least one active owner must remain.'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists admin_profiles_preserve_active_owner_update
on public.admin_profiles;
create trigger admin_profiles_preserve_active_owner_update
before update of role, is_active on public.admin_profiles
for each row execute function public.protect_last_active_owner();

drop trigger if exists admin_profiles_preserve_active_owner_delete
on public.admin_profiles;
create trigger admin_profiles_preserve_active_owner_delete
before delete on public.admin_profiles
for each row execute function public.protect_last_active_owner();

revoke all on function public.protect_last_active_owner()
from public, anon, authenticated;

comment on function public.protect_last_active_owner() is
  'Prevents concurrent or direct mutations from removing the final active admin owner.';

-- Persist provider delivery state separately from the inquiry workflow state.
alter table public.booking_inquiries
  add column if not exists resend_email_id text,
  add column if not exists email_status text not null default 'unknown',
  add column if not exists email_status_changed_at timestamptz,
  add column if not exists email_status_provider_at timestamptz,
  add column if not exists email_status_webhook_id text;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'booking_inquiries_email_status_check'
      and conrelid = 'public.booking_inquiries'::regclass
  ) then
    alter table public.booking_inquiries
      add constraint booking_inquiries_email_status_check
      check (
        email_status in (
          'unknown',
          'pending',
          'sent',
          'delivered',
          'delayed',
          'bounced',
          'complained',
          'failed',
          'suppressed'
        )
      );
  end if;
end;
$$;

create unique index if not exists booking_inquiries_resend_email_id_idx
on public.booking_inquiries (resend_email_id)
where resend_email_id is not null;

create or replace function public.record_booking_email_delivery(
  p_resend_email_id text,
  p_email_status text,
  p_event_at timestamptz,
  p_webhook_id text
)
returns table (
  inquiry_id uuid,
  applied boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inquiry_id uuid;
  v_provider_at timestamptz;
  v_webhook_id text;
begin
  if p_resend_email_id is null
    or btrim(p_resend_email_id) = ''
    or p_event_at is null
    or p_webhook_id is null
    or btrim(p_webhook_id) = ''
    or p_email_status not in (
      'pending',
      'sent',
      'delivered',
      'delayed',
      'bounced',
      'complained',
      'failed',
      'suppressed'
    )
  then
    raise exception 'invalid email delivery event'
      using errcode = '22023';
  end if;

  select id, email_status_provider_at, email_status_webhook_id
  into v_inquiry_id, v_provider_at, v_webhook_id
  from public.booking_inquiries
  where resend_email_id = p_resend_email_id
  for update;

  if not found then
    return;
  end if;

  if v_webhook_id = p_webhook_id
    or (v_provider_at is not null and p_event_at <= v_provider_at)
  then
    return query select v_inquiry_id, false;
    return;
  end if;

  update public.booking_inquiries
  set
    email_status = p_email_status,
    email_status_changed_at = p_event_at,
    email_status_provider_at = p_event_at,
    email_status_webhook_id = p_webhook_id
  where id = v_inquiry_id;

  return query select v_inquiry_id, true;
end;
$$;

revoke all on function public.record_booking_email_delivery(
  text,
  text,
  timestamptz,
  text
) from public, anon, authenticated;
grant execute on function public.record_booking_email_delivery(
  text,
  text,
  timestamptz,
  text
) to service_role;

comment on column public.booking_inquiries.email_status is
  'Resend provider delivery state. Independent from the admin new/read/replied/archived workflow.';
comment on function public.record_booking_email_delivery(text, text, timestamptz, text) is
  'Applies signed Resend delivery events once and rejects replayed or older provider state.';
