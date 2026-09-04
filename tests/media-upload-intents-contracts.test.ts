import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  new URL(
    "../supabase/migrations/0036_media_upload_intents.sql",
    import.meta.url
  ),
  "utf8"
);

const prepareStart = migrationSql.indexOf(
  "create or replace function public.prepare_media_upload_intent_v1"
);
const prepareEnd = migrationSql.indexOf(
  "revoke all on function public.prepare_media_upload_intent_v1",
  prepareStart
);
const prepareBody = migrationSql.slice(prepareStart, prepareEnd);
const migrationTimeSql = migrationSql.slice(0, prepareStart);

describe("Batch 7A.2b media upload-intent foundation", () => {
  it("fails closed unless every 0035 integrity prerequisite is installed", () => {
    expect(migrationTimeSql).toContain(
      "create temporary table media_0036_expected_ready_status"
    );
    expect(migrationTimeSql).toContain(") on commit drop;");
    for (const required of [
      "media_physical_objects_integrity_guard",
      "guard_media_physical_object_v1()",
      "media_asset_variants_integrity_guard",
      "guard_media_asset_variant_v1()",
      "media_optimization_jobs_integrity_guard",
      "guard_media_optimization_job_v1()",
      "media_asset_variants_ready_object_fk",
    ]) {
      expect(migrationTimeSql).toContain(required);
    }

    expect(migrationTimeSql).toContain("installed.tgisinternal = false");
    expect(migrationTimeSql).toContain("installed.tgenabled in ('O', 'A')");
    expect(migrationTimeSql).toContain(
      "installed.tgtype = required.trigger_type"
    );
    expect(migrationTimeSql).toContain("installed.tgqual is null");
    expect(migrationTimeSql).toContain(
      "installed.tgattr = ''::pg_catalog.int2vector"
    );
    expect(migrationTimeSql).toContain("installed.convalidated = true");
    expect(migrationTimeSql).toContain(
      "installed.confrelid = pg_catalog.to_regclass"
    );
    for (const contract of [
      "installed.condeferrable = false",
      "installed.condeferred = false",
      "installed.confmatchtype = 's'",
      "installed.confupdtype = 'a'",
      "installed.confdeltype = 'r'",
      "pg_catalog.unnest(installed.conkey)",
      "pg_catalog.unnest(installed.confkey)",
      "attribute.attgenerated = 's'",
      "pg_catalog.pg_get_expr(",
      "enforcement.tgconstraint = installed.oid",
      "enforcement.tgisinternal = true",
      "enforcement.tgenabled in ('O', 'A')",
      "enforcement.tgrelid = installed.conrelid",
      "enforcement.tgrelid = installed.confrelid",
    ]) {
      expect(migrationTimeSql).toContain(contract);
    }
    expect(migrationTimeSql).toContain(") = 4");
    expect(migrationTimeSql.match(/\) = 2/g)).toHaveLength(2);
    expect(migrationTimeSql).toContain(
      "'pg_temp.media_0036_expected_ready_status'"
    );
    expect(migrationTimeSql.match(/pg_catalog\.pg_get_expr\(/g)).toHaveLength(2);
    expect(migrationTimeSql).not.toMatch(
      /regexp_replace|pg_catalog\.lower/
    );
    expect(migrationTimeSql).toContain("errcode = '55000'");
    expect(migrationTimeSql).toContain(
      "media_upload_intents_require_verified_0035"
    );
  });

  it("adds a private provider-neutral intent table without content backfill", () => {
    expect(migrationSql).toContain(
      "create table if not exists public.media_upload_intents"
    );
    expect(migrationSql).toContain(
      "alter table public.media_upload_intents enable row level security"
    );
    expect(migrationSql).toContain(
      "revoke all on table public.media_upload_intents"
    );
    expect(migrationTimeSql).not.toMatch(
      /\b(?:insert\s+into|update|delete\s+from)\s+public[.](?:media_assets|media_physical_objects|media_asset_variants|media_optimization_jobs)\b/i
    );
    expect(migrationSql).not.toMatch(/\bcreate\s+policy\b/i);
    expect(migrationSql).not.toMatch(/\b(?:r2|supabase)\b/i);
    expect(migrationSql).not.toMatch(
      /grant\s+(?:all|select|insert|update|delete)\s+on\s+table/i
    );
  });

  it("binds the actor, prospective asset metadata, exact target, and file facts", () => {
    for (const field of [
      "asset_id text not null",
      "asset_metadata jsonb not null",
      "physical_object_id uuid not null unique",
      "actor_id uuid references auth.users(id) on delete set null",
      "storage_provider text not null",
      "storage_container text not null",
      "object_key text not null",
      "expected_media_type text not null",
      "expected_mime_type text not null",
      "expected_byte_size bigint not null",
      "expected_checksum_sha256 text not null",
      "expires_at timestamptz not null",
    ]) {
      expect(migrationSql).toContain(field);
    }

    for (const metadataField of [
      "'label'",
      "'alt'",
      "'usageKey'",
      "'sortOrder'",
      "'isPublished'",
    ]) {
      expect(migrationSql).toContain(metadataField);
    }
    expect(migrationSql).toContain("expected_checksum_sha256 ~ '^[0-9a-f]{64}$'");
    expect(migrationSql).toContain("ttl_seconds between 60 and 900");
    expect(migrationSql).toContain(
      "create unique index if not exists media_physical_objects_upload_binding_key"
    );
    expect(migrationSql).toContain(
      "constraint media_upload_intents_object_binding_fk"
    );
    expect(migrationSql).toContain(
      ") references public.media_physical_objects ("
    );
  });

  it("uses the exact active MIME allowlist and current server size caps", () => {
    for (const mimeType of [
      "image/avif",
      "image/gif",
      "image/jpeg",
      "image/png",
      "image/webp",
      "video/mp4",
      "video/quicktime",
      "video/webm",
    ]) {
      expect(migrationSql).toContain(`'${mimeType}'`);
    }

    expect(migrationSql).not.toMatch(/'image\/svg\+xml'|'text\/html'/);
    expect(migrationSql).toContain(
      "expected_byte_size between 1 and 10485760"
    );
    expect(migrationSql).toContain(
      "expected_byte_size between 1 and 104857600"
    );
    expect(prepareBody).toContain(
      "p_expected_byte_size not between 1 and 10485760"
    );
    expect(prepareBody).toContain(
      "p_expected_byte_size not between 1 and 104857600"
    );
  });

  it("allows only one active intent per asset and one row per caller UUID", () => {
    expect(migrationSql).toContain("id uuid primary key");
    expect(migrationSql).toContain(
      "create unique index if not exists media_upload_intents_active_asset_idx"
    );
    expect(migrationSql).toContain(
      "on public.media_upload_intents (asset_id)\nwhere status = 'prepared'"
    );
    expect(prepareBody).toContain(
      "'media_upload_intent_v1:id:' || p_intent_id::text"
    );
    expect(prepareBody).toContain(
      "'media_upload_intent_v1:asset:' || p_asset_id"
    );
    expect(prepareBody).toContain("where intent.id = p_intent_id");
    expect(prepareBody).toContain(
      "media_upload_intent_idempotency_conflict"
    );
    expect(prepareBody).toContain("media_upload_intent_already_active");
  });

  it("reserves one matching pending physical object atomically", () => {
    expect(prepareBody).toContain(
      "v_object_key := 'media/source/' || p_asset_id || '/' || p_intent_id::text"
    );
    expect(prepareBody).toContain(
      "insert into public.media_physical_objects"
    );
    expect(prepareBody).toContain("insert into public.media_upload_intents");
    expect(prepareBody).toContain("p_storage_provider");
    expect(prepareBody).toContain("p_storage_container");
    expect(prepareBody).toContain("p_expected_media_type");
    expect(prepareBody).toContain("p_expected_mime_type");
    expect(prepareBody).toContain("p_expected_byte_size");
    expect(prepareBody).toContain("p_expected_checksum_sha256");
    expect(prepareBody).toContain("'pending'");
    expect(prepareBody).not.toContain(
      "insert into public.media_asset_variants"
    );

    const objectInsertStart = prepareBody.indexOf(
      "insert into public.media_physical_objects"
    );
    const objectInsertEnd = prepareBody.indexOf(
      "insert into public.media_upload_intents",
      objectInsertStart
    );
    const objectInsert = prepareBody.slice(objectInsertStart, objectInsertEnd);
    expect(objectInsert).not.toContain("byte_size");
    expect(objectInsert).not.toContain("checksum_sha256");
    expect(objectInsert).not.toContain("p_expected_byte_size");
    expect(objectInsert).not.toContain("p_expected_checksum_sha256");
  });

  it("requires an active admin and exposes only the preparation RPC", () => {
    expect(prepareBody).toContain("security definer");
    expect(prepareBody).toContain("set search_path = ''");
    expect(prepareBody).toContain("from public.admin_profiles as admin");
    expect(prepareBody).toContain("admin.user_id = p_actor_id");
    expect(prepareBody).toContain("admin.is_active = true");
    expect(prepareBody).toContain("for share");
    expect(migrationSql).toContain(
      "grant execute on function public.prepare_media_upload_intent_v1"
    );
    expect(migrationSql).toContain(
      ") from public, anon, authenticated, service_role;"
    );
    expect(migrationSql).toContain(") to service_role;");
    expect(migrationSql).not.toMatch(/finalize_media_upload_intent/i);
  });

  it("keeps retried and expired reservations one-time and auditable", () => {
    expect(prepareBody).toContain("v_existing.asset_metadata = p_asset_metadata");
    expect(prepareBody).toContain("v_existing.ttl_seconds = p_ttl_seconds");
    expect(prepareBody).toContain("v_existing.status");
    expect(prepareBody).toContain("stale.expires_at <= v_now");
    expect(prepareBody).toContain("status = 'expired'");
    expect(prepareBody).toContain("object.status = 'pending'");
    expect(prepareBody).toContain("set status = 'failed'");
    expect(prepareBody).toContain("'media_upload_intent_prepared'");
    expect(prepareBody).toContain(
      "v_existing.expires_at <= pg_catalog.clock_timestamp()"
    );
    expect(prepareBody).toContain("media_upload_asset_already_exists");

    const retryLookup = prepareBody.indexOf("where intent.id = p_intent_id");
    const retryBranchEnd = prepareBody.indexOf(
      "raise exception 'media_upload_intent_idempotency_conflict'"
    );
    const retryBranch = prepareBody.slice(retryLookup, retryBranchEnd);
    expect(retryBranch).toContain("from public.media_assets as asset");
    expect(retryBranch).toContain("status = 'cancelled'");
    expect(retryBranch).toContain("set status = 'failed'");

    const retryReturn = prepareBody.indexOf(
      "return pg_catalog.jsonb_build_object",
      retryLookup
    );
    const retryWindow = prepareBody.slice(retryLookup, retryReturn);
    expect(retryWindow).toContain("status = 'expired'");

    const objectInsert = prepareBody.indexOf(
      "insert into public.media_physical_objects"
    );
    expect(
      prepareBody.lastIndexOf(
        "v_now := pg_catalog.clock_timestamp();",
        objectInsert
      )
    ).toBeGreaterThan(prepareBody.indexOf("media_upload_intent_already_active"));
    expect(prepareBody).toContain("publish with insert-only semantics");

    const auditStart = prepareBody.indexOf("insert into public.audit_logs");
    const auditEnd = prepareBody.indexOf("return pg_catalog.jsonb_build_object", auditStart);
    const auditBlock = prepareBody.slice(auditStart, auditEnd);
    expect(auditBlock).not.toContain("p_storage_provider");
    expect(auditBlock).not.toContain("p_storage_container");
    expect(auditBlock).not.toContain("v_object_key");
    expect(auditBlock).not.toContain("p_expected_checksum_sha256");
    expect(auditBlock).not.toMatch(/token|credential|secret/i);
  });

  it("ends transactionally without adding signing or finalization behavior", () => {
    expect(migrationSql.trim().endsWith("commit;")).toBe(true);
    expect(migrationSql).not.toMatch(
      /create\s+(?:or\s+replace\s+)?function\s+public[.](?:presign|sign|finalize)/i
    );
    expect(migrationSql).not.toMatch(/\bdelivery_url\s*=/i);
    expect(prepareBody).not.toMatch(/\bstatus\s*=\s*'ready'/i);
    for (const replaySafeCreate of [
      "create table if not exists public.media_upload_intents",
      "create unique index if not exists media_physical_objects_upload_binding_key",
      "create unique index if not exists media_upload_intents_active_asset_idx",
      "create index if not exists media_upload_intents_expiry_idx",
    ]) {
      expect(migrationSql).toContain(replaySafeCreate);
    }
  });
});
