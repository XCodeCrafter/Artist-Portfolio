"use client";

import { useEffect, useId, useRef, useState } from "react";
import { FiArrowDown, FiArrowUpRight, FiCalendar, FiChevronLeft, FiChevronRight, FiMapPin } from "react-icons/fi";
import {
  isSafeBookingCalendarTicketUrl,
  isValidBookingCalendarDate,
  type BookingCalendarDraft,
  type BookingCalendarEvent,
} from "@/lib/booking-calendar";
import styles from "./BookingCalendar.module.css";

type Props = {
  data: BookingCalendarDraft;
  preview?: boolean;
  onSelectEvent?: (id: string) => void;
  selectedEventId?: string;
  /** Stable server-provided ISO date; never read a visitor's clock during hydration. */
  today?: string;
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const STATUS_LABELS = { scheduled: "Scheduled", sold_out: "Sold out", cancelled: "Cancelled" } as const;

function statusLabel(status: BookingCalendarEvent["status"], showTicketLinks: boolean) {
  return status === "sold_out" && !showTicketLinks ? "At capacity" : STATUS_LABELS[status];
}

function dateValue(date: string) {
  return new Date(`${date}T12:00:00.000Z`);
}

export function bookingCalendarDateLabel(date: string, long = false) {
  if (!isValidBookingCalendarDate(date)) return "Date to be confirmed";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC", day: "numeric", month: long ? "long" : "short", year: "numeric",
    ...(long ? { weekday: "long" as const } : {}),
  }).format(dateValue(date));
}

export function shiftBookingCalendarMonth(month: string, step: number) {
  const [year, number] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, number - 1 + step, 1, 12));
  return date.toISOString().slice(0, 7);
}

/** Monday-first calendar dates. Blank cells cannot be mistaken for bookable slots. */
export function bookingCalendarCells(month: string): Array<string | null> {
  const firstDate = `${month}-01`;
  if (!isValidBookingCalendarDate(firstDate)) return [];
  const first = dateValue(firstDate);
  const count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const start = (first.getUTCDay() + 6) % 7;
  const cells: Array<string | null> = Array.from({ length: start }, () => null);
  for (let day = 1; day <= count; day++) cells.push(`${month}-${String(day).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

export function getVisibleBookingCalendarEvents(data: BookingCalendarDraft, preview = false) {
  return data.events
    .filter((event) => (preview || event.published) && isValidBookingCalendarDate(event.date))
    .slice()
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`) || a.id.localeCompare(b.id));
}

function monthLabel(month: string) {
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(dateValue(`${month}-01`));
}

function EventStatus({ event, preview, showTicketLinks }: { event: BookingCalendarEvent; preview: boolean; showTicketLinks: boolean }) {
  return <span className={styles.statuses}>
    {event.status !== "scheduled" && <span className={styles.status} data-status={event.status}>{statusLabel(event.status, showTicketLinks)}</span>}
    {preview && !event.published && <span className={styles.status}>Draft · not public</span>}
  </span>;
}

function EventDetail({ event, preview, id, showTicketLinks }: { event: BookingCalendarEvent | undefined; preview: boolean; id: string; showTicketLinks: boolean }) {
  if (!event) return <aside className={styles.detail} id={id} aria-label="Event details">
    <FiCalendar aria-hidden="true" className={styles.emptyIcon} />
    <h3>No dates announced</h3>
    <p className={styles.description}>Check another month or get in touch about your event.</p>
  </aside>;

  const tickets = showTicketLinks && event.status === "scheduled" && Boolean(event.ticketUrl) && isSafeBookingCalendarTicketUrl(event.ticketUrl);
  return <aside className={styles.detail} id={id} aria-label="Event details">
    <div className={styles.poster} aria-hidden="true"><span>{event.kind || "LIVE"}</span><strong>{event.city || "Live on stage"}</strong></div>
    <span className={styles.eyebrow}>{event.kind || "Live event"}</span>
    <h3>{event.title || "Untitled event"}</h3>
    <EventStatus event={event} preview={preview} showTicketLinks={showTicketLinks} />
    <p className={styles.meta}><FiCalendar aria-hidden="true" /><span><time dateTime={event.date}>{bookingCalendarDateLabel(event.date, true)}</time><br />{event.time || "Time to be confirmed"}{event.time && " · venue local time"}<br /><span className={styles.timezone}>{event.timezone || "Time zone to be confirmed"}</span></span></p>
    <p className={styles.meta}><FiMapPin aria-hidden="true" /><span>{event.venue || "Venue to be confirmed"}{event.city && <><br />{event.city}</>}</span></p>
    {event.description && <p className={styles.description}>{event.description}</p>}
    {tickets && (preview ? <span className={styles.ticketPreview}>Tickets <FiArrowUpRight aria-hidden="true" /><span className={styles.srOnly}> — external link disabled in editor preview</span></span> : <a className={styles.ticketLink} href={event.ticketUrl} target="_blank" rel="noopener noreferrer">Tickets <FiArrowUpRight aria-hidden="true" /><span className={styles.srOnly}> — opens the organiser&apos;s website in a new tab</span></a>)}
    {event.status === "cancelled" && <p className={styles.description}>This event has been cancelled.{showTicketLinks ? " For ticket enquiries, contact the organiser." : ""}</p>}
    {event.status === "sold_out" && <p className={styles.description}>{showTicketLinks ? "This event is sold out." : "This event is at capacity."}</p>}
    {showTicketLinks && event.status === "scheduled" && !tickets && <p className={styles.ticketNote}>Ticket information will be announced by the organiser.</p>}
    {preview && showTicketLinks && <p className={styles.ticketNote}>Editor preview · external ticket links are disabled here.</p>}
  </aside>;
}

