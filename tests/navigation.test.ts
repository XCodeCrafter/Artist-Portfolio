import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  NAVIGATION_DESTINATION_KEYS,
  NAVIGATION_DESTINATIONS,
  MIXED_REVIEW_NAVIGATION_KEYS,
  PUBLIC_PORTFOLIO_PATHS,
  createMixedReviewNavigationConfig,
  createLegacyNavigationConfig,
  getActiveNavigationKey,
  getVisiblePublicPageNavigationItems,
  getVisiblePublicNavigationItems,
  isMissingNavigationSchemaError,
  mergeStoredNavigationRows,
  normalizeNavigationConfigVersion,
  normalizeNavigationTarget,
  resolveNavigationConfig,
  splitNavigationOverflow,
  validateNavigationRegistry,
} from "@/lib/content/navigation";
import type {
  NavigationDestinationDefinition,
  StoredNavigationRow,
} from "@/lib/content/navigation";

function visibleItems(
  config: ReturnType<typeof createLegacyNavigationConfig>
) {
  return config.items
    .filter((item) => item.isVisible)
    .map(({ key, defaultLabel, href }) => ({ key, label: defaultLabel, href }));
}

describe("navigation destination registry", () => {
  it("contains the exact curated destination contract", () => {
    expect(NAVIGATION_DESTINATION_KEYS).toEqual([
      "home",
      "home.about",
      "home.cnc",
      "home.stories",
      "bio",
      "bio.resume",
      "gallery",
      "music",
      "music.platforms",
      "music.spotify",
      "music.soundcloud",
      "works",
      "contact",
    ]);
    expect(validateNavigationRegistry()).toEqual([]);
  });

  it("owns unique internal pathname and fragment targets", () => {
    const normalizedTargets = NAVIGATION_DESTINATIONS.map((destination) =>
      normalizeNavigationTarget(destination.href)
    );

    expect(new Set(normalizedTargets).size).toBe(normalizedTargets.length);
    expect(() => normalizeNavigationTarget("//example.com/work")).toThrow();
    expect(() => normalizeNavigationTarget("https://example.com/work")).toThrow();
    expect(() => normalizeNavigationTarget("/bio?admin=true")).toThrow();
    expect(() => normalizeNavigationTarget("/bio#not a fragment")).toThrow();
  });

  it("reports duplicate registry identities, targets, and order values", () => {
    const first = NAVIGATION_DESTINATIONS[0];
    const duplicate: NavigationDestinationDefinition = {
      ...first,
      href: "/",
    };

    expect(validateNavigationRegistry([first, duplicate])).toEqual(
      expect.arrayContaining([
        "Duplicate navigation key: home",
        "Duplicate navigation target: /",
        "Duplicate navigation order: 10",
      ])
    );
  });
});

describe("legacy navigation compatibility", () => {
  it("matches the musician menu and its legacy labels", () => {
    expect(visibleItems(createLegacyNavigationConfig("musician"))).toEqual([
      { key: "home", label: "HOME", href: "/" },
      { key: "bio", label: "BIO", href: "/bio" },
      { key: "music", label: "MUSIC", href: "/music" },
      { key: "works", label: "VIDEO", href: "/video" },
      { key: "contact", label: "BOOKING", href: "/booking" },
    ]);
  });

  it("matches the actor menu and respects hidden legacy page slugs", () => {
    expect(
      visibleItems(
        createLegacyNavigationConfig("actor", ["gallery", "booking"])
      )
    ).toEqual([
      { key: "home", label: "HOME", href: "/" },
      { key: "bio", label: "BIO", href: "/bio" },
      { key: "works", label: "SHOWREEL", href: "/video" },
    ]);
  });

  it("keeps version 0 authoritative even when shadow rows exist", () => {
    const config = resolveNavigationConfig({
      version: 0,
      portfolioType: "actor",
      rows: [
        {
          destination_key: "music",
          is_visible: true,
          sort_order: 10,
          updated_at: "2026-09-02T10:00:00.000Z",
        },
      ],
    });

    expect(config.source).toBe("legacy");
    expect(config.items.find((item) => item.key === "music")?.isVisible).toBe(
      false
    );
    expect(config.items.find((item) => item.key === "gallery")?.isVisible).toBe(
      true
    );
    expect(config.persistedItems.find((item) => item.key === "music")).toMatchObject({
      isVisible: true,
      sortOrder: 10,
      updatedAt: "2026-09-02T10:00:00.000Z",
      isPersisted: true,
    });
  });

  it("uses the legacy menu when the additive table is absent before activation", () => {
    const config = resolveNavigationConfig({
      version: 0,
      portfolioType: "musician",
      error: {
        code: "42P01",
        message: 'relation "site_navigation_items" does not exist',
      },
    });

    expect(config.source).toBe("legacy");
    expect(config.migrationRequired).toBe(true);
    expect(
      config.items.filter((item) => item.isVisible).map((item) => item.key)
    ).toEqual(["home", "bio", "music", "works", "contact"]);
  });
});

