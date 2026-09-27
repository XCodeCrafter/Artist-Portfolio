import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ContactPageView from "@/components/contact/ContactPageView";
import { FALLBACK_CONTENT } from "@/lib/content/fallback";
import { INITIAL_CALENDAR_FIXTURE } from "./fixtures/booking-calendar-actions";

const data = {
  hero: { ...FALLBACK_CONTENT.heroes.booking, mediaType: "image" as const },
  details: { contactBlurb: "Contact me", location: "Prague" },
  calendarToday: "2026-10-01",
};

describe("Bookings calendar integration", () => {
  it("renders real calendar before the unchanged inquiry form and hides drafts", () => {
    const html = renderToStaticMarkup(<ContactPageView data={{ ...data, calendar: INITIAL_CALENDAR_FIXTURE.draft }} />);
    expect(html).toContain('id="events"');
    expect(html.indexOf('id="events"')).toBeLessThan(html.indexOf('id="form"'));
    expect(html).toContain("Backroom blues");
    expect(html).not.toContain("Private rehearsal draft");
    expect(html).toContain('id="contact-form"');
    expect(html).toContain("Send a message");
  });
  it.each([null, { ...INITIAL_CALENDAR_FIXTURE.draft, settings: { ...INITIAL_CALENDAR_FIXTURE.draft.settings, enabled: false } }])("retains booking inquiries while calendar is absent or disabled", calendar => {
    const html = renderToStaticMarkup(<ContactPageView data={{ ...data, calendar }} />);
    expect(html).not.toContain('id="events"');
    expect(html).toContain('id="contact-form"');
  });
  it("reads the public calendar separately, without altering global portfolio fallback data", () => {
    const page = readFileSync(new URL("../app/booking/page.tsx", import.meta.url), "utf8");
    expect(page).toContain("getPublicBookingCalendar()");
    expect(page).toContain("calendarToday:");
    const fallback = readFileSync(new URL("../lib/content/fallback.ts", import.meta.url), "utf8");
    expect(fallback).not.toContain("Backroom blues");
    expect(fallback).not.toContain("bookingCalendar");
  });
  it("keeps the Contact editor linked to the separate V2 event inspector", () => {
    const contact = readFileSync(new URL("../app/admin/v2/pages/contact/page.tsx", import.meta.url), "utf8");
    expect(contact).toContain('href="/admin/v2/pages/events"');
    const preview = readFileSync(new URL("../app/admin/v2-preview/contact/page.tsx", import.meta.url), "utf8");
    expect(preview).toContain("getPublicBookingCalendar()");
  });
});
