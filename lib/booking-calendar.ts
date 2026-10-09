import { z } from "zod";

export const BOOKING_CALENDAR_MAX_EVENTS = 250;
// Leave room for multipart action metadata below Next's default 1 MB boundary.
export const BOOKING_CALENDAR_MAX_PAYLOAD = 750_000;
export const BOOKING_CALENDAR_LIMITS = {
  title: 160, description: 2_000, city: 120, venue: 180, kind: 80,
  ticketUrl: 2_048, timezone: 80, intro: 600,
} as const;

export type BookingCalendarEvent = {
  id: string; title: string; description: string; date: string; time: string;
  timezone: string; city: string; venue: string; kind: string; ticketUrl: string;
  status: "scheduled" | "sold_out" | "cancelled"; published: boolean;
};
export type BookingCalendarSettings = {
  enabled: boolean; title: string; intro: string;
  /** Legacy public responses omit this field; absence never enables ticket links. */
  showTicketLinks?: boolean;
};
export type BookingCalendarDraft = { settings: BookingCalendarSettings; events: BookingCalendarEvent[] };
export type BookingCalendarSnapshot = { draft: BookingCalendarDraft; updatedAt: string };
export type BookingCalendarSaveState = {
  status: "idle" | "saved" | "invalid" | "conflict" | "error" | "migration-required" | "security-error" | "missing-service";
  message: string; eventId?: string; snapshot?: BookingCalendarSnapshot; fieldErrors?: Record<string, string[]>;
};
export const INITIAL_BOOKING_CALENDAR_SAVE_STATE: BookingCalendarSaveState = { status: "idle", message: "" };
export const DEFAULT_BOOKING_CALENDAR_DRAFT: BookingCalendarDraft = {
  settings: {
    enabled: false,
    showTicketLinks: false,
    title: "See you out there.",
    intro: "Live shows, festivals, and special appearances. Find the next one near you.",
  },
  events: [],
};