describe("stored navigation resolution", () => {
  const mixedRows: StoredNavigationRow[] = [
    {
      destination_key: "music",
      is_visible: true,
      sort_order: 10,
      updated_at: "2026-09-02T10:00:00.000Z",
    },
    {
      destination_key: "gallery",
      is_visible: true,
      sort_order: 20,
      updated_at: "2026-09-02T10:00:00.000Z",
    },
    {
      destination_key: "works",
      is_visible: false,
      sort_order: 30,
      updated_at: "2026-09-02T10:00:00.000Z",
    },
  ];

  it("uses a mixed Gallery and Music menu in persisted order for version 1", () => {
    const config = resolveNavigationConfig({
      version: 1,
      portfolioType: "actor",
      rows: mixedRows.filter((row) => row.is_visible),
      audience: "public",
    });

    expect(config.source).toBe("database");
    expect(
      config.items
        .filter((item) => item.isVisible)
        .map((item) => item.key)
    ).toEqual(["music", "gallery"]);
    expect(config.items.find((item) => item.key === "works")?.isVisible).toBe(
      false
    );
  });

  it("fills absent known destinations as hidden and surfaces unknown rows", () => {
    const merged = mergeStoredNavigationRows([
      ...mixedRows,
      {
        destination_key: "future.section",
        is_visible: true,
        sort_order: 40,
      },
      {
        destination_key: "music",
        is_visible: false,
        sort_order: 50,
      },
    ]);

    expect(merged.items).toHaveLength(NAVIGATION_DESTINATIONS.length);
    expect(merged.items.find((item) => item.key === "home")?.isVisible).toBe(
      false
    );
    expect(merged.unresolvedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: "unknown-destination" }),
        expect.objectContaining({ reason: "duplicate-destination" }),
      ])
    );
  });

  it("fails closed after activation for missing or unavailable storage", () => {
    const missing = resolveNavigationConfig({
      version: 1,
      portfolioType: "actor",
      error: {
        code: "PGRST205",
        message:
          "Could not find the table public.site_navigation_items in the schema cache",
      },
    });
    const unavailable = resolveNavigationConfig({
      version: 1,
      portfolioType: "actor",
      error: { code: "42501", message: "permission denied" },
    });

    expect(missing.source).toBe("database");
    expect(missing.migrationRequired).toBe(true);
    expect(missing.items.some((item) => item.isVisible)).toBe(false);
    expect(unavailable.source).toBe("database");
    expect(unavailable.degradedReason).toBe("load-error");
    expect(unavailable.items.some((item) => item.isVisible)).toBe(false);
  });

  it("does not reveal legacy links when an active table returns no rows", () => {
    const config = resolveNavigationConfig({
      version: 1,
      portfolioType: "musician",
      rows: [],
    });

    expect(config.source).toBe("database");
    expect(config.degradedReason).toBe("empty-active-navigation");
    expect(config.items.every((item) => !item.isVisible)).toBe(true);
  });
});

