import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../supabase/migrations/0043_content_archive_bio.sql", import.meta.url), "utf8");
const checks = readFileSync(new URL("../supabase/checks/0043_content_archive_bio.sql", import.meta.url), "utf8");
const runtime = readFileSync(new URL("../scripts/test-bio-content-archive-migration.mjs", import.meta.url), "utf8");
const mutation = migration.slice(migration.indexOf("create or replace function public.mutate_bio_content_archive_v2"));
const readRpc = migration.slice(migration.indexOf("create or replace function public.get_bio_content_archive_v2"), migration.indexOf("create or replace function public.mutate_bio_content_archive_v2"));

describe("BIO content archive 13D.3 database contract", () => {
  it("extends all prior collections without content rewrites, file deletion or replacing the Media registry", () => {
    for (const collection of ["navbar-shortcuts", "music-platforms", "music-soundcloud", "bio-portraits", "bio-paragraphs", "bio-credits"]) expect(migration).toContain(`'${collection}'`);
    expect(migration).toContain("bio_archive_requires_0042_and_0030");
    expect(migration).toContain("alter table public.content_archive_v2 enable row level security");
    expect(migration).toContain("revoke all on table public.content_archive_v2 from public, anon, authenticated, service_role");
    expect(migration).not.toMatch(/delete\s+from\s+(?:storage\.|public\.media_assets)/i);
    expect(migration).not.toMatch(/update\s+public\.bio_profile/i);
    expect(migration).not.toContain("create or replace function public.media_library_reference_registry_v2");
  });
  it("keeps exact ordinary-save advisory locks and alphabetical source/archive table ordering", () => {
    expect(mutation).toContain("hashtextextended('bio_page_v2:biography:main', 0)");
    expect(mutation).toContain("hashtextextended('bio_page_v2:credits:main', 0)");
    const gallery = mutation.indexOf("lock table public.bio_gallery_images");
    const paragraphs = mutation.indexOf("lock table public.bio_paragraphs");
    const profile = mutation.indexOf("from public.bio_profile where id = 'main' for update");
    const archive = mutation.indexOf("lock table public.content_archive_v2");
    expect(gallery).toBeLessThan(paragraphs); expect(paragraphs).toBeLessThan(profile); expect(profile).toBeLessThan(archive);
    expect(mutation.indexOf("lock table public.actor_credits")).toBeLessThan(archive);
    expect(mutation).toContain("exception when deadlock_detected");
    expect(mutation).toContain("using errcode = '40001'");
  });
  it("validates the exact nested save boundary and all map capacities before acquiring locks", () => {
    expect(mutation).toContain("array['profileUpdatedAt', 'galleryItems', 'paragraphItems']");
    expect(mutation).toContain("v_keys := array['galleryItems', 'paragraphItems']; v_limits := array[32, 50]");
    expect(mutation).toContain("v_keys := array['items']; v_limits := array[100]");
    expect(mutation).toContain("jsonb_object_keys(p_expected_versions)) <> 3");
    expect(mutation).toContain("jsonb_object_keys(p_expected_versions)) <> 1");
    expect(mutation).toContain("pg_catalog.jsonb_typeof(v_expected) is distinct from 'object'");
    expect(mutation.indexOf("not pg_catalog.isfinite(expected.version::timestamptz)")).toBeLessThan(mutation.indexOf("pg_advisory_xact_lock"));
  });
  it("compares the shared profile plus every sibling member/version and archive version", () => {
    expect(mutation).toContain("v_profile.updated_at is distinct from v_profile_version");
    expect(mutation).toContain("jsonb_object_keys(v_current)) <> (select count(*) from pg_catalog.jsonb_object_keys(v_expected))");
    expect(mutation).toContain("where not (v_expected ? item.id)");
    expect(mutation).toContain("where not (v_current ? item.id)");
    expect(mutation).toContain("item.version::timestamptz is distinct from (v_expected ->> item.id)::timestamptz");
    expect(mutation).toContain("v_archive.updated_at is distinct from p_expected_archive_updated_at");
    expect(mutation.indexOf("raise exception 'bio_profile_missing'")).toBeLessThan(mutation.indexOf("insert into public.content_archive_v2"));
  });
  it("restores complete hidden rows and original ordering with strict anti-ABA timestamps", () => {
    expect(mutation).toContain("when 'portraits' then 32 when 'paragraphs' then 50 else 100 end");
    expect(mutation).toContain("v_current_count >= v_limit");
    for (const row of ["v_portrait", "v_paragraph", "v_credit"]) {
      expect(mutation).toContain(`${row}.is_published := false`);
      expect(mutation).toContain(`${row}.updated_at + interval '1 microsecond'`);
      expect(mutation).toContain(`select (${row}).*`);
    }
    expect(mutation).not.toContain(".sort_order :=");
    expect(mutation).toContain("v_archive.updated_at + interval '1 microsecond'");
  });
  it("returns canonical complete Biography or Credits and never rewrites ordinary save functions", () => {
    for (const field of ["topLabel", "introText", "caption", "galleryImages", "paragraphs", "profileUpdatedAt", "galleryItems", "paragraphItems", "creditType", "production", "director", "revealDelay"]) expect(mutation).toContain(`'${field}'`);
    expect(mutation).toContain("'collection', p_collection");
    expect(mutation).toContain("'section', case when p_collection = 'credits' then 'credits' else 'biography' end");
    expect(mutation).toContain("'canonicalSection', v_canonical, 'versions', v_versions");
    expect(migration).not.toMatch(/create or replace function public\.(?:save_bio_|mutate_navbar_|mutate_music_)/);
  });
  it("isolates source guards by collection as well as ID", () => {
    for (const table of ["bio_gallery_images", "bio_paragraphs", "actor_credits"]) expect(migration).toContain(`before insert or update on public.${table}`);
    expect(migration).toContain("where archive.collection = v_collection and archive.source_id = new.id");
    expect(migration).toContain("raise exception 'bio_content_is_archived'");
  });
  it("provides bounded metadata-only private pages with clear labels", () => {
    expect(readRpc).toContain("order by archived_at desc, source_id limit 20 offset p_offset");
    expect(readRpc).toContain("p_offset > 1000000 or p_offset % 20 <> 0");
    expect(readRpc).toContain("'Untitled portrait'"); expect(readRpc).toContain("'Untitled paragraph'");
    expect(readRpc).toContain("120");
    for (const forbidden of ["'row_data'", "'archived_by'", "'href'", "'src'"]) expect(readRpc).not.toContain(forbidden);
    expect(mutation).toContain("from public.admin_profiles where user_id = p_actor_id and is_active");
    expect(migration).toContain("grant execute on function public.get_bio_content_archive_v2(text,integer) to service_role");
    expect(migration).toContain("grant execute on function public.mutate_bio_content_archive_v2(text,text,text,jsonb,uuid,timestamptz) to service_role");
  });
  it("supplies nine read-only deployment checks including all prior collection invariants", () => {
    expect(checks.match(/union all/g)).toHaveLength(8);
    expect(checks).toContain("bio_archive_active_ids_do_not_overlap");
    expect(checks).toContain("bio_archive_parent_and_previous_guards_ready");
    expect(checks).toContain("bio_archive_media_references_registered");
    expect(checks).not.toMatch(/\b(?:insert|update|delete|alter)\s+(?:into|from|table|public\.)/i);
  });
  it("has isolated PostgreSQL runtime coverage for coupled CAS, rollback, Media and predecessor lifecycles", () => {
    expect(runtime).toContain("new PGlite()");
    for (const marker of ["deliberate_archive_failure", "deliberate_restore_failure", "replace_and_trash", "beforeRerun", "set role", "mutate_navbar_shortcut_archive_v2", "mutate_music_content_archive_v2", "save_bio_biography_v2", "save_bio_credits_v2", "same ID", "capacity", "ABA", "beforeMissing"]) expect(runtime).toContain(marker);
    expect(runtime).not.toContain("process.env");
  });
});
