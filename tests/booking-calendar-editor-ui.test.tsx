import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BookingCalendarEditor from "@/components/admin/v2/BookingCalendarEditor";
import BookingCalendar from "@/components/booking/BookingCalendar";
import { BOOKING_CALENDAR_MAX_EVENTS, type BookingCalendarDraft, type BookingCalendarSaveState, type BookingCalendarSnapshot } from "@/lib/booking-calendar";

const mocks = vi.hoisted(() => ({
  values: [] as unknown[], cursor: 0, pending: false,
  action: undefined as undefined | ((form: FormData) => Promise<BookingCalendarSaveState>),
  submission: undefined as undefined | Promise<BookingCalendarSaveState>, transition: vi.fn(),
  save: vi.fn(), markDirty: vi.fn(), clearDirty: vi.fn(), confirmDiscard: vi.fn(),
}));
vi.mock("react", async original => {
  const react = await original<typeof import("react")>();
  function state(initial: unknown): [unknown, (value: unknown) => void] {
    const index = mocks.cursor++;
    if (!(index in mocks.values)) mocks.values[index] = typeof initial === "function" ? initial() : initial;
    return [mocks.values[index], (next: unknown) => { mocks.values[index] = typeof next === "function" ? next(mocks.values[index]) : next; }];
  }
  return {
    ...react, startTransition: (callback: () => void) => { mocks.transition(); callback(); },
    useState: state, useRef: (initial: unknown) => state({ current: initial })[0],
    useMemo: (read: () => unknown) => read(), useCallback: (callback: unknown) => callback, useEffect: () => {},
    useActionState: (action: (previous: BookingCalendarSaveState, form: FormData) => Promise<BookingCalendarSaveState>, initial: BookingCalendarSaveState) => {
      const [value, setValue] = state(initial);
      mocks.action = (form: FormData) => {
        mocks.submission = (async () => {
          mocks.pending = true;
          try { const result = await action(value as BookingCalendarSaveState, form); setValue(result); return result; }
          finally { mocks.pending = false; }
        })();
        return mocks.submission;
      };
      return [value, mocks.action, mocks.pending];
    },
  };
});
vi.mock("@/app/admin/v2/pages/events/actions", () => ({ saveBookingCalendarV2: mocks.save }));
vi.mock("@/components/admin/useUnsavedChangesGuard", () => ({ default: () => ({ markDirty: mocks.markDirty, clearDirty: mocks.clearDirty, confirmDiscard: mocks.confirmDiscard }) }));
vi.mock("@/components/booking/BookingCalendar", () => ({ default: () => null }));

type Element = ReactElement<Record<string, unknown>>;
type Props = Parameters<typeof BookingCalendarEditor>[0];
const version = "2026-09-27T14:00:00.000001Z";
const nextVersion = "2026-09-27T14:00:01.000002Z";
let props: Props;

function nodes(tree: ReactNode): Element[] {
  return Children.toArray(tree).flatMap(node => {
    if (!isValidElement<Record<string, unknown>>(node)) return [];
    const component = node.type;
    const children = typeof component === "function" && component.name === "Field"
      ? (component as (props: Record<string, unknown>) => ReactNode)(node.props) : node.props.children as ReactNode;
    return typeof component === "function" && component.name === "Field" ? nodes(children) : [node, ...nodes(children)];
  });
}
function text(tree: ReactNode): string {
  return Children.toArray(tree).map(node => {
    if (!isValidElement<Record<string, unknown>>(node)) return String(node);
    const component = node.type;
    return text(typeof component === "function" && component.name === "Field"
      ? (component as (props: Record<string, unknown>) => ReactNode)(node.props) : node.props.children as ReactNode);
  }).join("");
}
function render() { mocks.cursor = 0; return BookingCalendarEditor(props); }
function find(test: (node: Element) => boolean) {
  const node = nodes(render()).find(test);
  if (!node) throw new Error("Requested editor control not found");
  return node;
}
function button(label: string) { return find(node => node.type === "button" && text(node.props.children as ReactNode).trim() === label); }
function click(node: Element) { return (node.props.onClick as () => void)(); }
function field(id: string, value: string | boolean) {
  const control = find(node => node.props.id === id);
  (control.props.onChange as (event: unknown) => void)({ target: { value, checked: value } });
}
function hidden(name: string) { return find(node => node.type === "input" && node.props.name === name).props.value as string; }
function draft(): BookingCalendarDraft { return JSON.parse(hidden("payload")); }
function form() { const result = new FormData(); result.set("payload", hidden("payload")); result.set("updatedAt", hidden("updatedAt")); return result; }
function select(id = props.snapshot.draft.events[0].id) { field("booking-event-selector", id); }
function publicPreview() { return find(node => node.type === BookingCalendar); }
function result(snapshot: BookingCalendarSnapshot): BookingCalendarSaveState { return { status: "saved", eventId: crypto.randomUUID(), message: "Calendar saved.", snapshot }; }