describe("mixed public review navigation", () => {
  it("opens every curated destination in the page-first review order", () => {
    const config = createMixedReviewNavigationConfig();

    expect(
      config.items
        .filter((item) => item.isVisible)
        .map((item) => item.key)
    ).toEqual(MIXED_REVIEW_NAVIGATION_KEYS);
  });

  it("applies content availability without unpublishing routes", () => {
    const config = createMixedReviewNavigationConfig();
    const withoutConditionalContent = getVisiblePublicNavigationItems(
      config.items,
      { hasPublishedCncPrograms: false, hasResumeContent: false }
    );
    const withConditionalContent = getVisiblePublicNavigationItems(
      config.items,
      { hasPublishedCncPrograms: true, hasResumeContent: true }
    );

    expect(withoutConditionalContent.map((item) => item.key)).not.toContain(
      "home.cnc"
    );
    expect(withoutConditionalContent.map((item) => item.key)).not.toContain(
      "bio.resume"
    );
    expect(withConditionalContent.map((item) => item.key)).toEqual(
      MIXED_REVIEW_NAVIGATION_KEYS
    );
    expect(PUBLIC_PORTFOLIO_PATHS).toEqual([
      "/",
      "/bio",
      "/gallery",
      "/music",
      "/video",
      "/booking",
    ]);
    expect(PUBLIC_PORTFOLIO_PATHS.every((path) => !path.includes("#"))).toBe(
      true
    );
  });

  it("keeps section destinations out of the public primary navbar", () => {
    const primaryItems = getVisiblePublicPageNavigationItems(
      createMixedReviewNavigationConfig().items,
      { hasPublishedCncPrograms: true, hasResumeContent: true }
    );

    expect(primaryItems.map((item) => item.key)).toEqual([
      "home",
      "bio",
      "gallery",
      "music",
      "works",
      "contact",
    ]);
    expect(primaryItems.every((item) => item.kind === "page")).toBe(true);
    expect(primaryItems.every((item) => !item.href.includes("#"))).toBe(true);
  });

  it("prefers an exact visible section and otherwise falls back to its page", () => {
    const items = getVisiblePublicNavigationItems(
      createMixedReviewNavigationConfig().items,
      { hasPublishedCncPrograms: true, hasResumeContent: true }
    );

    expect(getActiveNavigationKey(items, "/music/", "#spotify-releases")).toBe(
      "music.spotify"
    );
    expect(getActiveNavigationKey(items, "/music", "#unknown")).toBe("music");
    expect(getActiveNavigationKey(items, "/gallery", "")).toBe("gallery");
  });

  it("keeps the overflow suffix complete and ordered", () => {
    const items = getVisiblePublicNavigationItems(
      createMixedReviewNavigationConfig().items,
      { hasPublishedCncPrograms: true, hasResumeContent: true }
    );
    const { directItems, overflowItems } = splitNavigationOverflow(items, 6);

    expect(directItems.map((item) => item.key)).toEqual([
      "home",
      "bio",
      "gallery",
      "music",
      "works",
      "contact",
    ]);
    expect(overflowItems.map((item) => item.key)).toEqual(
      MIXED_REVIEW_NAVIGATION_KEYS.slice(6)
    );
  });
});

describe("navigation schema compatibility", () => {
  it("keeps migration and fresh-install seed keys aligned with the registry", () => {
    const migration = readFileSync(
      new URL(
        "../supabase/migrations/0025_site_navigation_items.sql",
        import.meta.url
      ),
      "utf8"
    );
    const seed = readFileSync(
      new URL("../supabase/seed.sql", import.meta.url),
      "utf8"
    );
    const migrationKeys = [...migration.matchAll(/\('([^']+)', \d+::smallint,/g)].map(
      (match) => match[1]
    );
    const seedKeys = [
      ...seed.matchAll(/\('main', '([^']+)', (?:true|false), \d+\)/g),
    ].map((match) => match[1]);

    expect(migrationKeys).toEqual(NAVIGATION_DESTINATION_KEYS);
    expect(seedKeys).toEqual(MIXED_REVIEW_NAVIGATION_KEYS);
  });

  it("activates the review preset and adds visitor-selected intent additively", () => {
    const migration = readFileSync(
      new URL(
        "../supabase/migrations/0026_mixed_public_portfolio.sql",
        import.meta.url
      ),
      "utf8"
    );

    expect(migration).toContain("set navigation_config_version = 1");
    expect(migration).toContain("add column if not exists inquiry_intent text");
    expect(migration).toContain("inquiry_intent in ('music', 'acting', 'general')");
    expect(migration).not.toMatch(/update\s+public\.booking_inquiries\s+set/i);
  });

  it("normalizes activation versions conservatively", () => {
    expect(normalizeNavigationConfigVersion(1)).toBe(1);
    expect(normalizeNavigationConfigVersion(0)).toBe(0);
    expect(normalizeNavigationConfigVersion(undefined)).toBe(0);
    expect(normalizeNavigationConfigVersion(2)).toBe("unsupported");
    expect(normalizeNavigationConfigVersion("1")).toBe("unsupported");
  });

  it("fails closed for a future unsupported activation version", () => {
    const config = resolveNavigationConfig({
      version: "unsupported",
      portfolioType: "actor",
      rows: [
        { destination_key: "gallery", is_visible: true, sort_order: 10 },
      ],
    });

    expect(config.source).toBe("database");
    expect(config.degradedReason).toBe("unsupported-version");
    expect(config.items.every((item) => !item.isVisible)).toBe(true);
  });

  it("recognizes only the navigation table missing cases", () => {
    expect(
      isMissingNavigationSchemaError({
        code: "42P01",
        message: 'relation "site_navigation_items" does not exist',
      })
    ).toBe(true);
    expect(
      isMissingNavigationSchemaError({
        code: "PGRST205",
        message: "Could not find public.site_navigation_items in the schema cache",
      })
    ).toBe(true);
    expect(
      isMissingNavigationSchemaError({
        code: "42501",
        message: "permission denied for site_navigation_items",
      })
    ).toBe(false);
    expect(
      isMissingNavigationSchemaError({
        code: "42P01",
        message: 'relation "unrelated_table" does not exist',
      })
    ).toBe(false);
  });
});
