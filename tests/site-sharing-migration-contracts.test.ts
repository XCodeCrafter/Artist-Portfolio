import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const migration = readFileSync(new URL("../supabase/migrations/0056_site_sharing_metadata.sql", import.meta.url), "utf8");
const checks = readFileSync(new URL("../supabase/checks/0056_site_sharing_metadata.sql", import.meta.url), "utf8");
const runtime = readFileSync(new URL("../scripts/test-site-sharing-migration.mjs", import.meta.url), "utf8");
describe("Sharing migration boundaries", () => {
  it("adds a private singleton without changing existing owner identity", () => {
    expect(migration).toContain("alter table public.site_sharing_config enable row level security");
    expect(migration).toContain("revoke all on table public.site_sharing_config from public, anon, authenticated, service_role");
    expect(migration).not.toMatch(/update public.site_settings|create policy/i);
    expect(migration).toContain("on conflict (id) do nothing");
  });
  it("protects both new and archived media references", () => {
    expect(migration).toContain("('site_sharing_config', 'Site sharing preview', array['payload'], array['payload'])");
    expect(migration).toContain("('content_archive_v2', 'Archived content', array['row_data'], array['row_data'])");
    expect(migration).toContain("for each row execute function public.guard_media_library_references_v2()");
    expect(migration).toContain("order by id for share");
  });
  it("publishes only exact safe projection while helpers and editor RPCs remain private", () => {
    const projection = migration.slice(migration.indexOf("create or replace function public.get_public_site_sharing_v2"), migration.indexOf("revoke all on function public.is_valid_site_sharing_v2"));
    expect(projection).not.toMatch(/updatedAt|'draft'|\b(?:update|insert|delete|execute)\b/i);
    expect(projection).toContain("public.is_available_site_sharing_image_v2");
    expect(migration).toContain("grant execute on function public.get_public_site_sharing_v2() to anon, authenticated, service_role");
    expect(migration).toContain("grant execute on function public.save_site_sharing_v2(text,timestamptz,jsonb) to service_role");
    expect(migration).not.toContain("grant execute on function public.validate_site_sharing_v2");
  });
  it("keeps CAS and validation in one locked transaction", () => {
    expect(migration).toContain("where id = 'main' for update");
    expect(migration).toContain("v_current is distinct from p_expected_updated_at");
    expect(migration).toContain("interval '1 microsecond'");
    expect(migration).toContain("new.payload := public.validate_site_sharing_v2(new.payload)");
  });
  it("includes isolated runtime verification and read-only rollout checks", () => {
    for (const marker of ["new PGlite()", "42501", "40001", "22023", "beforeRerun", "begin read only", "Unpublished cover", "Incompatible replacement"]) expect(runtime).toContain(marker);
    expect(runtime).not.toContain("process.env");
    expect(checks).not.toMatch(/^\s*(?:insert|update|delete|alter|create)\b/im);
    expect(checks.match(/select 'site_sharing_/g)).toHaveLength(10);
  });
});
