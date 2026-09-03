import {
  NAVIGATION_DESTINATION_KEYS,
  NAVIGATION_DESTINATIONS,
  type NavigationConfig,
  type NavigationDestinationKey,
  type NavigationItem,
} from "@/lib/content/navigation";

export const RECOMMENDED_VISIBLE_NAVIGATION_KEYS = [
  "home",
  "bio",
  "gallery",
  "music",
  "works",
  "contact",
] as const satisfies readonly NavigationDestinationKey[];

export type NavigationExpectedVersions = Record<string, string>;

export type NavigationEditorKnownItem = NavigationItem & {
  itemType: "known";
};

export type NavigationEditorLockedItem = {
  itemType: "locked";
  key: string;
  defaultLabel: string;
  description: string;
  href: string;
  kind: "future";
  availability: "future";
  isVisible: boolean;
  sortOrder: number;
  updatedAt: string | null;
  isPersisted: true;
};

export type NavigationEditorItem =
  | NavigationEditorKnownItem
  | NavigationEditorLockedItem;

export type NavigationSaveItem = {
  destinationKey: string;
  isVisible: boolean;
};

export type NavigationSaveState = {
  status:
    | "idle"
    | "saved"
    | "conflict"
    | "invalid"
    | "migration-required"
    | "missing-service"
    | "security-error"
    | "error";
  message: string;
  configVersion?: 0 | 1;
  expectedVersions?: NavigationExpectedVersions;
  eventId?: string;
};

export const INITIAL_NAVIGATION_SAVE_STATE: NavigationSaveState = {
  status: "idle",
  message: "",
};

export type NavigationEditorModel = {
  items: NavigationEditorItem[];
  expectedVersions: NavigationExpectedVersions;
  blockingIssues: string[];
};

export type NavigationDraftValidation =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "duplicate-destination"
        | "missing-destination"
        | "empty-navigation"
        | "empty-unconditional-navigation";
    };

const destinationByKey = new Map(
  NAVIGATION_DESTINATIONS.map((destination) => [destination.key, destination])
);
const knownKeySet = new Set<string>(NAVIGATION_DESTINATION_KEYS);
const pageReviewOrder = new Map<string, number>(
  RECOMMENDED_VISIBLE_NAVIGATION_KEYS.map((key, index) => [key, index])
);
const recommendedVisibleKeySet = new Set<string>(
  RECOMMENDED_VISIBLE_NAVIGATION_KEYS
);

export function isNavigationEditorPage(
  item: NavigationEditorItem
): item is NavigationEditorKnownItem {
  return item.itemType === "known" && item.kind === "page";
}

/** Page choices plus future-version barriers; known section rows stay internal. */
export function getNavigationEditorRows(
  items: readonly NavigationEditorItem[]
) {
  return items.filter(
    (item) => item.itemType === "locked" || isNavigationEditorPage(item)
  );
}

function isUsableVersion(value: string | null | undefined): value is string {
  if (!value || !value.includes("T")) return false;
  return Number.isFinite(Date.parse(value));
}

function compareEditorItems(
  left: NavigationEditorItem,
  right: NavigationEditorItem
) {
  if (left.sortOrder !== right.sortOrder) {
    return left.sortOrder - right.sortOrder;
  }

  return left.key.localeCompare(right.key);
}

/**
 * Creates the editor's complete ordered collection. Known catalogue entries
 * stay editable; rows created by a newer app build are interleaved and locked.
 */
export function createNavigationEditorModel(
  config: NavigationConfig
): NavigationEditorModel {
  const sourceItems = config.persistedItems.length
    ? config.persistedItems
    : config.items;
  const blockingIssues: string[] = [];
  const expectedVersions: NavigationExpectedVersions = {};

  const knownItems: NavigationEditorKnownItem[] = sourceItems.map((item) => {
    if (item.isPersisted) {
      if (!isUsableVersion(item.updatedAt)) {
        blockingIssues.push(
          `Saved destination ${item.key} has no usable version timestamp.`
        );
      } else {
        expectedVersions[item.key] = item.updatedAt;
      }
    }

    return { ...item, itemType: "known" };
  });

  const lockedItems: NavigationEditorLockedItem[] = [];
  for (const unresolved of config.unresolvedItems) {
    if (unresolved.reason !== "unknown-destination") {
      blockingIssues.push(
        `Navigation contains a ${unresolved.reason.replaceAll("-", " ")} row.`
      );
      continue;
    }

    const { row } = unresolved;
    if (!isUsableVersion(row.updated_at)) {
      blockingIssues.push(
        `Future destination ${row.destination_key || "(unnamed)"} has no usable version timestamp.`
      );
      continue;
    }

    if (expectedVersions[row.destination_key]) {
      blockingIssues.push(
        `Navigation contains duplicate destination ${row.destination_key}.`
      );
      continue;
    }

    expectedVersions[row.destination_key] = row.updated_at;
    lockedItems.push({
      itemType: "locked",
      key: row.destination_key,
      defaultLabel: row.destination_key,
      description:
        "Created by a newer application version. It will be preserved automatically.",
      href: "",
      kind: "future",
      availability: "future",
      isVisible: row.is_visible,
      sortOrder: row.sort_order,
      updatedAt: row.updated_at,
      isPersisted: true,
    });
  }

  const foundKnownKeys = new Set(knownItems.map((item) => item.key));
  for (const key of NAVIGATION_DESTINATION_KEYS) {
    if (!foundKnownKeys.has(key)) {
      blockingIssues.push(`Known destination ${key} is missing from the editor model.`);
    }
  }

  return {
    items: [...knownItems, ...lockedItems].sort(compareEditorItems),
    expectedVersions,
    blockingIssues,
  };
}

