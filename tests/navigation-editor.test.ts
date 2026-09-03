import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  RECOMMENDED_VISIBLE_NAVIGATION_KEYS,
  canMoveNavigationItem,
  createNavigationEditorModel,
  getNavigationEditorRows,
  getNavigationPosition,
  moveNavigationItem,
  moveNavigationItemBefore,
  parseNavigationExpectedVersions,
  parseNavigationSaveItems,
  restoreRecommendedNavigation,
  serializeNavigationDraft,
  showAllNavigationForReview,
  toPreviewNavigationItems,
  validateNavigationDraft,
  type NavigationEditorItem,
} from "@/lib/admin/navigation-editor";
import {
  ADMIN_V2_NAVIGATION,
  getAdminV2ActiveItem,
  parseAdminV2SidebarState,
  serializeAdminV2SidebarState,
} from "@/lib/admin/v2-shell";
import {
  MIXED_REVIEW_NAVIGATION_KEYS,
  NAVIGATION_DESTINATION_KEYS,
  createMixedReviewNavigationConfig,
  getVisiblePublicPageNavigationItems,
  resolveNavigationConfig,
  type StoredNavigationRow,
} from "@/lib/content/navigation";

function editorItems(): NavigationEditorItem[] {
  return createMixedReviewNavigationConfig().items.map((item, index) => ({
    ...item,
    itemType: "known" as const,
    updatedAt: `2026-09-02T10:00:${String(index).padStart(2, "0")}.000Z`,
    isPersisted: true,
  }));
}

function lockedItem(key = "future.press"):
  Extract<NavigationEditorItem, { itemType: "locked" }> {
  return {
    itemType: "locked",
    key,
    defaultLabel: key,
    description: "Created by a newer build.",
    href: "",
    kind: "future",
    availability: "future",
    isVisible: true,
    sortOrder: 35,
    updatedAt: "2026-09-02T12:00:00.000Z",
    isPersisted: true,
  };
}

