import type { PageSlug, PortfolioType } from "./types";

export const NAVIGATION_CONFIG_VERSIONS = [0, 1] as const;

export type SupportedNavigationConfigVersion =
  (typeof NAVIGATION_CONFIG_VERSIONS)[number];
export type NavigationConfigVersion =
  | SupportedNavigationConfigVersion
  | "unsupported";

export type NavigationDestinationAvailability =
  | "available"
  | "conditional-cnc"
  | "conditional-resume"
  | "planned-anchor";

export type NavigationDestinationDefinition = {
  key: string;
  defaultLabel: string;
  description: string;
  href: string;
  pageSlug: PageSlug;
  kind: "page" | "section";
  availability: NavigationDestinationAvailability;
  defaultOrder: number;
};

/**
 * Curated application-owned destinations. Persisted navigation rows reference
 * these keys; URLs never come from the database or an admin text field.
 */
export const NAVIGATION_DESTINATIONS = [
  {
    key: "home",
    defaultLabel: "HOME",
    description: "The main actor and musician portfolio landing page.",
    href: "/",
    pageSlug: "home",
    kind: "page",
    availability: "available",
    defaultOrder: 10,
  },
  {
    key: "home.about",
    defaultLabel: "ABOUT",
    description: "A short introduction on the portfolio homepage.",
    href: "/#home-about",
    pageSlug: "home",
    kind: "section",
    availability: "available",
    defaultOrder: 20,
  },
  {
    key: "home.cnc",
    defaultLabel: "CNC",
    description: "Selected CNC programming work on the homepage.",
    href: "/#cnc-code",
    pageSlug: "home",
    kind: "section",
    availability: "conditional-cnc",
    defaultOrder: 30,
  },
  {
    key: "home.stories",
    defaultLabel: "STORIES",
    description: "Selected visual stories on the portfolio homepage.",
    href: "/#home-stories",
    pageSlug: "home",
    kind: "section",
    availability: "available",
    defaultOrder: 40,
  },
  {
    key: "bio",
    defaultLabel: "BIO",
    description: "Biography, creative background, and professional profile.",
    href: "/bio",
    pageSlug: "bio",
    kind: "page",
    availability: "available",
    defaultOrder: 50,
  },
  {
    key: "bio.resume",
    defaultLabel: "RESUME & CREDITS",
    description: "Acting resume, experience, and selected credits.",
    href: "/bio#resume",
    pageSlug: "bio",
    kind: "section",
    availability: "conditional-resume",
    defaultOrder: 60,
  },
  {
    key: "gallery",
    defaultLabel: "GALLERY",
    description: "Headshots, portraits, and selected visual work.",
    href: "/gallery",
    pageSlug: "gallery",
    kind: "page",
    availability: "available",
    defaultOrder: 70,
  },
  {
    key: "music",
    defaultLabel: "MUSIC",
    description: "Music platforms, releases, and selected mixes.",
    href: "/music",
    pageSlug: "music",
    kind: "page",
    availability: "available",
    defaultOrder: 80,
  },
  {
    key: "music.platforms",
    defaultLabel: "MUSIC PLATFORMS",
    description: "Official listening profiles across music platforms.",
    href: "/music#music-platforms",
    pageSlug: "music",
    kind: "section",
    availability: "available",
    defaultOrder: 90,
  },
  {
    key: "music.spotify",
    defaultLabel: "SPOTIFY",
    description: "Latest releases available on Spotify.",
    href: "/music#spotify-releases",
    pageSlug: "music",
    kind: "section",
    availability: "available",
    defaultOrder: 100,
  },
  {
    key: "music.soundcloud",
    defaultLabel: "SOUNDCLOUD",
    description: "Latest mixes available on SoundCloud.",
    href: "/music#soundcloud-mixes",
    pageSlug: "music",
    kind: "section",
    availability: "available",
    defaultOrder: 110,
  },
  {
    key: "works",
    defaultLabel: "SHOWREEL",
    description: "Showreel, scenes, music videos, and selected motion work.",
    href: "/video",
    pageSlug: "video",
    kind: "page",
    availability: "available",
    defaultOrder: 120,
  },
  {
    key: "contact",
    defaultLabel: "CONTACT",
    description: "Contact for acting, music, and general collaboration.",
    href: "/booking",
    pageSlug: "booking",
    kind: "page",
    availability: "available",
    defaultOrder: 130,
  },
] as const satisfies readonly NavigationDestinationDefinition[];

