import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import BookingCalendar, { bookingCalendarCells, bookingCalendarDateLabel, getVisibleBookingCalendarEvents, shiftBookingCalendarMonth } from "@/components/booking/BookingCalendar";
import type { BookingCalendarDraft, BookingCalendarEvent } from "@/lib/booking-calendar";

const event: BookingCalendarEvent = {
  id: "concert-a", title: "Evening in Prague", description: "Acoustic performance.",
  date: "2026-10-03", time: "19:30", timezone: "Europe/Prague", city: "Prague", venue: "Test venue", kind: "Live show",
  ticketUrl: "https://tickets.example.com/show", status: "scheduled", published: true,
};
function data(events: BookingCalendarEvent[] = [event]): BookingCalendarDraft {
  return { settings: { enabled: true, title: "See you out there.", intro: "Live shows and special appearances." }, events };
}
function markup(events = [event], preview = false) {
  return renderToStaticMarkup(<BookingCalendar data={data(events)} preview={preview} today="2026-09-27" />);
}

describe("Public booking calendar date presentation", () => {
  it("builds a Monday-first October grid including the correct Saturday", () => {
    const cells = bookingCalendarCells("2026-10");
    expect(cells.slice(0, 6)).toEqual([null, null, null, "2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(cells.filter(Boolean)).toHaveLength(31);
    expect(cells.length % 7).toBe(0);
  });
  it("handles leap years and rejects malformed months", () => {
    expect(bookingCalendarCells("2028-02")).toContain("2028-02-29");
    expect(bookingCalendarCells("2027-02")).not.toContain("2027-02-29");
    expect(bookingCalendarCells("2026-13")).toEqual([]);
    expect(bookingCalendarCells("")).toEqual([]);
  });
  it("crosses year boundaries without a hardcoded demo range", () => {
    expect(shiftBookingCalendarMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftBookingCalendarMonth("2035-01", -1)).toBe("2034-12");
  });
  it("formats the written venue date without shifting it into a visitor timezone", () => {
    expect(bookingCalendarDateLabel("2026-10-03", true)).toBe("Saturday, 3 October 2026");
    expect(bookingCalendarDateLabel("bad date")).toBe("Date to be confirmed");
  });
  it("filters drafts and invalid in-progress dates and sorts without mutating input", () => {
    const draft = data([
      { ...event, id: "later", date: "2026-11-02" },
      { ...event, id: "draft", published: false },
      { ...event, id: "invalid", date: "2026-02-30" },
      event,
    ]);
    expect(getVisibleBookingCalendarEvents(draft).map(value => value.id)).toEqual(["concert-a", "later"]);
    expect(getVisibleBookingCalendarEvents(draft, true).map(value => value.id)).toEqual(["concert-a", "draft", "later"]);
    expect(draft.events[0].id).toBe("later");
  });
});

describe("Public booking calendar rendering", () => {
  it("renders the real title, local date/time, timezone and external tickets", () => {
    const html = markup();
    expect(html).toContain("See you out there.");
    expect(html).toContain("October 2026");
    expect(html).toContain("19:30");
    expect(html).toContain("venue local time");
    expect(html).toContain("Europe/Prague");
    expect(html).toContain('href="https://tickets.example.com/show" target="_blank" rel="noopener noreferrer"');
    expect(html).toContain('href="#form"');
    expect(html).toContain("An empty date does not mean availability");
  });
  it("does not leak draft events even if passed an unfiltered catalog", () => {
    expect(markup([{ ...event, title: "SECRET DRAFT", published: false }])).not.toContain("SECRET DRAFT");
  });
  it("renders nothing for a disabled public calendar", () => {
    const draft = data(); draft.settings.enabled = false;
    expect(renderToStaticMarkup(<BookingCalendar data={draft} today="2026-09-27" />)).toBe("");
  });
  it("renders disabled and unpublished events with editor-only labels, without live outbound links", () => {
    const draft = data([{ ...event, published: false }]); draft.settings.enabled = false;
    const html = renderToStaticMarkup(<BookingCalendar data={draft} preview today="2026-09-27" />);
    expect(html).toContain("Calendar hidden from visitors");
    expect(html).toContain("Draft · not public");
    expect(html).toContain("Evening in Prague");
    expect(html).not.toContain('href="https://tickets');
    expect(html).not.toContain('href="#form"');
  });
  it.each(["sold_out", "cancelled"] as const)("keeps %s events visible but disables ticket sales", status => {
    const html = markup([{ ...event, status }]);
    expect(html).toContain(status === "sold_out" ? "Sold out" : "Cancelled");
    expect(html).toContain("Evening in Prague");
    expect(html).not.toContain('href="https://tickets');
  });
  it.each(["", "javascript:alert(1)", "http://tickets.example.com", "https://user:password@tickets.example.com", "https://localhost/tickets"])("does not expose a ticket link for unsafe or absent URL %s", ticketUrl => {
    const html = markup([{ ...event, ticketUrl }]);
    expect(html).not.toContain('target="_blank"');
    expect(html).toContain("Ticket information will be announced");
  });
  it("escapes event and presentation content rather than injecting HTML", () => {
    const html = markup([{ ...event, title: "<img src=x onerror=alert(1)>", description: "<script>steal()</script>" }]);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
  });
  it("offers distinct controls for multiple events on the same date", () => {
    const html = markup([event, { ...event, id: "concert-b", title: "Late-night set", time: "23:00" }]);
    expect(html).toContain('aria-label="3 Oct 2026: Evening in Prague, Prague"');
    expect(html).toContain('aria-label="3 Oct 2026: Late-night set, Prague"');
  });
  it("does not crash on an empty preview or incomplete event/timezone", () => {
    expect(() => markup([{ ...event, title: "", date: "", timezone: "Europe/" }], true)).not.toThrow();
    const html = renderToStaticMarkup(<BookingCalendar data={data([])} preview />);
    expect(html).toContain("No public events announced yet");
    expect(html).not.toContain("1970");
    expect(html).not.toContain("Backroom blues");
  });
  it("starts on an externally selected event even beyond the current year", () => {
    const html = renderToStaticMarkup(<BookingCalendar data={data([{ ...event, date: "2034-05-10" }])} selectedEventId={event.id} preview today="2026-09-27" />);
    expect(html).toContain("May 2034");
  });
  it("provides a responsive list in narrow containers and uses the global font choices", () => {
    const css = readFileSync(new URL("../components/booking/BookingCalendar.module.css", import.meta.url), "utf8");
    expect(css).toContain("container-type: inline-size");
    expect(css).toContain('@container (max-width: 560px)');
    expect(css).toContain('.section[data-view="auto"] .listPanel { display: block; }');
    expect(css).toContain("var(--font-display)");
    expect(css).toContain("var(--font-ui)");
  });
});