describe("Admin V2 navigation editor model", () => {
  it("interleaves and preserves a future destination with its exact version", () => {
    const rows: StoredNavigationRow[] = MIXED_REVIEW_NAVIGATION_KEYS.map((key, index) => ({
      destination_key: key,
      is_visible: index < 6,
      sort_order: (index + 1) * 10,
      updated_at: `2026-09-02T10:00:${String(index).padStart(2, "0")}.000Z`,
    }));
    rows.splice(3, 0, {
      destination_key: "future.press",
      is_visible: true,
      sort_order: 35,
      updated_at: "2026-09-02T11:00:00.000Z",
    });
    const config = resolveNavigationConfig({
      version: 1,
      portfolioType: "actor",
      rows,
      audience: "admin",
    });
    const model = createNavigationEditorModel(config);

    expect(model.blockingIssues).toEqual([]);
    expect(model.items.map((item) => item.key).slice(0, 5)).toEqual([
      "home",
      "bio",
      "gallery",
      "future.press",
      "music",
    ]);
    expect(model.items.find((item) => item.key === "future.press")).toMatchObject({
      itemType: "locked",
      isVisible: true,
    });
    expect(model.expectedVersions["future.press"]).toBe(
      "2026-09-02T11:00:00.000Z"
    );
    expect(serializeNavigationDraft(model.items)).toContainEqual({
      destinationKey: "future.press",
      isVisible: true,
    });
  });

  it("fails closed when a persisted row has no usable timestamp", () => {
    const config = createMixedReviewNavigationConfig();
    const model = createNavigationEditorModel(config);
    expect(model.blockingIssues).toHaveLength(NAVIGATION_DESTINATION_KEYS.length);
  });

  it("shows all pages, hides internal sections, and restores the page order", () => {
    const initial = editorItems().map((item) =>
      item.itemType === "known" ? { ...item, isVisible: false } : item
    );
    const reversed = [...initial].reverse();
    const shown = showAllNavigationForReview(reversed);
    const recommended = restoreRecommendedNavigation(reversed);

    expect(shown.map((item) => item.key)).toEqual(
      reversed.map((item) => item.key)
    );
    expect(
      shown
        .filter(
          (item) =>
            item.itemType === "known" && item.kind === "page" && item.isVisible
        )
        .map((item) => item.key)
    ).toEqual([...RECOMMENDED_VISIBLE_NAVIGATION_KEYS].reverse());
    expect(
      shown.filter(
        (item) =>
          item.itemType === "known" &&
          item.kind === "section" &&
          item.isVisible
      )
    ).toHaveLength(0);
    expect(
      recommended
        .filter(
          (item) => item.itemType === "known" && item.kind === "page"
        )
        .map((item) => item.key)
    ).toEqual(RECOMMENDED_VISIBLE_NAVIGATION_KEYS);
    expect(
      recommended
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => item.itemType === "known" && item.kind === "section")
        .map(({ item, index }) => ({ key: item.key, index }))
    ).toEqual(
      reversed
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => item.itemType === "known" && item.kind === "section")
        .map(({ item, index }) => ({ key: item.key, index }))
    );
    expect(
      recommended
        .filter((item) => item.itemType === "known" && item.isVisible)
        .map((item) => item.key)
    ).toEqual(RECOMMENDED_VISIBLE_NAVIGATION_KEYS);
  });

  it("supports directional drag while treating future rows as barriers", () => {
    const initial = editorItems();
    const withBarrier = [
      initial[0],
      initial[1],
      lockedItem(),
      ...initial.slice(2),
    ];

    expect(canMoveNavigationItem(withBarrier, "bio", 1)).toBe(false);
    expect(moveNavigationItem(withBarrier, "bio", 1)).toEqual(withBarrier);
    expect(
      moveNavigationItemBefore(withBarrier, "home", "gallery")
    ).toEqual(withBarrier);
    expect(
      moveNavigationItemBefore(withBarrier, "music", "gallery").map(
        (item) => item.key
      )
    ).toEqual([
      "home",
      "bio",
      "future.press",
      "music",
      "gallery",
      ...initial.slice(4).map((item) => item.key),
    ]);

    const withoutBarrier = editorItems();
    expect(
      moveNavigationItemBefore(withoutBarrier, "home", "bio")
        .slice(0, 3)
        .map((item) => item.key)
    ).toEqual(["bio", "home", "gallery"]);
    expect(
      moveNavigationItemBefore(
        withoutBarrier,
        "home",
        "contact"
      )
        .filter(
          (item) => item.itemType === "known" && item.kind === "page"
        )
        .at(-1)?.key
    ).toBe("home");
  });

  it("moves pages across internal section rows without moving those rows", () => {
    const byKey = new Map(editorItems().map((item) => [item.key, item]));
    const interleaved = [
      byKey.get("home")!,
      byKey.get("home.about")!,
      byKey.get("bio")!,
      byKey.get("bio.resume")!,
      byKey.get("gallery")!,
      byKey.get("music")!,
      byKey.get("music.platforms")!,
      byKey.get("works")!,
      byKey.get("contact")!,
      byKey.get("home.cnc")!,
      byKey.get("home.stories")!,
      byKey.get("music.spotify")!,
      byKey.get("music.soundcloud")!,
    ];
    const moved = moveNavigationItem(interleaved, "home", 1);

    expect(
      moved
        .filter(
          (item) => item.itemType === "known" && item.kind === "page"
        )
        .map((item) => item.key)
    ).toEqual(["bio", "home", "gallery", "music", "works", "contact"]);
    expect(moved[1]?.key).toBe("home.about");
    expect(moved[3]?.key).toBe("bio.resume");
    expect(getNavigationPosition(moved, "home")).toEqual({
      index: 1,
      position: 2,
      total: 6,
    });
  });

  it("shows only pages and future barriers as editor rows", () => {
    const rows = getNavigationEditorRows([
      ...editorItems().slice(0, 2),
      lockedItem(),
      ...editorItems().slice(2),
    ]);

    expect(
      rows.filter((item) => item.itemType === "known").map((item) => item.key)
    ).toEqual(RECOMMENDED_VISIBLE_NAVIGATION_KEYS);
    expect(rows.find((item) => item.itemType === "locked")?.key).toBe(
      "future.press"
    );
  });

  it("requires one always-available destination", () => {
    const hidden = editorItems().map((item) =>
      item.itemType === "known" ? { ...item, isVisible: false } : item
    );
    const conditionalOnly = hidden.map((item) =>
      item.itemType === "known" && item.key === "home.cnc"
        ? { ...item, isVisible: true }
        : item
    );

    expect(validateNavigationDraft(hidden)).toEqual({
      ok: false,
      reason: "empty-navigation",
    });
    expect(
      validateNavigationDraft(conditionalOnly)
    ).toEqual({ ok: false, reason: "empty-navigation" });
    expect(
      validateNavigationDraft(
        conditionalOnly.map((item) =>
          item.itemType === "known" && item.key === "home"
            ? { ...item, isVisible: true }
            : item
        )
      )
    ).toEqual({ ok: true });
  });

  it("uses the same availability-aware order for the preview", () => {
    const visible = getVisiblePublicPageNavigationItems(
      toPreviewNavigationItems(editorItems()),
      { hasPublishedCncPrograms: false, hasResumeContent: false }
    );
    expect(visible.map((item) => item.key)).toEqual(
      RECOMMENDED_VISIBLE_NAVIGATION_KEYS
    );
  });

  it("serializes every compatibility row while forcing known sections hidden", () => {
    const serialized = serializeNavigationDraft(editorItems());

    expect(serialized).toHaveLength(NAVIGATION_DESTINATION_KEYS.length);
    expect(
      serialized
        .filter((item) => item.destinationKey.includes("."))
        .every((item) => !item.isVisible)
    ).toBe(true);
    expect(
      serialized.find((item) => item.destinationKey === "home")?.isVisible
    ).toBe(true);
  });
});