export type NavigationDestination =
  (typeof NAVIGATION_DESTINATIONS)[number];
export type NavigationDestinationKey = NavigationDestination["key"];

export const NAVIGATION_DESTINATION_KEYS = NAVIGATION_DESTINATIONS.map(
  (destination) => destination.key
) as NavigationDestinationKey[];

export const MIXED_REVIEW_NAVIGATION_KEYS = [
  "home",
  "bio",
  "gallery",
  "music",
  "works",
  "contact",
  "home.about",
  "home.cnc",
  "home.stories",
  "bio.resume",
  "music.platforms",
  "music.spotify",
  "music.soundcloud",
] as const satisfies readonly NavigationDestinationKey[];

/** Canonical public pages stay published even when their navbar item is hidden. */
export const PUBLIC_PORTFOLIO_PAGE_DESTINATIONS = NAVIGATION_DESTINATIONS.filter(
  (destination) => destination.kind === "page"
) as readonly NavigationDestination[];

export const PUBLIC_PORTFOLIO_PATHS = PUBLIC_PORTFOLIO_PAGE_DESTINATIONS.map(
  (destination) => destination.href
);

export type StoredNavigationRow = {
  destination_key: string;
  is_visible: boolean;
  sort_order: number;
  updated_at?: string | null;
};

export type NavigationItem = NavigationDestinationDefinition & {
  key: NavigationDestinationKey;
  isVisible: boolean;
  sortOrder: number;
  updatedAt: string | null;
  isPersisted: boolean;
};

export type UnresolvedNavigationItem = {
  row: StoredNavigationRow;
  reason: "unknown-destination" | "duplicate-destination" | "invalid-row";
};

export type NavigationDegradedReason =
  | "missing-schema"
  | "load-error"
  | "empty-active-navigation"
  | "incomplete-catalog"
  | "unsupported-version";

export type NavigationConfig = {
  /** Effective items used by the currently active navigation version. */
  items: NavigationItem[];
  /** Persisted shadow/active rows for V2 editing and conflict detection. */
  persistedItems: NavigationItem[];
  unresolvedItems: UnresolvedNavigationItem[];
  source: "legacy" | "database";
  migrationRequired: boolean;
  isIncomplete: boolean;
  degradedReason?: NavigationDegradedReason;
};

export type NavigationAvailabilityContext = {
  hasPublishedCncPrograms: boolean;
  hasResumeContent: boolean;
};

/**
 * Applies only runtime availability. Visibility comes from the saved navbar
 * configuration; neither rule controls whether the underlying route exists.
 */
export function getVisiblePublicNavigationItems(
  items: readonly NavigationItem[],
  context: NavigationAvailabilityContext
) {
  return items
    .filter((item) => {
      if (!item.isVisible) return false;
      if (item.availability === "conditional-cnc") {
        return context.hasPublishedCncPrograms;
      }
      if (item.availability === "conditional-resume") {
        return context.hasResumeContent;
      }

      return item.availability === "available";
    })
    .sort((left, right) =>
      left.sortOrder === right.sortOrder
        ? left.key.localeCompare(right.key)
        : left.sortOrder - right.sortOrder
    );
}

/**
 * The primary navbar intentionally links to pages only. Section destinations
 * remain available to the admin editor and as deep links, but do not clutter
 * the public header with anchors visitors can already reach inside each page.
 */
export function getVisiblePublicPageNavigationItems(
  items: readonly NavigationItem[],
  context: NavigationAvailabilityContext
) {
  return getVisiblePublicNavigationItems(items, context).filter(
    (item) => item.kind === "page"
  );
}

function normalizePublicPathname(value: string) {
  return value.length > 1 ? value.replace(/\/+$/, "") : value || "/";
}

function splitPublicNavigationTarget(href: string) {
  const [pathname, fragment = ""] = href.split("#", 2);
  return {
    pathname: normalizePublicPathname(pathname || "/"),
    hash: fragment ? `#${fragment}` : "",
  };
}

