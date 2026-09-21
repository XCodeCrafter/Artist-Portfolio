import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../supabase/migrations/0046_hero_media_framing.sql", import.meta.url), "utf8");
const checks = readFileSync(new URL("../supabase/checks/0046_hero_media_framing.sql", import.meta.url), "utf8");
const runtime = readFileSync(new URL("../scripts/test-hero-media-framing-migration.mjs", import.meta.url), "utf8");
const body = (name: string) => {
  const start = migration.indexOf(`create or replace function public.${name}(`);
  return migration.slice(start, migration.indexOf("$$;", start) + 3);
};
const validator = body("is_valid_hero_media_framing_v2");
const reader = body("get_hero_editor_with_framing_v2");
const writer = body("save_hero_with_framing_v2");

describe("Hero media framing forward-migration contract", () => {
  it("requires all existing editors and both live media guards before installing", () => {
    const prerequisite = migration.slice(0, migration.indexOf("create or replace function"));
    for (const editor of ["home", "bio", "music", "gallery", "showreel", "contact"])
      expect(prerequisite).toContain(`public.get_${editor}_page_v2_snapshot(text)`);
    for (const editor of ["bio", "music", "gallery", "showreel", "contact"])
      expect(prerequisite).toContain(`public.save_${editor}_hero_v2(text,timestamp with time zone,jsonb)`);
    expect(prerequisite).toContain("public.save_home_section_v2(text,text,timestamp with time zone,jsonb)");
    expect(prerequisite).toContain("zz_media_library_reference_guard_v2");
    expect(prerequisite).toContain("tgenabled in ('O', 'A')");
    expect(prerequisite).toContain("hero_framing_requires_all_v2_editors_and_0040_guards");
    expect(prerequisite).toContain("using errcode = '55000'");
  });

  it("adds nullable placement columns without backfill, default changes or old RPC rewrites", () => {
    expect(migration).toContain("alter table public.page_heroes add column if not exists media_framing jsonb;");
    expect(migration).toContain("alter table public.home_page_config add column if not exists hero_media_framing jsonb;");
    const deployed = migration.replace(writer, "");
    expect(deployed).not.toMatch(/^\s*(?:insert\s+into|update\s+public\.|delete\s+from)/im);
    expect(migration).not.toMatch(/create or replace function public.(?:save_(?:home|bio|music|gallery|showreel|contact)|get_(?:home|bio|music|gallery|showreel|contact)_page)_/);
    expect(migration).not.toContain("create or replace function public.guard_media_library_references_v2");
    expect(migration).not.toContain("create or replace function public.media_library_reference_registry_v2");
    expect(migration.trim().endsWith("commit;")).toBe(true);
  });

  it("validates both responsive variants with exact keys and finite numeric bounds", () => {
    expect(validator).toContain("p_framing ?& array['desktop', 'mobile']");
    expect(validator).toContain("jsonb_object_keys(p_framing)) <> 2");
    expect(validator).toContain("v_view ?& array['fit', 'x', 'y', 'zoom']");
    expect(validator).toContain("jsonb_object_keys(v_view)) <> 4");
    expect(validator).toContain("v_view ->> 'fit' not in ('cover', 'contain')");
    for (const key of ["x", "y", "zoom"])
      expect(validator).toContain(`jsonb_typeof(v_view -> '${key}') is distinct from 'number'`);
    expect(validator).toContain("(v_view ->> 'x')::numeric not between 0 and 100");
    expect(validator).toContain("(v_view ->> 'y')::numeric not between 0 and 100");
    expect(validator).toContain("(v_view ->> 'zoom')::numeric not between 1 and 3");
    expect(validator).not.toContain("::integer");
    expect(validator).toContain("pg_catalog.octet_length(p_framing::text) > 4096");
  });

  it("protects direct writes with equivalent built-in predicates without private-function ACL regression", () => {
    for (const column of ["media_framing", "hero_media_framing"]) {
      expect(migration).toContain(`check (${column} is null or coalesce(pg_catalog.octet_length(${column}::text) <= 4096 and`);
      expect(migration).toContain(`pg_catalog.jsonb_path_match(${column}, 'strict`);
      expect(migration).not.toContain(`check (${column} is null or public.is_valid_hero_media_framing_v2`);
    }
    expect(migration.match(/'\{\}'::jsonb, true\), false\)\);/g)).toHaveLength(2);
    expect(migration).not.toContain("not valid");
    expect(validator).toContain("p_framing is null or pg_catalog.jsonb_typeof(p_framing) is distinct from 'object'");
  });

  it("locks the true parent before combining framing with the unchanged complete snapshot", () => {
    expect(reader).toContain("p_site_id is distinct from 'main'");
    expect(reader).toContain("p_page not in ('home', 'bio', 'music', 'gallery', 'video', 'booking')");
    expect(reader).toContain("from public.home_page_config where id = p_site_id for share;");
    expect(reader).toContain("from public.page_heroes where page_slug = p_page for share;");
    expect(reader.indexOf("for share;")).toBeLessThan(reader.indexOf("public.get_home_page_v2_snapshot"));
    expect(reader).toContain("hero_framing_parent_missing");
    expect(reader).toContain("using errcode = '23503'");
    expect(reader).toContain("'{draft,hero,framing}', coalesce(v_framing, 'null'::jsonb), true");
    expect(reader).toContain("'{hero,framing}', coalesce(v_framing, 'null'::jsonb), true");
  });

  it("requires framing explicitly and delegates every original content validation/CAS boundary", () => {
    expect(writer).toContain("p_expected_updated_at is null");
    expect(writer).toContain("array['title', 'subtitle', 'ctaLabel', 'ctaHref', 'backgroundSrc', 'posterSrc', 'mediaType', 'framing']");
    expect(writer).toContain("jsonb_object_keys(p_payload)) <> 8");
    expect(writer).toContain("v_payload := p_payload - 'framing';");
    expect(writer).toContain("v_framing = 'null'::jsonb");
    expect(writer).toContain("not public.is_valid_hero_media_framing_v2(v_framing)");
    for (const editor of ["bio", "music", "gallery", "showreel", "contact"])
      expect(writer).toContain(`public.save_${editor}_hero_v2(p_site_id, p_expected_updated_at, v_payload)`);
    expect(writer).toContain("public.save_home_section_v2(p_site_id, 'hero', p_expected_updated_at, v_payload)");
    expect(writer).not.toMatch(/execute\s|exception\s+when|commit;|rollback;/i);
  });

  it("returns final parent versions and HOME's normalized canonical response after both writes", () => {
    expect(writer).toContain("set hero_media_framing = v_framing where id = p_site_id returning updated_at into v_version;");
    expect(writer).toContain("set media_framing = v_framing where page_slug = p_page returning updated_at into v_version;");
    expect(writer).toContain("'canonicalSection', (v_home_result -> 'canonicalSection') || pg_catalog.jsonb_build_object('framing', v_framing)");
    expect(writer).toContain("'versions', pg_catalog.jsonb_build_object('updatedAt', v_version)");
    expect(writer.lastIndexOf("return pg_catalog.jsonb_build_object")).toBeGreaterThan(writer.lastIndexOf("returning updated_at into v_version"));
  });

  it("makes wrappers service-only and the immutable validation helper private with fixed search paths", () => {
    for (const signature of ["get_hero_editor_with_framing_v2(text, text)", "save_hero_with_framing_v2(text, text, timestamptz, jsonb)"]) {
      expect(migration).toContain(`revoke all on function public.${signature} from public, anon, authenticated, service_role;`);
      expect(migration).toContain(`grant execute on function public.${signature} to service_role;`);
    }
    expect(migration).toContain("revoke all on function public.is_valid_hero_media_framing_v2(jsonb) from public, anon, authenticated, service_role;");
    expect(migration).not.toContain("grant execute on function public.is_valid_hero_media_framing_v2");
    for (const fn of [reader, writer, validator]) expect(fn).toContain("security definer set search_path = ''");
    expect(validator).toContain("immutable");
    expect(reader).not.toContain("immutable");
  });

  it("provides eight read-only deployment checks", () => {
    expect(checks.match(/union all/g)).toHaveLength(7);
    for (const label of ["columns_ready", "constraints_validated", "rpcs_service_only", "validator_private", "fixed_search_paths", "parent_guards_enabled", "shape_and_limits", "all_six_editors_ready"])
      expect(checks).toContain(`hero_framing_${label}`);
    expect(checks).not.toMatch(/^\s*(?:insert|update|delete|alter|create)\b/im);
  });

  it("has isolated real PostgreSQL coverage for rollout, compatibility, CAS, rollback and ACL", () => {
    expect(runtime).toContain("new PGlite()");
    for (const marker of ["beforeMigration", "beforeRerun", "originalDefinitions", "legacySave", "legacySnapshot", "beforeRollback", "beforeTrashed", "test_fail_framing_update", "set role", "99.999", "0.001", "2.999", "0044_content_archive_gallery_showreel", "0045_contact_optional_copy"])
      expect(runtime).toContain(marker);
    expect(runtime).not.toContain("process.env");
  });
});
