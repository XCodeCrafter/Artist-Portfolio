import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../supabase/migrations/0051_photo_framing.sql", import.meta.url), "utf8");
const checks = readFileSync(new URL("../supabase/checks/0051_photo_framing.sql", import.meta.url), "utf8");
const runtime = readFileSync(new URL("../scripts/test-photo-framing-migration.mjs", import.meta.url), "utf8");
const body = (name: string) => {
  const start = migration.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  return migration.slice(start, migration.indexOf("$$;", start) + 3);
};

describe("Photo framing additive migration contract", () => {
  it("requires the parent framing capability and every existing media guard", () => {
    const precondition = migration.slice(0, migration.indexOf("create table"));
    expect(precondition).toContain("public.get_hero_editor_with_framing_v2(text,text)");
    expect(precondition).toContain("public.is_valid_hero_media_framing_v2(jsonb)");
    expect(precondition).toContain("zz_media_library_reference_guard_v2");
    expect(precondition).toContain("tgenabled in ('O','A')");
    expect(precondition).toContain("<> 5");
  });

  it("stores no original files, URLs or ownership references in its private sidecar", () => {
    const table = migration.slice(migration.indexOf("create table"), migration.indexOf("create or replace function"));
    expect(table).toContain("placement text primary key");
    expect(table).toContain("source_fingerprint text not null");
    expect(table).toContain("is_valid_hero_media_framing_v2(framing)");
    expect(table).not.toMatch(/\b(?:src|url|asset_id|object_key)\s+(?:text|uuid)/i);
    expect(table).toContain("enable row level security");
    expect(table).toContain("revoke all on table public.photo_framings from public, anon, authenticated, service_role");
    expect(migration).not.toContain("create policy");
  });

  it("reads framing only for the exact current source and advertises support on empty collections", () => {
    expect(body("photo_framing_for_source_v2")).toContain("source_fingerprint = pg_catalog.md5(p_src)");
    expect(body("apply_photo_framing_v2")).toContain('"photoFramingAvailable":true');
    for (const placement of ["home:about", "home:feature:poster", "home:story:", "bio:image:", "music:platform:", "gallery:image:", "showreel:thumbnail:"])
      expect(body("apply_photo_framing_v2")).toContain(placement);
  });

  it("locks collections before enriching the existing complete snapshot", () => {
    const reader = body("get_photo_editor_with_framing_v2");
    for (const table of ["bio_gallery_images", "bio_paragraphs", "music_platform_links", "gallery_images", "videos"])
      expect(reader).toContain(`lock table public.${table} in share mode`);
    expect(reader).toContain("from public.home_page_config where id = p_site_id for share");
    expect(reader.indexOf("lock table")).toBeLessThan(reader.indexOf("public.get_hero_editor_with_framing_v2"));
  });

  it("requires explicit crop values and delegates content/CAS/media/archive checks atomically", () => {
    const writer = body("save_photo_section_with_framing_v2");
    expect(writer).toContain("not (v_item ? v_field)");
    expect(writer).toContain("not public.is_valid_hero_media_framing_v2(v_item -> v_field)");
    expect(writer).toContain("v_item - v_field");
    for (const save of ["save_home_section_v2", "save_bio_biography_v2", "save_music_platforms_v2", "save_gallery_frames_v2", "save_showreel_works_v2"])
      expect(writer).toContain(`public.${save}(`);
    expect(writer.indexOf("public.set_photo_framing_for_source_v2")).toBeGreaterThan(writer.indexOf("public.save_showreel_works_v2"));
    expect(writer).not.toMatch(/\bexecute\b|\bcommit\b|\brollback\b/i);
    expect(writer).toContain("public.apply_photo_framing_v2('home'");
    expect(writer).toContain("public.apply_photo_framing_v2('music'");
  });

  it("public projection never reads archives and only joins published current sources", () => {
    const reader = body("get_public_photo_framings_v1");
    expect(reader).toContain("language sql stable security definer set search_path = ''");
    expect(reader).toContain("crop.source_fingerprint = pg_catalog.md5(source.src)");
    expect(reader.match(/where is_published/g)).toHaveLength(4);
    expect(reader).toContain("and not is_freelance_story");
    expect(reader.match(/enabled.*true/g)).toHaveLength(3);
    expect(reader).not.toContain("content_archive_v2");
    expect(reader).not.toMatch(/\b(?:insert|update|delete|execute)\b/i);
  });

  it("exposes service write wrappers, public read-only projection, and no helper access", () => {
    for (const signature of ["get_photo_editor_with_framing_v2(text,text)", "save_photo_section_with_framing_v2(text,text,text,jsonb,jsonb)"])
      expect(migration).toContain(`grant execute on function public.${signature} to service_role;`);
    for (const helper of ["photo_framing_for_source_v2", "set_photo_framing_for_source_v2", "apply_photo_framing_v2"])
      expect(migration).not.toContain(`grant execute on function public.${helper}`);
    expect(migration).toContain("grant execute on function public.get_public_photo_framings_v1() to anon, authenticated, service_role;");
    expect(migration.match(/security definer set search_path = ''/g)).toHaveLength(6);
    expect(checks.match(/union all/g)).toHaveLength(8);
    expect(checks).not.toMatch(/^\s*(?:insert|update|delete|alter|create)\b/im);
  });

  it("repairs only the exact original Showreel capacity expression and accepts a safe rerun", () => {
    expect(migration).toContain("pg_catalog.md5(pg_catalog.replace(v_body");
    expect(migration).toContain("'46977223dce71aa5cd24d38c2ebcaab7','3c5b5f7e78b096cd14b047a5cf94e262'");
    expect(migration).toContain("photo_framing_requires_known_showreel_save_contract");
    expect(migration).toContain("execute pg_catalog.replace(v_definition,'pg_catalog.greatest(120, v_current_count)','greatest(120, v_current_count)')");
    expect(checks).toContain("photo_framing_showreel_capacity_fixed");
  });

  it("includes isolated real PostgreSQL execution of CAS, source changes, archive and ACL", () => {
    expect(runtime).toContain("new PGlite()");
    for (const marker of ["40001", "23514", "42501", "photoFramingAvailable", "mutate_bio_content_archive_v2", "rollbackCrops", "rerunCrops", "begin read only"])
      expect(runtime).toContain(marker);
    expect(runtime).not.toContain("process.env");
  });
});