/** Exact visible section wins; unknown hashes fall back to the route item. */
export function getActiveNavigationKey(
  items: readonly Pick<NavigationItem, "href" | "key" | "kind">[],
  pathname: string,
  currentHash: string
): NavigationDestinationKey | null {
  const normalizedPathname = normalizePublicPathname(pathname);
  const section = items.find((item) => {
    if (item.kind !== "section") return false;
    const target = splitPublicNavigationTarget(item.href);
    return (
      target.pathname === normalizedPathname && target.hash === currentHash
    );
  });
  if (section) return section.key;

  return (
    items.find((item) => {
      if (item.kind !== "page") return false;
      return (
        splitPublicNavigationTarget(item.href).pathname === normalizedPathname
      );
    })?.key ?? null
  );
}

export function splitNavigationOverflow<T>(
  items: readonly T[],
  directCount: number
) {
  const safeCount = Math.max(0, Math.floor(directCount));
  return {
    directItems: items.slice(0, safeCount),
    overflowItems: items.slice(safeCount),
  };
}

type NavigationReadError = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
};

type ResolveNavigationConfigInput = {
  version: NavigationConfigVersion;
  rows?: readonly StoredNavigationRow[] | null;
  error?: unknown;
  portfolioType: PortfolioType;
  hiddenPageSlugs?: readonly PageSlug[];
  audience?: "public" | "admin";
};

type MergedNavigationRows = {
  items: NavigationItem[];
  unresolvedItems: UnresolvedNavigationItem[];
  knownRowCount: number;
};

const NAVIGATION_DESTINATION_MAP = new Map<
  NavigationDestinationKey,
  NavigationDestination
>(
  NAVIGATION_DESTINATIONS.map((destination) => [
    destination.key,
    destination,
  ])
);

const LEGACY_PROFILE_KEYS: Record<
  PortfolioType,
  readonly NavigationDestinationKey[]
> = {
  actor: ["home", "bio", "gallery", "works", "contact"],
  musician: ["home", "bio", "music", "works", "contact"],
};

function isNavigationDestinationKey(
  value: string
): value is NavigationDestinationKey {
  return NAVIGATION_DESTINATION_MAP.has(value as NavigationDestinationKey);
}

function isStoredNavigationRow(value: unknown): value is StoredNavigationRow {
  if (!value || typeof value !== "object") return false;

  const row = value as Partial<StoredNavigationRow>;
  return (
    typeof row.destination_key === "string" &&
    typeof row.is_visible === "boolean" &&
    Number.isInteger(row.sort_order) &&
    Number(row.sort_order) >= 10 &&
    Number(row.sort_order) <= 9999 &&
    (row.updated_at === undefined ||
      row.updated_at === null ||
      typeof row.updated_at === "string")
  );
}

function getLegacyLabel(
  key: NavigationDestinationKey,
  portfolioType: PortfolioType
) {
  if (key === "works") {
    return portfolioType === "actor" ? "SHOWREEL" : "VIDEO";
  }

  if (key === "contact") {
    return portfolioType === "actor" ? "CONTACT" : "BOOKING";
  }

  return NAVIGATION_DESTINATION_MAP.get(key)?.defaultLabel ?? key;
}

export function normalizeNavigationConfigVersion(
  value: unknown
): NavigationConfigVersion {
  if (value === undefined || value === null || value === 0) return 0;
  return value === 1 ? 1 : "unsupported";
}

/** Normalizes a registry href for duplicate detection without accepting URLs. */
export function normalizeNavigationTarget(href: string) {
  if (!href.startsWith("/") || href.startsWith("//")) {
    throw new Error(`Navigation target must be an internal path: ${href}`);
  }

  const url = new URL(href, "https://portfolio.invalid");
  if (
    url.origin !== "https://portfolio.invalid" ||
    url.username ||
    url.password ||
    url.search
  ) {
    throw new Error(`Navigation target must not contain an origin or query: ${href}`);
  }

  if (url.hash && !/^#[A-Za-z][A-Za-z0-9_-]*$/.test(url.hash)) {
    throw new Error(`Navigation target has an invalid fragment: ${href}`);
  }

  const collapsedPath = url.pathname.replace(/\/{2,}/g, "/");
  const pathname =
    collapsedPath.length > 1 ? collapsedPath.replace(/\/$/, "") : collapsedPath;

  return `${pathname}${url.hash}`;
}

