// Disposable PostgreSQL WASM. No credentials, providers or hosted SQL.
// Usage: node scripts/test-booking-calendar-migration.mjs <PGlite dist/index.js>
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
if (!process.argv[2]) throw new Error("Pass a local @electric-sql/pglite/dist/index.js path.");
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const migration = await readFile(new URL("../supabase/migrations/0053_booking_calendar.sql", import.meta.url), "utf8");
const checks = await readFile(new URL("../supabase/checks/0053_booking_calendar.sql", import.meta.url), "utf8");
await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
await db.exec(migration);
const snapshot = async () => (await db.query("select public.get_booking_calendar_v2_snapshot() as data")).rows[0].data;
const publicData = async () => (await db.query("select public.get_public_booking_calendar_v1() as data")).rows[0].data;
const save = async (version, draft) => (await db.query("select public.save_booking_calendar_v2($1,$2) as data", [version, draft])).rows[0].data;
const valid = async draft => (await db.query("select public.is_valid_booking_calendar_v2($1) as ok", [draft])).rows[0].ok;
const initial = await snapshot();
assert.equal(initial.draft.settings.enabled, false);
assert.deepEqual(initial.draft.events, []);
assert.equal(await publicData(), null);
const event = { id: "11111111-1111-4111-8111-111111111111", title: "Isolated test event", description: "Fixture, never public data.", date: "2026-10-09", time: "19:30", timezone: "Europe/Prague", city: "Prague", venue: "Fixture venue", kind: "Live show", ticketUrl: "https://tickets.example.com/events/one", status: "scheduled", published: true };
const draft = { settings: { ...initial.draft.settings, enabled: true }, events: [event, { ...event, id: "22222222-2222-4222-8222-222222222222", date: "2026-10-08", title: "PRIVATE DRAFT", published: false }] };
assert.equal(await valid(draft), true);
const saved = await save(initial.updatedAt, draft);
assert.notEqual(saved.updatedAt, initial.updatedAt);
assert.equal(saved.draft.events[0].title, "PRIVATE DRAFT");
assert.equal((await publicData()).events.length, 1);
assert.equal(JSON.stringify(await publicData()).includes("PRIVATE DRAFT"), false);
assert.deepEqual((await publicData()).events[0], event);
await assert.rejects(() => save(initial.updatedAt, initial.draft), error => error.code === "40001");
assert.deepEqual(await snapshot(), saved);

const invalidDrafts = [null, [], {}, { ...draft, secret: "unexpected" },
  { ...draft, settings: { ...draft.settings, enabled: "true" } },
  { ...draft, settings: { ...draft.settings, title: " " } },
  { ...draft, events: [event, { ...event, id: event.id.toUpperCase() }] },
  { ...draft, events: Array.from({ length: 251 }, (_, i) => ({ ...event, id: `11111111-1111-4111-8111-${String(i).padStart(12,"0")}` })) },
  ...[{ date: "2026-02-29" }, { date: "2026-13-01" }, { date: "2200-01-01" }, { time: "24:00" }, { time: "9:00" }, { timezone: "Fake/Zone" }, { timezone: "+02:00" }, { status: "unknown" }, { published: "true" }, { venue: "" }, { ticketUrl: "javascript:alert(1)" }, { ticketUrl: "https://user:pass@example.com" }, { ticketUrl: "https://example.com:8443/path" }, { ticketUrl: "https://127.0.0.1/path" }, { ticketUrl: "https://example.com\\@evil.com" }, { ticketUrl: "https://example.test" }, { ticketUrl: "https://example.com/space here" }, { id: "not-a-uuid" }, { privateNotes: "extra" }, { description: "x".repeat(2001) }, { title: "tab\u0001control" }].map(patch => ({ ...draft, events: [{ ...event, ...patch }] })),
];
for (const invalid of invalidDrafts) {
  assert.equal(await valid(invalid), false, JSON.stringify(invalid).slice(0,200));
  await assert.rejects(() => save(saved.updatedAt, invalid), error => error.code === "22023");
}
assert.deepEqual(await snapshot(), saved);
assert.equal(await valid({ ...draft, events: [{ ...event, date: "2028-02-29", timezone: "UTC", ticketUrl: "" }] }), true);
const huge = { ...draft, events: Array.from({ length: 250 }, (_, i) => ({ ...event, id: `11111111-1111-4111-8111-${String(i).padStart(12,"0")}`, description: "ž".repeat(2000) })) };
assert.equal(await valid(huge), false);

for (const role of ["anon", "authenticated", "service_role"]) {
  await db.exec(`set role ${role}`);
  await assert.rejects(() => db.query("select * from public.booking_calendar"), error => error.code === "42501");
  await assert.rejects(() => db.query("select public.is_valid_booking_calendar_v2($1)", [draft]), error => error.code === "42501");
  const projection = await publicData();
  assert.equal(projection.events.length, 1);
  if (role !== "service_role") {
    await assert.rejects(snapshot, error => error.code === "42501");
    await assert.rejects(() => save(saved.updatedAt, initial.draft), error => error.code === "42501");
  } else {
    assert.deepEqual(await snapshot(), saved);
    const hidden = await save(saved.updatedAt, { ...draft, settings: { ...draft.settings, enabled: false } });
    assert.equal(await publicData(), null);
    await save(hidden.updatedAt, draft);
  }
  await db.exec("reset role");
}
const beforeRerun = await snapshot();
await db.exec(migration);
assert.deepEqual(await snapshot(), beforeRerun);
await db.exec("begin read only");
const verified = (await db.query(checks)).rows;
assert.equal(verified.length, 8);
assert.ok(verified.every(check => check.passed), JSON.stringify(verified));
await db.exec("rollback");
await db.close();
console.log(`Booking calendar migration passed: ${invalidDrafts.length} invalid drafts, CAS, ordering, permissions, privacy, disabled fallback, safe rerun and 8 read-only checks.`);
