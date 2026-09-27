import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BookingCalendar from "@/components/booking/BookingCalendar";
import type { BookingCalendarDraft, BookingCalendarEvent } from "@/lib/booking-calendar";

// Exercises the real React callbacks/state transitions; container layout and focus
// remain browser QA responsibilities, not claims made by this small hook harness.
const hooks = vi.hoisted(() => ({ cursor: 0, refCursor: 0, values: [] as unknown[], refs: [] as Array<{ current: unknown }>, effect: null as null | (() => void | (() => void)) }));
vi.mock("react", async original => {
  const react = await original<typeof import("react")>();
  return { ...react, useId: () => "calendar-test", useEffect: (effect: () => void | (() => void)) => { hooks.effect = effect; }, useRef: () => hooks.refs[hooks.refCursor++] ??= { current: null }, useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = typeof initial === "function" ? initial() : initial;
    return [hooks.values[index], (next: unknown) => { hooks.values[index] = typeof next === "function" ? next(hooks.values[index]) : next; }];
  } };
});
type Node = ReactElement<Record<string, unknown>>;
function nodes(tree: ReactNode): Node[] { return Children.toArray(tree).flatMap(node => isValidElement<Record<string, unknown>>(node) ? [node, ...nodes(node.props.children as ReactNode)] : []); }
function text(tree: ReactNode): string { return Children.toArray(tree).map(node => isValidElement<Record<string, unknown>>(node) ? text(node.props.children as ReactNode) : String(node)).join(""); }
function button(tree: ReactNode, name: string) {
  const item = nodes(tree).find(node => node.type === "button" && (node.props["aria-label"] === name || text(node.props.children as ReactNode).trim() === name));
  if (!item) throw new Error(`Missing button: ${name}`);
  return item;
}
function click(tree: ReactNode, name: string) { (button(tree, name).props.onClick as () => void)(); }
function selected(tree: ReactNode) { return nodes(tree).find(node => typeof node.type === "function" && "event" in node.props && "id" in node.props)?.props.event as BookingCalendarEvent | undefined; }
let draft: BookingCalendarDraft;
beforeEach(() => {
  hooks.cursor = 0; hooks.refCursor = 0; hooks.values = []; hooks.refs = []; hooks.effect = null;
  const shared = { description: "", time: "19:30", timezone: "Europe/Prague", city: "Prague", venue: "Venue", kind: "Live", ticketUrl: "", status: "scheduled" as const, published: true };
  draft = { settings: { enabled: true, title: "Live", intro: "" }, events: [
    { ...shared, id: "first", title: "Early set", date: "2026-10-03" },
    { ...shared, id: "second", title: "Late set", date: "2026-10-03", time: "22:30" },
    { ...shared, id: "november", title: "November set", date: "2026-11-14" },
  ] };
});
afterEach(() => vi.unstubAllGlobals());
function render(extra: Partial<Parameters<typeof BookingCalendar>[0]> = {}) {
  hooks.cursor = 0; hooks.refCursor = 0;
  return BookingCalendar({ data: draft, today: "2026-09-27", ...extra });
}