export function validateNavigationRegistry(
  destinations: readonly NavigationDestinationDefinition[] =
    NAVIGATION_DESTINATIONS
) {
  const issues: string[] = [];
  const keys = new Set<string>();
  const targets = new Set<string>();
  const orders = new Set<number>();

  for (const destination of destinations) {
    if (keys.has(destination.key)) {
      issues.push(`Duplicate navigation key: ${destination.key}`);
    }
    keys.add(destination.key);

    if (orders.has(destination.defaultOrder)) {
      issues.push(`Duplicate navigation order: ${destination.defaultOrder}`);
    }
    orders.add(destination.defaultOrder);

    try {
      const target = normalizeNavigationTarget(destination.href);
      if (targets.has(target)) {
        issues.push(`Duplicate navigation target: ${target}`);
      }
      targets.add(target);
    } catch (error) {
      issues.push(error instanceof Error ? error.message : "Invalid navigation target");
    }
  }

  return issues;
}

export function isMissingNavigationSchemaError(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const candidate = error as NavigationReadError;
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message = [candidate.message, candidate.details, candidate.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ");

  if (code === "42P01" || code === "PGRST205") {
    return !message || /site_navigation_items/i.test(message);
  }

  return (
    /site_navigation_items/i.test(message) &&
    /(does not exist|schema cache|could not find|unknown relation)/i.test(message)
  );
}

export function createLegacyNavigationConfig(
  portfolioType: PortfolioType,
  hiddenPageSlugs: readonly PageSlug[] = [],
  overrides: Partial<
    Pick<
      NavigationConfig,
      "migrationRequired" | "isIncomplete" | "degradedReason"
    >
  > = {}
): NavigationConfig {
  const activeKeys = new Set(LEGACY_PROFILE_KEYS[portfolioType]);
  const hidden = new Set(hiddenPageSlugs);

  return {
    items: NAVIGATION_DESTINATIONS.map((destination) => ({
      ...destination,
      defaultLabel: getLegacyLabel(destination.key, portfolioType),
      isVisible:
        activeKeys.has(destination.key) && !hidden.has(destination.pageSlug),
      sortOrder: destination.defaultOrder,
      updatedAt: null,
      isPersisted: false,
    })),
    persistedItems: [],
    unresolvedItems: [],
    source: "legacy",
    migrationRequired: overrides.migrationRequired ?? true,
    isIncomplete: overrides.isIncomplete ?? false,
    ...(overrides.degradedReason
      ? { degradedReason: overrides.degradedReason }
      : {}),
  };
}

export function mergeStoredNavigationRows(
  rows: readonly unknown[] = []
): MergedNavigationRows {
  const validRows = rows.filter(isStoredNavigationRow).sort((left, right) =>
    left.sort_order === right.sort_order
      ? left.destination_key.localeCompare(right.destination_key)
      : left.sort_order - right.sort_order
  );
  const invalidRows = rows
    .filter((row) => !isStoredNavigationRow(row))
    .map((row) => ({
      row: {
        destination_key:
          row &&
          typeof row === "object" &&
          "destination_key" in row &&
          typeof row.destination_key === "string"
            ? row.destination_key
            : "",
        is_visible: false,
        sort_order: 0,
      },
      reason: "invalid-row" as const,
    }));
  const rowByKey = new Map<NavigationDestinationKey, StoredNavigationRow>();
  const unresolvedItems: UnresolvedNavigationItem[] = [...invalidRows];

  for (const row of validRows) {
    if (!isNavigationDestinationKey(row.destination_key)) {
      unresolvedItems.push({ row, reason: "unknown-destination" });
      continue;
    }

    if (rowByKey.has(row.destination_key)) {
      unresolvedItems.push({ row, reason: "duplicate-destination" });
      continue;
    }

    rowByKey.set(row.destination_key, row);
  }

  const storedItems = validRows.reduce<NavigationItem[]>((items, row) => {
    if (
      !isNavigationDestinationKey(row.destination_key) ||
      rowByKey.get(row.destination_key) !== row
    ) {
      return items;
    }

    const destination = NAVIGATION_DESTINATION_MAP.get(row.destination_key);
    if (!destination) return items;

    items.push({
      ...destination,
      isVisible: row.is_visible,
      sortOrder: row.sort_order,
      updatedAt: row.updated_at ?? null,
      isPersisted: true,
    });
    return items;
  }, []);

  const nextOrder =
    Math.max(0, ...storedItems.map((item) => item.sortOrder)) + 10;
  let missingIndex = 0;
  const missingItems = NAVIGATION_DESTINATIONS.filter(
    (destination) => !rowByKey.has(destination.key)
  ).map(
    (destination): NavigationItem => ({
      ...destination,
      isVisible: false,
      sortOrder: nextOrder + missingIndex++ * 10,
      updatedAt: null,
      isPersisted: false,
    })
  );

  return {
    items: [...storedItems, ...missingItems],
    unresolvedItems,
    knownRowCount: rowByKey.size,
  };
}

export function resolveNavigationConfig({
  version,
  rows = [],
  error,
  portfolioType,
  hiddenPageSlugs = [],
  audience = "public",
}: ResolveNavigationConfigInput): NavigationConfig {
  const migrationRequired = isMissingNavigationSchemaError(error);
  const merged = error ? null : mergeStoredNavigationRows(rows ?? []);
  const catalogIncomplete =
    audience === "admin" &&
    Boolean(merged) &&
    merged!.knownRowCount !== NAVIGATION_DESTINATIONS.length;

  if (version === "unsupported") {
    const closed = mergeStoredNavigationRows();
    return {
      items: closed.items,
      persistedItems: merged?.items ?? [],
      unresolvedItems: merged?.unresolvedItems ?? [],
      source: "database",
      migrationRequired: false,
      isIncomplete: audience === "admin",
      degradedReason: "unsupported-version",
    };
  }

  if (version === 0) {
    return {
      ...createLegacyNavigationConfig(portfolioType, hiddenPageSlugs, {
        migrationRequired,
        isIncomplete: catalogIncomplete,
        ...(migrationRequired
          ? { degradedReason: "missing-schema" as const }
          : error
            ? { degradedReason: "load-error" as const }
            : catalogIncomplete
              ? { degradedReason: "incomplete-catalog" as const }
              : {}),
      }),
      persistedItems: merged?.items ?? [],
      unresolvedItems: merged?.unresolvedItems ?? [],
    };
  }

  if (error) {
    const closed = mergeStoredNavigationRows();
    return {
      items: closed.items,
      persistedItems: [],
      unresolvedItems: closed.unresolvedItems,
      source: "database",
      migrationRequired,
      isIncomplete: audience === "admin",
      degradedReason: migrationRequired ? "missing-schema" : "load-error",
    };
  }

  const hasVisibleKnownItem = merged!.items.some(
    (item) => item.isPersisted && item.isVisible
  );
  if (!hasVisibleKnownItem) {
    return {
      items: merged!.items,
      persistedItems: merged!.items,
      unresolvedItems: merged!.unresolvedItems,
      source: "database",
      migrationRequired: false,
      isIncomplete: catalogIncomplete,
      degradedReason: "empty-active-navigation",
    };
  }

  return {
    items: merged!.items,
    persistedItems: merged!.items,
    unresolvedItems: merged!.unresolvedItems,
    source: "database",
    migrationRequired: false,
    isIncomplete: catalogIncomplete,
    ...(catalogIncomplete
      ? { degradedReason: "incomplete-catalog" as const }
      : {}),
  };
}

export function createMixedReviewNavigationConfig(): NavigationConfig {
  return resolveNavigationConfig({
    version: 1,
    portfolioType: "actor",
    rows: MIXED_REVIEW_NAVIGATION_KEYS.map((key, index) => ({
      destination_key: key,
      is_visible: true,
      sort_order: (index + 1) * 10,
    })),
  });
}

const registryIssues = validateNavigationRegistry();
if (registryIssues.length) {
  throw new Error(`Invalid navigation registry: ${registryIssues.join("; ")}`);
}
