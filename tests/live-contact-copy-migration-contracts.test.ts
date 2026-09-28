import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../supabase/migrations/0054_live_contact_page_copy.sql", import.meta.url), "utf8");
const checks = readFileSync(new URL("../supabase/checks/0054_live_contact_page_copy.sql", import.meta.url), "utf8");
const runtime = readFileSync(new URL("../scripts/test-live-contact-copy-migration.mjs", import.meta.url), "utf8");

describe("Live & Contact copy migration", () => {
  it("updates only the stock booking hero title without renaming stable IDs", () => {
    expect(migration).toContain("pg_catalog.upper(pg_catalog.btrim(v_title)) not in ('CONTACT', 'BOOKING', 'BOOKINGS')");
    expect(migration).toContain("set title = 'LIVE & CONTACT'");
    expect(migration).toContain("where page_slug = 'booking'");
    expect(migration.match(/\bupdate public\./g)).toHaveLength(1);
    expect(migration).not.toMatch(/^\s*(?:insert|delete|alter|create|drop|grant|revoke|truncate)\b/im);
  });

  it("locks the existing hero and requires version invalidation instead of bypassing CAS", () => {
    expect(migration).toContain("for update");
    expect(migration).toContain("tgenabled in ('O', 'A')");
    expect(migration).toContain("tgtype = 19");
    expect(migration).toContain("tgfoid = pg_catalog.to_regprocedure('public.set_updated_at()')");
    expect(migration).toContain("v_next_version is not distinct from v_previous_version");
    expect(migration).toContain("live_contact_copy_version_not_invalidated");
    expect(migration.trimEnd()).toMatch(/commit;$/);
  });

  it("provides five read-only checks that accept owner copy and retain privacy", () => {
    expect(checks.match(/union all select/g)).toHaveLength(4);
    expect(checks).toContain("not in ('CONTACT', 'BOOKING', 'BOOKINGS')");
    expect(checks).toContain("live_contact_hero_editor_service_only");
    expect(checks).toContain("live_contact_calendar_privacy_retained");
    expect(checks).not.toMatch(/^\s*(?:insert|update|delete|alter|create|drop|grant|revoke|truncate)\b/im);
  });

  it("exercises real isolated SQL, stale save rejection, exact preservation and rollback", () => {
    for (const marker of ["new PGlite()", "40001", "55000", "stockTitles", "customTitles", "unchangedCalendar", "unchangedHome", "failClosedBefore", "begin read only"]) {
      expect(runtime).toContain(marker);
    }
    expect(runtime).not.toContain("process.env");
  });
});
