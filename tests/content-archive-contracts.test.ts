import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../supabase/migrations/0041_content_archive_navbar.sql", import.meta.url), "utf8");
const checks = readFileSync(new URL("../supabase/checks/0041_content_archive_navbar.sql", import.meta.url), "utf8");
const runtime = readFileSync(new URL("../scripts/test-content-archive-migration.mjs", import.meta.url), "utf8");
const mutation = migration.slice(migration.indexOf("create or replace function public.mutate_navbar_shortcut_archive_v2"));

describe("Content archive 13D.1 database contract", () => {
  it("installs a private, recoverable Navbar-only archive without a media deletion lifecycle", () => {
    expect(migration).toContain("collection = 'navbar-shortcuts'");
    expect(migration).toContain("unique (collection, source_id)");
    expect(migration).toContain("row_data ? 'id'");
    expect(migration).toContain("jsonb_typeof(row_data -> 'id') = 'string'");
    expect(migration).toContain("alter table public.content_archive_v2 enable row level security");
    expect(migration).toContain("revoke all on table public.content_archive_v2 from public, anon, authenticated, service_role");
    expect(migration).not.toMatch(/delete\s+from\s+(?:storage\.|public\.media_assets)/i);
    expect(migration).not.toMatch(/grant\s+(?:select|all)\s+on\s+table\s+public\.content_archive_v2/i);
  });
  it("matches the existing Navbar lock and Media's alphabetical content lock order", () => {
    expect(mutation).toContain("hashtextextended('navbar_social_links_v2:main', 0)");
    expect(mutation.indexOf("lock table public.content_archive_v2")).toBeLessThan(mutation.indexOf("lock table public.social_links"));
    expect(mutation.indexOf("lock table public.social_links")).toBeLessThan(mutation.indexOf("insert into public.content_archive_v2"));
  });
  it("checks active membership and all exact timestamps before any write", () => {
    expect(mutation).toContain("v_current_count <> (select count(*) from pg_catalog.jsonb_object_keys(p_expected_versions))");
    expect(mutation).toContain("where not (p_expected_versions ? social.id)");
    expect(mutation).toContain("social.updated_at is distinct from (p_expected_versions ->> social.id)::timestamptz");
    expect(mutation.indexOf("social.updated_at is distinct from")).toBeLessThan(mutation.indexOf("insert into public.content_archive_v2"));
    expect(mutation).toContain("v_archive.updated_at is distinct from p_expected_archive_updated_at");
  });
  it("restores hidden within capacity and invalidates pre-archive CAS tokens", () => {
    expect(mutation).toContain("v_current_count >= 16");
    expect(mutation).toContain("v_source.is_published := false");
    expect(mutation).toContain("v_source.updated_at + interval '1 microsecond'");
    expect(mutation).toContain("v_archive.updated_at + interval '1 microsecond'");
    expect(mutation.indexOf("delete from public.content_archive_v2")).toBeLessThan(mutation.indexOf("insert into public.social_links select"));
    expect(mutation).toContain("public.get_navbar_social_links_v2_snapshot('main')");
  });
  it("guards archived source IDs and keeps media reference / replacement parity", () => {
    expect(migration).toContain("'content_archive_v2', 'Archived content', array['row_data'], array['row_data']");
    expect(migration).toContain("before insert or update on public.content_archive_v2");
    expect(migration).toContain("before insert or update on public.social_links");
    expect(migration).toContain("raise exception 'navbar_shortcut_is_archived'");
    expect(migration).toContain("execute function public.guard_media_library_references_v2()");
  });
  it("limits archive disclosure to 20 metadata records, without raw payloads or actor IDs", () => {
    const readRpc = migration.slice(migration.indexOf("create or replace function public.get_navbar_shortcut_archive_v2"), migration.indexOf("create or replace function public.mutate_navbar_shortcut_archive_v2"));
    expect(readRpc).toContain("order by archived_at desc, source_id limit 20 offset p_offset");
    expect(readRpc).toContain("p_offset > 1000000 or p_offset % 20 <> 0");
    expect(readRpc).toContain("'total'");
    expect(readRpc).not.toContain("'row_data'");
    expect(readRpc).not.toContain("'archived_by'");
    expect(readRpc).not.toContain("'href'");
  });
  it("authorizes active admins through service-only RPCs and preserves the established save function", () => {
    expect(mutation).toContain("from public.admin_profiles where user_id = p_actor_id and is_active");
    expect(migration).toContain("grant execute on function public.get_navbar_shortcut_archive_v2(integer) to service_role");
    expect(migration).toContain("grant execute on function public.mutate_navbar_shortcut_archive_v2(text,text,jsonb,uuid,timestamptz) to service_role");
    expect(migration).not.toContain("create or replace function public.save_navbar_social_links_v2");
    expect(checks).toContain("archive_table_private_and_rls");
    expect(checks).toContain("archive_active_ids_do_not_overlap");
  });
  it("has an isolated real-PostgreSQL verification covering atomic failures and archive media replacement", () => {
    expect(runtime).toContain("new PGlite()");
    expect(runtime).toContain("deliberate_archive_failure");
    expect(runtime).toContain("deliberate_restore_failure");
    expect(runtime).toContain('"replace_and_trash"');
    expect(runtime).toContain("beforeRerun");
    expect(runtime).toContain("set role");
    expect(runtime).not.toContain("process.env");
  });
});