describe("Admin V2 navigation payload", () => {
  const versions = Object.fromEntries(
    NAVIGATION_DESTINATION_KEYS.map((key, index) => [
      key,
      `2026-09-02T10:00:${String(index).padStart(2, "0")}.000Z`,
    ])
  );
  const items = NAVIGATION_DESTINATION_KEYS.map((destinationKey) => ({
    destinationKey,
    isVisible: destinationKey === "home",
  }));

  it("accepts strict versions and the complete known catalogue", () => {
    expect(parseNavigationExpectedVersions(versions)).toEqual(versions);
    expect(parseNavigationSaveItems(items, versions)).toEqual(items);
  });

  it("normalizes legacy section visibility to hidden without dropping rows", () => {
    const legacyVisibleSections = items.map((item) => ({
      ...item,
      isVisible:
        item.destinationKey === "home" || item.destinationKey.includes("."),
    }));
    const parsed = parseNavigationSaveItems(legacyVisibleSections, versions);

    expect(parsed).toHaveLength(NAVIGATION_DESTINATION_KEYS.length);
    expect(
      parsed
        ?.filter((item) => item.destinationKey.includes("."))
        .every((item) => !item.isVisible)
    ).toBe(true);
    expect(parsed?.find((item) => item.destinationKey === "home")?.isVisible).toBe(
      true
    );
  });

  it("rejects duplicates, missing keys, zero visible keys, and invented unknown rows", () => {
    expect(parseNavigationSaveItems([...items, items[0]], versions)).toBeNull();
    expect(parseNavigationSaveItems(items.slice(1), versions)).toBeNull();
    expect(
      parseNavigationSaveItems(
        items.map((item) => ({ ...item, isVisible: false })),
        versions
      )
    ).toBeNull();
    expect(
      parseNavigationSaveItems(
        [...items, { destinationKey: "invented", isVisible: true }],
        versions
      )
    ).toBeNull();
    expect(
      parseNavigationSaveItems(
        items.map((item) => ({
          ...item,
          isVisible:
            item.destinationKey === "home.cnc" ||
            item.destinationKey === "bio.resume",
        })),
        versions
      )
    ).toBeNull();
  });

  it("requires and retains every expected future row", () => {
    const futureVersions = {
      ...versions,
      "future.press": "2026-09-02T12:00:00.000Z",
    };
    expect(parseNavigationSaveItems(items, futureVersions)).toBeNull();
    expect(
      parseNavigationSaveItems(
        [...items, { destinationKey: "future.press", isVisible: false }],
        futureVersions
      )
    ).toHaveLength(items.length + 1);
  });
});

