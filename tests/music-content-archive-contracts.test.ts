import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../supabase/migrations/0042_content_archive_music.sql", import.meta.url), "utf8");
const checks = readFileSync(new URL("../supabase/checks/0042_content_archive_music.sql", import.meta.url), "utf8");
const runtime = readFileSync(new URL("../scripts/test-music-content-archive-migration.mjs", import.meta.url), "utf8");
const mutation = migration.slice(migration.indexOf("create or replace function public.mutate_music_content_archive_v2"));

describe("Music content archive 13D.2 database contract", () => {
  it("extends only the known collection allowlist without rewriting old content or deleting files", () => {
    expect(migration).toContain("collection in ('navbar-shortcuts', 'music-platforms', 'music-soundcloud')");
    expect(migration).toContain("alter table public.content_archive_v2 enable row level security");
    expect(migration).toContain("revoke all on table public.content_archive_v2 from public, anon, authenticated, service_role");
    expect(migration).not.toMatch(/delete\s+from\s+(?:storage\.|public\.media_assets)/i);
    expect(migration).not.toMatch(/update\s+public\.music_presentation/i);
    expect(migration).not.toContain("create or replace function public.media_library_reference_registry_v2");
  });
  it("matches both existing Music save locks and protects the shared parent without editing it", () => {
    expect(mutation).toContain("hashtextextended('music_page_v2:platforms:main', 0)");
    expect(mutation).toContain("hashtextextended('music_page_v2:soundcloud:main', 0)");
    expect(mutation.indexOf("lock table public.content_archive_v2")).toBeLessThan(mutation.indexOf("lock table public.music_platform_links"));
    expect(mutation.indexOf("lock table public.soundcloud_tracks")).toBeLessThan(mutation.indexOf("from public.music_presentation where id = 'main' for update"));
    expect(mutation).toContain("v_presentation.updated_at is distinct from p_expected_presentation_updated_at");
  });
  it("compares whole active membership and exact row / archive timestamps before writes", () => {
    expect(mutation).toContain("v_current_count <> (select count(*) from pg_catalog.jsonb_object_keys(p_expected_versions))");
    expect(mutation).toContain("where not (p_expected_versions ? current_item.id)");
    expect(mutation).toContain("where not (v_current_versions ? expected.id)");
    expect(mutation).toContain("current_item.version::timestamptz is distinct from (p_expected_versions ->> current_item.id)::timestamptz");
    expect(mutation).toContain("v_archive.updated_at is distinct from p_expected_archive_updated_at");
  });
  it("restores only hidden rows within the per-section capacity and invalidates ABA", () => {
    expect(mutation).toContain("case p_section when 'platforms' then 32 else 48 end");
    expect(mutation).toContain("v_current_count >= v_limit");
    for (const row of ["v_platform", "v_track"]) {
      expect(mutation).toContain(`${row}.is_published := false`);
      expect(mutation).toContain(`${row}.updated_at + interval '1 microsecond'`);
    }
    expect(mutation).toContain("v_archive.updated_at + interval '1 microsecond'");
    expect(mutation).toContain("'canonicalSection', v_canonical, 'versions', v_versions");
  });
  it("guards both archived source IDs while preserving existing Navbar and ordinary saves", () => {
    expect(migration).toContain("before insert or update on public.music_platform_links");
    expect(migration).toContain("before insert or update on public.soundcloud_tracks");
    expect(migration).toContain("raise exception 'music_content_is_archived'");
    expect(migration).not.toMatch(/create or replace function public\.(?:save_music_|mutate_navbar_)/);
  });
  it("uses metadata-only, section-isolated pages of at most 20 items", () => {
    const readRpc = migration.slice(migration.indexOf("create or replace function public.get_music_content_archive_v2"), migration.indexOf("create or replace function public.mutate_music_content_archive_v2"));
    expect(readRpc).toContain("order by archived_at desc, source_id limit 20 offset p_offset");
    expect(readRpc).toContain("p_offset > 1000000 or p_offset % 20 <> 0");
    expect(readRpc).toContain("'Untitled mix'");
    expect(readRpc).not.toContain("'row_data'");
    expect(readRpc).not.toContain("'archived_by'");
    expect(readRpc).not.toContain("'href'");
  });
  it("requires service-only active-admin mutation and has deployment checks", () => {
    expect(mutation).toContain("from public.admin_profiles where user_id = p_actor_id and is_active");
    expect(migration).toContain("grant execute on function public.get_music_content_archive_v2(text,integer) to service_role");
    expect(migration).toContain("grant execute on function public.mutate_music_content_archive_v2(text,text,text,jsonb,uuid,timestamptz,timestamptz) to service_role");
    expect(checks.match(/union all/g)).toHaveLength(8);
    expect(checks).toContain("music_archive_active_ids_do_not_overlap");
  });
  it("has isolated real PostgreSQL tests for both collections and prior Navbar lifecycle", () => {
    expect(runtime).toContain("new PGlite()");
    for (const text of ["deliberate_archive_failure", "deliberate_restore_failure", "replace_and_trash", "beforeRerun", "set role", "mutate_navbar_shortcut_archive_v2", "save_music_soundcloud_v2"]) {
      expect(runtime).toContain(text);
    }
    expect(runtime).not.toContain("process.env");
  });
});
