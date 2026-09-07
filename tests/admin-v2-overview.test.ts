import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ADMIN_V2_DESTINATIONS,
  filterAdminV2Destinations,
} from "@/lib/admin/v2-destinations";

const overviewPage = readFileSync(
  new URL("../app/admin/v2/page.tsx", import.meta.url),
  "utf8"
);
const overviewLoader = readFileSync(
  new URL("../lib/admin/v2-overview.ts", import.meta.url),
  "utf8"
);
const finder = readFileSync(
  new URL(
    "../components/admin/v2/DashboardDestinationFinder.tsx",
    import.meta.url
  ),
  "utf8"
);
const inquiryLoader = readFileSync(
  new URL("../lib/admin/inquiries.ts", import.meta.url),
  "utf8"
);
const settingsPage = readFileSync(
  new URL("../app/admin/v2/settings/page.tsx", import.meta.url),
  "utf8"
);
const shellCatalog = readFileSync(
  new URL("../lib/admin/v2-shell.ts", import.meta.url),
  "utf8"
);
const shell = readFileSync(
  new URL("../components/admin/v2/AdminV2Shell.tsx", import.meta.url),
  "utf8"
);

describe("Admin V2 destination finder", () => {
  it("finds familiar English and Czech terms without inventing destinations", () => {
    expect(filterAdminV2Destinations("Spotify").map((item) => item.id)).toContain(
      "music"
    );
    expect(filterAdminV2Destinations("CV credits").map((item) => item.id)).toEqual([
      "bio",
    ]);
    expect(filterAdminV2Destinations("fotky").map((item) => item.id)).toEqual([
      "gallery",
    ]);
    expect(filterAdminV2Destinations("heslo").map((item) => item.id)).toEqual([
      "access",
    ]);
    expect(filterAdminV2Destinations("logo fonts").map((item) => item.id)).toEqual([
      "brand",
    ]);
    expect(filterAdminV2Destinations("hero video").map((item) => item.id)).toEqual([
      "showreel",
    ]);
    expect(filterAdminV2Destinations("gallery hero").map((item) => item.id)).toEqual([
      "gallery",
    ]);
    expect(filterAdminV2Destinations("settings").map((item) => item.id)).toEqual([
      "settings",
    ]);
    expect(filterAdminV2Destinations("nastavení").map((item) => item.id)).toEqual([
      "settings",
    ]);
    expect(filterAdminV2Destinations("audit")[0]).toMatchObject({
      id: "audit",
      href: "/admin/v2/security#audit",
    });
    expect(filterAdminV2Destinations("music")[0]?.id).toBe("music");
    expect(filterAdminV2Destinations("brand")[0]?.id).toBe("brand");
    expect(filterAdminV2Destinations("security")[0]?.id).toBe("security");
    expect(filterAdminV2Destinations("admin access")[0]?.id).toBe("access");
    expect(filterAdminV2Destinations("technical health")[0]?.id).toBe(
      "technical-health"
    );
    expect(filterAdminV2Destinations("definitely-not-an-editor")).toEqual([]);
  });

  it("keeps every result on an application-owned admin route", () => {
    expect(ADMIN_V2_DESTINATIONS.length).toBeGreaterThanOrEqual(12);
    for (const destination of ADMIN_V2_DESTINATIONS) {
      expect(destination.href).toMatch(/^\/admin\/(?:v2\/|content#)/);
      expect(destination.href).not.toMatch(/^https?:|\/\//);
    }
  });

  it("provides a real searchable control with keyboard-safe native links", () => {
    expect(finder).toContain("data-dashboard-destination-finder");
    expect(finder).toContain('role="search"');
    expect(finder).toContain("filterAdminV2Destinations");
    expect(finder).toContain("router.push(results[0].href)");
    expect(finder).not.toContain("useDeferredValue");
    expect(finder).toContain('type="search"');
    expect(finder).toContain('aria-label="Matching admin destinations"');
    expect(finder).toContain("inputRef.current?.focus()");
    expect(finder).toContain('aria-live="polite"');
  });
});

describe("Admin V2 task-first overview", () => {
  it("loads only presentation-safe editor health plus a lightweight Inbox pulse", () => {
    expect(overviewPage).toContain("await getAdminV2OverviewData()");
    expect(overviewPage).not.toContain("getBookingInquiries");
    expect(overviewPage).not.toContain("getAnalyticsSummary");
    expect(overviewPage).not.toContain("getSecurityCenterData");
    expect(overviewLoader).toContain("await requireAdmin()");
    expect(overviewLoader).toContain("getAdminMusicEditorData()");
    expect(overviewLoader).toContain("getAdminNewInquiryCount()");
    expect(overviewLoader).not.toContain("getProductionReadiness");
    expect(overviewLoader).not.toContain("getSecurityCenterData");
    expect(overviewLoader).not.toContain("getAnalyticsSummary");
  });

  it("counts new messages without loading contact PII or message bodies", () => {
    const start = inquiryLoader.indexOf(
      "export async function getAdminNewInquiryCount"
    );
    const end = inquiryLoader.indexOf(
      "export async function getBookingInquiries",
      start
    );
    const pulseLoader = inquiryLoader.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(pulseLoader.indexOf("await requireAdmin()"))
      .toBeGreaterThan(-1);
    expect(pulseLoader.indexOf("await requireAdmin()"))
      .toBeLessThan(pulseLoader.indexOf("createAdminServiceClient()"));
    expect(pulseLoader).toContain('.select("id", { count: "exact", head: true })');
    expect(pulseLoader).toContain('.eq("status", "new")');
    expect(pulseLoader).not.toMatch(/\.select\([^)]*(?:name|email|message)/);
    expect(pulseLoader).toContain("count: null");
  });

  it("prioritizes actions and keeps page state distinct from navbar state", () => {
    expect(overviewPage).toContain("Your next actions");
    expect(overviewPage).toContain("new message");
    expect(overviewPage).toContain("Quick actions");
    expect(overviewPage).toContain("Portfolio pages");
    expect(overviewPage).toContain("Editor readiness and navbar visibility are separate");
    expect(overviewLoader).toContain('getEditorState(editor.readiness)');
    expect(overviewLoader).toContain('navbarState: navbarStateFor');
    expect(overviewLoader).toContain("selectedCount: number | null");
    expect(overviewLoader).toContain('if (!item) return "unknown"');
    expect(overviewPage).toContain("Visibility unavailable");
    expect(overviewLoader).toContain('key: "music"');
    expect(overviewPage).not.toContain("Workspace status");
    expect(overviewPage).not.toContain("V1 remains available for every existing editor");
    expect(overviewPage.indexOf('id="dashboard-next-actions"')).toBeLessThan(
      overviewPage.lastIndexOf("<DashboardDestinationFinder")
    );
  });
});

describe("Admin V2 Settings information architecture", () => {
  it("groups brand, access, security, audit, and technical health", () => {
    expect(settingsPage).toContain("Brand &amp; appearance");
    expect(settingsPage).toContain('href="/admin/content#settings"');
    expect(settingsPage).toContain('href="/admin/v2/security#access"');
    expect(settingsPage).toContain('href="/admin/v2/security#activity"');
    expect(settingsPage).toContain('href="/admin/v2/security#configuration"');
    expect(settingsPage).toContain("Classic editor");
  });

  it("uses Settings as the sidebar home while keeping Security routes active", () => {
    expect(shellCatalog).toContain('key: "settings"');
    expect(shellCatalog).toContain('href: "/admin/v2/settings"');
    expect(shellCatalog).toContain('normalized === "/admin/v2/security"');
    expect(shell).toContain("settings: <FaShieldAlt />");
    expect(shell).toContain("item.group");
    expect(shell).toContain("aria-hidden={collapsed ? true : undefined}");
  });
});
