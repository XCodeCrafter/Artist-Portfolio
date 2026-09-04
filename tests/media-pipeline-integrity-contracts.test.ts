import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  new URL(
    "../supabase/migrations/0035_media_pipeline_integrity_guards.sql",
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
    : migrationSql.indexOf("comment on function", start + 1);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return migrationSql.slice(start, end);
}

describe("Batch 7A.2 media-pipeline integrity guards", () => {
  it("is additive and does not rewrite existing media or pipeline rows with DML", () => {
    expect(migrationSql).not.toMatch(
      /\b(?:insert\s+into|delete\s+from|alter\s+table)\s+public[.]media_assets\b/i
    );
    expect(migrationSql).not.toMatch(
      /\b(?:insert\s+into|update|delete\s+from)\s+public[.](?:media_physical_objects|media_asset_variants|media_optimization_jobs)\b/i
    );
    expect(migrationSql.trim().endsWith("commit;")).toBe(true);
  });

  it("uses a database constraint to serialize ready variants against object retirement", () => {
    expect(migrationSql).toContain(
      "create unique index if not exists media_physical_objects_id_status_key"
    );
    expect(migrationSql).toContain(
      "add column if not exists required_physical_object_status text"
    );
    expect(migrationSql).toContain(
      "case when status = 'ready' then 'ready'::text else null::text end"
    );
    expect(migrationSql).toContain(
      "constraint media_asset_variants_ready_object_fk"
    );
    expect(migrationSql).toContain(
      "foreign key (physical_object_id, required_physical_object_status)"
    );
    expect(migrationSql).toContain(
      "references public.media_physical_objects (id, status)"
    );
  });

  it("freezes physical identity and verified technical metadata", () => {
    const body = functionBody(
      "guard_media_physical_object_v1",
      "guard_media_asset_variant_v1"
    );

    for (const field of [
      "id",
      "storage_provider",
      "storage_container",
      "object_key",
      "created_by",
      "created_at",
      "media_type",
      "mime_type",
      "byte_size",
      "checksum_sha256",
      "etag",
      "width_px",
      "height_px",
      "duration_ms",
    ]) {
      expect(body).toContain(`new.${field} is distinct from old.${field}`);
    }

    expect(body).toContain("old.status in ('ready', 'retired')");
    expect(body).toContain("media_object_is_used_by_ready_variant");
    expect(body).toContain("variant.status = 'ready'");
  });

  it("requires every derived variant to reference a real source variant", () => {
    const body = functionBody(
      "guard_media_asset_variant_v1",
      "guard_media_optimization_job_v1"
    );

    expect(body).toContain("new.variant_kind <> 'source'");
    expect(body).toContain("new.id is distinct from old.id");
    expect(body).toContain("source.id = new.source_variant_id");
    expect(body).toContain("source.asset_id = new.asset_id");
    expect(body).toContain("v_source_kind <> 'source'");
    expect(body).toContain("media_variant_source_is_not_verified");
  });

  it("allows only ready type-compatible objects behind ready variants", () => {
    const body = functionBody(
      "guard_media_asset_variant_v1",
      "guard_media_optimization_job_v1"
    );

    expect(body).toContain("new.status = 'ready'");
    expect(body).toContain("v_object_status is distinct from 'ready'");
    expect(body).toContain("v_object_deleted_at is not null");
    expect(body).toContain("new.variant_kind = 'poster'");
    expect(body).toContain("v_asset_media_type <> 'video'");
    expect(body).toContain("v_object_media_type <> 'image'");
  });

  it("freezes a job recipe and validates its successful output", () => {
    const body = functionBody("guard_media_optimization_job_v1");

    for (const field of [
      "id",
      "asset_id",
      "source_variant_id",
      "output_kind",
      "preset_key",
      "asset_version",
      "source_variant_version",
      "max_attempts",
      "request_options",
      "requested_by",
      "created_at",
    ]) {
      expect(body).toContain(`new.${field} is distinct from old.${field}`);
    }

    expect(body).toContain("new.status = 'succeeded'");
    expect(body).toContain("v_output_kind is distinct from new.output_kind");
    expect(body).toContain("v_output_preset is distinct from new.preset_key");
    expect(body).toContain(
      "v_output_source_id is distinct from new.source_variant_id"
    );
    expect(body).toContain("v_output_status is distinct from 'ready'");
    expect(body).toContain("v_object_status is distinct from 'ready'");
  });

  it("preserves auth-user ON DELETE SET NULL without opening a mutation bypass", () => {
    const objectBody = functionBody(
      "guard_media_physical_object_v1",
      "guard_media_asset_variant_v1"
    );
    const variantBody = functionBody(
      "guard_media_asset_variant_v1",
      "guard_media_optimization_job_v1"
    );
    const jobBody = functionBody("guard_media_optimization_job_v1");

    expect(objectBody).toContain("old.created_by is not null");
    expect(objectBody).toContain("new.created_by is null");
    expect(objectBody).toContain(
      "pg_catalog.to_jsonb(new) - 'created_by' - 'updated_at'"
    );
    expect(objectBody).toContain(
      "pg_catalog.to_jsonb(old) - 'created_by' - 'updated_at'"
    );

    expect(variantBody).toContain("old.created_by is not null");
    expect(variantBody).toContain("new.created_by is null");
    for (const field of [
      "id",
      "asset_id",
      "physical_object_id",
      "source_variant_id",
      "variant_kind",
      "preset_key",
      "status",
      "is_preferred",
      "transformation_params",
      "created_at",
    ]) {
      expect(variantBody).toContain(
        `new.${field} is not distinct from old.${field}`
      );
    }
    expect(variantBody).not.toContain("to_jsonb(new)");

    for (const body of [objectBody, variantBody]) {
      expect(body).toContain("if v_attribution_cleared then");
    }

    expect(jobBody).toContain("old.requested_by is not null");
    expect(jobBody).toContain("new.requested_by is null");
    expect(jobBody).toContain(
      "pg_catalog.to_jsonb(new) - 'requested_by' - 'updated_at'"
    );
    expect(jobBody).toContain(
      "pg_catalog.to_jsonb(old) - 'requested_by' - 'updated_at'"
    );
    expect(jobBody).toContain("if v_attribution_cleared then");
  });

  it("installs private trigger-only functions on all three tables", () => {
    for (const [table, trigger, fn] of [
      [
        "media_physical_objects",
        "media_physical_objects_integrity_guard",
        "guard_media_physical_object_v1",
      ],
      [
        "media_asset_variants",
        "media_asset_variants_integrity_guard",
        "guard_media_asset_variant_v1",
      ],
      [
        "media_optimization_jobs",
        "media_optimization_jobs_integrity_guard",
        "guard_media_optimization_job_v1",
      ],
    ]) {
      expect(migrationSql).toContain(`drop trigger if exists ${trigger}`);
      expect(migrationSql).toContain(`on public.${table}`);
      expect(migrationSql).toContain(
        `execute function public.${fn}();`
      );
      expect(migrationSql).toContain(
        `revoke all on function public.${fn}()`
      );
    }

    expect(migrationSql.match(/security definer/g)).toHaveLength(3);
    expect(migrationSql.match(/set search_path = ''/g)).toHaveLength(3);
    expect(migrationSql).not.toMatch(/grant execute/i);
    expect(migrationSql).not.toMatch(/create\s+policy/i);
  });
});
