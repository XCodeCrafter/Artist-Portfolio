import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../supabase/migrations/0045_contact_optional_copy.sql", import.meta.url), "utf8");
const predecessor = readFileSync(new URL("../supabase/migrations/0033_contact_page_editor.sql", import.meta.url), "utf8");
const checks = readFileSync(new URL("../supabase/checks/0045_contact_optional_copy.sql", import.meta.url), "utf8");
const runtime = readFileSync(new URL("../scripts/test-contact-optional-copy-migration.mjs", import.meta.url), "utf8");
const body = (sql: string) => {
  const start = sql.indexOf("create or replace function public.save_contact_details_v2(");
  return sql.slice(start, sql.indexOf("$$;", start) + 3).replaceAll("\r\n", "\n");
};
const details = body(migration);
const capability = migration.slice(migration.indexOf("create or replace function public.get_contact_copy_capabilities_v2()"), migration.indexOf("revoke all on function"));

describe("Contact optional copy 13E database contract", () => {
  it("changes exactly the two minimum lengths in the existing save RPC", () => {
    expect(details).toBe(body(predecessor)
      .replace("char_length(pg_catalog.btrim(p_payload ->> 'location')) not between 1 and 220", "char_length(pg_catalog.btrim(p_payload ->> 'location')) > 220")
      .replace("char_length(pg_catalog.btrim(p_payload ->> 'contactBlurb')) not between 1 and 1000", "char_length(pg_catalog.btrim(p_payload ->> 'contactBlurb')) > 1000"));
  });
  it("requires the predecessor RPCs and the main settings parent without creating content", () => {
    const setup = migration.slice(0, migration.indexOf("create or replace function"));
    for (const name of ["get_contact_page_v2_snapshot", "save_contact_hero_v2", "save_contact_details_v2"]) expect(setup).toContain(`public.${name}(`);
    expect(setup).toContain("not exists(select 1 from public.site_settings where id = 'main')");
    expect(setup).toContain("contact_optional_copy_requires_0033_and_main_settings");
    expect(setup).not.toMatch(/\b(?:insert|update|delete)\s+(?:into|from|public\.)/i);
    expect(migration).not.toMatch(/create\s+table|delete\s+from|insert\s+into/i);
  });
  it("retains exact string fields, upper limits and trimming, not NULL or omission semantics", () => {
    expect(details).toContain("not (p_payload ?& array['location', 'contactBlurb'])");
    expect(details).toContain("where supplied.key not in ('location', 'contactBlurb')");
    expect(details).toContain("jsonb_typeof(p_payload -> 'location') is distinct from 'string'");
    expect(details).toContain("jsonb_typeof(p_payload -> 'contactBlurb') is distinct from 'string'");
    expect(details).toContain("char_length(pg_catalog.btrim(p_payload ->> 'location')) > 220");
    expect(details).toContain("char_length(pg_catalog.btrim(p_payload ->> 'contactBlurb')) > 1000");
    expect(details).toContain("set location = pg_catalog.btrim(p_payload ->> 'location')");
    expect(details).toContain("contact_blurb = pg_catalog.btrim(p_payload ->> 'contactBlurb')");
  });
  it("retains the shared settings row CAS, original lock namespace and failure codes", () => {
    expect(details).toContain("pg_catalog.hashtextextended('contact_page_v2:details:main', 0)");
    expect(details).toContain("from public.site_settings as settings");
    expect(details).toContain("for update;");
    expect(details).toContain("v_current_version is distinct from p_expected_updated_at");
    expect(details).toContain("contact_page_snapshot_missing");
    expect(details).toContain("using errcode = '23503'");
    expect(details).toContain("contact_details_changed");
    expect(details).toContain("using errcode = '40001'");
    expect(details).toContain("'versions', pg_catalog.jsonb_build_object('updatedAt', v_version)");
  });
  it("exposes one content-free immutable capability without querying or writing user data", () => {
    expect(capability).toContain("language sql\nimmutable\nsecurity definer\nset search_path = ''");
    expect(capability).toContain("select pg_catalog.jsonb_build_object('optionalDetails', true);");
    expect(capability).not.toMatch(/\b(?:insert|update|delete|from)\b/i);
    expect(capability).not.toContain("site_settings");
  });
  it("limits both RPCs to service_role and preserves unrelated Contact functions", () => {
    for (const signature of ["save_contact_details_v2(text, timestamptz, jsonb)", "get_contact_copy_capabilities_v2()"]) {
      expect(migration).toContain(`revoke all on function public.${signature}\nfrom public, anon, authenticated, service_role;`);
      expect(migration).toContain(`grant execute on function public.${signature}\nto service_role;`);
    }
    expect(migration).not.toContain("create or replace function public.save_contact_hero_v2");
    expect(migration).not.toContain("create or replace function public.get_contact_page_v2_snapshot");
    expect(migration).not.toContain("update public.booking_inquiries");
    expect(migration.trim().endsWith("commit;")).toBe(true);
  });
  it("provides six read-only rollout checks including parent, capability and privileges", () => {
    expect(checks.match(/union all/g)).toHaveLength(5);
    for (const name of ["contact_optional_copy_parent_ready", "contact_optional_copy_capability_ready", "contact_optional_copy_rpcs_service_only", "contact_optional_copy_fixed_search_paths", "contact_optional_copy_empty_text_and_limits", "contact_optional_copy_shared_settings_cas"]) expect(checks).toContain(name);
    expect(checks).not.toMatch(/^\s*(?:insert|update|delete|alter|create)\b/im);
  });
  it("has isolated PostgreSQL coverage for empty copy, concurrency, compatibility and private access", () => {
    expect(runtime).toContain("new PGlite()");
    for (const marker of ["beforeMigration", "beforeRerun", "beforeAppearance", "staleAppearance", "beforeMissing", "originalHero", "originalSnapshot", "originalTrigger", "inquiryBefore", "set role", "repeat(220)", "repeat(221)", "repeat(1000)", "repeat(1001)"]) expect(runtime).toContain(marker);
    expect(runtime).not.toContain("process.env");
  });
});