beforeEach(() => {
  vi.clearAllMocks(); mocks.values = []; mocks.cursor = 0; mocks.pending = false; mocks.action = undefined; mocks.submission = undefined;
  mocks.confirmDiscard.mockImplementation((callback: () => void) => callback());
  props = {
    disabled: false, migrationRequired: false,
    snapshot: {
      updatedAt: version,
      draft: {
        settings: { enabled: true, title: "See you out there.", intro: "Public performances", showTicketLinks: true },
        events: [
          { id: "c9fcdab1-2a8c-4b01-9d40-2a1b46cece00", title: "Acoustic evening", description: "Selected work", date: "2026-10-03", time: "19:00", timezone: "Europe/Prague", city: "Prague", venue: "Example room", kind: "Live show", ticketUrl: "https://tickets.example.com/event", status: "scheduled", published: true },
          { id: "d9fcdab1-2a8c-4b01-9d40-2a1b46cece00", title: "Private draft", description: "Not announced", date: "2026-11-12", time: "20:00", timezone: "Europe/Berlin", city: "Berlin", venue: "Example club", kind: "Live show", ticketUrl: "", status: "sold_out", published: false },
        ],
      },
    },
  };
  vi.stubGlobal("window", { matchMedia: () => ({ matches: true }), location: { reload: vi.fn() } });
});
afterEach(() => vi.unstubAllGlobals());