describe("Admin V2 shell helpers", () => {
  it("matches the longest active route without activating overview everywhere", () => {
    expect(ADMIN_V2_NAVIGATION.map((item) => item.key)).toEqual([
      "overview",
      "navigation",
      "bio",
      "gallery",
      "showreel",
      "music",
    ]);
    expect(getAdminV2ActiveItem("/admin/v2").key).toBe("overview");
    expect(getAdminV2ActiveItem("/admin/v2/navigation").key).toBe(
      "navigation"
    );
    expect(getAdminV2ActiveItem("/admin/v2/navigation/history").key).toBe(
      "navigation"
    );
    expect(getAdminV2ActiveItem("/admin/v2/pages/bio").key).toBe("bio");
    expect(getAdminV2ActiveItem("/admin/v2/pages/bio/history").key).toBe(
      "bio"
    );
    expect(getAdminV2ActiveItem("/admin/v2/pages/gallery").key).toBe(
      "gallery"
    );
    expect(getAdminV2ActiveItem("/admin/v2/pages/gallery/history").key).toBe(
      "gallery"
    );
    expect(getAdminV2ActiveItem("/admin/v2/pages/showreel").key).toBe(
      "showreel"
    );
    expect(
      getAdminV2ActiveItem("/admin/v2/pages/showreel/history").key
    ).toBe("showreel");
    expect(getAdminV2ActiveItem("/admin/v2/pages/music").key).toBe("music");
    expect(getAdminV2ActiveItem("/admin/v2/pages/music/history").key).toBe(
      "music"
    );
  });

  it("defaults corrupt sidebar preferences to expanded", () => {
    expect(parseAdminV2SidebarState(null)).toBe(false);
    expect(parseAdminV2SidebarState("expanded")).toBe(false);
    expect(parseAdminV2SidebarState("banana")).toBe(false);
    expect(parseAdminV2SidebarState("collapsed")).toBe(true);
    expect(serializeAdminV2SidebarState(true)).toBe("collapsed");
    expect(serializeAdminV2SidebarState(false)).toBe("expanded");
  });
});

