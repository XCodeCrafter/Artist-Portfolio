import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  new URL(
    "../supabase/migrations/0033_contact_page_editor.sql",
    import.meta.url
  ),
  "utf8"
);
const classicContentActions = readFileSync(
  new URL("../app/admin/content/actions.ts", import.meta.url),
  "utf8"
);
const classicContentEditor = readFileSync(
  new URL("../components/admin/ContentEditor.tsx", import.meta.url),
  "utf8"
);
const readinessSource = readFileSync(
  new URL("../lib/admin/readiness.ts", import.meta.url),
  "utf8"
);

function functionBody(name: string, nextName?: string) {
  const start = migrationSql.indexOf(
    `create or replace function public.${name}`
  );
  const end = nextName
    ? migrationSql.indexOf(
        `create or replace function public.${nextName}`,
        start + 1
      )
    : migrationSql.indexOf("revoke all on function", start + 1);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return migrationSql.slice(start, end);
}

describe("Batch 6D Contact migration contract", () => {
  it("repairs only a missing booking hero and never overwrites existing copy", () => {
    const repairEnd = migrationSql.indexOf(
      "create or replace function public.get_contact_page_v2_snapshot"
    );
    const repair = migrationSql.slice(0, repairEnd);

    expect(repair).toContain("begin;");
    expect(repair).toContain("insert into public.page_heroes");
    expect(repair).toContain("'booking'");
    expect(repair).toContain("'CONTACT'");
    expect(repair).toContain("'LET''S WORK TOGETHER'");
    expect(repair).toContain("'/images/booking-hero.jpg'");
    expect(repair).toContain("on conflict (page_slug) do nothing;");
    expect(repair).not.toMatch(/on conflict[\s\S]*do update/i);
    expect(migrationSql).not.toMatch(/create\s+table/i);
  });

  it("returns one consistent hero and details snapshot with versions", () => {
    const snapshot = functionBody(
      "get_contact_page_v2_snapshot",
      "save_contact_hero_v2"
    );

    expect(snapshot).toContain("'hero', pg_catalog.jsonb_build_object(");
    expect(snapshot).toContain("'details', pg_catalog.jsonb_build_object(");
    expect(snapshot).toContain("'location', settings.location");
    expect(snapshot).toContain("'contactBlurb', settings.contact_blurb");
    expect(snapshot).toContain("'updatedAt', hero.updated_at");
    expect(snapshot).toContain("'updatedAt', settings.updated_at");
    expect(snapshot).toContain("from public.site_settings as settings");
    expect(snapshot).toContain("cross join public.page_heroes as hero");
    expect(snapshot).toContain("hero.page_slug = 'booking'");
    expect(snapshot).toContain("contact_page_snapshot_missing");
  });

  it("accepts only the exact Contact hero fields and enforces CTA pairing", () => {
    const hero = functionBody(
      "save_contact_hero_v2",
      "save_contact_details_v2"
    );

    for (const field of [
      "title",
      "subtitle",
      "ctaLabel",
      "ctaHref",
      "backgroundSrc",
      "posterSrc",
      "mediaType",
    ]) {
      expect(hero).toContain(`'${field}'`);
    }
    expect(hero).toContain("jsonb_object_keys(p_payload)");
    expect(hero).toContain("where supplied.key not in (");
    expect(hero).toContain("not between 1 and 220");
    expect(hero).toContain("not between 1 and 2048");
    expect(hero).toContain("(p_payload ->> 'mediaType') not in ('image', 'video')");
    expect(hero).toContain("(pg_catalog.btrim(p_payload ->> 'ctaLabel') = '') <>");
    expect(hero).toContain("'^#[A-Za-z][A-Za-z0-9_-]*$'");
    expect(hero).toContain("'^https://[^[:space:]/?#:@]+(:443)?([/?#]|$)'");
  });

  it("permits only local or live Media Library hero assets and locks them", () => {
    const hero = functionBody(
      "save_contact_hero_v2",
      "save_contact_details_v2"
    );

    expect(hero).toContain("from public.media_assets as background_asset");
    expect(hero).toContain("background_asset.media_type = p_payload ->> 'mediaType'");
    expect(hero).toContain("background_asset.deleted_at is null");
    expect(hero).toContain("from public.media_assets as poster_asset");
    expect(hero).toContain("poster_asset.media_type = 'image'");
    expect(hero.match(/for share;/g)).toHaveLength(2);
    expect(hero).toContain("contact_page_v2:hero:main");
  });

  it("saves only location and contact copy behind an optimistic row lock", () => {
    const details = functionBody("save_contact_details_v2");

    expect(details).toContain(
      "not (p_payload ?& array['location', 'contactBlurb'])"
    );
    expect(details).toContain(
      "where supplied.key not in ('location', 'contactBlurb')"
    );
    expect(details).toContain("p_payload -> 'location'");
    expect(details).toContain("p_payload -> 'contactBlurb'");
    expect(details).toContain(
      "char_length(pg_catalog.btrim(p_payload ->> 'location')) not between 1 and 220"
    );
    expect(details).toContain(
      "char_length(pg_catalog.btrim(p_payload ->> 'contactBlurb')) not between 1 and 1000"
    );
    expect(details).toContain("contact_page_v2:details:main");
    expect(details).toContain("from public.site_settings as settings");
    expect(details).toContain("for update;");
    expect(details).toContain("contact_details_changed");
    expect(details).toContain("using errcode = '40001';");
    expect(details).toContain("set location =");
    expect(details).toContain("contact_blurb =");
    expect(details).not.toContain("portfolio_type =");
  });

  it("never deletes content or inquiries", () => {
    expect(migrationSql).not.toMatch(/delete\s+from/i);
    expect(migrationSql).not.toMatch(/update\s+public[.]booking_inquiries/i);
    expect(migrationSql).not.toMatch(/insert\s+into\s+public[.]booking_inquiries/i);
  });

  it("exposes exactly three locked service-role RPCs", () => {
    for (const name of [
      "get_contact_page_v2_snapshot",
      "save_contact_hero_v2",
      "save_contact_details_v2",
    ]) {
      expect(migrationSql).toContain(`function public.${name}`);
    }
    expect(migrationSql.match(/security definer/g)).toHaveLength(3);
    expect(migrationSql.match(/set search_path = ''/g)).toHaveLength(3);
    expect(migrationSql.match(/from public, anon, authenticated, service_role;/g))
      .toHaveLength(3);
    expect(migrationSql.match(/to service_role;/g)).toHaveLength(3);
    expect(migrationSql.trim().endsWith("commit;")).toBe(true);
  });

  it("hands classic Contact writes to V2 once the snapshot RPC exists", () => {
    expect(classicContentActions).toContain("handOffLegacyContactWrite");
    expect(classicContentActions).toContain(
      'redirect("/admin/v2/pages/contact?from=classic")'
    );
    expect(
      classicContentActions.match(/await handOffLegacyContactWrite\(supabase\);/g)
    ).toHaveLength(2);
    expect(classicContentActions).toContain(
      'parsed.data.pageSlug === "booking"'
    );
    expect(classicContentEditor).toContain("Contact moved to V2");
    expect(classicContentEditor).toContain('href="/admin/v2/pages/contact"');
  });

  it("probes both Contact save grants without mutating content", () => {
    expect(readinessSource).toContain('supabase.rpc("save_contact_hero_v2"');
    expect(readinessSource).toContain('supabase.rpc("save_contact_details_v2"');
    expect(readinessSource.match(/p_site_id: "~schema-probe"/g)).toHaveLength(2);
    expect(readinessSource).toContain(
      'result.error?.code === "22023"'
    );
    expect(readinessSource).toContain("process.env.RESEND_API_KEY?.trim()");
  });
});
