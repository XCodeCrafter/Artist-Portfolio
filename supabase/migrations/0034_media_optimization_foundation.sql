-- Batch 7A.1: provider-neutral media metadata and optimization queue.
--
-- media_assets remains the compatibility/publication layer. This migration
-- deliberately performs no backfill and does not update or delete any existing
-- media_assets row, including synthetic settings/document rows.

begin;

create table if not exists public.media_physical_objects (
  id uuid primary key default gen_random_uuid(),
  storage_provider text not null,
  storage_container text not null,
  object_key text not null,
  delivery_url text not null default '',
  media_type text not null,
  mime_type text not null,
  byte_size bigint not null default 0,
  checksum_sha256 text,
  etag text,
  width_px integer,
  height_px integer,
  duration_ms bigint,
  status text not null default 'pending',
  provider_metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint media_physical_objects_location_key
    unique (storage_provider, storage_container, object_key),
  constraint media_physical_objects_provider_check check (
    storage_provider ~ '^[a-z][a-z0-9_-]{0,63}$'
  ),
  constraint media_physical_objects_container_check check (
    pg_catalog.char_length(storage_container) between 1 and 255
    and storage_container !~ '[[:cntrl:]/\\]'
  ),
  constraint media_physical_objects_object_key_check check (
    pg_catalog.char_length(object_key) between 1 and 1024
    and object_key !~ '[[:cntrl:]\\]'
    and object_key !~ '(^/|//|(^|/)[.]{1,2}(/|$))'
  ),
  constraint media_physical_objects_delivery_url_check check (
    delivery_url = ''
    or (
      pg_catalog.char_length(delivery_url) <= 2048
      and delivery_url ~* '^https://[^[:space:]/?#:@]+(:[0-9]{1,5})?([/?#]|$)'
      and delivery_url !~ '[[:cntrl:]\\]'
      and delivery_url !~ '[?#]'
    )
  ),
  constraint media_physical_objects_media_type_check check (
    media_type in ('image', 'video', 'audio', 'document')
  ),
  constraint media_physical_objects_mime_type_check check (
    mime_type = pg_catalog.lower(mime_type)
    and mime_type ~ '^[a-z0-9][a-z0-9.+-]{0,126}/[a-z0-9][a-z0-9.+-]{0,126}$'
  ),
  constraint media_physical_objects_size_check check (byte_size >= 0),
  constraint media_physical_objects_sha256_check check (
    checksum_sha256 is null or checksum_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint media_physical_objects_dimensions_check check (
    (width_px is null or width_px between 1 and 32768)
    and (height_px is null or height_px between 1 and 32768)
  ),
  constraint media_physical_objects_duration_check check (
    duration_ms is null or duration_ms between 0 and 86400000
  ),
  constraint media_physical_objects_status_check check (
    status in ('pending', 'ready', 'failed', 'retired')
  ),
  constraint media_physical_objects_ready_check check (
    status <> 'ready'
    or (delivery_url <> '' and byte_size > 0 and checksum_sha256 is not null)
  ),
  constraint media_physical_objects_retired_check check (
    (status = 'retired') = (deleted_at is not null)
  ),
  constraint media_physical_objects_metadata_check check (
    provider_metadata = '{}'::jsonb
  )
);

create table if not exists public.media_asset_variants (
  id uuid primary key default gen_random_uuid(),
  asset_id text not null references public.media_assets(id) on delete restrict,
  physical_object_id uuid references public.media_physical_objects(id) on delete restrict,
  source_variant_id uuid,
  variant_kind text not null,
  preset_key text not null,
  status text not null default 'pending',
  is_preferred boolean not null default false,
  transformation_params jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_asset_variants_id_asset_key unique (id, asset_id),
  constraint media_asset_variants_object_key unique (physical_object_id),
  constraint media_asset_variants_source_asset_fk
    foreign key (source_variant_id, asset_id)
    references public.media_asset_variants(id, asset_id)
    on delete restrict,
  constraint media_asset_variants_kind_check check (
    variant_kind in ('source', 'optimized', 'preview', 'poster')
  ),
  constraint media_asset_variants_preset_check check (
    preset_key ~ '^[a-z][a-z0-9_-]{0,63}$'
  ),
  constraint media_asset_variants_status_check check (
    status in ('pending', 'ready', 'failed', 'retired')
  ),
  constraint media_asset_variants_source_lineage_check check (
    (
      variant_kind = 'source'
      and preset_key = 'source'
      and source_variant_id is null
    )
    or (
      variant_kind <> 'source'
      and preset_key <> 'source'
      and source_variant_id is not null
    )
  ),
  constraint media_asset_variants_not_self_source_check check (
    source_variant_id is null or source_variant_id <> id
  ),
  constraint media_asset_variants_ready_check check (
    status <> 'ready' or physical_object_id is not null
  ),
  constraint media_asset_variants_preferred_check check (
    not is_preferred or status = 'ready'
  ),
  constraint media_asset_variants_params_check check (
    transformation_params = '{}'::jsonb
  )
);

create unique index if not exists media_asset_variants_live_source_idx
on public.media_asset_variants (asset_id)
where variant_kind = 'source' and status in ('pending', 'ready');

create unique index if not exists media_asset_variants_preferred_kind_idx
on public.media_asset_variants (asset_id, variant_kind)
where is_preferred;

create index if not exists media_asset_variants_asset_created_idx
on public.media_asset_variants (asset_id, created_at desc);

create table if not exists public.media_optimization_jobs (
  id uuid primary key,
  asset_id text not null references public.media_assets(id) on delete restrict,
  source_variant_id uuid not null,
  output_variant_id uuid,
  output_kind text not null default 'optimized',
  preset_key text not null,
  asset_version timestamptz not null,
  source_variant_version timestamptz not null,
  status text not null default 'queued',
  progress smallint not null default 0,
  attempt_count smallint not null default 0,
  max_attempts smallint not null default 3,
  worker_id text,
  lease_expires_at timestamptz,
  request_options jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  requested_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint media_optimization_jobs_source_asset_fk
    foreign key (source_variant_id, asset_id)
    references public.media_asset_variants(id, asset_id)
    on delete restrict,
  constraint media_optimization_jobs_output_asset_fk
    foreign key (output_variant_id, asset_id)
    references public.media_asset_variants(id, asset_id)
    on delete restrict,
  constraint media_optimization_jobs_output_key unique (output_variant_id),
  constraint media_optimization_jobs_output_kind_check check (
    output_kind in ('optimized', 'preview', 'poster')
  ),
  constraint media_optimization_jobs_preset_check check (
    preset_key in ('high_quality', 'balanced', 'smallest_file')
  ),
  constraint media_optimization_jobs_status_check check (
    status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')
  ),
  constraint media_optimization_jobs_progress_check check (
    progress between 0 and 100
  ),
  constraint media_optimization_jobs_attempts_check check (
    attempt_count between 0 and 10
    and max_attempts between 1 and 10
    and attempt_count <= max_attempts
  ),
  constraint media_optimization_jobs_worker_check check (
    worker_id is null
    or worker_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  ),
  constraint media_optimization_jobs_options_check check (
    request_options = '{}'::jsonb
  ),
  constraint media_optimization_jobs_error_check check (
    (error_code is null or error_code ~ '^[a-z][a-z0-9_]{0,63}$')
    and (error_message is null or (
      pg_catalog.char_length(error_message) between 1 and 500
      and error_message !~ '[[:cntrl:]]'
    ))
  ),
  constraint media_optimization_jobs_lifecycle_check check (
    (
      status = 'queued'
      and progress = 0
      and worker_id is null
      and lease_expires_at is null
      and started_at is null
      and finished_at is null
      and output_variant_id is null
      and error_code is null
      and error_message is null
    )
    or (
      status = 'running'
      and progress < 100
      and worker_id is not null
      and lease_expires_at is not null
      and started_at is not null
      and finished_at is null
      and output_variant_id is null
      and error_code is null
      and error_message is null
    )
    or (
      status = 'succeeded'
      and progress = 100
      and worker_id is null
      and lease_expires_at is null
      and started_at is not null
      and finished_at is not null
      and output_variant_id is not null
      and error_code is null
      and error_message is null
    )
    or (
      status in ('failed', 'cancelled')
      and worker_id is null
      and lease_expires_at is null
      and finished_at is not null
      and output_variant_id is null
      and error_code is not null
      and error_message is not null
    )
  )
);

create unique index if not exists media_optimization_jobs_active_profile_idx
on public.media_optimization_jobs (asset_id, output_kind, preset_key)
where status in ('queued', 'running');

create index if not exists media_optimization_jobs_queue_idx
on public.media_optimization_jobs (created_at, id)
where status = 'queued';

create index if not exists media_optimization_jobs_lease_idx
on public.media_optimization_jobs (lease_expires_at)
where status = 'running';

drop trigger if exists media_physical_objects_updated_at
on public.media_physical_objects;
create trigger media_physical_objects_updated_at
before update on public.media_physical_objects
for each row execute function public.set_updated_at();

drop trigger if exists media_asset_variants_updated_at
on public.media_asset_variants;
create trigger media_asset_variants_updated_at
before update on public.media_asset_variants
for each row execute function public.set_updated_at();

drop trigger if exists media_optimization_jobs_updated_at
on public.media_optimization_jobs;
create trigger media_optimization_jobs_updated_at
before update on public.media_optimization_jobs
for each row execute function public.set_updated_at();

alter table public.media_physical_objects enable row level security;
alter table public.media_asset_variants enable row level security;
alter table public.media_optimization_jobs enable row level security;

-- These are operational tables, not public portfolio content. No RLS policy is
-- added; callers must use the explicitly service-role-only RPC boundary below.
revoke all on table public.media_physical_objects
from public, anon, authenticated, service_role;
revoke all on table public.media_asset_variants
from public, anon, authenticated, service_role;
revoke all on table public.media_optimization_jobs
from public, anon, authenticated, service_role;

create or replace function public.get_media_pipeline_v1_snapshot(
  p_asset_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_objects jsonb;
  v_variants jsonb;
  v_jobs jsonb;
begin
  if p_asset_id is null
    or (
      pg_catalog.char_length(pg_catalog.btrim(p_asset_id)) not between 1 and 220
      or p_asset_id ~ '[[:cntrl:]]'
    )
  then
    raise exception 'invalid_media_asset_id'
      using errcode = '22023';
  end if;

  if not exists (
      select 1 from public.media_assets as asset where asset.id = p_asset_id
    )
  then
    raise exception 'media_asset_missing'
      using errcode = '23503';
  end if;

  select pg_catalog.coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', object.id,
        'storageProvider', object.storage_provider,
        'storageContainer', object.storage_container,
        'objectKey', object.object_key,
        'deliveryUrl', object.delivery_url,
        'mediaType', object.media_type,
        'mimeType', object.mime_type,
        'byteSize', object.byte_size,
        'checksumSha256', object.checksum_sha256,
        'etag', object.etag,
        'widthPx', object.width_px,
        'heightPx', object.height_px,
        'durationMs', object.duration_ms,
        'status', object.status,
        'createdAt', object.created_at,
        'updatedAt', object.updated_at,
        'deletedAt', object.deleted_at
      ) order by object.created_at, object.id
    ),
    '[]'::jsonb
  )
  into v_objects
  from public.media_physical_objects as object
  where exists (
      select 1
      from public.media_asset_variants as variant
      where variant.asset_id = p_asset_id
        and variant.physical_object_id = object.id
    );

  select pg_catalog.coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', variant.id,
        'assetId', variant.asset_id,
        'physicalObjectId', variant.physical_object_id,
        'sourceVariantId', variant.source_variant_id,
        'variantKind', variant.variant_kind,
        'presetKey', variant.preset_key,
        'status', variant.status,
        'isPreferred', variant.is_preferred,
        'transformationParams', variant.transformation_params,
        'createdAt', variant.created_at,
        'updatedAt', variant.updated_at
      ) order by variant.created_at, variant.id
    ),
    '[]'::jsonb
  )
  into v_variants
  from public.media_asset_variants as variant
  where variant.asset_id = p_asset_id;

  select pg_catalog.coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', job.id,
        'assetId', job.asset_id,
        'sourceVariantId', job.source_variant_id,
        'outputVariantId', job.output_variant_id,
        'outputKind', job.output_kind,
        'presetKey', job.preset_key,
        'status', job.status,
        'progress', job.progress,
        'attemptCount', job.attempt_count,
        'maxAttempts', job.max_attempts,
        'errorCode', job.error_code,
        'createdAt', job.created_at,
        'startedAt', job.started_at,
        'finishedAt', job.finished_at,
        'updatedAt', job.updated_at
      ) order by job.created_at desc, job.id
    ),
    '[]'::jsonb
  )
  into v_jobs
  from public.media_optimization_jobs as job
  where job.asset_id = p_asset_id;

  return pg_catalog.jsonb_build_object(
    'objects', v_objects,
    'variants', v_variants,
    'jobs', v_jobs
  );
