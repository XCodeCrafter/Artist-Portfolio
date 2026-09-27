// Browser QA only: in-memory state, no server imports, credentials or network.
import {
  parseBookingCalendarDraft,
  type BookingCalendarSaveState,
  type BookingCalendarSnapshot,
} from "@/lib/booking-calendar";

export const INITIAL_CALENDAR_FIXTURE: BookingCalendarSnapshot = {
  updatedAt: "2026-09-27T10:00:00.000Z",
  draft: {
    settings: { enabled: true, title: "See you out there.", intro: "Synthetic local QA events — never published." },
    events: [
      { id: "10000000-0000-4000-8000-000000000001", title: "Backroom blues", description: "A synthetic intimate live show.", date: "2026-10-03", time: "19:30", timezone: "Europe/Prague", city: "Prague", venue: "Velvet Club", kind: "Live show", ticketUrl: "https://example.com/tickets", status: "scheduled", published: true },
      { id: "10000000-0000-4000-8000-000000000002", title: "Swamp Sessions", description: "A synthetic sold-out show.", date: "2026-10-17", time: "18:00", timezone: "Europe/Vienna", city: "Vienna", venue: "Riverbank", kind: "Festival", ticketUrl: "", status: "sold_out", published: true },
      { id: "10000000-0000-4000-8000-000000000003", title: "Private rehearsal draft", description: "Never appears in the public view.", date: "2026-10-24", time: "18:00", timezone: "Europe/Prague", city: "Prague", venue: "Studio", kind: "Rehearsal", ticketUrl: "", status: "scheduled", published: false },
      { id: "10000000-0000-4000-8000-000000000004", title: "Northbound", description: "Synthetic November show.", date: "2026-11-07", time: "20:00", timezone: "Europe/Berlin", city: "Berlin", venue: "Room 24", kind: "Live show", ticketUrl: "", status: "cancelled", published: true },
    ],
  },
};

let saved = structuredClone(INITIAL_CALENDAR_FIXTURE);
let simulateConflict = false;
export function readFixtureCalendar() { return structuredClone(saved); }
export function setFixtureConflict(value: boolean) { simulateConflict = value; }

export async function saveBookingCalendarV2(_previous: BookingCalendarSaveState, form: FormData): Promise<BookingCalendarSaveState> {
  await new Promise(resolve => setTimeout(resolve, 250));
  const eventId = crypto.randomUUID();
  if (simulateConflict || form.get("updatedAt") !== saved.updatedAt) {
    return { status: "conflict", message: "Synthetic version conflict: draft kept, reload the saved version.", eventId };
  }
  const parsed = parseBookingCalendarDraft(JSON.parse(String(form.get("payload"))));
  if (!parsed.success) return { status: "invalid", message: "Invalid local test draft.", eventId };
  saved = { draft: parsed.data, updatedAt: new Date(Date.parse(saved.updatedAt) + 1000).toISOString() };
  return { status: "saved", message: "Saved in local test memory only.", eventId, snapshot: readFixtureCalendar() };
}
