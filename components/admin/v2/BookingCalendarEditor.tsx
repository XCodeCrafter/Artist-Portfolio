"use client";

import { startTransition, useActionState, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { FaCalendarAlt, FaCheck, FaPlus, FaSlidersH, FaSpinner, FaTrash } from "react-icons/fa";
import { saveBookingCalendarV2 } from "@/app/admin/v2/pages/events/actions";
import BookingCalendar from "@/components/booking/BookingCalendar";
import useUnsavedChangesGuard from "@/components/admin/useUnsavedChangesGuard";
import { needsEditorReload, runEditorSave } from "@/lib/admin/editor-save-recovery";
import {
  BOOKING_CALENDAR_MAX_EVENTS,
  parseBookingCalendarDraft,
  parseBookingCalendarSnapshot,
  type BookingCalendarDraft,
  type BookingCalendarEvent,
  type BookingCalendarSaveState,
  type BookingCalendarSnapshot,
} from "@/lib/booking-calendar";

type Props = {
  snapshot: BookingCalendarSnapshot;
  disabled: boolean;
  migrationRequired: boolean;
  loadError?: string;
};

const INITIAL_STATE: BookingCalendarSaveState = { status: "idle", message: "" };
const panelClass = "min-w-0 rounded-[24px] border border-white/10 bg-[#101012]";
const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/12 px-4 text-xs font-semibold text-white/75 outline-none transition hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/65 disabled:cursor-not-allowed disabled:opacity-35";
const inputClass = "mt-2 min-h-11 w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/55 disabled:opacity-40";

function Field({ id, label, error, children, required = false, help }: {
  id: string; label: string; error?: string; children: ReactNode; required?: boolean; help?: string;
}) {
  return <div>
    <label className="block text-xs font-semibold text-white/65" htmlFor={id}>{label}{required ? <span aria-hidden="true" className="ml-1 text-[#ff806c]">*</span> : null}</label>
    {children}
    {help ? <p id={`${id}-help`} className="mt-2 text-xs leading-5 text-white/45">{help}</p> : null}
    {error ? <p id={`${id}-error`} role="alert" className="mt-2 text-xs leading-5 text-red-200">{error}</p> : null}
  </div>;
}

function localToday() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function newEvent(): BookingCalendarEvent {
  return {
    id: crypto.randomUUID(), title: "", description: "", date: localToday(), time: "19:00",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Prague",
    city: "", venue: "", kind: "Live show", ticketUrl: "", status: "scheduled", published: false,
  };
}

/** The public calendar and the inspector share the same draft. Nothing is
 * written until the complete, versioned calendar is explicitly saved. */
export default function BookingCalendarEditor({ snapshot, disabled, migrationRequired, loadError }: Props) {
  const [saved, setSaved] = useState(snapshot);
  const [draft, setDraft] = useState(snapshot.draft);
  const [selectedId, setSelectedId] = useState("");
  const [removeId, setRemoveId] = useState("");
  const [lastSubmittedPayload, setLastSubmittedPayload] = useState("");
  const draftRef = useRef(snapshot.draft);
  const savedRef = useRef(snapshot);
  const savingRef = useRef(false);
  const lastHandledEventRef = useRef("");
  const inspectorRef = useRef<HTMLElement>(null);
  const { markDirty, clearDirty, confirmDiscard } = useUnsavedChangesGuard(
    "You have unsaved calendar changes. Leave and discard them?", true,
  );
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved.draft);
  const validation = useMemo(() => parseBookingCalendarDraft(draft), [draft]);
  const [state, action, pending] = useActionState(async (previous: BookingCalendarSaveState, form: FormData) => {
    if (disabled || migrationRequired || loadError || savingRef.current || previous.status === "migration-required" || previous.status === "security-error" || previous.status === "missing-service") return previous;
    const submitted = String(form.get("payload") || "");
    // A queued second submit must not write an obsolete draft or version.
    if (submitted !== JSON.stringify(draftRef.current) || form.get("updatedAt") !== savedRef.current.updatedAt ||
      submitted === JSON.stringify(savedRef.current.draft) || !parseBookingCalendarDraft(draftRef.current).success) return previous;
    savingRef.current = true;
    setLastSubmittedPayload(submitted);
    try {
      return await runEditorSave(previous, () => saveBookingCalendarV2(previous, form), result => {
        if (!result.eventId || !result.snapshot || !result.snapshot.updatedAt) return false;
        if (lastHandledEventRef.current === result.eventId) return true;
        const confirmed = parseBookingCalendarSnapshot(result.snapshot);
        if (!confirmed) return false;
        lastHandledEventRef.current = result.eventId;
        savedRef.current = confirmed;
        setSaved(confirmed);
        // Inputs are locked while saving, but retain a newer local draft even
        // if an event already queued by the browser arrives during the request.
        if (JSON.stringify(draftRef.current) === submitted) {
          draftRef.current = confirmed.draft;
          setDraft(confirmed.draft);
          clearDirty();
        } else if (JSON.stringify(draftRef.current) === JSON.stringify(confirmed.draft)) {
          clearDirty();
        } else {
          markDirty();
        }
        return true;
      });
    } finally {
      savingRef.current = false;
    }
  }, INITIAL_STATE);
  const recoveryRequired = needsEditorReload(state) || state.status === "migration-required" || state.status === "security-error" || state.status === "missing-service";
  const blocked = disabled || migrationRequired || Boolean(loadError) || pending || recoveryRequired;
  const selectedIndex = draft.events.findIndex(event => event.id === selectedId);
  const selected = draft.events[selectedIndex];
  const errors: Record<string, string[]> = {};
  if (!validation.success) {
    for (const issue of validation.error.issues) {
      const path = issue.path.map(String).join(".") || "calendar";
      errors[path] = [...(errors[path] || []), issue.message];
    }
  }
  const errorFor = (key: string) => errors[key]?.join(" ");
  const publishedCount = draft.events.filter(event => event.published).length;

  function change(next: BookingCalendarDraft) {
    if (blocked || savingRef.current) return;
    draftRef.current = next;
    setDraft(next);
    setRemoveId("");
    if (JSON.stringify(next) === JSON.stringify(savedRef.current.draft)) clearDirty(); else markDirty();
  }
  function patchEvent(patch: Partial<BookingCalendarEvent>) {
    change({ ...draft, events: draft.events.map(event => event.id === selectedId ? { ...event, ...patch } : event) });
  }
  function select(id: string) {
    setSelectedId(id);
    setRemoveId("");
    if (typeof window !== "undefined" && !window.matchMedia("(min-width: 1280px)").matches) {
      inspectorRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
    }
  }
  function add() {
    if (blocked || savingRef.current || draft.events.length >= BOOKING_CALENDAR_MAX_EVENTS) return;
    const event = newEvent();
    change({ ...draft, events: [...draft.events, event] });
    select(event.id);
  }
  function remove() {
    if (blocked || savingRef.current || removeId !== selectedId || !selected) return;
    change({ ...draft, events: draft.events.filter(event => event.id !== removeId) });
    setSelectedId("");
    setRemoveId("");
  }
  function discard() {
    if (blocked || savingRef.current) return;
    confirmDiscard(() => {
      draftRef.current = savedRef.current.draft;
      setDraft(savedRef.current.draft);
      setSelectedId("");
      setRemoveId("");
    });
  }
  function textField(key: "title" | "description" | "city" | "venue" | "kind" | "ticketUrl" | "date" | "time" | "timezone", label: string, maxLength: number, options: { multiline?: boolean; required?: boolean; help?: string; type?: "date" | "time" | "url"; placeholder?: string } = {}) {
    if (!selected) return null;
    const id = `booking-event-${key}`;
    const error = errorFor(`events.${selectedIndex}.${key}`);
    const props = {
      id, className: inputClass, value: selected[key], maxLength, required: options.required,
      placeholder: options.placeholder,
      "aria-invalid": error ? true as const : undefined,
      "aria-describedby": [error ? `${id}-error` : "", options.help ? `${id}-help` : ""].filter(Boolean).join(" ") || undefined,
      onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => patchEvent({ [key]: event.target.value }),
    };
    return <Field id={id} label={label} error={error} required={options.required} help={options.help}>
      {options.multiline ? <textarea {...props} rows={5} /> : <input {...props} type={options.type || "text"} min={options.type === "date" ? "1900-01-01" : undefined} max={options.type === "date" ? "2199-12-31" : undefined} />}
    </Field>;
  }

  return <form onSubmit={event => {
    event.preventDefault();
    if (blocked || savingRef.current || !dirty || !validation.success) return;
    const submitted = new FormData(event.currentTarget);
    // React form actions automatically reset DOM controls after fulfillment.
    // Dispatch in a transition without an action attribute so the selected
    // event and publication checkbox remain aligned with the controlled draft.
    startTransition(() => action(submitted));
  }} onReset={event => event.preventDefault()} data-unsaved-guard-bypass="true" className="min-w-0">
    <input type="hidden" name="payload" value={JSON.stringify(draft)} readOnly />
    <input type="hidden" name="updatedAt" value={saved.updatedAt} readOnly />
    {migrationRequired ? <p role="status" className="mb-4 rounded-2xl border border-amber-300/20 bg-amber-300/5 p-4 text-sm leading-6 text-amber-100">Apply migration 0053 in Supabase, verify its checks, then reload this page. Calendar saving stays disabled until the database is ready.</p> : null}
    {loadError ? <p role="alert" className="mb-4 rounded-2xl border border-red-300/20 bg-red-300/5 p-4 text-sm leading-6 text-red-100">{loadError}</p> : null}
    {disabled && !migrationRequired && !loadError ? <p role="status" className="mb-4 rounded-2xl border border-amber-300/20 p-4 text-sm text-amber-100">Calendar data is unavailable. This editor is read-only; no fallback data can overwrite the saved calendar.</p> : null}
    <section className={`${panelClass} mb-4 p-4 sm:p-5`} aria-label="Calendar workspace controls">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-[10px] font-semibold uppercase tracking-widest text-[#ff806c]">Preview → select → edit → save</p>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-white/50">Click an event in the real calendar to edit it. Hidden drafts stay visible here; visitors only see published events when the calendar is enabled.</p></div>
        <button type="button" className={buttonClass} onClick={add} disabled={blocked || draft.events.length >= BOOKING_CALENDAR_MAX_EVENTS}><FaPlus aria-hidden="true" /> Add event</button>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <button type="button" aria-pressed={!selected} className={buttonClass + (!selected ? " border-[#ff806c]/60 bg-[#ff806c]/10" : "")} onClick={() => select("")}><FaSlidersH aria-hidden="true" /> Calendar settings</button>
        <label className="block min-w-0 flex-1 text-xs font-semibold text-white/65" htmlFor="booking-event-selector">Or choose an event
          <select id="booking-event-selector" className={inputClass} value={selectedId} onChange={event => select(event.target.value)}>
            <option value="">Calendar settings</option>
            {draft.events.map(event => <option key={event.id} value={event.id}>{event.date || "No date"} · {event.title || "Untitled event"}{event.published ? "" : " · Draft"}</option>)}
          </select>
        </label>
      </div>
      <p className="mt-3 text-xs leading-5 text-white/45">{draft.events.length} / {BOOKING_CALENDAR_MAX_EVENTS} events · {publishedCount} published · calendar {draft.settings.enabled ? "enabled" : "hidden"}. Dates with no public event are not advertised as available for booking.</p>
    </section>

    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,390px)] xl:items-start">
      <section className={`${panelClass} overflow-hidden`} aria-label="Live calendar preview">
        <header className="border-b border-white/10 px-4 py-3"><p className="flex items-center gap-2 text-xs font-semibold text-white/75"><FaCalendarAlt aria-hidden="true" /> Bookings · public calendar preview</p><p className="mt-1 text-xs text-white/45">Preview only. Ticket links are disabled and edits are not yet public.</p></header>
        <BookingCalendar data={draft} preview onSelectEvent={select} selectedEventId={selectedId || undefined} />
      </section>
      <section ref={inspectorRef} className={`${panelClass} scroll-mt-4 p-4 sm:p-5`} aria-labelledby="booking-calendar-inspector-title">
        <div className="mb-5"><p className="text-[10px] font-semibold uppercase tracking-widest text-[#ff806c]">{selected ? "Event inspector" : "Calendar section"}</p><h2 id="booking-calendar-inspector-title" className="heading-ui mt-2 break-words text-xl font-semibold text-white">{selected ? selected.title || "New event" : "Calendar settings"}</h2><p className="mt-2 text-xs leading-5 text-white/45">{selected ? "Changes appear in the preview immediately. Save when ready." : "This section appears above the existing Bookings inquiry form."}</p></div>
        <fieldset disabled={blocked} className="grid min-w-0 gap-5">
          <legend className="sr-only">{selected ? "Selected event fields" : "Calendar display settings"}</legend>
          {!selected ? <>
            <label htmlFor="booking-calendar-enabled" className="flex min-h-12 items-start gap-3 rounded-xl border border-white/10 p-3 text-sm text-white/80"><input id="booking-calendar-enabled" type="checkbox" className="mt-1 accent-[#ff674f]" checked={draft.settings.enabled} onChange={event => change({ ...draft, settings: { ...draft.settings, enabled: event.target.checked } })} /><span>Show calendar on Bookings<span className="mt-1 block text-xs leading-5 text-white/45">Switching this off hides the entire public calendar without deleting events. Save to apply.</span></span></label>
            <Field id="booking-calendar-title" label="Section title" required error={errorFor("settings.title")}>
              <input id="booking-calendar-title" className={inputClass} required maxLength={160} value={draft.settings.title} aria-invalid={Boolean(errorFor("settings.title"))} aria-describedby={errorFor("settings.title") ? "booking-calendar-title-error" : undefined} onChange={event => change({ ...draft, settings: { ...draft.settings, title: event.target.value } })} />
            </Field>
            <Field id="booking-calendar-intro" label="Introduction" error={errorFor("settings.intro")}>
              <textarea id="booking-calendar-intro" className={inputClass} rows={4} maxLength={600} value={draft.settings.intro} aria-invalid={Boolean(errorFor("settings.intro"))} aria-describedby={errorFor("settings.intro") ? "booking-calendar-intro-error" : undefined} onChange={event => change({ ...draft, settings: { ...draft.settings, intro: event.target.value } })} />
            </Field>
            <p className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-5 text-white/50">Public programme, not an availability calendar. Private inquiries still go through the existing protected contact form. No visitor bookings or emails are created by this editor.</p>
          </> : <>
            <label htmlFor="booking-event-published" className="flex min-h-12 items-start gap-3 rounded-xl border border-white/10 p-3 text-sm text-white/80"><input id="booking-event-published" type="checkbox" className="mt-1 accent-[#ff674f]" checked={selected.published} onChange={event => patchEvent({ published: event.target.checked })} /><span>Publish this event<span className="mt-1 block text-xs leading-5 text-white/45">{draft.settings.enabled ? "Visible to visitors after you save." : "The calendar is hidden. Enable it in Calendar settings when ready."}</span></span></label>
            {textField("title", "Event title", 160, { required: true, placeholder: "Acoustic evening" })}
            <div className="grid grid-cols-2 gap-3">
              {textField("date", "Date", 10, { type: "date", required: true })}
              {textField("time", "Start time", 5, { type: "time", required: true })}
            </div>
            {textField("timezone", "Event timezone", 80, { required: true, placeholder: "Europe/Prague", help: "Use the venue's IANA timezone, for example Europe/Prague, Europe/London or America/New_York. The time above is local to the venue." })}
            {textField("city", "City", 120, { required: true })}
            {textField("venue", "Venue", 180, { required: true })}
            {textField("kind", "Event type", 80, { required: true, placeholder: "Concert, festival, theatre…" })}
            {textField("description", "Description", 2000, { multiline: true })}
            <Field id="booking-event-status" label="Event status" error={errorFor(`events.${selectedIndex}.status`)}>
              <select id="booking-event-status" className={inputClass} value={selected.status} onChange={event => patchEvent({ status: event.target.value as BookingCalendarEvent["status"] })}>
                <option value="scheduled">Scheduled</option><option value="sold_out">Sold out</option><option value="cancelled">Cancelled</option>
              </select>
            </Field>
            {textField("ticketUrl", "Ticket / event link (optional)", 2048, { type: "url", placeholder: "https://…", help: selected.status === "scheduled" ? "An HTTPS link to the organiser or ticket seller. Leave empty if there is no booking link yet." : "The ticket button is hidden for sold-out and cancelled events. The saved link is kept in case the status changes." })}
            <div className="border-t border-white/10 pt-4"><button type="button" className={buttonClass + " text-red-200"} onClick={() => setRemoveId(selected.id)}><FaTrash aria-hidden="true" /> Remove event</button>
              {removeId === selected.id ? <div role="group" aria-label="Confirm event removal" className="mt-3 rounded-2xl border border-red-300/25 bg-red-300/5 p-4 text-xs leading-5 text-red-100"><p>Remove “{selected.title || "Untitled event"}” from the draft? It is removed from the saved calendar only when you save all changes. To keep its record, unpublish it instead.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className={buttonClass} onClick={remove}>Confirm removal</button><button type="button" className={buttonClass} onClick={() => setRemoveId("")}>Keep event</button></div></div> : null}
            </div>
          </>}
        </fieldset>
      </section>
    </div>

    {!validation.success ? <section aria-label="Calendar validation" role="alert" className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/5 p-4 text-xs leading-5 text-amber-100"><p className="font-semibold">Some fields need attention before saving.</p><ul className="mt-2 list-disc space-y-1 pl-5">{Object.entries(errors).map(([path, messages]) => {
      const eventIndex = /^events\.(\d+)/.exec(path)?.[1];
      const event = eventIndex === undefined ? null : draft.events[Number(eventIndex)];
      return <li key={path}>{event ? <button className="underline underline-offset-4" type="button" onClick={() => select(event.id)}>{event.title || "Untitled event"}</button> : "Calendar"}: {messages.join(" ")}</li>;
    })}</ul></section> : null}
    {state.status !== "idle" && (state.status !== "invalid" || lastSubmittedPayload === JSON.stringify(draft)) ? <section className={`mt-4 rounded-2xl border p-4 text-sm leading-6 ${state.status === "saved" ? "border-emerald-300/20 bg-emerald-300/5 text-emerald-100" : "border-red-300/20 bg-red-300/5 text-red-100"}`} role={state.status === "saved" ? "status" : "alert"}>{state.message}{state.status !== "saved" && state.fieldErrors ? <ul className="mt-2 list-disc pl-5 text-xs">{Object.entries(state.fieldErrors).map(([path, messages]) => <li key={path}>{messages.join(" ")}</li>)}</ul> : null}</section> : null}
    <footer className={`${panelClass} sticky bottom-3 z-20 mt-4 grid grid-cols-2 items-center gap-3 bg-[#101012]/95 p-4 shadow-xl backdrop-blur-xl sm:flex sm:flex-wrap sm:justify-between sm:gap-4`}>
      <div className="col-span-2 min-w-0 sm:flex-1"><p aria-live="polite" className="text-sm font-semibold text-white">{pending ? "Saving calendar…" : blocked ? "Calendar is read-only" : dirty ? "Calendar has unsaved changes" : "All calendar changes are saved"}</p><p className="mt-1 hidden text-xs leading-5 text-white/50 sm:block">Saving applies the entire calendar, including visibility and removals. Hidden drafts remain private.</p></div>
      {recoveryRequired ? <button type="button" className={`${buttonClass} col-span-2`} disabled={pending} onClick={() => confirmDiscard(() => window.location.reload())}>Reload saved calendar</button> : null}
      <button type="button" className={buttonClass} disabled={blocked || !dirty} onClick={discard}>Discard changes</button>
      <button type="submit" className={`${buttonClass} !bg-white !text-black`} disabled={blocked || !dirty || !validation.success} aria-busy={pending}>{pending ? <FaSpinner className="animate-spin" aria-hidden="true" /> : <FaCheck aria-hidden="true" />}{pending ? "Saving…" : "Save calendar"}</button>
    </footer>
  </form>;
}
