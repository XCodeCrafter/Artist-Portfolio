import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  new URL(
    "../supabase/migrations/0034_media_optimization_foundation.sql",
    import.meta.url
  ),
  "utf8"
);

function functionBody(name: string, nextName?: string) {
  const start = migrationSql.indexOf(
    `create or replace function public.${name}`
  );
  const end = nextName
    ? migrationSql.indexOf(
        `create or replace function public.${nextName}`,
        start + 1
      )
    : migrationSql.indexOf("revoke all on function", start + 1);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return migrationSql.slice(start, end);
}

describe("Batch 7A.1 media optimization foundation", () => {
  it("is additive and leaves every existing media_assets row untouched", () => {
    expect(migrationSql).not.toMatch(
      /\b(?:alter|update)\s+(?:table\s+)?public[.]media_assets\b/i
    );
    expect(migrationSql).not.toMatch(
      /\b(?:insert\s+into|delete\s+from)\s+public[.]media_assets\b/i
    );
    expect(migrationSql).not.toMatch(/insert\s+into[\s\S]+select[\s\S]+media_assets/i);

    for (const table of [
      "media_physical_objects",
      "media_asset_variants",
      "media_optimization_jobs",
    ]) {
      expect(migrationSql).toContain(
        `create table if not exists public.${table}`
      );
    }
  });

  it("models unique provider-neutral storage locations without hard-coding a provider", () => {
    expect(migrationSql).toContain("storage_provider text not null");
    expect(migrationSql).toContain("storage_container text not null");
    expect(migrationSql).toContain("object_key text not null");
    expect(migrationSql).toContain(
      "unique (storage_provider, storage_container, object_key)"
    );
    expect(migrationSql).toContain("checksum_sha256 ~ '^[0-9a-f]{64}$'");
    expect(migrationSql).toContain(
      "status in ('pending', 'ready', 'failed', 'retired')"
    );
    expect(migrationSql).toContain("provider_metadata = '{}'::jsonb");
    expect(migrationSql).toContain("transformation_params = '{}'::jsonb");
    expect(migrationSql).toContain("request_options = '{}'::jsonb");
    expect(migrationSql).toContain("delivery_url !~ '[?#]'");
    expect(migrationSql).not.toMatch(
      /storage_provider\s+(?:=|in\s*\()[^\n]*(?:supabase|r2)/i
    );
  });

  it("keeps object, source, and job lineage on the same logical asset", () => {
    expect(migrationSql).toContain(
      "asset_id text not null references public.media_assets(id) on delete restrict"
    );
    expect(migrationSql).toContain(
      "constraint media_asset_variants_source_asset_fk"
    );
    expect(migrationSql).toContain(
      "foreign key (source_variant_id, asset_id)"
    );
    expect(migrationSql).toContain(
      "constraint media_optimization_jobs_output_asset_fk"
    );
    expect(migrationSql).toContain(
      "references public.media_asset_variants(id, asset_id)"
    );
    expect(migrationSql).not.toMatch(/on delete cascade/i);
  });

  it("supports source, optimized, preview, and poster variants safely", () => {
    expect(migrationSql).toContain(
      "variant_kind in ('source', 'optimized', 'preview', 'poster')"
    );
    expect(migrationSql).toContain(
      "constraint media_asset_variants_source_lineage_check"
    );
    expect(migrationSql).toContain(
      "source_variant_id is null or source_variant_id <> id"
    );
    expect(migrationSql).toContain(
      "create unique index if not exists media_asset_variants_live_source_idx"
    );
    expect(migrationSql).toContain(
      "create unique index if not exists media_asset_variants_preferred_kind_idx"
    );
  });

  it("defines the three Admin presets and a bounded leased job lifecycle", () => {
    expect(migrationSql).toContain(
      "preset_key in ('high_quality', 'balanced', 'smallest_file')"
    );
    expect(migrationSql).toContain(
      "status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')"
    );
    expect(migrationSql).toContain("progress between 0 and 100");
    expect(migrationSql).toContain("attempt_count <= max_attempts");
    expect(migrationSql).toContain("lease_expires_at timestamptz");
    expect(migrationSql).toContain(
      "create unique index if not exists media_optimization_jobs_active_profile_idx"
    );
  });

  it("keeps operational rows private behind two service-only RPCs", () => {
    for (const table of [
      "media_physical_objects",
      "media_asset_variants",
      "media_optimization_jobs",
    ]) {
      expect(migrationSql).toContain(
        `alter table public.${table} enable row level security;`
      );
      expect(migrationSql).toContain(
        `revoke all on table public.${table}\nfrom public, anon, authenticated, service_role;`
      );
    }

    expect(migrationSql).not.toMatch(/create\s+policy/i);
    expect(migrationSql.match(/security definer/g)).toHaveLength(2);
    expect(migrationSql.match(/set search_path = ''/g)).toHaveLength(2);
    expect(migrationSql.match(/revoke all on function/g)).toHaveLength(2);
    expect(migrationSql.match(/grant execute on function/g)).toHaveLength(2);
    expect(migrationSql.match(/\) to service_role;/g)).toHaveLength(1);
    expect(migrationSql).toContain(
      "grant execute on function public.get_media_pipeline_v1_snapshot(text)\nto service_role;"
    );
  });

  it("returns versions without exposing provider metadata", () => {
    const snapshot = functionBody(
      "get_media_pipeline_v1_snapshot",
      "enqueue_media_optimization_v1"
    );

    expect(snapshot).toContain("'objects', v_objects");
    expect(snapshot).toContain("'variants', v_variants");
    expect(snapshot).toContain("'jobs', v_jobs");
    expect(snapshot).toContain("'updatedAt', object.updated_at");
    expect(snapshot).toContain("'updatedAt', variant.updated_at");
    expect(snapshot).toContain("'updatedAt', job.updated_at");
    expect(snapshot).not.toContain("provider_metadata");
    expect(snapshot).not.toContain("worker_id");
    expect(snapshot).not.toContain("error_message");
    expect(snapshot).not.toContain("p_asset_id text default null");
  });

  it("queues only a locked, current, verified image/video source", () => {
    const enqueue = functionBody("enqueue_media_optimization_v1");

    expect(enqueue).toContain("pg_advisory_xact_lock");
    expect(enqueue).toContain("from public.media_assets as asset");
    expect(enqueue).toContain("for update;");
    expect(enqueue).toContain("v_asset.deleted_at is not null");
    expect(enqueue).toContain("v_asset.media_type not in ('image', 'video')");
    expect(enqueue).toContain(
      "v_asset.updated_at is distinct from p_expected_asset_updated_at"
    );
    expect(enqueue).toContain("v_source.variant_kind <> 'source'");
    expect(enqueue).toContain(
      "v_source.updated_at is distinct from p_expected_source_updated_at"
    );
    expect(enqueue).toContain("v_source_object.status <> 'ready'");
    expect(enqueue).toContain("for share;");
    expect(enqueue).toContain("media_optimization_idempotency_conflict");
    expect(enqueue).toContain("using errcode = '40001'");
  });

  it("records one bounded audit event and stores no provider secret", () => {
    const enqueue = functionBody("enqueue_media_optimization_v1");

    expect(enqueue).toContain("insert into public.audit_logs");
    expect(enqueue).toContain("'media_optimization_queued'");
    expect(enqueue).toContain("'assetId', p_asset_id");
    expect(enqueue).toContain("'presetKey', p_preset_key");
    expect(enqueue).not.toContain("deliveryUrl");
    expect(enqueue).not.toContain("storageProvider");
    expect(migrationSql.trim().endsWith("commit;")).toBe(true);
  });
});