export function serializeNavigationDraft(
  items: readonly NavigationEditorItem[]
): NavigationSaveItem[] {
  return items.map((item) => ({
    destinationKey: item.key,
    isVisible:
      item.itemType === "known" && item.kind === "section"
        ? false
        : item.isVisible,
  }));
}

export function validateNavigationDraft(
  items: readonly NavigationEditorItem[]
): NavigationDraftValidation {
  const seen = new Set<string>();

  for (const item of items) {
    if (seen.has(item.key)) {
      return { ok: false, reason: "duplicate-destination" };
    }
    seen.add(item.key);
  }

  if (NAVIGATION_DESTINATION_KEYS.some((key) => !seen.has(key))) {
    return { ok: false, reason: "missing-destination" };
  }

  const visibleKnownItems = items.filter(
    (item): item is NavigationEditorKnownItem =>
      isNavigationEditorPage(item) && item.isVisible
  );
  if (!visibleKnownItems.length) {
    return { ok: false, reason: "empty-navigation" };
  }

  if (!visibleKnownItems.some((item) => item.availability === "available")) {
    return { ok: false, reason: "empty-unconditional-navigation" };
  }

  return { ok: true };
}

export function setNavigationItemVisibility(
  items: readonly NavigationEditorItem[],
  key: NavigationDestinationKey,
  isVisible: boolean
) {
  return items.map((item) =>
    isNavigationEditorPage(item) && item.key === key
      ? { ...item, isVisible }
      : item
  );
}

export function showAllNavigationForReview(
  items: readonly NavigationEditorItem[]
) {
  return items.map((item) =>
    item.itemType === "known"
      ? { ...item, isVisible: item.kind === "page" }
      : item
  );
}

function sortPageSegment(segment: NavigationEditorKnownItem[]) {
  return [...segment].sort((left, right) => {
    const leftOrder = pageReviewOrder.get(left.key) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = pageReviewOrder.get(right.key) ?? Number.MAX_SAFE_INTEGER;
    return leftOrder === rightOrder
      ? left.key.localeCompare(right.key)
      : leftOrder - rightOrder;
  });
}

function restorePageOrderWithinKnownSegment(
  segment: readonly NavigationEditorKnownItem[]
) {
  const orderedPages = sortPageSegment(segment.filter(isNavigationEditorPage));
  let pageIndex = 0;

  return segment.map((item) => {
    if (item.kind === "section") return { ...item, isVisible: false };
    const page = orderedPages[pageIndex++] ?? item;
    return {
      ...page,
      isVisible: recommendedVisibleKeySet.has(page.key),
    };
  });
}

/**
 * Restores the primary page order while treating every future row as a barrier.
 * Internal section rows retain their slots and are normalized to hidden.
 */
export function restoreRecommendedNavigation(
  items: readonly NavigationEditorItem[]
) {
  const result: NavigationEditorItem[] = [];
  let segment: NavigationEditorKnownItem[] = [];

  function flushSegment() {
    result.push(...restorePageOrderWithinKnownSegment(segment));
    segment = [];
  }

  for (const item of items) {
    if (item.itemType === "locked") {
      flushSegment();
      result.push(item);
    } else {
      segment.push(item);
    }
  }
  flushSegment();

  return result;
}

function getSegmentBounds(items: readonly NavigationEditorItem[], index: number) {
  let start = index;
  let end = index;

  while (start > 0 && items[start - 1]?.itemType === "known") start -= 1;
  while (end < items.length - 1 && items[end + 1]?.itemType === "known") end += 1;

  return { start, end };
}

export function canMoveNavigationItem(
  items: readonly NavigationEditorItem[],
  key: NavigationDestinationKey,
  direction: -1 | 1
) {
  const index = items.findIndex(
    (item) => isNavigationEditorPage(item) && item.key === key
  );
  if (index < 0) return false;

  for (
    let targetIndex = index + direction;
    targetIndex >= 0 && targetIndex < items.length;
    targetIndex += direction
  ) {
    const target = items[targetIndex];
    if (target?.itemType === "locked") return false;
    if (target && isNavigationEditorPage(target)) return true;
  }

  return false;
}

