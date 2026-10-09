import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ContactPageView from "@/components/contact/ContactPageView";
import { FALLBACK_CONTENT } from "@/lib/content/fallback";
import { INITIAL_CALENDAR_FIXTURE } from "./fixtures/booking-calendar-actions";
import { filterAdminV2Destinations } from "@/lib/admin/v2-destinations";

const data = {
  hero: { ...FALLBACK_CONTENT.heroes.booking, mediaType: "image" as const },
  details: { contactBlurb: "Contact me", location: "Prague" },
  calendarToday: "2026-10-01",
};

describe("Live & Contact calendar integration", () => {
  it("keeps gig details and inquiries usable with ticket links switched off", () => {
    const calendar = structuredClone(INITIAL_CALENDAR_FIXTURE.draft);
    calendar.settings.showTicketLinks = false;
    calendar.events = [{ ...calendar.events[0], date: "2026-10-09", status: "scheduled", published: true,
      description: "Free entry. Doors open at 19:00.", ticketUrl: "https://tickets.example.com/saved-for-later" }];
    const before = structuredClone(calendar);
    const html = renderToStaticMarkup(<ContactPageView data={{ ...data, calendar }} />);
    expect(html).toContain("Free entry. Doors open at 19:00.");
    expect(html).toContain(calendar.events[0].venue);
    expect(html).toContain('href="#events"');
    expect(html).toContain('id="contact-form"');
    expect(html).not.toContain("https://tickets.example.com/saved-for-later");
    expect(html).not.toContain("Ticket information will be announced");
    expect(calendar).toEqual(before);
  });

  it.each(["free entry", "vstup zdarma", "tickets"])("finds the same event editor for %s", query => {
    expect(filterAdminV2Destinations(query)[0]).toMatchObject({ id: "events", href: "/admin/v2/pages/events" });
  });

  it("renders real calendar before the unchanged inquiry form and hides drafts", () => {
    const html = renderToStaticMarkup(<ContactPageView data={{ ...data, calendar: INITIAL_CALENDAR_FIXTURE.draft }} />);
    expect(html).toContain('id="events"');
    expect(html.indexOf('id="events"')).toBeLessThan(html.indexOf('id="form"'));
    expect(html).toContain("Backroom blues");
    expect(html).not.toContain("Private rehearsal draft");
    expect(html).toContain('id="contact-form"');
    expect(html).toContain("Send a message");
    expect(html).toContain('aria-label="Live &amp; Contact sections"');
    expect(html).toContain('href="#events"');
    expect(html).toContain('href="#form"');
    expect(html).toContain("Live dates");
    expect(html).toContain("Get in touch");
  });
  it.each([null, { ...INITIAL_CALENDAR_FIXTURE.draft, settings: { ...INITIAL_CALENDAR_FIXTURE.draft.settings, enabled: false } }])("retains booking inquiries while calendar is absent or disabled", calendar => {
    const html = renderToStaticMarkup(<ContactPageView data={{ ...data, calendar }} />);
    expect(html).not.toContain('id="events"');
    expect(html).not.toContain('href="#events"');
    expect(html).not.toContain('aria-label="Live &amp; Contact sections"');
    expect(html).toContain('id="contact-form"');
  });
  it("preserves owner-edited hero copy while the fallback reflects the renamed page", () => {
    expect(FALLBACK_CONTENT.heroes.booking.title).toBe("LIVE & CONTACT");
    const html = renderToStaticMarkup(<ContactPageView data={{ ...data, hero: { ...data.hero, title: "My custom invitation" } }} />);
    const heading = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1].replace(/<[^>]+>/g, "").replace(/\s|&nbsp;/g, "");
    expect(heading).toBe("Mycustominvitation");
    expect(html).not.toContain("LIVE &amp; CONTACT");
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
