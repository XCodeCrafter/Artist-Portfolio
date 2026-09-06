import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  getAdminInquiryPagePath,
  getAdminInquiryPath,
  getAdminInquiryStatusPath,
  normalizeAdminInquiryPage,
} from "@/lib/admin/inquiry-routes";

const v2Page = readFileSync(
  new URL("../app/admin/v2/inbox/page.tsx", import.meta.url),
  "utf8"
);
const classicPage = readFileSync(
  new URL("../app/admin/analytics/page.tsx", import.meta.url),
  "utf8"
);
const classicDashboard = readFileSync(
  new URL("../components/admin/AnalyticsDashboard.tsx", import.meta.url),
  "utf8"
);
const inbox = readFileSync(
  new URL("../components/admin/InquiryInbox.tsx", import.meta.url),
  "utf8"
);
const inquiryLoader = readFileSync(
  new URL("../lib/admin/inquiries.ts", import.meta.url),
  "utf8"
);
const classicActions = readFileSync(
  new URL("../app/admin/analytics/actions.ts", import.meta.url),
  "utf8"
);
const v2Actions = readFileSync(
  new URL("../app/admin/v2/inbox/actions.ts", import.meta.url),
  "utf8"
);
const overview = readFileSync(
  new URL("../app/admin/v2/page.tsx", import.meta.url),
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
const contactEditor = readFileSync(
  new URL("../components/admin/v2/ContactEditor.tsx", import.meta.url),
  "utf8"
);

describe("Admin Inbox surface routing", () => {
  it("uses only fixed Classic and V2 destinations", () => {
    expect(getAdminInquiryPath("classic")).toBe("/admin/analytics");
    expect(getAdminInquiryPath("v2")).toBe("/admin/v2/inbox");
    expect(getAdminInquiryStatusPath("classic", "saved")).toBe(
      "/admin/analytics?status=saved#inquiries"
    );
    expect(getAdminInquiryStatusPath("v2", "saved")).toBe(
      "/admin/v2/inbox?status=saved#messages"
    );
    expect(
      getAdminInquiryStatusPath("classic", "saved", {
        page: 4,
        rangeDays: 180,
      })
    ).toBe(
      "/admin/analytics?status=saved&inquiryPage=4&range=180#inquiries"
    );
    expect(getAdminInquiryPagePath("classic", 2, 90)).toBe(
      "/admin/analytics?range=90&inquiryPage=2#inquiries"
    );
    expect(getAdminInquiryPagePath("v2", 2)).toBe(
      "/admin/v2/inbox?page=2#messages"
    );
    expect(getAdminInquiryPagePath("v2", -50)).toBe(
      "/admin/v2/inbox?page=1#messages"
    );
    expect(normalizeAdminInquiryPage(Number.POSITIVE_INFINITY)).toBe(1);
    expect(normalizeAdminInquiryPage(5_000_000)).toBe(10_000);
    expect(normalizeAdminInquiryPage("2abc")).toBe(1);
  });

  it("uses separate server-owned action wrappers rather than a return URL", () => {
    expect(classicActions).toContain('updateInquiryOnSurface("classic"');
    expect(classicActions).toContain('deleteInquiryOnSurface("classic"');
    expect(v2Actions).toContain('updateInquiryOnSurface("v2"');
    expect(v2Actions).toContain('deleteInquiryOnSurface("v2"');
    expect(classicActions + v2Actions).not.toMatch(/returnUrl|redirectUrl/);
  });
});

describe("Admin V2 Inbox route and navigation", () => {
  it("authenticates before service-role data and does not load analytics", () => {
    expect(v2Page.indexOf("await requireAdmin()"))
      .toBeGreaterThan(-1);
    expect(v2Page.indexOf("await requireAdmin()"))
      .toBeLessThan(v2Page.indexOf("await getBookingInquiries"));
    expect(v2Page).not.toContain("getAnalyticsSummary");
    expect(v2Page).toContain("getContactDeliveryStatus");
    expect(v2Page).toContain("requestedPage > lastAvailablePage");
    expect(v2Page).toContain("pageParameterIsCanonical");
    expect(v2Page).toContain("inquiriesAvailable &&");
  });

  it("keeps Classic Analytics using the shared Inbox view", () => {
    expect(classicPage).toContain("getBookingInquiries");
    expect(classicDashboard).toContain("<InquiryInboxView");
    expect(classicDashboard).toContain('surface="classic"');
    expect(classicDashboard).toContain("useUnsavedChangesGuard()");
  });

  it("is discoverable from the overview, sidebar, and Contact editor", () => {
    expect(overview).toContain('href="/admin/v2/inbox"');
    expect(shellCatalog).toContain('href: "/admin/v2/inbox"');
    expect(shellCatalog).toContain('key: "inbox"');
    expect(shell).toContain("inbox: <FaInbox />");
    expect(contactEditor).toContain('href="/admin/v2/inbox#messages"');
  });
});

describe("Shared Inbox UI contract", () => {
  it("preserves the complete triage workflow and safety affordances", () => {
    expect(inbox).toContain("Workflow status");
    expect(inbox).toContain("Private notes");
    expect(inbox).toContain("Only dashboard admins can see this note.");
    expect(inbox).toContain("Reply in email app");
    expect(inbox).toContain("Save inquiry");
    expect(inbox).toContain("Delete inquiry");
    expect(inbox).toContain("This cannot be undone.");
    expect(inbox).toContain("useUnsavedChangesGuard()");
    expect(inbox).toContain("maxLength={4000}");
    expect(inbox).toContain('target="_blank"');
    expect(inbox).toContain("hidden={!visibleIds.has(inquiry.id)}");
    expect(inbox).toContain("window.sessionStorage.setItem");
    expect(inbox).toContain("isInquiryFormDirty");
    expect(inbox).toContain("dirtyForm.reset()");
    expect(inbox).toContain('aria-live="polite"');
  });

  it("states the loaded-page filter scope and distinguishes empty states", () => {
    expect(inbox).toContain("Search this loaded page…");
    expect(inbox).toContain("Search and filter apply");
    expect(inbox).toContain("only to these loaded rows.");
    expect(inbox).toContain("No inquiries have arrived yet.");
    expect(inbox).toContain("No inquiries match the search and status filter");
  });

  it("keeps notification failures separate from stored messages", () => {
    expect(inbox).toContain("Notification failed · message saved");
    expect(inbox).toContain("Recipient marked email as spam · message saved");
    expect(inbox).toContain("Stored Inbox messages remain available.");
    expect(inbox).toContain("Configuration presence is shown here");
    expect(inbox).toContain("actual provider result");
  });

  it("keeps the V2 toolbar below the mobile shell header", () => {
    expect(inbox).toContain('"sticky top-[76px] lg:top-3"');
    expect(inbox).toContain('aria-label="Inquiry pages"');
  });

  it("selects only rendered inquiry columns for the client payload", () => {
    expect(inquiryLoader).not.toContain('.select("*")');
    expect(inquiryLoader).not.toContain("sourceIp:");
    expect(inquiryLoader).not.toContain("userAgent:");
    expect(inquiryLoader).not.toContain("resendEmailId:");
    expect(inquiryLoader).toContain(
      '"id,name,email,message,portfolio_type,inquiry_type,inquiry_intent,status,admin_notes,email_status,email_status_changed_at,created_at"'
    );
    expect(inquiryLoader).toContain("LEGACY_INQUIRY_SELECT");
    expect(inquiryLoader).not.toContain("updatedAt:");
  });
});
