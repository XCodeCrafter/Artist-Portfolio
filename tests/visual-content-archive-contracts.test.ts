import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../supabase/migrations/0044_content_archive_gallery_showreel.sql", import.meta.url), "utf8");
const checks = readFileSync(new URL("../supabase/checks/0044_content_archive_gallery_showreel.sql", import.meta.url), "utf8");
const runtime = readFileSync(new URL("../scripts/test-visual-content-archive-migration.mjs", import.meta.url), "utf8");
const mutation = migration.slice(migration.indexOf("create or replace function public.mutate_visual_content_archive_v2"));
const readRpc = migration.slice(migration.indexOf("create or replace function public.get_visual_content_archive_v2"), migration.indexOf("create or replace function public.mutate_visual_content_archive_v2"));

describe("Gallery / Showreel content archive 13D.4 database contract", () => {
  it("extends all eight collections without rewriting earlier RPCs or Media registry", () => {
    for (const collection of ["navbar-shortcuts", "music-platforms", "music-soundcloud", "bio-portraits", "bio-paragraphs", "bio-credits", "gallery-frames", "showreel-works"]) expect(migration).toContain(`'${collection}'`);
    expect(migration).toContain("visual_archive_requires_0043_0031_and_0032");
    expect(migration).not.toMatch(/create or replace function public\.(?:save_|mutate_bio_|mutate_music_|mutate_navbar_|media_library_reference_registry_v2)/);
    expect(migration).not.toMatch(/delete\s+from\s+(?:storage\.|public\.media_assets)/i);
  });

  it("preserves source-ID restrictions for prior collections while permitting exact legacy Showreel IDs", () => {
    const constraint = migration.slice(migration.indexOf("add constraint content_archive_v2_source_id_check"), migration.indexOf("alter table public.content_archive_v2 enable"));
    expect(constraint).toContain("collection = 'showreel-works' and char_length(source_id) between 1 and 512");
    expect(constraint).toContain("btrim(source_id) <> '' and source_id !~ '[[:cntrl:]]'");
    expect(constraint).toContain("collection <> 'showreel-works' and char_length(source_id) between 1 and 160");
    expect(constraint).toContain("source_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'");
    expect(mutation).not.toMatch(/p_item_id\s*:=\s*(?:btrim|trim|lower)/);
  });

  it("requires exact expected-version maps, active-admin identity, finite timestamps and bounded data", () => {
    expect(mutation).toContain("jsonb_object_keys(p_expected_versions)) <> 1");
    expect(mutation).toContain("jsonb_typeof(p_expected_versions -> 'items') is distinct from 'object'");
    expect(mutation).toContain("from public.admin_profiles where user_id = p_actor_id and is_active");
    expect(mutation).toContain("not pg_catalog.isfinite(expected.version::timestamptz)");
    expect(mutation).toContain("not pg_catalog.isfinite(p_expected_archive_updated_at)");
    expect(mutation).toContain("jsonb_object_keys(v_expected)) > 10000");
    expect(mutation).toContain("if v_limit > 10000 then");
    expect(mutation).toContain("jsonb_object_keys(v_expected)) > 120");
  });

  it("matches ordinary-save advisory locks followed by archive-first Media lock ordering", () => {
    expect(mutation).toContain("hashtextextended('gallery_page_v2:frames:main', 0)");
    expect(mutation).toContain("hashtextextended('showreel_page_v2:works:main', 0)");
    const archive = mutation.indexOf("lock table public.content_archive_v2");
    expect(mutation.indexOf("pg_advisory_xact_lock")).toBeLessThan(archive);
    expect(archive).toBeLessThan(mutation.indexOf("lock table public.gallery_images"));
    expect(archive).toBeLessThan(mutation.indexOf("lock table public.videos"));
    expect(mutation).toContain("exception when deadlock_detected");
    expect(mutation).toContain("using errcode = '40001'");
  });

  it("compares complete current membership, timestamps and archived versions before moving a row", () => {
    expect(mutation).toContain("jsonb_object_keys(v_current)) <> (select count(*) from pg_catalog.jsonb_object_keys(v_expected))");
    expect(mutation).toContain("where not (v_expected ? item.id)");
    expect(mutation).toContain("where not (v_current ? item.id)");
    expect(mutation).toContain("item.version::timestamptz is distinct from (v_expected ->> item.id)::timestamptz");
    expect(mutation).toContain("v_archive.updated_at is distinct from p_expected_archive_updated_at");
    expect(mutation.indexOf("where not (v_expected ? item.id)")).toBeLessThan(mutation.indexOf("insert into public.content_archive_v2"));
  });

  it("excludes HOME stories from every Gallery boundary and refuses cross-owner restoration", () => {
    expect(mutation).toContain("into v_current from public.gallery_images where is_freelance_story = false");
    expect(mutation).toContain("where id = p_item_id and is_freelance_story = false for update");
    expect(mutation).toContain("delete from public.gallery_images where id = p_item_id and is_freelance_story = false");
    expect(mutation).toContain("from public.gallery_images item where is_freelance_story = false");
    expect(mutation).toContain("v_frame.is_freelance_story is distinct from false");
    expect(mutation).toContain("raise exception 'invalid_gallery_archive_ownership'");
    expect(mutation).toContain("p_collection = 'gallery' and exists(select 1 from public.gallery_images where id = p_item_id)");
    expect(migration).not.toMatch(/update\s+public\.gallery_images/i);
  });

  it("keeps a private nondecreasing high-water mark so older catalogs can be fully restored", () => {
    expect(migration).toContain("create table if not exists public.visual_content_archive_limits_v2");
    expect(migration).toContain("values('showreel', greatest(120, (select count(*)::integer from public.videos)))");
    expect(migration).toContain("active_limit = greatest(existing.active_limit, excluded.active_limit)");
    expect(mutation).toContain("values('showreel', v_limit)");
    expect(mutation).toContain("v_current_count >= v_limit");
    expect(migration).toContain("alter table public.visual_content_archive_limits_v2 enable row level security");
    expect(migration).toContain("revoke all on table public.visual_content_archive_limits_v2 from public, anon, authenticated, service_role");
    expect(readRpc).toContain("'activeLimit', v_limit");
    expect(readRpc).not.toMatch(/\b(?:insert|update|delete)\s+(?:into|from|public\.)/i);
  });

  it("restores complete hidden rows with original ordering and strict anti-ABA timestamps", () => {
    for (const row of ["v_frame", "v_work"]) {
      expect(mutation).toContain(`${row}.is_published := false`);
      expect(mutation).toContain(`${row}.updated_at + interval '1 microsecond'`);
      expect(mutation).toContain(`select (${row}).*`);
    }
    expect(mutation).toContain("v_archive.updated_at + interval '1 microsecond'");
    expect(mutation).not.toContain(".sort_order :=");
    expect(mutation).not.toContain(".is_featured := false");
  });

  it("refuses a second featured flag even if the competing work is hidden or a legacy music video", () => {
    expect(mutation).toContain("v_work.is_featured and exists(select 1 from public.videos where is_featured)");
    expect(mutation).toContain("jsonb_build_object('outcome', 'featured_conflict')");
    const check = mutation.indexOf("v_work.is_featured and exists");
    expect(check).toBeLessThan(mutation.indexOf("delete from public.content_archive_v2", check));
    expect(mutation).not.toContain("where is_featured and is_published");
    expect(mutation).not.toContain("where is_featured and video_type");
  });

  it("reserves archived IDs against all source INSERT and UPDATE paths", () => {
    for (const table of ["gallery_images", "videos"]) expect(migration).toContain(`before insert or update on public.${table}`);
    expect(migration).toContain("where archive.collection = v_collection and archive.source_id = new.id");
    expect(migration).toContain("raise exception 'visual_content_is_archived'");
  });

  it("returns exact canonical editor fields and metadata-only bounded archive pages", () => {
    for (const field of ["isMosaic", "isPublished", "caption", "category", "embedUrl", "thumbnailSrc", "isFeatured", "videoType"]) expect(mutation).toContain(`'${field}'`);
    expect(mutation).toContain("'section', case p_collection when 'gallery' then 'frames' else 'works' end");
    expect(mutation).toContain("'canonicalSection', pg_catalog.jsonb_build_object('items', v_items)");
    expect(mutation).toContain("'versions', pg_catalog.jsonb_build_object('items', v_versions)");
    expect(readRpc).toContain("order by archived_at desc, source_id limit 20 offset p_offset");
    expect(readRpc).toContain("p_offset > 1000000 or p_offset % 20 <> 0");
    for (const forbidden of ["'row_data'", "'archived_by'", "'embed_url'", "'thumbnail_src'", "'src'"]) expect(readRpc).not.toContain(forbidden);
  });

  it("permits only narrow service RPCs, keeping both tables and the trigger function private", () => {
    expect(migration).toContain("revoke all on table public.content_archive_v2 from public, anon, authenticated, service_role");
    expect(migration).toContain("revoke all on function public.guard_archived_visual_content_v2() from public, anon, authenticated, service_role");
    expect(migration).toContain("grant execute on function public.get_visual_content_archive_v2(text,integer) to service_role");
    expect(migration).toContain("grant execute on function public.mutate_visual_content_archive_v2(text,text,text,jsonb,uuid,timestamptz) to service_role");
    expect(migration).not.toMatch(/grant\s+.*on\s+table/i);
  });

  it("supplies ten read-only checks for private access, HOME, legacy IDs, capacity and predecessor guards", () => {
    expect(checks.match(/union all/g)).toHaveLength(9);
    for (const name of ["visual_archive_tables_private_and_rls", "visual_archive_active_ids_and_home_ownership", "visual_archive_legacy_id_contract", "visual_archive_showreel_restore_capacity", "visual_archive_previous_guards_ready"]) expect(checks).toContain(name);
    expect(checks).not.toMatch(/\b(?:insert|update|delete|alter)\s+(?:into|from|table|public\.)/i);
  });

  it("has disposable PostgreSQL coverage for lifecycle, compatibility, Media, rollback and legacy recovery", () => {
    expect(runtime).toContain("new PGlite()");
    for (const marker of ["deliberate_archive_failure", "deliberate_restore_failure", "replace_and_trash", "beforeRerun", "set role", "mutate_navbar_shortcut_archive_v2", "mutate_music_content_archive_v2", "mutate_bio_content_archive_v2", "save_gallery_frames_v2", "save_showreel_works_v2", "historical-", "featured_conflict", "HOME is never", "__proto__", "ABA", "10001"]) expect(runtime).toContain(marker);
    expect(runtime).not.toContain("process.env");
  });
});
