-- Batch 7A.2b: dormant, provider-neutral upload-intent foundation.
--
-- This migration creates no signed URLs and moves, publishes, backfills, or
-- deletes no current media. The only write path added here is a private RPC
-- that can later reserve a new pending physical object for one exact upload.

begin;

-- Fail closed when 0035 was skipped or only partially applied. Upload
-- reservations must never be exposed without the pipeline's integrity guards.
do $$
begin
  if exists (
    select 1
    from (
      values
        (
          'public.media_physical_objects',
          'media_physical_objects_integrity_guard',
          'public.guard_media_physical_object_v1()',
          19
        ),
        (
          'public.media_asset_variants',
          'media_asset_variants_integrity_guard',
          'public.guard_media_asset_variant_v1()',
          23
        ),
        (
          'public.media_optimization_jobs',
          'media_optimization_jobs_integrity_guard',
          'public.guard_media_optimization_job_v1()',
          23
        )
    ) as required(
      relation_name,
      trigger_name,
      function_signature,
      trigger_type
    )
    where not exists (
      select 1
      from pg_catalog.pg_trigger as installed
      where installed.tgrelid = pg_catalog.to_regclass(required.relation_name)
        and installed.tgname = required.trigger_name
        and installed.tgfoid = pg_catalog.to_regprocedure(
          required.function_signature
        )
        and installed.tgisinternal = false
        and installed.tgenabled in ('O', 'A')
        and installed.tgtype = required.trigger_type
        and installed.tgqual is null
        and installed.tgattr = ''::pg_catalog.int2vector
    )
  ) or not exists (
    select 1
    from pg_catalog.pg_constraint as installed
    where installed.conrelid = pg_catalog.to_regclass(
        'public.media_asset_variants'
      )
      and installed.conname = 'media_asset_variants_ready_object_fk'
      and installed.contype = 'f'
      and installed.convalidated = true
      and installed.confrelid = pg_catalog.to_regclass(
        'public.media_physical_objects'
      )
      and installed.condeferrable = false
      and installed.condeferred = false
      and installed.confmatchtype = 's'
      and installed.confupdtype = 'a'
      and installed.confdeltype = 'r'
      and array(
        select attribute.attname
        from pg_catalog.unnest(installed.conkey) with ordinality
          as key(attnum, position)
        join pg_catalog.pg_attribute as attribute
          on attribute.attrelid = installed.conrelid
          and attribute.attnum = key.attnum
        order by key.position
      ) = array[
        'physical_object_id',
        'required_physical_object_status'
      ]::pg_catalog.name[]
      and array(
        select attribute.attname
        from pg_catalog.unnest(installed.confkey) with ordinality
          as key(attnum, position)
        join pg_catalog.pg_attribute as attribute
          on attribute.attrelid = installed.confrelid
          and attribute.attnum = key.attnum
        order by key.position
      ) = array['id', 'status']::pg_catalog.name[]
      and (
        select pg_catalog.count(*)
        from pg_catalog.pg_trigger as enforcement
        where enforcement.tgconstraint = installed.oid
          and enforcement.tgisinternal = true
          and enforcement.tgenabled in ('O', 'A')
          and enforcement.tgqual is null
      ) = 4
      and (
        select pg_catalog.count(*)
        from pg_catalog.pg_trigger as enforcement
        where enforcement.tgconstraint = installed.oid
          and enforcement.tgisinternal = true
          and enforcement.tgenabled in ('O', 'A')
          and enforcement.tgqual is null
          and enforcement.tgrelid = installed.conrelid
      ) = 2
      and (
        select pg_catalog.count(*)
        from pg_catalog.pg_trigger as enforcement
        where enforcement.tgconstraint = installed.oid
          and enforcement.tgisinternal = true
          and enforcement.tgenabled in ('O', 'A')
          and enforcement.tgqual is null
          and enforcement.tgrelid = installed.confrelid
      ) = 2
  ) or not exists (
    select 1
    from pg_catalog.pg_attribute as attribute
    join pg_catalog.pg_attrdef as definition
      on definition.adrelid = attribute.attrelid
      and definition.adnum = attribute.attnum
    where attribute.attrelid = pg_catalog.to_regclass(
        'public.media_asset_variants'
      )
      and attribute.attname = 'required_physical_object_status'
      and attribute.attgenerated = 's'
      and attribute.atttypid = 'pg_catalog.text'::pg_catalog.regtype
      and pg_catalog.pg_get_expr(
        definition.adbin,
        definition.adrelid,
        false
      ) = 'CASE WHEN (status = ''ready''::text) THEN ''ready''::text ELSE NULL::text END'
  ) then
    raise exception 'media_upload_intents_require_verified_0035'
      using
        errcode = '55000',
        detail = 'Apply and verify migration 0035 before migration 0036.';
  end if;
