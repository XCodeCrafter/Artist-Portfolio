import { describe, expect, it } from "vitest";
import { getAnalyticsPageLabel } from "@/lib/admin/analytics-shared";
import { LIVE_CONTACT_NAV_LABEL, LIVE_CONTACT_PAGE_LABEL } from "@/lib/content/live-contact";
import { getProfilePublicModules, getVisibleNavigationModules } from "@/lib/content/modules";

describe("Live & Contact public labels", () => {
  it.each(["actor", "musician"] as const)("keeps the %s module route and visibility contract", (profile) => {
    expect(getProfilePublicModules(profile).find((module) => module.key === "contact")).toMatchObject({
      label: LIVE_CONTACT_NAV_LABEL,
      href: "/booking",
      pageSlug: "booking",
      description: expect.stringMatching(/live event/i),
    });
    expect(getVisibleNavigationModules(profile, ["booking"]).some((module) => module.key === "contact")).toBe(false);
  });

  it("shows the new page name in Insights without changing tracked paths", () => {
    expect(getAnalyticsPageLabel("/booking")).toBe(LIVE_CONTACT_PAGE_LABEL);
    expect(getAnalyticsPageLabel("/unknown")).toBe("/unknown");
  });
});