describe("Live & Contact calendar V2 editor", () => {
  it("uses the same calendar in safe draft preview mode and starts with section settings", () => {
    expect(publicPreview().props).toMatchObject({ data: props.snapshot.draft, preview: true });
    expect(text(render())).toContain("Show calendar on Live & Contact");
    expect(text(render())).toContain("above the contact form on Live & Contact");
    expect(text(render())).not.toContain("Bookings · public calendar preview");
    expect(text(render())).toContain("not advertised as available for booking");
    expect(button("Save calendar").props.disabled).toBe(true);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("selects a preview event into the right inspector without writing or marking dirty", () => {
    const id = props.snapshot.draft.events[1].id;
    (publicPreview().props.onSelectEvent as (id: string) => void)(id);
    expect(find(node => node.props.id === "booking-event-title").props.value).toBe("Private draft");
    expect(publicPreview().props.selectedEventId).toBe(id);
    expect(mocks.markDirty).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("edits event content, venue-local timezone and publication in one versioned draft", () => {
    select(); field("booking-event-title", "Updated show"); field("booking-event-date", "2026-12-17");
    field("booking-event-time", "20:30"); field("booking-event-timezone", "Europe/London");
    field("booking-event-published", false); field("booking-event-status", "cancelled");
    expect(draft().events[0]).toMatchObject({ title: "Updated show", date: "2026-12-17", time: "20:30", timezone: "Europe/London", published: false, status: "cancelled" });
    expect(draft().events[1]).toEqual(props.snapshot.draft.events[1]);
    expect(publicPreview().props.data).toEqual(draft());
    expect(hidden("updatedAt")).toBe(version);
    expect(button("Save calendar").props.disabled).toBe(false);
    expect(mocks.markDirty).toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("can hide the complete calendar without deleting events", () => {
    field("booking-calendar-enabled", false); field("booking-calendar-title", "Tour dates");
    field("booking-calendar-intro", "");
    expect(draft().settings).toEqual({ enabled: false, title: "Tour dates", intro: "", showTicketLinks: true });
    expect(draft().events).toEqual(props.snapshot.draft.events);
    expect(button("Save calendar").props.disabled).toBe(false);
  });
  it("adds only a hidden unsaved event, with safe defaults and shared required-field validation", () => {
    click(button("Add event"));
    const created = draft().events[2];
    expect(created).toMatchObject({ title: "", description: "", published: false, status: "scheduled", time: "19:00", ticketUrl: "" });
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(button("Save calendar").props.disabled).toBe(true);
    expect(text(render())).toContain("Some fields need attention");
    field("booking-event-title", "New show"); field("booking-event-city", "Brno"); field("booking-event-venue", "Example venue");
    expect(button("Save calendar").props.disabled).toBe(false);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("hides the ticket input when disabled and preserves existing URLs through both modes", () => {
    props.snapshot.draft.settings.showTicketLinks = false;
    expect(find(node => node.props.id === "booking-calendar-ticket-links").props.checked).toBe(false);
    expect(text(render())).toContain("Preview only. Edits are not yet public.");
    expect(text(render())).not.toContain("Ticket links are disabled and edits are not yet public");
    select();
    expect(nodes(render()).some(node => node.props.id === "booking-event-ticketUrl")).toBe(false);
    expect(draft().events).toEqual(props.snapshot.draft.events);
    click(button("Open calendar settings")); field("booking-calendar-ticket-links", true); select();
    expect(find(node => node.props.id === "booking-event-ticketUrl").props.value).toBe("https://tickets.example.com/event");
    click(button("Calendar settings")); field("booking-calendar-ticket-links", false); select();
    expect(nodes(render()).some(node => node.props.id === "booking-event-ticketUrl")).toBe(false);
    expect(draft()).toEqual(props.snapshot.draft);
    expect(button("Save calendar").props.disabled).toBe(true);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("keeps admission event-specific while saving ticket visibility and event edits together", async () => {
    field("booking-calendar-ticket-links", false); select();
    field("booking-event-description", "Free entry. Doors open at 19:00.");
    field("booking-event-city", "Heemskerk"); field("booking-event-venue", "Sample music room");
    const submitted = draft();
    expect(submitted.events[1]).toEqual(props.snapshot.draft.events[1]);
    expect(publicPreview().props.data).toEqual(submitted);
    expect(text(render())).toContain("Only describe free entry when it applies to this event");
    mocks.save.mockResolvedValue(result({ draft: submitted, updatedAt: nextVersion }));
    await mocks.action!(form());
    expect(JSON.parse(mocks.save.mock.calls[0][1].get("payload"))).toEqual(submitted);
    expect(draft().settings.showTicketLinks).toBe(false);
    expect(draft().events[0].ticketUrl).toBe("https://tickets.example.com/event");
    expect(button("Save calendar").props.disabled).toBe(true);
    click(button("Calendar settings")); field("booking-calendar-ticket-links", true);
    select(); field("booking-event-description", "Discard these details");
    click(button("Discard changes"));
    expect(draft()).toEqual(submitted);
    expect(hidden("updatedAt")).toBe(nextVersion);
  });
  it("keeps an invalid URL draft recoverable after hiding ticket controls", () => {
    select(); field("booking-event-ticketUrl", "javascript:alert(1)");
    click(button("Calendar settings")); field("booking-calendar-ticket-links", false); select();
    expect(button("Save calendar").props.disabled).toBe(true);
    expect(text(render())).toContain("A draft URL needs attention before saving");
    click(button("Open calendar settings")); field("booking-calendar-ticket-links", true); select();
    expect(find(node => node.props.id === "booking-event-ticketUrl").props.value).toBe("javascript:alert(1)");
    field("booking-event-ticketUrl", "");
    expect(button("Save calendar").props.disabled).toBe(false);
  });
  it("uses admission-neutral capacity copy without changing the stored event status", () => {
    field("booking-calendar-ticket-links", false); select(props.snapshot.draft.events[1].id);
    expect(text(find(node => node.type === "option" && node.props.value === "sold_out"))).toBe("At capacity");
    expect(find(node => node.props.id === "booking-event-status").props.value).toBe("sold_out");
    click(button("Calendar settings")); field("booking-calendar-ticket-links", true); select(props.snapshot.draft.events[1].id);
    expect(text(find(node => node.type === "option" && node.props.value === "sold_out"))).toBe("Sold out");
    expect(draft().events).toEqual(props.snapshot.draft.events);
  });
  it.each([
    ["booking-event-date", "2026-02-30"], ["booking-event-time", "25:00"],
    ["booking-event-timezone", "Europe/Imaginary"], ["booking-event-title", " "],
    ["booking-event-ticketUrl", "javascript:alert(1)"], ["booking-event-ticketUrl", "https://user:secret@example.com"],
  ])("blocks invalid %s input while keeping its exact draft", (id, value) => {
    select(); field(id, value);
    expect(button("Save calendar").props.disabled).toBe(true);
    expect(find(node => node.props.id === id).props.value).toBe(value);
    expect(find(node => node.props.id === id).props["aria-invalid"]).toBe(true);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("requires confirmation before removal, keeps cancellation safe, and writes only on save", () => {
    select(); click(button("Remove event"));
    expect(text(render())).toContain("only when you save all changes");
    expect(draft().events).toHaveLength(2);
    click(button("Keep event")); expect(draft().events).toHaveLength(2);
    click(button("Remove event")); click(button("Confirm removal"));
    expect(draft().events).toEqual([props.snapshot.draft.events[1]]);
    expect(button("Save calendar").props.disabled).toBe(false);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("clears a removal confirmation when the selection changes", () => {
    select(); click(button("Remove event")); select(props.snapshot.draft.events[1].id);
    expect(text(render())).not.toContain("Confirm removal");
    expect(draft().events).toHaveLength(2);
  });
  it("requires explicit discard and restores all settings and event edits", () => {
    field("booking-calendar-title", "Keep until discard"); select(); field("booking-event-city", "Changed");
    click(button("Discard changes"));
    expect(mocks.confirmDiscard).toHaveBeenCalledTimes(1);
    expect(draft()).toEqual(props.snapshot.draft); expect(hidden("updatedAt")).toBe(version);
    expect(button("Save calendar").props.disabled).toBe(true);
  });
  it("submits all changes through the action and only accepts a validated canonical snapshot", async () => {
    select(); field("booking-event-title", "  Canonical title  ");
    const submitted = draft(); const formData = form();
    mocks.save.mockResolvedValue(result({ draft: submitted, updatedAt: nextVersion }));
    await mocks.action!(formData);
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith({ status: "idle", message: "" }, formData);
    expect(draft().events[0].title).toBe("Canonical title");
    expect(hidden("updatedAt")).toBe(nextVersion);
    expect(button("Save calendar").props.disabled).toBe(true);
    expect(mocks.clearDirty).toHaveBeenCalled();
  });
  it("dispatches a native submit in a transition without a React auto-reset form action", async () => {
    select(); field("booking-event-published", false);
    const expectedDraft = draft(); const fields = form();
    const nativeFormData = globalThis.FormData;
    const formElement = { test: "native form element" };
    vi.stubGlobal("FormData", class extends nativeFormData {
      constructor(element?: unknown) {
        super();
        if (element === formElement) fields.forEach((value, key) => this.set(key, value));
      }
    });
    mocks.save.mockResolvedValue(result({ draft: expectedDraft, updatedAt: nextVersion }));
    const formNode = find(node => node.type === "form");
    const preventDefault = vi.fn();
    expect(formNode.props.action).toBeUndefined();
    expect(formNode.props.noValidate).toBeUndefined();
    (formNode.props.onSubmit as (event: unknown) => void)({ preventDefault, currentTarget: formElement });
    expect(preventDefault).toHaveBeenCalledOnce(); expect(mocks.transition).toHaveBeenCalledOnce();
    await mocks.submission;
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(JSON.parse(mocks.save.mock.calls[0][1].get("payload"))).toEqual(expectedDraft);
    expect(find(node => node.props.id === "booking-event-selector").props.value).toBe(expectedDraft.events[0].id);
    expect(find(node => node.props.id === "booking-event-published").props.checked).toBe(false);
    expect(find(node => node.props.id === "booking-event-title").props.value).toBe(expectedDraft.events[0].title);
    expect(button("Save calendar").props.disabled).toBe(true);
  });
  it("prevents unchanged, invalid and unavailable native submits before dispatching", () => {
    for (const scenario of ["unchanged", "invalid", "unavailable"]) {
      if (scenario === "invalid") { select(); field("booking-event-title", ""); }
      if (scenario === "unavailable") props.disabled = true;
      const preventDefault = vi.fn();
      const formNode = find(node => node.type === "form");
      (formNode.props.onSubmit as (event: unknown) => void)({ preventDefault, currentTarget: {} });
      expect(preventDefault).toHaveBeenCalledOnce();
    }
    expect(mocks.transition).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("does not overwrite the local draft with an invalid canonical save response", async () => {
    select(); field("booking-event-title", "Unsaved title"); const original = draft();
    mocks.save.mockResolvedValue(result({ draft: original, updatedAt: "invalid timestamp" }));
    await mocks.action!(form());
    expect(draft()).toEqual(original); expect(hidden("updatedAt")).toBe(version);
    expect(text(render())).toContain("Reload saved calendar");
    expect(button("Save calendar").props.disabled).toBe(true);
  });
  it.each(["conflict", "error", "migration-required", "security-error", "missing-service"] as const)("keeps a draft and stops editing after %s", async status => {
    select(); field("booking-event-title", "Keep my changes"); const original = draft();
    mocks.save.mockResolvedValue({ status, message: "Reload required", eventId: "result" });
    await mocks.action!(form());
    expect(draft()).toEqual(original); expect(hidden("updatedAt")).toBe(version);
    expect(button("Save calendar").props.disabled).toBe(true);
    expect(button("Add event").props.disabled).toBe(true);
    click(button("Reload saved calendar"));
    expect(mocks.confirmDiscard).toHaveBeenCalled(); expect(window.location.reload).toHaveBeenCalled();
  });
  it("keeps drafts and blocks retry after a thrown/lost response without leaking its details", async () => {
    select(); field("booking-event-title", "Keep this draft");
    mocks.save.mockRejectedValue(new Error("private-secret-provider-info"));
    await mocks.action!(form());
    expect(draft().events[0].title).toBe("Keep this draft");
    expect(hidden("updatedAt")).toBe(version);
    expect(text(render())).toContain("server may have saved");
    expect(text(render())).not.toContain("private-secret-provider-info");
    const retry = form(); await mocks.action!(retry);
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });
  it("keeps validation responses editable without accepting a conflicting snapshot", async () => {
    select(); field("booking-event-title", "Correction needed");
    mocks.save.mockResolvedValue({ status: "invalid", message: "Correct a field", fieldErrors: { "events.0.title": ["Server field validation"] }, snapshot: props.snapshot });
    await mocks.action!(form());
    expect(draft().events[0].title).toBe("Correction needed"); expect(hidden("updatedAt")).toBe(version);
    expect(text(render())).toContain("Server field validation");
    field("booking-event-title", "Corrected"); expect(button("Save calendar").props.disabled).toBe(false);
    expect(text(render())).not.toContain("Server field validation");
  });
  it("locks mutations during an in-flight save and suppresses a stale queued submission", async () => {
    select(); field("booking-event-title", "Submitted title"); const submitted = draft(); const data = form();
    let finish: (value: BookingCalendarSaveState) => void = () => {};
    mocks.save.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const work = mocks.action!(data);
    expect(button("Add event").props.disabled).toBe(true);
    field("booking-event-title", "Queued browser change");
    expect(draft()).toEqual(submitted);
    finish(result({ draft: submitted, updatedAt: nextVersion })); await work;
    render(); await mocks.action!(data);
    expect(mocks.save).toHaveBeenCalledTimes(1); expect(hidden("updatedAt")).toBe(nextVersion);
  });
  it("shows the exact pending migration and leaves unavailable data read-only without seeding events", () => {
    props = { ...props, disabled: true, migrationRequired: true, snapshot: { ...props.snapshot, draft: { ...props.snapshot.draft, events: [] } } };
    expect(text(render())).toContain("migration 0061");
    expect(nodes(render()).find(node => node.type === "fieldset")?.props.disabled).toBe(true);
    click(button("Add event")); field("booking-calendar-title", "Do not write");
    expect(draft().events).toEqual([]); expect(draft().settings.title).toBe("See you out there.");
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("enforces the collection limit in the add control", () => {
    props.snapshot.draft.events = Array.from({ length: BOOKING_CALENDAR_MAX_EVENTS }, () => ({ ...props.snapshot.draft.events[0], id: crypto.randomUUID() }));
    expect(button("Add event").props.disabled).toBe(true);
    click(button("Add event")); expect(draft().events).toHaveLength(BOOKING_CALENDAR_MAX_EVENTS);
  });
});