end;
$$;

-- Make the intent-to-object binding database-verifiable, not merely a promise
-- made by the preparation function. id already makes every index row unique;
-- the remaining columns make the exact reserved target and declared type part
-- of the foreign-key contract. Size and checksum remain unverified claims only
-- on the intent until a later provider HEAD/GET verification succeeds.
create unique index if not exists media_physical_objects_upload_binding_key
on public.media_physical_objects (
  id,
  storage_provider,
  storage_container,
  object_key,
  media_type,
  mime_type
);

-- asset_id intentionally has no foreign key: an upload intent may safely bind
-- metadata for a prospective media_assets row before that row is published.
create table if not exists public.media_upload_intents (
  id uuid primary key,
  asset_id text not null,
  asset_metadata jsonb not null,
  physical_object_id uuid not null unique,
  actor_id uuid references auth.users(id) on delete set null,
  storage_provider text not null,
  storage_container text not null,
  object_key text not null,
  expected_media_type text not null,
  expected_mime_type text not null,
  expected_byte_size bigint not null,
  expected_checksum_sha256 text not null,
  ttl_seconds integer not null,
  status text not null default 'prepared',
  expires_at timestamptz not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_upload_intents_location_key
    unique (storage_provider, storage_container, object_key),
  constraint media_upload_intents_object_binding_fk
    foreign key (
      physical_object_id,
      storage_provider,
      storage_container,
      object_key,
      expected_media_type,
      expected_mime_type
    ) references public.media_physical_objects (
      id,
      storage_provider,
      storage_container,
      object_key,
      media_type,
      mime_type
    ) on delete restrict,
  constraint media_upload_intents_asset_id_check check (
    pg_catalog.char_length(asset_id) between 1 and 100
    and asset_id ~* '^[a-z0-9][a-z0-9_-]{0,99}$'
  ),
  constraint media_upload_intents_asset_metadata_check check (
    pg_catalog.jsonb_typeof(asset_metadata) = 'object'
    and asset_metadata ?& array[
      'label', 'alt', 'usageKey', 'sortOrder', 'isPublished'
    ]::text[]
    and (
      asset_metadata - array[
        'label', 'alt', 'usageKey', 'sortOrder', 'isPublished'
      ]::text[]
    ) = '{}'::jsonb
    and pg_catalog.jsonb_typeof(asset_metadata -> 'label') = 'string'
    and pg_catalog.char_length(
      pg_catalog.btrim(asset_metadata ->> 'label')
    ) between 1 and 220
    and (asset_metadata ->> 'label') !~ '[[:cntrl:]]'
    and pg_catalog.jsonb_typeof(asset_metadata -> 'alt') = 'string'
    and pg_catalog.char_length(asset_metadata ->> 'alt') <= 220
    and (asset_metadata ->> 'alt') !~ '[[:cntrl:]]'
    and pg_catalog.jsonb_typeof(asset_metadata -> 'usageKey') = 'string'
    and pg_catalog.char_length(asset_metadata ->> 'usageKey') <= 120
    and (asset_metadata ->> 'usageKey') !~ '[[:cntrl:]]'
    and pg_catalog.jsonb_typeof(asset_metadata -> 'sortOrder') = 'number'
    and (asset_metadata ->> 'sortOrder') ~ '^(0|[1-9][0-9]{0,3})$'
    and pg_catalog.jsonb_typeof(asset_metadata -> 'isPublished') = 'boolean'
  ),
  constraint media_upload_intents_provider_check check (
    storage_provider ~ '^[a-z][a-z0-9_-]{0,63}$'
  ),
  constraint media_upload_intents_container_check check (
    pg_catalog.char_length(storage_container) between 1 and 255
    and storage_container !~ '[[:cntrl:]/\\]'
  ),
  constraint media_upload_intents_object_key_check check (
    pg_catalog.char_length(object_key) between 1 and 1024
    and object_key !~ '[[:cntrl:]\\]'
    and object_key !~ '(^/|//|(^|/)[.]{1,2}(/|$))'
  ),
  constraint media_upload_intents_media_type_check check (
    expected_media_type in ('image', 'video')
  ),
  constraint media_upload_intents_mime_type_check check (
    (
      expected_media_type = 'image'
      and expected_mime_type in (
        'image/avif',
        'image/gif',
        'image/jpeg',
        'image/png',
        'image/webp'
      )
    ) or (
      expected_media_type = 'video'
      and expected_mime_type in (
        'video/mp4',
        'video/quicktime',
        'video/webm'
      )
    )
  ),
  constraint media_upload_intents_expected_size_check check (
    (
      expected_media_type = 'image'
      and expected_byte_size between 1 and 10485760
    ) or (
      expected_media_type = 'video'
      and expected_byte_size between 1 and 104857600
    )
  ),
  constraint media_upload_intents_expected_sha256_check check (
    expected_checksum_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint media_upload_intents_ttl_check check (
    ttl_seconds between 60 and 900
    and expires_at > created_at
    and expires_at <= created_at + interval '15 minutes'
  ),
  constraint media_upload_intents_status_check check (
    status in ('prepared', 'consumed', 'expired', 'cancelled', 'failed')
  ),
  constraint media_upload_intents_lifecycle_check check (
    (status = 'prepared' and resolved_at is null)
    or (status <> 'prepared' and resolved_at is not null)
  )
);

-- The UUID primary key makes one request idempotent. This partial index also
-- guarantees that two different requests cannot be active for one asset.
create unique index if not exists media_upload_intents_active_asset_idx
on public.media_upload_intents (asset_id)
where status = 'prepared';

create index if not exists media_upload_intents_expiry_idx
on public.media_upload_intents (expires_at, id)
where status = 'prepared';

drop trigger if exists media_upload_intents_updated_at
on public.media_upload_intents;
create trigger media_upload_intents_updated_at
before update on public.media_upload_intents
for each row execute function public.set_updated_at();

alter table public.media_upload_intents enable row level security;

-- Upload intents are operational capability records. There are deliberately
-- no public policies and not even service_role receives direct table access.
revoke all on table public.media_upload_intents
from public, anon, authenticated, service_role;

create or replace function public.prepare_media_upload_intent_v1(
  p_intent_id uuid,
  p_asset_id text,
  p_asset_metadata jsonb,
  p_storage_provider text,
  p_storage_container text,
  p_expected_media_type text,
  p_expected_mime_type text,
  p_expected_byte_size bigint,
  p_expected_checksum_sha256 text,
  p_actor_id uuid,
  p_ttl_seconds integer default 600
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz;
  v_object_key text;
  v_physical_object_id uuid;
  v_active_intent_id uuid;
  v_existing public.media_upload_intents%rowtype;
begin
  if p_intent_id is null
    or p_asset_id is null
    or pg_catalog.char_length(p_asset_id) not between 1 and 100
    or p_asset_id !~* '^[a-z0-9][a-z0-9_-]{0,99}$'
    or p_asset_metadata is null
    or pg_catalog.jsonb_typeof(p_asset_metadata) <> 'object'
    or not (
      p_asset_metadata ?& array[
        'label', 'alt', 'usageKey', 'sortOrder', 'isPublished'
      ]::text[]
    )
    or (
      p_asset_metadata - array[
        'label', 'alt', 'usageKey', 'sortOrder', 'isPublished'
      ]::text[]
    ) <> '{}'::jsonb
    or pg_catalog.jsonb_typeof(p_asset_metadata -> 'label') <> 'string'
    or pg_catalog.char_length(
      pg_catalog.btrim(p_asset_metadata ->> 'label')
    ) not between 1 and 220
    or (p_asset_metadata ->> 'label') ~ '[[:cntrl:]]'
    or pg_catalog.jsonb_typeof(p_asset_metadata -> 'alt') <> 'string'
    or pg_catalog.char_length(p_asset_metadata ->> 'alt') > 220
    or (p_asset_metadata ->> 'alt') ~ '[[:cntrl:]]'
    or pg_catalog.jsonb_typeof(p_asset_metadata -> 'usageKey') <> 'string'
    or pg_catalog.char_length(p_asset_metadata ->> 'usageKey') > 120
    or (p_asset_metadata ->> 'usageKey') ~ '[[:cntrl:]]'
    or pg_catalog.jsonb_typeof(p_asset_metadata -> 'sortOrder') <> 'number'
    or (p_asset_metadata ->> 'sortOrder') !~ '^(0|[1-9][0-9]{0,3})$'
    or pg_catalog.jsonb_typeof(p_asset_metadata -> 'isPublished') <> 'boolean'
    or p_storage_provider is null
    or p_storage_provider !~ '^[a-z][a-z0-9_-]{0,63}$'
    or p_storage_container is null
    or pg_catalog.char_length(p_storage_container) not between 1 and 255
    or p_storage_container ~ '[[:cntrl:]/\\]'
    or p_expected_media_type is null
    or p_expected_media_type not in ('image', 'video')
    or p_expected_mime_type is null
    or (
      p_expected_media_type = 'image'
      and p_expected_mime_type not in (
        'image/avif',
        'image/gif',
        'image/jpeg',
        'image/png',
        'image/webp'
      )
    )
    or (
      p_expected_media_type = 'video'
      and p_expected_mime_type not in (
        'video/mp4',
        'video/quicktime',
        'video/webm'
      )
    )
    or p_expected_byte_size is null
    or (
      p_expected_media_type = 'image'
      and p_expected_byte_size not between 1 and 10485760
    )
    or (
      p_expected_media_type = 'video'
      and p_expected_byte_size not between 1 and 104857600
    )
    or p_expected_checksum_sha256 is null
    or p_expected_checksum_sha256 !~ '^[0-9a-f]{64}$'
    or p_actor_id is null
    or p_ttl_seconds is null
    or p_ttl_seconds not between 60 and 900
  then
    raise exception 'invalid_media_upload_intent_request'
      using errcode = '22023';
  end if;

  -- The trusted application server supplies its authenticated actor id. Keep
  -- that attribution tied to a current active administrator at call time.
  perform 1
  from public.admin_profiles as admin
  where admin.user_id = p_actor_id
    and admin.is_active = true
  for share;

  if not found then
    raise exception 'media_upload_intent_actor_is_not_active'
      using errcode = '42501';
  end if;

  -- Serialize both a retried UUID and competing uploads for the same asset.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'media_upload_intent_v1:id:' || p_intent_id::text,
      0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'media_upload_intent_v1:asset:' || p_asset_id,
      0
    )
  );

  v_object_key := 'media/source/' || p_asset_id || '/' || p_intent_id::text;

  -- The caller UUID is the idempotency key. A byte-for-byte equivalent retry
  -- returns the original reservation and never emits a second audit row.
  select intent.*
  into v_existing
  from public.media_upload_intents as intent
  where intent.id = p_intent_id
  for update;

  if found then
    if v_existing.asset_id = p_asset_id
      and v_existing.asset_metadata = p_asset_metadata
      and v_existing.storage_provider = p_storage_provider
      and v_existing.storage_container = p_storage_container
      and v_existing.object_key = v_object_key
      and v_existing.expected_media_type = p_expected_media_type
      and v_existing.expected_mime_type = p_expected_mime_type
      and v_existing.expected_byte_size = p_expected_byte_size
      and v_existing.expected_checksum_sha256 = p_expected_checksum_sha256
      and v_existing.actor_id = p_actor_id
      and v_existing.ttl_seconds = p_ttl_seconds
    then
      -- Row locking can outlive the original TTL. Never revive a prepared
      -- reservation merely because the caller retried the same UUID.
      if v_existing.status = 'prepared'
        and v_existing.expires_at <= pg_catalog.clock_timestamp()
      then
        v_now := pg_catalog.clock_timestamp();

        update public.media_physical_objects as object
        set status = 'failed'
        where object.id = v_existing.physical_object_id
          and object.status = 'pending';

        update public.media_upload_intents as intent
        set
          status = 'expired',
          resolved_at = v_now
        where intent.id = v_existing.id
          and intent.status = 'prepared';

        v_existing.status := 'expired';
      end if;

      -- Do not keep returning an apparently usable reservation if another
      -- write path claimed the prospective asset id after preparation.
      if v_existing.status = 'prepared'
        and exists (
          select 1
          from public.media_assets as asset
          where asset.id = p_asset_id
        )
      then
        v_now := pg_catalog.clock_timestamp();

        update public.media_physical_objects as object
        set status = 'failed'
        where object.id = v_existing.physical_object_id
          and object.status = 'pending';

        update public.media_upload_intents as intent
        set
          status = 'cancelled',
          resolved_at = v_now
        where intent.id = v_existing.id
          and intent.status = 'prepared';

        v_existing.status := 'cancelled';
      end if;

      return pg_catalog.jsonb_build_object(
        'intentId', v_existing.id,
        'assetId', v_existing.asset_id,
        'physicalObjectId', v_existing.physical_object_id,
        'storageProvider', v_existing.storage_provider,
        'storageContainer', v_existing.storage_container,
        'objectKey', v_existing.object_key,
        'mediaType', v_existing.expected_media_type,
        'mimeType', v_existing.expected_mime_type,
        'expectedByteSize', v_existing.expected_byte_size,
        'expectedChecksumSha256', v_existing.expected_checksum_sha256,
        'expiresAt', v_existing.expires_at,
        'status', v_existing.status
      );
    end if;

    raise exception 'media_upload_intent_idempotency_conflict'
      using errcode = '23505';
  end if;

  -- Reclaim only reservations created by this upload-intent system. The
  -- physical object's pending -> failed transition is permitted by 0035.
  v_now := pg_catalog.clock_timestamp();

  update public.media_physical_objects as object
  set status = 'failed'
  where object.status = 'pending'
    and exists (
      select 1
      from public.media_upload_intents as stale
      where stale.asset_id = p_asset_id
        and stale.status = 'prepared'
        and stale.expires_at <= v_now
        and stale.physical_object_id = object.id
    );

  update public.media_upload_intents as stale
  set
    status = 'expired',
    resolved_at = v_now
  where stale.asset_id = p_asset_id
    and stale.status = 'prepared'
    and stale.expires_at <= v_now;

  select intent.id
  into v_active_intent_id
  from public.media_upload_intents as intent
  where intent.asset_id = p_asset_id
    and intent.status = 'prepared'
  for update;

  if found then
    raise exception 'media_upload_intent_already_active'
      using
        errcode = '23505',
        detail = 'Retry the existing intent UUID or wait for it to expire.';
  end if;

  -- This is an early collision check, not publication authorization. A later
  -- signer/finalizer must repeat it and publish with insert-only semantics in
  -- the same transaction; unrelated legacy writers do not share these locks.
  if exists (
    select 1
    from public.media_assets as asset
    where asset.id = p_asset_id
  ) then
    raise exception 'media_upload_asset_already_exists'
      using errcode = '23505';
  end if;

  -- Compute the new deadline only after every potentially blocking lock and
  -- conflict check. The returned reservation therefore receives its full TTL.
  v_now := pg_catalog.clock_timestamp();
  v_physical_object_id := pg_catalog.gen_random_uuid();

  insert into public.media_physical_objects (
    id,
    storage_provider,
    storage_container,
    object_key,
    media_type,
    mime_type,
    status,
    created_by
  ) values (
    v_physical_object_id,
    p_storage_provider,
    p_storage_container,
    v_object_key,
    p_expected_media_type,
    p_expected_mime_type,
    'pending',
    p_actor_id
  );

  insert into public.media_upload_intents (
    id,
    asset_id,
    asset_metadata,
    physical_object_id,
    actor_id,
    storage_provider,
    storage_container,
    object_key,
    expected_media_type,
    expected_mime_type,
    expected_byte_size,
    expected_checksum_sha256,
    ttl_seconds,
    status,
    expires_at,
    created_at,
    updated_at
  ) values (
    p_intent_id,
    p_asset_id,
    p_asset_metadata,
    v_physical_object_id,
    p_actor_id,
    p_storage_provider,
    p_storage_container,
    v_object_key,
    p_expected_media_type,
    p_expected_mime_type,
    p_expected_byte_size,
    p_expected_checksum_sha256,
    p_ttl_seconds,
    'prepared',
    v_now + pg_catalog.make_interval(secs => p_ttl_seconds),
    v_now,
    v_now
  );

  -- The audit event proves who reserved what kind of upload, but deliberately
  -- omits provider locations, filenames, checksums, credentials, and tokens.
  insert into public.audit_logs (
    actor_id,
    action,
    table_name,
    record_id,
    metadata
  ) values (
    p_actor_id,
    'media_upload_intent_prepared',
    'media_upload_intents',
    p_intent_id::text,
    pg_catalog.jsonb_build_object(
      'assetId', p_asset_id,
      'physicalObjectId', v_physical_object_id,
      'mediaType', p_expected_media_type,
      'mimeType', p_expected_mime_type,
      'expectedByteSize', p_expected_byte_size,
      'expiresAt', v_now + pg_catalog.make_interval(secs => p_ttl_seconds)
    )
  );

  return pg_catalog.jsonb_build_object(
    'intentId', p_intent_id,
    'assetId', p_asset_id,
    'physicalObjectId', v_physical_object_id,
    'storageProvider', p_storage_provider,
    'storageContainer', p_storage_container,
    'objectKey', v_object_key,
    'mediaType', p_expected_media_type,
    'mimeType', p_expected_mime_type,
    'expectedByteSize', p_expected_byte_size,
    'expectedChecksumSha256', p_expected_checksum_sha256,
    'expiresAt', v_now + pg_catalog.make_interval(secs => p_ttl_seconds),
    'status', 'prepared'
  );
end;
$$;

revoke all on function public.prepare_media_upload_intent_v1(
  uuid, text, jsonb, text, text, text, text, bigint, text, uuid, integer
) from public, anon, authenticated, service_role;

grant execute on function public.prepare_media_upload_intent_v1(
  uuid, text, jsonb, text, text, text, text, bigint, text, uuid, integer
) to service_role;

comment on table public.media_upload_intents is
  'Private one-time upload reservations. Stores exact targets and expected file facts, never signed URLs or provider credentials.';
comment on function public.prepare_media_upload_intent_v1(
  uuid, text, jsonb, text, text, text, text, bigint, text, uuid, integer
) is
  'Idempotently reserves one pending provider-neutral physical object for an active admin; it does not sign or finalize an upload.';

commit;