export default function BookingCalendar({ data, preview = false, onSelectEvent, selectedEventId, today }: Props) {
  const id = useId();
  const headingId = `${id}-heading`;
  const detailId = `${id}-detail`;
  const sectionRef = useRef<HTMLElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const events = getVisibleBookingCalendarEvents(data, preview);
  const showTicketLinks = data.settings.showTicketLinks === true;
  const stableToday = today && isValidBookingCalendarDate(today) ? today : undefined;
  const upcoming = events.find((event) => !stableToday || event.date >= stableToday);
  const externalEvent = events.find((event) => event.id === selectedEventId);
  const initialMonth = externalEvent?.date.slice(0, 7) || upcoming?.date.slice(0, 7) || stableToday?.slice(0, 7) || events[0]?.date.slice(0, 7) || "";
  const [navigation, setNavigation] = useState({ month: initialMonth, selectedId: externalEvent?.id || upcoming?.id || "", externalId: selectedEventId, externalDate: externalEvent?.date });
  const [view, setView] = useState<"auto" | "calendar" | "list">("auto");
  const [compact, setCompact] = useState(false);
  const activeView = view === "auto" ? (compact ? "list" : "calendar") : view;
  useEffect(() => {
    const section = sectionRef.current;
    if (!section || typeof ResizeObserver === "undefined") return;
    // CSS selects the first-paint layout; observe that same container so the
    // pressed-state semantics also follow an admin panel resize or phone width.
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) setCompact(entry.contentRect.width <= 560);
    });
    observer.observe(section);
    return () => observer.disconnect();
  }, [data.settings.enabled, preview]);
  // Follow inspector selection/date edits, but allow visitors and editors to browse independently.
  const externalChanged = selectedEventId !== navigation.externalId || externalEvent?.date !== navigation.externalDate;
  const month = externalChanged && externalEvent ? externalEvent.date.slice(0, 7) : navigation.month || initialMonth;
  const monthEvents = events.filter((event) => event.date.startsWith(`${month}-`));
  const selected = (externalChanged ? externalEvent : monthEvents.find((event) => event.id === navigation.selectedId)) || monthEvents[0];
  const anchorMonth = stableToday?.slice(0, 7) || initialMonth;
  const firstMonth = [anchorMonth && shiftBookingCalendarMonth(anchorMonth, -12), events[0]?.date.slice(0, 7), month].filter(Boolean).sort()[0] || month;
  const lastMonth = [anchorMonth && shiftBookingCalendarMonth(anchorMonth, 12), events[events.length - 1]?.date.slice(0, 7), month].filter(Boolean).sort().at(-1) || month;
  const minimum = firstMonth < "1900-01" ? "1900-01" : firstMonth;
  const maximum = lastMonth > "2199-12" ? "2199-12" : lastMonth;
  const eventsByDate = new Map<string, BookingCalendarEvent[]>();
  for (const event of monthEvents) eventsByDate.set(event.date, [...(eventsByDate.get(event.date) || []), event]);

  function navigate(nextMonth: string, eventId?: string) {
    setNavigation({ month: nextMonth, selectedId: eventId || "", externalId: selectedEventId, externalDate: externalEvent?.date });
  }

  function selectEvent(event: BookingCalendarEvent) {
    navigate(event.date.slice(0, 7), event.id);
    onSelectEvent?.(event.id);
    // The stacked detail may be below a long mobile list. Keep the clicked control
    // focused, announce the new selection, and bring the visible detail into view.
    if (!preview && sectionRef.current && sectionRef.current.clientWidth <= 760) {
      detailRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
    }
  }

  if (!data.settings.enabled && !preview) return null;

  return <section ref={sectionRef} id="events" className={`${styles.section} public-nav-anchor`} aria-labelledby={headingId} data-view={view}>
    <div className={styles.inner}>
      <div className={styles.kicker}><span>On stage / Live</span>{preview && <span className={styles.previewBadge}>{data.settings.enabled ? "Editor preview" : "Calendar hidden from visitors"}</span>}</div>
      <div className={styles.heading}><div><h2 id={headingId}>{data.settings.title || "See you out there."}</h2>{data.settings.intro && <p>{data.settings.intro}</p>}</div>{!preview && <a className={styles.enquiryLink} href="#form">Booking enquiry <FiArrowDown aria-hidden="true" /></a>}</div>
      {month && <div className={styles.toolbar}>
        <div className={styles.monthControl}>
          <button className={styles.iconButton} type="button" aria-label="Previous month" disabled={month <= minimum} onClick={() => navigate(shiftBookingCalendarMonth(month, -1))}><FiChevronLeft aria-hidden="true" /></button>
          <h3 className={styles.month} aria-live="polite" aria-atomic="true">{monthLabel(month)}</h3>
          <button className={styles.iconButton} type="button" aria-label="Next month" disabled={month >= maximum} onClick={() => navigate(shiftBookingCalendarMonth(month, 1))}><FiChevronRight aria-hidden="true" /></button>
        </div>
        <div className={styles.viewControls}>
          {upcoming && <button className={styles.upcoming} type="button" onClick={() => navigate(upcoming.date.slice(0, 7), upcoming.id)}>Next event</button>}
          <div className={styles.viewSwitch} role="group" aria-label="Event display">
            <button type="button" data-view-button="calendar" aria-pressed={activeView === "calendar"} onClick={() => setView("calendar")}>Calendar</button>
            <button type="button" data-view-button="list" aria-pressed={activeView === "list"} onClick={() => setView("list")}>List</button>
          </div>
        </div>
      </div>}
      <div className={styles.layout}>
        <div className={styles.schedule}>
          {month && <div className={styles.calendarPanel}>
            <div className={styles.weekdays} aria-hidden="true">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
            <div className={styles.grid} aria-label={`Events in ${monthLabel(month)}`}>
              {bookingCalendarCells(month).map((date, index) => {
                const dayEvents = date ? eventsByDate.get(date) || [] : [];
                return <div key={date || `blank-${index}`} className={styles.day} data-empty={!date || undefined} data-today={date === stableToday || undefined}>
                  {date && <><span className={styles.dayNumber} aria-hidden="true">{Number(date.slice(-2))}</span>{dayEvents.map((event) => <button
                    className={styles.eventDay} key={event.id} type="button" aria-pressed={selected?.id === event.id}
                    aria-label={`${bookingCalendarDateLabel(event.date)}: ${event.title || "Untitled event"}, ${event.city || "venue to be confirmed"}${event.status !== "scheduled" ? `, ${statusLabel(event.status, showTicketLinks)}` : ""}${preview && !event.published ? ", unpublished draft" : ""}`}
                    aria-controls={detailId} data-status={event.status} onClick={() => selectEvent(event)}
                  ><span className={styles.eventCity}>{event.city || event.title || "Live event"}</span><span className={styles.eventName}>{event.title || "Untitled event"}</span>{event.status !== "scheduled" && <span className={styles.dayStatus}>{statusLabel(event.status, showTicketLinks)}</span>}{preview && !event.published && <span className={styles.dayStatus}>Draft</span>}</button>)}</>}
                </div>;
              })}
            </div>
            {monthEvents.length > 0 && <p className={styles.calendarKey}>Select an event to see the details{stableToday && " · Underlined date: today"}.</p>}
          </div>}
          {monthEvents.length > 0 ? <div className={styles.listPanel} aria-label="Events this month">
            {monthEvents.map((event) => <button key={event.id} className={styles.eventRow} type="button" aria-pressed={selected?.id === event.id} aria-controls={detailId} onClick={() => selectEvent(event)}>
              <span className={styles.rowDate}><strong>{Number(event.date.slice(-2))}</strong><span>{new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "short" }).format(dateValue(event.date))}</span></span>
              <span className={styles.rowContent}><strong>{event.title || "Untitled event"}</strong><span>{event.venue || "Venue to be confirmed"}{event.city && ` · ${event.city}`}</span><EventStatus event={event} preview={preview} showTicketLinks={showTicketLinks} /></span><FiArrowUpRight aria-hidden="true" />
            </button>)}
          </div> : <div className={styles.emptyMonth}><FiCalendar aria-hidden="true" /><p>No public events announced{month ? " for this month" : " yet"}.</p><span>More dates will appear here when they are announced.</span></div>}
        </div>
        <div className={styles.detailWrap} ref={detailRef}>
          <p className={styles.srOnly} role="status" aria-live="polite">{selected ? `Selected event: ${selected.title || "Untitled event"}, ${bookingCalendarDateLabel(selected.date)}, ${statusLabel(selected.status, showTicketLinks)}.` : "No event selected."}</p>
          <EventDetail event={selected} preview={preview} id={detailId} showTicketLinks={showTicketLinks} />
        </div>
      </div>
      <p className={styles.availability}>Public events only. An empty date does not mean availability for private bookings.</p>
    </div>
  </section>;
}
