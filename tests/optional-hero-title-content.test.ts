import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPortfolioContent } from "@/lib/content";
import { getPublishedHomeDraft } from "@/lib/content/home.server";
import { createHomeDraftFromContent } from "@/lib/admin/home-editor";
import { FALLBACK_CONTENT } from "@/lib/content/fallback";

const mocks = vi.hoisted(() => ({ rows: {} as Record<string, Record<string, unknown>[]>, available: true, errorTable: "" }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(), cache: (fn: unknown) => fn }));
vi.mock("@/lib/content/photo-framing.server", () => ({ loadPublicPhotoFramings: async () => null }));
vi.mock("@/lib/content/site-sharing.server", () => ({ loadPublicSiteSharing: async () => null }));
vi.mock("@/lib/content/supabase", () => ({ createPublicContentClient: () => mocks.available ? {
  from: (table: string) => {
    const query = {
      select: () => query, eq: () => query, order: () => query, limit: () => query,
      returns: async () => ({ data: mocks.rows[table] ?? [], error: table === mocks.errorTable ? { code: "42501", message: "permission denied" } : null }),
    };
    return query;
  },
} : null }));

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("ALLOW_FALLBACK_CONTENT", "true"); // Vercel must still forbid fallback.
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.available = true;
  mocks.errorTable = "";
  mocks.rows = {
    site_settings: [{ artist_name: "Saved owner identity", tagline: "Saved tagline", description: "Saved description", location: "Prague", contact_blurb: "Saved contact" }],
    page_heroes: Object.entries(FALLBACK_CONTENT.heroes).map(([page, hero]) => ({
      page_slug: page, title: "", subtitle: "Owner subtitle", cta_label: "Explore", cta_href: "#owner-section",
      background_src: hero.backgroundSrc, poster_src: hero.posterSrc, media_type: hero.mediaType,
    })),
    about_home: [{ heading: "Saved about heading", body: "Saved biography", cta_label: "", cta_href: "", image_src: "", image_alt: "" }],
    bio_profile: [{ top_label: "Saved profile", intro_text: "Saved introduction", caption: "Saved caption" }],
  };
});
afterEach(() => vi.unstubAllEnvs());

describe("production public content with optional Hero titles", () => {
  it("preserves intentionally blank titles on every page without demo fallback", async () => {
    const content = await getPortfolioContent();
    expect(content.settings.artistName).toBe("Saved owner identity");
    expect(content.aboutHome.body).toBe("Saved biography");
    expect(content.bio.introText).toBe("Saved introduction");
    expect(content.galleryImages).toEqual([]);
    for (const hero of Object.values(content.heroes)) {
      expect(hero.title).toBe("");
      expect(hero.subtitle).toBe("Owner subtitle");
      expect(hero.ctaLabel).toBe("Explore");
      expect(hero.ctaHref).toBe("#owner-section");
    }
  });

  it("does not reinterpret historic whitespace-only saved titles as missing identity", async () => {
    for (const row of mocks.rows.page_heroes) row.title = " \t\n ";
    const content = await getPortfolioContent();
    expect(content.settings.artistName).toBe("Saved owner identity");
    expect(content.heroes.home.title).toBe(" \t\n ");
  });

  it.each([null, undefined, 42, false, {}, []])("still rejects malformed Home title instead of falling back (%j)", async title => {
    mocks.rows.page_heroes.find(row => row.page_slug === "home")!.title = title;
    await expect(getPortfolioContent()).rejects.toThrow("Published portfolio content is temporarily unavailable.");
  });

  it("still requires the Home hero row", async () => {
    mocks.rows.page_heroes = mocks.rows.page_heroes.filter(row => row.page_slug !== "home");
    await expect(getPortfolioContent()).rejects.toThrow("Published portfolio content is temporarily unavailable.");
  });

  it.each(["site_settings", "about_home", "bio_profile"])("still requires the published %s row", async table => {
    mocks.rows[table] = [];
    await expect(getPortfolioContent()).rejects.toThrow("Published portfolio content is temporarily unavailable.");
  });

  it.each(["", " \t ", null])("still requires the owner identity (%j)", async name => {
    mocks.rows.site_settings[0].artist_name = name;
    await expect(getPortfolioContent()).rejects.toThrow("Published portfolio content is temporarily unavailable.");
  });

  it("does not revive demo data on read failures or missing production configuration", async () => {
    mocks.errorTable = "page_heroes";
    await expect(getPortfolioContent()).rejects.toThrow("Published portfolio content is temporarily unavailable.");
    mocks.available = false;
    await expect(getPortfolioContent()).rejects.toThrow("Supabase is not configured");
  });

  it("keeps an empty saved Home heading through the real published Home reader", async () => {
    const draft = createHomeDraftFromContent(FALLBACK_CONTENT);
    draft.hero.title = "";
    draft.layout.reverse();
    draft.about.body = "Owner-authored content must remain intact.";
    mocks.rows.home_page_config = [{ draft }];
    const loaded = await getPublishedHomeDraft(await getPortfolioContent());
    expect(loaded).toEqual(draft);
    expect(loaded.hero.title).toBe("");
  });
});