describe("Public calendar interaction callbacks", () => {
  it("selects each same-day event and notifies the inspector exactly once", () => {
    const onSelectEvent = vi.fn();
    let tree = render({ onSelectEvent });
    expect(selected(tree)?.id).toBe("first");
    click(tree, "3 Oct 2026: Late set, Prague");
    tree = render({ onSelectEvent });
    expect(selected(tree)?.id).toBe("second");
    expect(onSelectEvent).toHaveBeenCalledExactlyOnceWith("second");
  });
  it("changes months, clears stale detail for an empty month, and jumps to the next event", () => {
    let tree = render();
    click(tree, "Next month"); tree = render();
    expect(selected(tree)?.id).toBe("november");
    click(tree, "Next month"); tree = render();
    expect(selected(tree)).toBeUndefined();
    expect(text(tree)).toContain("December 2026");
    click(tree, "Next event"); tree = render();
    expect(text(tree)).toContain("October 2026");
    expect(selected(tree)?.id).toBe("first");
  });
  it("switches from responsive default to explicit list/calendar preferences", () => {
    let tree = render();
    expect(tree?.props["data-view"]).toBe("auto");
    click(tree, "List"); tree = render();
    expect(tree?.props["data-view"]).toBe("list");
    expect(button(tree, "List").props["aria-pressed"]).toBe(true);
    click(tree, "Calendar"); tree = render();
    expect(tree?.props["data-view"]).toBe("calendar");
    expect(button(tree, "Calendar").props["aria-pressed"]).toBe(true);
  });
  it("synchronizes auto-view pressed states with observed container width and disconnects cleanly", () => {
    let resize: ((entries: Array<{ contentRect: { width: number } }>) => void) | undefined;
    const observe = vi.fn(); const disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: typeof resize) { resize = callback; }
      observe = observe; disconnect = disconnect;
    });
    let tree = render();
    expect(button(tree, "Calendar").props["aria-pressed"]).toBe(true);
    hooks.refs[0].current = { clientWidth: 390 };
    const cleanup = hooks.effect?.();
    expect(observe).toHaveBeenCalledWith(hooks.refs[0].current);
    resize?.([{ contentRect: { width: 390 } }]);
    tree = render();
    expect(button(tree, "List").props["aria-pressed"]).toBe(true);
    expect(button(tree, "Calendar").props["aria-pressed"]).toBe(false);
    click(tree, "Calendar"); tree = render();
    resize?.([{ contentRect: { width: 350 } }]); tree = render();
    expect(button(tree, "Calendar").props["aria-pressed"]).toBe(true);
    cleanup?.(); expect(disconnect).toHaveBeenCalledOnce();
  });
  it("reveals the selected detail on a stacked public calendar without hijacking the admin preview", () => {
    let tree = render();
    const scrollIntoView = vi.fn();
    hooks.refs[0].current = { clientWidth: 390 };
    hooks.refs[1].current = { scrollIntoView };
    click(tree, "3 Oct 2026: Late set, Prague");
    expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({ behavior: "auto", block: "start" });
    scrollIntoView.mockClear();
    tree = render({ preview: true });
    click(tree, "3 Oct 2026: Early set, Prague");
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
  it("follows inspector selection and edits to an event date outside the visible month", () => {
    render({ preview: true, selectedEventId: "first" });
    let tree = render({ preview: true, selectedEventId: "november" });
    expect(text(tree)).toContain("November 2026");
    draft.events[2] = { ...draft.events[2], date: "2030-04-12" };
    tree = render({ preview: true, selectedEventId: "november" });
    expect(text(tree)).toContain("April 2030");
    expect(selected(tree)?.date).toBe("2030-04-12");
    click(tree, "Previous month"); tree = render({ preview: true, selectedEventId: "november" });
    expect(text(tree)).toContain("March 2030");
    expect(selected(tree)).toBeUndefined();
  });
  it("stays safe when the selected event is deleted or its date is temporarily invalid", () => {
    render({ preview: true, selectedEventId: "first" });
    draft.events[0] = { ...draft.events[0], date: "" };
    expect(() => render({ preview: true, selectedEventId: "first" })).not.toThrow();
    draft.events = [];
    expect(selected(render({ preview: true, selectedEventId: "first" }))).toBeUndefined();
  });
  it("bounds navigation to the supported date range without an invalid century", () => {
    draft.events = [{ ...draft.events[0], date: "1900-01-01" }];
    let tree = render({ today: "1900-01-01" });
    expect(button(tree, "Previous month").props.disabled).toBe(true);
    hooks.values = [];
    draft.events = [{ ...draft.events[0], date: "2199-12-31" }];
    tree = render({ today: "2199-12-31" });
    expect(button(tree, "Next month").props.disabled).toBe(true);
  });
});
