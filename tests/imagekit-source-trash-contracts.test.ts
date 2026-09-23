import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../supabase/migrations/0048_imagekit_source_trash.sql", import.meta.url), "utf8");
const checks = readFileSync(new URL("../supabase/checks/0048_imagekit_source_trash.sql", import.meta.url), "utf8");
const predecessor = readFileSync(new URL("../supabase/migrations/0040_media_library_v2.sql", import.meta.url), "utf8");
function body(sql: string, name: string) {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  return sql.slice(start, sql.indexOf("$$;", start) + 3);
}
const helper = body(migration, "is_imagekit_media_source_trashable_v1");
const mutation = body(migration, "mutate_media_asset_v2");
const oldMutation = body(predecessor, "mutate_media_asset_v2");
const withoutComments = (value: string) => value.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();

describe("ImageKit source-only recoverable Trash migration", () => {
  it("requires the private 0047 lifecycle and the shared archive-aware reference registry", () => {
    const preflight = migration.slice(0, migration.indexOf("create or replace function"));
    expect(preflight).toContain("to_regclass('public.media_imagekit_upload_lifecycle') is null");
    expect(preflight).toContain("to_regclass('public.media_imagekit_file_bindings') is null");
    expect(preflight).toContain("(values ('public.media_imagekit_upload_lifecycle'),('public.media_imagekit_file_bindings'))");
    expect(preflight).toContain("has_table_privilege(caller.role_name,required.table_name");
    expect(preflight).toContain("and relrowsecurity");
    expect(preflight).toContain("'SELECT,INSERT,UPDATE,DELETE'");
    expect(preflight).toContain("table_name = 'content_archive_v2'");
    expect(preflight).toContain("installed.tgname = 'zz_media_library_reference_guard_v2'");
    expect(preflight).toContain("installed.tgtype = 23 and installed.tgqual is null");
    expect(preflight).toContain("imagekit_source_trash_requires_0047_and_archive_guards");
  });

  it("locks all candidate variants and preserves legacy files with no variants", () => {
    expect(helper).toContain("where asset_id = p_asset_id order by id for share");
    expect(helper.indexOf("order by id for share")).toBeLessThan(helper.indexOf("select count(*)"));
    expect(helper).toContain("if v_count = 0 then return true; end if");
    expect(helper).toContain("if v_count <> 1 then return false; end if");
    for (const table of ["media_assets", "media_physical_objects", "media_upload_intents", "media_imagekit_upload_lifecycle", "media_imagekit_file_bindings"])
      expect(helper).toMatch(new RegExp(`from public\\.${table}[^;]*for share;`));
  });

  it("locks the exact account/file/intent uniqueness fence and rejects a missing binding", () => {
    const fence = helper.slice(helper.indexOf("perform 1 from public.media_imagekit_file_bindings"));
    expect(fence).toContain("where storage_container = v_intent.storage_container");
    expect(fence).toContain("and file_id = v_lifecycle.file_id and intent_id = v_intent.id for share;");
    expect(fence).toContain("if not found then return false; end if;");
    expect(fence.indexOf("if not found then return false")).toBeLessThan(fence.indexOf("return true"));
  });

  it("allows only a ready untransformed ImageKit source with the exact logical delivery facts", () => {
    for (const rule of [
      "v_variant.variant_kind <> 'source'", "v_variant.preset_key <> 'source'",
      "v_variant.source_variant_id is not null", "v_variant.status <> 'ready'",
      "v_variant.transformation_params <> '{}'::jsonb", "v_object.storage_provider <> 'imagekit'",
      "v_object.status <> 'ready'", "v_object.deleted_at is not null", "v_object.provider_metadata <> '{}'::jsonb",
      "v_object.delivery_url is distinct from v_asset.src", "v_object.media_type is distinct from v_asset.media_type",
      "v_object.mime_type is distinct from v_asset.mime_type", "v_object.byte_size is distinct from v_asset.file_size",
    ]) expect(helper).toContain(rule);
  });

  it("requires consumed ownership, physical identity and exact verified digest plus private version binding", () => {
    for (const rule of [
      "v_intent.status <> 'consumed'", "v_intent.resolved_at is null", "v_intent.asset_id is distinct from p_asset_id",
      "v_intent.storage_provider is distinct from v_object.storage_provider",
      "v_intent.storage_container is distinct from v_object.storage_container",
      "v_intent.object_key is distinct from v_object.object_key",
      "v_intent.expected_media_type is distinct from v_object.media_type",
      "v_intent.expected_mime_type is distinct from v_object.mime_type",
      "v_intent.expected_byte_size is distinct from v_object.byte_size",
      "v_intent.expected_checksum_sha256 is distinct from v_object.checksum_sha256",
      "v_lifecycle.source_variant_id is distinct from v_variant.id", "v_lifecycle.issued_at is null",
      "v_lifecycle.authority_expires_at <= v_lifecycle.issued_at",
      "v_lifecycle.file_id is null", "v_lifecycle.version_id is null", "v_lifecycle.version_token is null",
      "v_lifecycle.cleanup_state is distinct from 'not_needed'",
    ]) expect(helper).toContain(rule);
  });

  it("retains advisory/table locking and CAS before checking both target and replacement pipelines", () => {
    const lock = mutation.indexOf("'media_pipeline_v1:'");
    expect(lock).toBeGreaterThan(-1);
    expect(lock).toBeLessThan(mutation.indexOf("'media_upload_intent_v1:asset:'"));
    expect(mutation).toContain("where id is not null order by id loop");
    expect(mutation).toContain("from public.media_library_reference_registry_v2() order by table_name");
    expect(mutation).toContain("lock table public.media_assets in share row exclusive mode");
    expect(mutation).toContain("v_asset.updated_at is distinct from p_expected_updated_at");
    expect(mutation).toContain("status in ('queued','running')");
    expect(mutation).toContain("asset_id in (p_asset_id,p_replacement_id) and status = 'prepared'");
    expect(mutation).toContain("not public.is_imagekit_media_source_trashable_v1(p_asset_id)");
    expect(mutation).toContain("p_replacement_id is not null and not public.is_imagekit_media_source_trashable_v1(p_replacement_id)");
  });

  it("protects restore too, retaining object/variant readiness and every stored byte", () => {
    const guard = mutation.indexOf("not public.is_imagekit_media_source_trashable_v1(p_asset_id)");
    expect(guard).toBeLessThan(mutation.indexOf("if p_operation = 'restore' then"));
    expect(mutation).toContain("update public.media_assets set deleted_at = null, deleted_by = null, is_published = true");
    expect(mutation).toContain("update public.media_assets set deleted_at = pg_catalog.clock_timestamp()");
    expect(migration).not.toMatch(/\b(?:update|delete from) public\.(?:media_asset_variants|media_physical_objects|media_imagekit_upload_lifecycle|media_upload_intents)\b/);
    expect(withoutComments(migration)).not.toMatch(/\bdelete\s+from\b|\btruncate\b/);
  });

  it("preserves all 0040 replacement/reference behavior verbatim apart from comments", () => {
    const start = "select coalesce(sum(reference_count),0) into v_total";
    expect(withoutComments(mutation.slice(mutation.indexOf(start))))
      .toBe(withoutComments(oldMutation.slice(oldMutation.indexOf(start))));
    expect(migration).not.toContain("create or replace function public.media_library_reference_registry_v2");
    expect(migration).not.toContain("create or replace function public.guard_media_library_references_v2");
  });

  it("keeps the helper private and only the existing mutation available to service role", () => {
    expect(migration).toContain("revoke all on function public.is_imagekit_media_source_trashable_v1(text) from public,anon,authenticated,service_role;");
    expect(migration).not.toContain("grant execute on function public.is_imagekit_media_source_trashable_v1");
    expect(migration).toContain("grant execute on function public.mutate_media_asset_v2(text,timestamptz,uuid,text,text,timestamptz) to service_role;");
    expect(migration.match(/security definer set search_path = ''/g)).toHaveLength(2);
    expect(migration.trim().endsWith("commit;")).toBe(true);
    expect(withoutComments(migration.replace(helper, "").replace(mutation, "")))
      .not.toMatch(/\b(?:update public\.|insert into|delete from)\b/);
  });

  it("ships read-only deployment checks including the early restore guard", () => {
    for (const suffix of ["helper_private", "mutation_service_only", "fixed_search_paths", "lifecycle_private", "file_binding_private", "archive_and_reference_guards", "ready_object_guard", "restore_protected"])
      expect(checks).toContain(`'imagekit_source_trash_${suffix}'`);
    expect(checks).toContain("array['storage_container','file_id']::pg_catalog.name[]");
    expect(checks).toContain("array['intent_id']::pg_catalog.name[]");
    expect(withoutComments(checks)).not.toMatch(/\b(?:update|insert into|delete from|alter|create)\b/);
  });
});
