import { useState } from "react";
import { createRoot } from "react-dom/client";
import BookingCalendarEditor from "@/components/admin/v2/BookingCalendarEditor";
import BookingCalendar from "@/components/booking/BookingCalendar";
import { readFixtureCalendar, setFixtureConflict } from "./booking-calendar-actions";

function Fixture() {
  const [snapshot, setSnapshot] = useState(readFixtureCalendar);
  const [mode, setMode] = useState("admin");
  const [revision, setRevision] = useState(0);
  const [conflict, setConflict] = useState(false);
  return <main className="mx-auto max-w-[1560px] p-4 md:p-7">
    <header className="mb-5 grid gap-3 rounded-2xl border border-white/20 p-4">
      <h1 className="font-ui text-xl">Events calendar · isolated UI QA</h1>
      <p className="text-sm text-white/65">Actual components with synthetic local events. No database, credentials, network saves or production content.</p>
      <div className="flex flex-wrap gap-4">
        <label>QA view <select aria-label="QA view" className="ml-2 bg-black p-2" value={mode} onChange={event => { setSnapshot(readFixtureCalendar()); setMode(event.target.value); setRevision(value => value + 1); }}><option value="admin">Admin editor</option><option value="public">Public calendar</option><option value="migration">Migration missing</option></select></label>
        <label><input type="checkbox" checked={conflict} onChange={event => { setConflict(event.target.checked); setFixtureConflict(event.target.checked); }} /> Simulate version conflict</label>
        <button type="button" className="rounded-lg border border-white/30 px-4 py-2" onClick={() => { setSnapshot(readFixtureCalendar()); setRevision(value => value + 1); }}>Reload saved test state</button>
      </div>
    </header>
    {mode === "public" ? <BookingCalendar data={snapshot.draft} today="2026-10-01" /> : <BookingCalendarEditor key={revision} snapshot={snapshot} disabled={mode === "migration"} migrationRequired={mode === "migration"} />}
  </main>;
}

const container = document.getElementById("fixture-root");
if (!container) throw new Error("Missing calendar fixture root");
createRoot(container).render(<Fixture />);