export function isValidBookingCalendarDate(value: string) {
  if (!/^(?:19|20|21)\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function isValidBookingCalendarTimeZone(value: string) {
  // Offset identifiers are not event locations and are unsupported by PostgreSQL's
  // IANA registry. UTC is the one deliberately accepted non-region identifier.
  if (value !== "UTC" && !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+$/.test(value)) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(0); return true; }
  catch { return false; }
}

export function isSafeBookingCalendarTicketUrl(value: string) {
  if (!value) return true;
  if (/[\s\\\u0000-\u001f\u007f]/.test(value)) return false;
  // Keep the save boundary aligned with PostgreSQL, including host labels.
  if (!/^https:\/\/[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+(?:\:443)?(?:[/?#][^\s\\]*)?$/.test(value)) return false;
  try {
    const url = new URL(value);
    return value.startsWith("https://") && url.protocol === "https:" && !url.username && !url.password &&
      (!url.port || url.port === "443") && /^[a-z0-9.-]+$/i.test(url.hostname) &&
      url.hostname.includes(".") && !url.hostname.endsWith(".") &&
      !/^(?:\d+\.){3}\d+$/.test(url.hostname) && !/(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(url.hostname);
  } catch { return false; }
}

const text = (max: number, required = false) => z.string().trim()
  .min(required ? 1 : 0, "This field is required.")
  .max(max, `Use at most ${max} characters.`)
  .refine(value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), "Remove unsupported control characters.");
export const bookingCalendarEventSchema = z.object({
  id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i), title: text(160, true), description: text(2_000),
  date: z.string().refine(isValidBookingCalendarDate, "Choose a valid date between 1900 and 2199."),
  time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Choose a local start time."),
  timezone: text(80, true).refine(isValidBookingCalendarTimeZone, "Choose a valid IANA time zone, such as Europe/Prague."),
  city: text(120, true), venue: text(180, true), kind: text(80, true),
  ticketUrl: text(2_048).refine(isSafeBookingCalendarTicketUrl, "Use a public https:// ticket URL without credentials, or leave it empty."),
  status: z.enum(["scheduled", "sold_out", "cancelled"]), published: z.boolean(),
}).strict();
const bookingCalendarSettingsSchema = z.object({
  enabled: z.boolean(), title: text(160, true), intro: text(600), showTicketLinks: z.boolean(),
}).strict();
const bookingCalendarDraftBaseSchema = z.object({
  settings: bookingCalendarSettingsSchema,
  events: z.array(bookingCalendarEventSchema).max(BOOKING_CALENDAR_MAX_EVENTS),
}).strict();
function validateCalendarCollection(draft: BookingCalendarDraft, context: z.RefinementCtx) {
  if (new TextEncoder().encode(JSON.stringify(draft)).byteLength > BOOKING_CALENDAR_MAX_PAYLOAD) {
    context.addIssue({ code: "custom", path: ["events"], message: "This calendar is too large. Shorten event descriptions or remove old events before saving." });
  }
  const seen = new Set<string>();
  draft.events.forEach((event, index) => {
    const key = event.id.toLowerCase();
    if (seen.has(key)) context.addIssue({ code: "custom", path: ["events", index, "id"], message: "Every event must have its own ID." });
    seen.add(key);
  });
}
// Reads support the exact pre-0061 shape during rollout. Saves must carry the
// explicit setting so an old client cannot silently reset a saved owner choice.
export const bookingCalendarDraftSchema = bookingCalendarDraftBaseSchema.extend({
  settings: bookingCalendarSettingsSchema.extend({ showTicketLinks: z.boolean().default(false) }),
}).superRefine(validateCalendarCollection);
const bookingCalendarSaveDraftSchema = bookingCalendarDraftBaseSchema.superRefine(validateCalendarCollection);
export const bookingCalendarTimestampSchema = z.string().max(64)
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/)
  .refine(value => Number.isFinite(Date.parse(value)), "Reload the editor to obtain the saved version.");

export function sortBookingCalendarEvents(events: readonly BookingCalendarEvent[]) {
  return [...events].sort((a, b) => `${a.date} ${a.time} ${a.id}`.localeCompare(`${b.date} ${b.time} ${b.id}`, "en"));
}
export function parseBookingCalendarDraft(value: unknown) { return bookingCalendarDraftSchema.safeParse(value); }
export function parseBookingCalendarSaveDraft(value: unknown) { return bookingCalendarSaveDraftSchema.safeParse(value); }
/** Check the raw response before legacy read normalization adds its false default. */
export function hasBookingCalendarTicketVisibility(value: unknown) {
  return z.object({ draft: z.object({ settings: z.object({ showTicketLinks: z.boolean() }) }) }).safeParse(value).success;
}
export function isNewerBookingCalendarVersion(saved: string, previous: string) {
  const milliseconds = Date.parse(saved) - Date.parse(previous);
  if (milliseconds !== 0) return milliseconds > 0;
  // Preserve PostgreSQL's microseconds and treat equivalent UTC offsets alike.
  const remainder = (value: string) => Number((value.match(/\.(\d+)/)?.[1] || "").padEnd(6, "0").slice(3));
  return remainder(saved) > remainder(previous);
}
export function parseBookingCalendarSnapshot(value: unknown): BookingCalendarSnapshot | null {
  const parsed = z.object({ draft: bookingCalendarDraftSchema, updatedAt: bookingCalendarTimestampSchema }).strict().safeParse(value);
  return parsed.success ? { ...parsed.data, draft: { ...parsed.data.draft, events: sortBookingCalendarEvents(parsed.data.draft.events) } } : null;
}
export function createFallbackBookingCalendarSnapshot(): BookingCalendarSnapshot {
  return { draft: { settings: { ...DEFAULT_BOOKING_CALENDAR_DRAFT.settings }, events: [] }, updatedAt: new Date(0).toISOString() };
}
export function bookingCalendarFieldErrors(error: z.ZodError) {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".") || "form";
    (fields[path] ??= []).push(issue.message);
  }
  return fields;
}
