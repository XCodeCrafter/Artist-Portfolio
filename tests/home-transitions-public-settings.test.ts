import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPortfolioContent } from "@/lib/content";
import { FALLBACK_CONTENT } from "@/lib/content/fallback";

const mocks = vi.hoisted(() => ({ row: {} as Record<string, unknown>, available: true, select: vi.fn() }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(), cache: (fn: unknown) => fn }));
vi.mock("@/lib/content/photo-framing.server", () => ({ loadPublicPhotoFramings: async () => null }));
vi.mock("@/lib/content/site-sharing.server", () => ({ loadPublicSiteSharing: async () => null }));
vi.mock("@/lib/content/supabase", () => ({ createPublicContentClient: () => mocks.available ? {
  from: (table: string) => {
    const query = {
      select: (columns: string) => { if (table === "site_settings") mocks.select(columns); return query; },
      eq: () => query, order: () => query, limit: () => query,
      returns: async () => ({ data: table === "site_settings" ? [mocks.row] : [], error: null }),
    };
    return query;
  },
} : null }));

beforeEach(() => {
  vi.clearAllMocks(); mocks.available = true;
  mocks.row = { artist_name: "Saved owner", tagline: "Existing tagline", description: "Existing description", location: "Prague", contact_blurb: "Existing contact" };
});

describe("public Home transitions settings", () => {
  it.each([undefined, null, false, "false", "true", 0, 1, {}, []])("keeps missing or non-true stored flags OFF %#", async value => {
    if (value !== undefined) mocks.row.home_section_transitions_enabled = value;
    const content = await getPortfolioContent();
    expect(content.settings.homeSectionTransitionsEnabled).toBe(false);
    expect(content.settings.artistName).toBe("Saved owner");
    expect(mocks.select).toHaveBeenCalledExactlyOnceWith("*");
  });
  it("enables only a persisted true boolean and preserves other settings", async () => {
    mocks.row.home_section_transitions_enabled = true;
    const content = await getPortfolioContent();
    expect(content.settings).toMatchObject({ homeSectionTransitionsEnabled: true, artistName: "Saved owner", tagline: "Existing tagline" });
  });
  it("keeps local fallback OFF", async () => {
    mocks.available = false;
    expect(FALLBACK_CONTENT.settings.homeSectionTransitionsEnabled).toBe(false);
    expect((await getPortfolioContent()).settings.homeSectionTransitionsEnabled).toBe(false);
  });
});
