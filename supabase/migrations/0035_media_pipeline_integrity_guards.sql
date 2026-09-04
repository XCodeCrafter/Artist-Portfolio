-- Batch 7A.2a: provider-neutral integrity guards required before any
-- storage/worker write RPC.
--
-- This migration is additive. It does not backfill, publish, update, or delete
-- media assets or stored objects.

begin;

-- A database-level conditional foreign key closes the concurrent race between
-- publishing a ready variant and retiring its physical object. Trigger-only
-- checks cannot provide this guarantee under every READ COMMITTED interleaving.
create unique index if not exists media_physical_objects_id_status_key
on public.media_physical_objects (id, status);

alter table public.media_asset_variants
add column if not exists required_physical_object_status text
generated always as (
  case when status = 'ready' then 'ready'::text else null::text end
) stored;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.media_asset_variants'::pg_catalog.regclass
      and conname = 'media_asset_variants_ready_object_fk'
  ) then
    alter table public.media_asset_variants
    add constraint media_asset_variants_ready_object_fk
      foreign key (physical_object_id, required_physical_object_status)
      references public.media_physical_objects (id, status)
      on delete restrict;
  end if;
end;
$$;

create or replace function public.guard_media_physical_object_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attribution_cleared boolean;
begin
  -- Preserve the ON DELETE SET NULL contract on created_by, including for
  -- terminal rows, while rejecting every other bundled mutation.
  v_attribution_cleared := old.created_by is not null
    and new.created_by is null
    and (
      pg_catalog.to_jsonb(new) - 'created_by' - 'updated_at'
      = pg_catalog.to_jsonb(old) - 'created_by' - 'updated_at'
    );

  if v_attribution_cleared then
    return new;
  end if;

  if new.id is distinct from old.id
    or new.storage_provider is distinct from old.storage_provider
    or new.storage_container is distinct from old.storage_container
    or new.object_key is distinct from old.object_key
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then
    raise exception 'media_object_identity_is_immutable'
      using errcode = '23514';
  end if;

  if old.status in ('ready', 'retired')
    and (
      new.media_type is distinct from old.media_type
      or new.mime_type is distinct from old.mime_type
      or new.byte_size is distinct from old.byte_size
      or new.checksum_sha256 is distinct from old.checksum_sha256
      or new.etag is distinct from old.etag
      or new.width_px is distinct from old.width_px
      or new.height_px is distinct from old.height_px
      or new.duration_ms is distinct from old.duration_ms
    )
  then
    raise exception 'verified_media_object_metadata_is_immutable'
      using errcode = '23514';
  end if;

  if old.status = 'failed' then
    raise exception 'failed_media_object_is_terminal'
      using errcode = '23514';
  end if;

  if old.status in ('ready', 'retired')
    and new.status not in ('ready', 'retired')
  then
    raise exception 'verified_media_object_state_is_invalid'
      using errcode = '23514';
  end if;

  if new.status = 'retired'
    and old.status <> 'retired'
    and exists (
      select 1
      from public.media_asset_variants as variant
      where variant.physical_object_id = old.id
        and variant.status = 'ready'
    )
  then
    raise exception 'media_object_is_used_by_ready_variant'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_media_physical_object_v1()
from public, anon, authenticated, service_role;

drop trigger if exists media_physical_objects_integrity_guard
on public.media_physical_objects;
create trigger media_physical_objects_integrity_guard
before update on public.media_physical_objects
for each row execute function public.guard_media_physical_object_v1();

create or replace function public.guard_media_asset_variant_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attribution_cleared boolean;
  v_asset_media_type text;
  v_source_kind text;
  v_source_status text;
  v_object_media_type text;
  v_object_status text;
  v_object_deleted_at timestamptz;
begin
  if tg_op = 'UPDATE' then
    -- Preserve the ON DELETE SET NULL contract on created_by without opening
    -- a general mutation path through failed or otherwise immutable variants.
    v_attribution_cleared := old.created_by is not null
      and new.created_by is null
      -- Do not read NEW.required_physical_object_status here: PostgreSQL fills
      -- stored generated columns only after BEFORE triggers have completed.
      and new.id is not distinct from old.id
      and new.asset_id is not distinct from old.asset_id
      and new.physical_object_id is not distinct from old.physical_object_id
      and new.source_variant_id is not distinct from old.source_variant_id
      and new.variant_kind is not distinct from old.variant_kind
      and new.preset_key is not distinct from old.preset_key
      and new.status is not distinct from old.status
      and new.is_preferred is not distinct from old.is_preferred
      and new.transformation_params is not distinct from old.transformation_params
      and new.created_at is not distinct from old.created_at;

    if v_attribution_cleared then
      return new;
    end if;

    if new.id is distinct from old.id
      or new.asset_id is distinct from old.asset_id
      or new.source_variant_id is distinct from old.source_variant_id
      or new.variant_kind is distinct from old.variant_kind
      or new.preset_key is distinct from old.preset_key
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at
    then
      raise exception 'media_variant_identity_is_immutable'
        using errcode = '23514';
    end if;

    if old.physical_object_id is not null
      and new.physical_object_id is distinct from old.physical_object_id
    then
      raise exception 'media_variant_object_is_immutable'
        using errcode = '23514';
    end if;

    if old.status = 'failed' then
      raise exception 'failed_media_variant_is_terminal'
        using errcode = '23514';
    end if;

    if old.status in ('ready', 'retired')
      and new.status not in ('ready', 'retired')
    then
      raise exception 'verified_media_variant_state_is_invalid'
        using errcode = '23514';
    end if;
  end if;

  if new.variant_kind <> 'source' then
    select source.variant_kind, source.status
    into v_source_kind, v_source_status
    from public.media_asset_variants as source
    where source.id = new.source_variant_id
      and source.asset_id = new.asset_id;

    if not found or v_source_kind <> 'source' then
      raise exception 'media_variant_source_is_invalid'
        using errcode = '23514';
    end if;

    if new.status = 'ready'
      and v_source_status not in ('ready', 'retired')
    then
      raise exception 'media_variant_source_is_not_verified'
        using errcode = '23514';
    end if;
  end if;

  if new.status = 'ready' then
    select asset.media_type
    into v_asset_media_type
    from public.media_assets as asset
    where asset.id = new.asset_id;

    select object.media_type, object.status, object.deleted_at
    into v_object_media_type, v_object_status, v_object_deleted_at
    from public.media_physical_objects as object
    where object.id = new.physical_object_id;

    if v_asset_media_type is null
      or v_object_status is distinct from 'ready'
      or v_object_deleted_at is not null
    then
      raise exception 'media_variant_object_is_not_ready'
        using errcode = '23514';
    end if;

    if (
      new.variant_kind = 'poster'
      and (
        v_asset_media_type <> 'video'
        or v_object_media_type <> 'image'
      )
    ) or (
      new.variant_kind <> 'poster'
      and v_object_media_type <> v_asset_media_type
    )
    then
      raise exception 'media_variant_object_type_mismatch'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_media_asset_variant_v1()