end;
$$;

create or replace function public.enqueue_media_optimization_v1(
  p_job_id uuid,
  p_asset_id text,
  p_source_variant_id uuid,
  p_output_kind text,
  p_preset_key text,
  p_expected_asset_updated_at timestamptz,
  p_expected_source_updated_at timestamptz,
  p_actor_id uuid,
  p_request_options jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asset public.media_assets%rowtype;
  v_source public.media_asset_variants%rowtype;
  v_source_object public.media_physical_objects%rowtype;
  v_existing public.media_optimization_jobs%rowtype;
  v_job_version timestamptz;
begin
  if p_job_id is null
    or p_asset_id is null
    or p_source_variant_id is null
    or p_expected_asset_updated_at is null
    or p_expected_source_updated_at is null
    or p_actor_id is null
    or p_output_kind is null
    or p_preset_key is null
    or p_output_kind not in ('optimized', 'preview', 'poster')
    or p_preset_key not in ('high_quality', 'balanced', 'smallest_file')
    or p_request_options is null
    or p_request_options <> '{}'::jsonb
    or not exists (
      select 1
      from public.admin_profiles as admin
      where admin.user_id = p_actor_id and admin.is_active = true
    )
  then
    raise exception 'invalid_media_optimization_request'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('media_pipeline_v1:' || p_asset_id, 0)
  );

  -- A caller-provided UUID makes retries safe without creating duplicate jobs
  -- or duplicate audit rows after an uncertain network response.
  select job.*
  into v_existing
  from public.media_optimization_jobs as job
  where job.id = p_job_id
  for update;

  if found then
    if v_existing.asset_id = p_asset_id
      and v_existing.source_variant_id = p_source_variant_id
      and v_existing.output_kind = p_output_kind
      and v_existing.preset_key = p_preset_key
      and v_existing.asset_version = p_expected_asset_updated_at
      and v_existing.source_variant_version = p_expected_source_updated_at
      and v_existing.requested_by = p_actor_id
      and v_existing.request_options = p_request_options
    then
      return pg_catalog.jsonb_build_object(
        'jobId', v_existing.id,
        'status', v_existing.status,
        'updatedAt', v_existing.updated_at
      );
    end if;

    raise exception 'media_optimization_idempotency_conflict'
      using errcode = '23505';
  end if;

  select asset.*
  into v_asset
  from public.media_assets as asset
  where asset.id = p_asset_id
  for update;

  if not found or v_asset.deleted_at is not null then
    raise exception 'media_asset_missing'
      using errcode = '23503';
  end if;
  if v_asset.media_type not in ('image', 'video')
    or (p_output_kind = 'poster' and v_asset.media_type <> 'video')
  then
    raise exception 'media_asset_not_optimizable'
      using errcode = '22023';
  end if;
  if v_asset.updated_at is distinct from p_expected_asset_updated_at then
    raise exception 'media_asset_changed'
      using errcode = '40001';
  end if;

  select variant.*
  into v_source
  from public.media_asset_variants as variant
  where variant.id = p_source_variant_id
    and variant.asset_id = p_asset_id
  for update;

  if not found
    or v_source.variant_kind <> 'source'
    or v_source.status <> 'ready'
    or v_source.physical_object_id is null
  then
    raise exception 'media_source_variant_missing'
      using errcode = '23503';
  end if;
  if v_source.updated_at is distinct from p_expected_source_updated_at then
    raise exception 'media_source_variant_changed'
      using errcode = '40001';
  end if;

  select object.*
  into v_source_object
  from public.media_physical_objects as object
  where object.id = v_source.physical_object_id
  for share;

  if not found
    or v_source_object.status <> 'ready'
    or v_source_object.deleted_at is not null
    or v_source_object.media_type <> v_asset.media_type
  then
    raise exception 'media_source_object_unavailable'
      using errcode = '23503';
  end if;

  insert into public.media_optimization_jobs (
    id,
    asset_id,
    source_variant_id,
    output_kind,
    preset_key,
    asset_version,
    source_variant_version,
    request_options,
    requested_by
  ) values (
    p_job_id,
    p_asset_id,
    p_source_variant_id,
    p_output_kind,
    p_preset_key,
    p_expected_asset_updated_at,
    p_expected_source_updated_at,
    p_request_options,
    p_actor_id
  )
  returning updated_at into v_job_version;

  insert into public.audit_logs (
    actor_id,
    action,
    table_name,
    record_id,
    metadata
  ) values (
    p_actor_id,
    'media_optimization_queued',
    'media_optimization_jobs',
    p_job_id::text,
    pg_catalog.jsonb_build_object(
      'assetId', p_asset_id,
      'sourceVariantId', p_source_variant_id,
      'outputKind', p_output_kind,
      'presetKey', p_preset_key
    )
  );

  return pg_catalog.jsonb_build_object(
    'jobId', p_job_id,
    'status', 'queued',
    'updatedAt', v_job_version
  );