export function moveNavigationItem(
  items: readonly NavigationEditorItem[],
  key: NavigationDestinationKey,
  direction: -1 | 1
) {
  if (!canMoveNavigationItem(items, key, direction)) return [...items];

  const next = [...items];
  const sourceIndex = next.findIndex(
    (item) => isNavigationEditorPage(item) && item.key === key
  );
  let targetIndex = sourceIndex + direction;
  while (
    targetIndex >= 0 &&
    targetIndex < next.length &&
    !isNavigationEditorPage(next[targetIndex])
  ) {
    targetIndex += direction;
  }
  [next[sourceIndex], next[targetIndex]] = [
    next[targetIndex],
    next[sourceIndex],
  ];
  return next;
}

export function moveNavigationItemBefore(
  items: readonly NavigationEditorItem[],
  sourceKey: NavigationDestinationKey,
  targetKey: NavigationDestinationKey
) {
  const sourceIndex = items.findIndex(
    (item) => isNavigationEditorPage(item) && item.key === sourceKey
  );
  const targetIndex = items.findIndex(
    (item) => isNavigationEditorPage(item) && item.key === targetKey
  );
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return [...items];
  }

  const sourceBounds = getSegmentBounds(items, sourceIndex);
  if (targetIndex < sourceBounds.start || targetIndex > sourceBounds.end) {
    return [...items];
  }

  const next = [...items];
  const pageSlots = next
    .map((item, index) => ({ item, index }))
    .filter(
      ({ item, index }) =>
        index >= sourceBounds.start &&
        index <= sourceBounds.end &&
        isNavigationEditorPage(item)
    );
  const pages = pageSlots.map(({ item }) => item);
  const sourcePageIndex = pages.findIndex((item) => item.key === sourceKey);
  const targetPageIndex = pages.findIndex((item) => item.key === targetKey);
  const [source] = pages.splice(sourcePageIndex, 1);
  pages.splice(targetPageIndex, 0, source);
  pageSlots.forEach(({ index }, pageIndex) => {
    next[index] = pages[pageIndex];
  });
  return next;
}

export function getNavigationPosition(
  items: readonly NavigationEditorItem[],
  key: NavigationDestinationKey
) {
  const pages = items.filter(isNavigationEditorPage);
  const index = pages.findIndex(
    (item) => item.key === key
  );
  return index < 0 ? null : { index, position: index + 1, total: pages.length };
}

export function toPreviewNavigationItems(
  items: readonly NavigationEditorItem[]
): NavigationItem[] {
  return items
    .filter(isNavigationEditorPage)
    .map((item, index) => ({ ...item, sortOrder: (index + 1) * 10 }));
}

/** Strict payload validation for the server action before the database RPC. */
export function parseNavigationExpectedVersions(
  value: unknown
): NavigationExpectedVersions | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const versions: NavigationExpectedVersions = {};
  for (const [key, version] of Object.entries(value)) {
    if (
      !key ||
      key.length > 120 ||
      typeof version !== "string" ||
      !isUsableVersion(version)
    ) {
      return null;
    }
    versions[key] = version;
  }

  return versions;
}

export function parseNavigationSaveItems(
  value: unknown,
  expectedVersions: NavigationExpectedVersions = {}
): NavigationSaveItem[] | null {
  if (!Array.isArray(value) || value.length > 999) return null;

  const parsed: NavigationSaveItem[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const candidate = item as Record<string, unknown>;
    if (
      typeof candidate.destinationKey !== "string" ||
      !candidate.destinationKey ||
      candidate.destinationKey.length > 120 ||
      typeof candidate.isVisible !== "boolean" ||
      seen.has(candidate.destinationKey)
    ) {
      return null;
    }

    seen.add(candidate.destinationKey);
    const destination = destinationByKey.get(
      candidate.destinationKey as NavigationDestinationKey
    );
    parsed.push({
      destinationKey: candidate.destinationKey,
      isVisible:
        destination?.kind === "section" ? false : candidate.isVisible,
    });
  }

  const expectedKeys = Object.keys(expectedVersions);
  if (
    NAVIGATION_DESTINATION_KEYS.some((key) => !seen.has(key)) ||
    expectedKeys.some((key) => !seen.has(key)) ||
    parsed.some(
      (item) =>
        !knownKeySet.has(item.destinationKey) &&
        !Object.prototype.hasOwnProperty.call(
          expectedVersions,
          item.destinationKey
        )
    )
  ) {
    return null;
  }

  const hasVisibleRenderableDestination = parsed.some(
    (item) =>
      item.isVisible &&
      knownKeySet.has(item.destinationKey) &&
      destinationByKey.get(item.destinationKey as NavigationDestinationKey)
        ?.kind === "page" &&
      destinationByKey.get(item.destinationKey as NavigationDestinationKey)
        ?.availability === "available"
  );
  return hasVisibleRenderableDestination ? parsed : null;
}

export function getNavigationDestination(
  key: NavigationDestinationKey
) {
  return destinationByKey.get(key);
}