from public, anon, authenticated, service_role;

drop trigger if exists media_asset_variants_integrity_guard
on public.media_asset_variants;
create trigger media_asset_variants_integrity_guard
before insert or update on public.media_asset_variants
for each row execute function public.guard_media_asset_variant_v1();

create or replace function public.guard_media_optimization_job_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attribution_cleared boolean;
  v_source_kind text;
  v_output_kind text;
  v_output_preset text;
  v_output_source_id uuid;
  v_output_status text;
  v_output_object_id uuid;
  v_object_status text;
  v_object_deleted_at timestamptz;
begin
  if tg_op = 'UPDATE' then
    -- requested_by also uses ON DELETE SET NULL. Permit only that isolated
    -- anonymization change, including after the job becomes terminal.
    v_attribution_cleared := old.requested_by is not null
      and new.requested_by is null
      and (
        pg_catalog.to_jsonb(new) - 'requested_by' - 'updated_at'
        = pg_catalog.to_jsonb(old) - 'requested_by' - 'updated_at'
      );

    if v_attribution_cleared then
      return new;
    end if;

    if new.id is distinct from old.id
      or new.asset_id is distinct from old.asset_id
      or new.source_variant_id is distinct from old.source_variant_id
      or new.output_kind is distinct from old.output_kind
      or new.preset_key is distinct from old.preset_key
      or new.asset_version is distinct from old.asset_version
      or new.source_variant_version is distinct from old.source_variant_version
      or new.max_attempts is distinct from old.max_attempts
      or new.request_options is distinct from old.request_options
      or new.requested_by is distinct from old.requested_by
      or new.created_at is distinct from old.created_at
    then
      raise exception 'media_optimization_job_recipe_is_immutable'
        using errcode = '23514';
    end if;

    if old.status in ('succeeded', 'failed', 'cancelled') then
      raise exception 'media_optimization_job_is_terminal'
        using errcode = '23514';
    end if;
  end if;

  select source.variant_kind
  into v_source_kind
  from public.media_asset_variants as source
  where source.id = new.source_variant_id
    and source.asset_id = new.asset_id;

  if not found or v_source_kind <> 'source' then
    raise exception 'media_optimization_source_is_invalid'
      using errcode = '23514';
  end if;

  if new.status = 'succeeded' then
    select
      output.variant_kind,
      output.preset_key,
      output.source_variant_id,
      output.status,
      output.physical_object_id
    into
      v_output_kind,
      v_output_preset,
      v_output_source_id,
      v_output_status,
      v_output_object_id
    from public.media_asset_variants as output
    where output.id = new.output_variant_id
      and output.asset_id = new.asset_id;

    if not found
      or v_output_kind is distinct from new.output_kind
      or v_output_preset is distinct from new.preset_key
      or v_output_source_id is distinct from new.source_variant_id
      or v_output_status is distinct from 'ready'
      or v_output_object_id is null
    then
      raise exception 'media_optimization_output_is_invalid'
        using errcode = '23514';
    end if;

    select object.status, object.deleted_at
    into v_object_status, v_object_deleted_at
    from public.media_physical_objects as object
    where object.id = v_output_object_id;

    if not found
      or v_object_status is distinct from 'ready'
      or v_object_deleted_at is not null
    then
      raise exception 'media_optimization_output_object_is_invalid'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_media_optimization_job_v1()
from public, anon, authenticated, service_role;

drop trigger if exists media_optimization_jobs_integrity_guard
on public.media_optimization_jobs;
create trigger media_optimization_jobs_integrity_guard
before insert or update on public.media_optimization_jobs
for each row execute function public.guard_media_optimization_job_v1();

comment on function public.guard_media_physical_object_v1() is
  'Freezes storage identity and verified technical metadata before provider write RPCs are exposed.';
comment on function public.guard_media_asset_variant_v1() is
  'Requires same-asset source lineage and a ready physical object for every ready media variant.';
comment on function public.guard_media_optimization_job_v1() is
  'Freezes optimization recipes and validates every successful output variant and object.';
comment on column public.media_asset_variants.required_physical_object_status is
  'Generated ready-state key used by a concurrency-safe physical-object foreign key.';

commit;
