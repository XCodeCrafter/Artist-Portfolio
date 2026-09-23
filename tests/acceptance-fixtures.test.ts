import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseHomeEditorDraft, parseHomeSectionSubmission } from "../lib/admin/home-editor";
import {
  ACCEPTANCE_BOOTSTRAP_SQL, ACCEPTANCE_SEED_SQL, ACCEPTANCE_HOME_DRAFT,
  ACCEPTANCE_HERO_SLUGS, ACCEPTANCE_MEDIA, ACCEPTANCE_OWNER_EMAIL,
} from "../scripts/acceptance/fixtures.mjs";

const config = readFileSync(new URL("../scripts/acceptance/config.toml", import.meta.url), "utf8");

describe("isolated acceptance fixtures", () => {
  it("uses dedicated ports/project and the loopback app with real MFA and closed signup", () => {
    expect(config).toContain('project_id = "artist-portfolio-acceptance"');
    for (const port of [55430, 55431, 55432, 55433, 55434]) expect(config).toContain(`= ${port}`);
    expect(config).toContain('site_url = "http://127.0.0.1:3101"');
    expect(config).toContain('additional_redirect_urls = ["http://127.0.0.1:3101/admin/auth/callback"]');
    const auth = config.split("[auth]\n")[1]?.split("\n[auth.email]")[0];
    const email = config.split("[auth.email]\n")[1]?.split("\n[auth.mfa.totp]")[0];
    expect(auth).toMatch(/^enable_signup = false$/m);
    expect(email).toMatch(/^enable_signup = true$/m);
    expect(config).toContain("enable_anonymous_sign_ins = false");
    expect(config).toContain("[auth.mfa.totp]\nenroll_enabled = true\nverify_enabled = true");
    expect(config).not.toMatch(/3000|3001|supabase\.co/);
  });

  it("bootstraps the required main row before 0045 without importing owner data", () => {
    expect(ACCEPTANCE_BOOTSTRAP_SQL).toContain("acceptance_bootstrap_requires_empty_fixture_database");
    expect(ACCEPTANCE_BOOTSTRAP_SQL).toContain("exists(select 1 from auth.users)");
    expect(ACCEPTANCE_BOOTSTRAP_SQL).toContain("create schema acceptance_fixture_private");
    expect(ACCEPTANCE_BOOTSTRAP_SQL).toContain("insert into public.site_settings");
    for (const slug of ACCEPTANCE_HERO_SLUGS) expect(ACCEPTANCE_BOOTSTRAP_SQL).toContain(`('${slug}',`);
    expect(new Set(ACCEPTANCE_HERO_SLUGS).size).toBe(6);
  });

  it("refuses seed on an unmarked database, changed identity or existing Auth accounts", () => {
    expect(ACCEPTANCE_SEED_SQL).toContain("acceptance_fixture_private.marker");
    expect(ACCEPTANCE_SEED_SQL).toContain("artist_name = 'Acceptance Artist'");
    expect(ACCEPTANCE_SEED_SQL).toContain("exists(select 1 from auth.users)");
    expect(ACCEPTANCE_SEED_SQL).toContain("exists(select 1 from public.admin_profiles)");
    expect(ACCEPTANCE_SEED_SQL).toContain("acceptance_seed_requires_fresh_marked_fixture_database");
    expect(ACCEPTANCE_SEED_SQL.indexOf("raise exception")).toBeLessThan(ACCEPTANCE_SEED_SQL.indexOf("update public."));
  });

  it("keeps media synthetic/local and emails/links in reserved test domains", () => {
    expect(ACCEPTANCE_OWNER_EMAIL).toBe("owner@portfolio.test");
    for (const value of Object.values(ACCEPTANCE_MEDIA)) expect(value).toMatch(/^\/acceptance-fixtures\/[a-z]+\.png$/);
    const all = ACCEPTANCE_BOOTSTRAP_SQL + ACCEPTANCE_SEED_SQL;
    expect(all).not.toMatch(/Franky|Fugazi|spotify\.com|soundcloud\.com|imagekit\.io|supabase\.co|\/images\/|\/media\/hero/);
    for (const match of all.matchAll(/https?:\/\/[^'\s]+/g)) expect(new URL(match[0]).hostname).toMatch(/\.test$/);
    expect(all).not.toMatch(/insert into auth\.|update auth\.|delete from|truncate |disable trigger|alter.*policy|jwt_secret/i);
  });

  it("passes the actual strict Home draft and every section submission schema", () => {
    expect(parseHomeEditorDraft(ACCEPTANCE_HOME_DRAFT)).not.toBeNull();
    const versions = { updatedAt: "2026-09-22T12:00:00.000Z" };
    for (const [section, value] of Object.entries(ACCEPTANCE_HOME_DRAFT)) {
      expect(parseHomeSectionSubmission(section, value, versions), section).toMatchObject({ success: true });
    }
    expect(ACCEPTANCE_HOME_DRAFT.stories.images).toHaveLength(4);
  });

  it("supplies all singleton prerequisites and disposable collection/reference coverage", () => {
    for (const table of ["bio_profile", "bio_paragraphs", "bio_gallery_images", "actor_resume", "actor_credits", "gallery_images", "gallery_presentation", "music_presentation", "music_platform_links", "social_links", "media_assets", "home_page_config", "booking_inquiries"])
      expect(ACCEPTANCE_SEED_SQL).toContain(`public.${table}`);
    expect(ACCEPTANCE_SEED_SQL).toContain("'acceptance-portrait'");
    expect(ACCEPTANCE_SEED_SQL).toContain("'acceptance-landscape'");
    expect(ACCEPTANCE_SEED_SQL).not.toMatch(/clip\.(webm|mp4)|insert into public\.videos/);
    expect(ACCEPTANCE_HOME_DRAFT.feature.videoSrc).toBe("");
    expect(ACCEPTANCE_SEED_SQL).toContain("hero_media_framing = null");
  });
});