describe("Admin V2 navigation migration contract", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/0027_admin_v2_navigation_manager.sql",
      import.meta.url
    ),
    "utf8"
  );

  it("takes the existing advisory lock before reading expected state", () => {
    const functionStart = migration.indexOf(
      "create or replace function public.save_site_navigation_v2"
    );
    const saveFunction = migration.slice(functionStart);
    const lockIndex = saveFunction.indexOf(
      "hashtextextended('site_navigation_items:main', 0)"
    );
    const configReadIndex = saveFunction.indexOf(
      "select settings.navigation_config_version"
    );
    const rowReadIndex = saveFunction.indexOf("into v_current_count");

    expect(lockIndex).toBeGreaterThan(0);
    expect(lockIndex).toBeLessThan(configReadIndex);
    expect(lockIndex).toBeLessThan(rowReadIndex);
  });

  it("detects conflicts, preserves future visibility, and never deletes rows", () => {
    expect(migration).toContain("site_navigation_changed");
    expect(migration).toContain("using errcode = '40001'");
    expect(migration).toContain("else current_item.is_visible");
    expect(migration).toContain("with ordinality as submitted(item, ordinality)");
    expect(migration).toContain("jsonb_object_keys(p_expected_versions)");
    expect(migration).toContain("v_unconditionally_renderable_keys");
    expect(migration).toContain("submitted_existing_positions");
    expect(migration).toContain(
      "peer_current.position < unknown_current.position"
    );
    expect(migration).toContain(
      "peer_submitted.position < unknown_submitted.position"
    );
    expect(migration).not.toContain("jsonb_object_length");
    expect(migration).not.toMatch(
      /delete\s+from\s+public\.site_navigation_items/i
    );
  });

  it("allows only the service role to execute the V2 functions", () => {
    expect(migration).toContain(
      "revoke all on function public.save_site_navigation_v2(text, smallint, jsonb, jsonb)"
    );
    expect(migration).toContain(
      "grant execute on function public.save_site_navigation_v2(text, smallint, jsonb, jsonb)"
    );
    expect(migration).toContain("to service_role;");
    expect(migration).toContain(
      "revoke insert, update, delete on table public.site_navigation_items"
    );
  });

  it("keeps the V1 legacy action behind an activation guard", () => {
    const action = readFileSync(
      new URL("../app/admin/content/actions.ts", import.meta.url),
      "utf8"
    );
    expect(action).toContain("navigation-managed-in-v2");
    expect(action).toContain("navigation_config_version");
    expect(action).toContain('.eq("navigation_config_version", 0)');
  });

  it("guards the service-role navigation loader inside the DAL", () => {
    const loader = readFileSync(
      new URL("../lib/admin/navigation.ts", import.meta.url),
      "utf8"
    );
    const loaderStart = loader.indexOf(
      "export async function getAdminNavigationData"
    );
    const guardedLoader = loader.slice(loaderStart);
    expect(guardedLoader.indexOf("await requireAdmin()"))
      .toBeGreaterThan(0);
    expect(guardedLoader.indexOf("await requireAdmin()"))
      .toBeLessThan(guardedLoader.indexOf("createAdminServiceClient()"));
  });

  it("retires the user-facing profile switch and keeps both editor groups open", () => {
    const editor = readFileSync(
      new URL("../components/admin/ContentEditor.tsx", import.meta.url),
      "utf8"
    );
    const mediaManager = readFileSync(
      new URL("../components/admin/MediaManager.tsx", import.meta.url),
      "utf8"
    );
    const mediaPage = readFileSync(
      new URL("../app/admin/media/page.tsx", import.meta.url),
      "utf8"
    );
    expect(editor).not.toContain('<Field label="Portfolio mode">');
    expect(editor).toContain("const musicEnabled = true");
    expect(editor).toContain("const actorEnabled = true");
    expect(editor).toContain("Navbar is managed in Admin V2");
    expect(editor).toContain("PUBLIC_PORTFOLIO_PAGE_DESTINATIONS.map");
    expect(mediaManager).not.toContain(
      'portfolioType === "actor" || panelMode !== "studio"'
    );
    expect(mediaManager).toContain('label: "Gallery Studio"');
    expect(mediaPage).not.toContain('requestedMode === "studio"');
  });

  it("closes the mobile modal at desktop width and restores prior body overflow", () => {
    const shell = readFileSync(
      new URL("../components/admin/v2/AdminV2Shell.tsx", import.meta.url),
      "utf8"
    );
    expect(shell).toContain('window.matchMedia("(min-width: 1024px)")');
    expect(shell).toContain("previousBodyOverflowRef");
    expect(shell).toContain("restoreBodyScroll");
  });

  it("lets the navbar save submit while guarding other V2 forms such as logout", () => {
    const manager = readFileSync(
      new URL(
        "../components/admin/v2/NavigationManager.tsx",
        import.meta.url
      ),
      "utf8"
    );
    const guard = readFileSync(
      new URL(
        "../components/admin/useUnsavedChangesGuard.ts",
        import.meta.url
      ),
      "utf8"
    );
    expect(manager).toContain('data-unsaved-guard-bypass="true"');
    expect(guard).toContain('document.addEventListener("submit"');
    expect(guard).toContain("guardOtherFormSubmissions");
  });

  it("checks V2 readiness through the service-only snapshot instead of revoked table reads", () => {
    const readiness = readFileSync(
      new URL("../lib/admin/readiness.ts", import.meta.url),
      "utf8"
    );
    expect(readiness).toContain(
      'supabase.rpc("get_site_navigation_v2_snapshot"'
    );
    expect(readiness).not.toContain('.from("site_navigation_items")');
    expect(readiness).toContain("getNavigationSnapshotRows");
  });
});