end;
$$;

revoke all on function public.get_media_pipeline_v1_snapshot(text)
from public, anon, authenticated, service_role;
revoke all on function public.enqueue_media_optimization_v1(
  uuid, text, uuid, text, text, timestamptz, timestamptz, uuid, jsonb
) from public, anon, authenticated, service_role;

grant execute on function public.get_media_pipeline_v1_snapshot(text)
to service_role;
grant execute on function public.enqueue_media_optimization_v1(
  uuid, text, uuid, text, text, timestamptz, timestamptz, uuid, jsonb
) to service_role;

comment on table public.media_physical_objects is
  'Provider-neutral object locations and verified technical metadata. Never store provider credentials here.';
comment on table public.media_asset_variants is
  'Source, optimized, preview, and poster variants for existing media_assets rows. media_assets remains the publication compatibility layer.';
comment on table public.media_optimization_jobs is
  'Leased, retry-bounded background work metadata for the three Admin media optimization presets.';
comment on function public.get_media_pipeline_v1_snapshot(text) is
  'Service-only processing snapshot with optimistic updatedAt versions and no provider secrets.';
comment on function public.enqueue_media_optimization_v1(
  uuid, text, uuid, text, text, timestamptz, timestamptz, uuid, jsonb
) is
  'Idempotently queues a version-checked media optimization request and records an audit event.';

commit;
