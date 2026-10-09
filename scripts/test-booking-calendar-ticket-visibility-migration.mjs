// Disposable PostgreSQL WASM. No credentials, providers or hosted SQL.
// Usage: node scripts/test-booking-calendar-ticket-visibility-migration.mjs <PGlite dist/index.js>
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
if (!process.argv[2]) throw new Error("Pass a local @electric-sql/pglite/dist/index.js path.");
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const read = name => readFile(new URL(`../supabase/${name}`, import.meta.url), "utf8");
const baseMigration = await read("migrations/0053_booking_calendar.sql");
const migration = await read("migrations/0061_booking_calendar_ticket_visibility.sql");
const baseChecks = await read("checks/0053_booking_calendar.sql");
const checks = await read("checks/0061_booking_calendar_ticket_visibility.sql");
await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
await db.exec(baseMigration);
const snapshot = async () => (await db.query("select public.get_booking_calendar_v2_snapshot() as data")).rows[0].data;
const publicData = async () => (await db.query("select public.get_public_booking_calendar_v1() as data")).rows[0].data;
const save = async (version, draft) => (await db.query("select public.save_booking_calendar_v2($1,$2) as data", [version, draft])).rows[0].data;
const valid = async draft => (await db.query("select public.is_valid_booking_calendar_v2($1) as ok", [draft])).rows[0].ok;
const assertChecks = async () => {
  await db.exec("begin read only");
  for (const [sql, count] of [[baseChecks, 8], [checks, 10]]) {
    const verified = (await db.query(sql)).rows;
    assert.equal(verified.length, count);
    assert.ok(verified.every(check => check.passed), JSON.stringify(verified));
  }
  await db.exec("rollback");
};
const initial = await snapshot();
const event = { id: "11111111-1111-4111-8111-111111111111", title: "Isolated fixture event", description: "Free entry. A saved link can be enabled later.", date: "2026-10-09", time: "19:30", timezone: "Europe/Prague", city: "Prague", venue: "Fixture venue", kind: "Live show", ticketUrl: "https://tickets.example.com/events/one", status: "scheduled", published: true };
const legacyDraft = { settings: { ...initial.draft.settings, enabled: true }, events: [
  event,
  { ...event, id: "22222222-2222-4222-8222-222222222222", date: "2026-10-08", title: "PRIVATE DRAFT", published: false },
  { ...event, id: "33333333-3333-4333-8333-333333333333", status: "sold_out" },
  { ...event, id: "44444444-4444-4444-8444-444444444444", status: "cancelled" },
] };
const legacy = await save(initial.updatedAt, legacyDraft);
const adminDefinitions = (await db.query("select oid::regprocedure::text as name, pg_get_functiondef(oid) as definition, proacl::text as acl from pg_proc where oid in ('public.get_booking_calendar_v2_snapshot()'::regprocedure, 'public.save_booking_calendar_v2(timestamptz,jsonb)'::regprocedure) order by name")).rows;
await db.exec(migration);
let saved = await snapshot();
assert.equal(saved.draft.settings.showTicketLinks, false);
assert.notEqual(saved.updatedAt, legacy.updatedAt);
assert.deepEqual(saved.draft, { ...legacy.draft, settings: { ...legacy.draft.settings, showTicketLinks: false } });
assert.deepEqual((await db.query("select oid::regprocedure::text as name, pg_get_functiondef(oid) as definition, proacl::text as acl from pg_proc where oid in ('public.get_booking_calendar_v2_snapshot()'::regprocedure, 'public.save_booking_calendar_v2(timestamptz,jsonb)'::regprocedure) order by name")).rows, adminDefinitions);
assert.equal((await publicData()).settings.showTicketLinks, false);
assert.equal((await publicData()).events.length, 3);
assert.ok((await publicData()).events.every(item => item.ticketUrl === ""));
assert.equal(JSON.stringify(await publicData()).includes("PRIVATE DRAFT"), false);
assert.equal(JSON.stringify(await publicData()).includes(event.ticketUrl), false);
await assertChecks();
await assert.rejects(() => save(legacy.updatedAt, saved.draft), error => error.code === "40001");
await assert.rejects(() => save(saved.updatedAt, legacy.draft), error => error.code === "22023");
assert.deepEqual(await snapshot(), saved);

const invalidDrafts = [
  legacy.draft,
  ...[null, "false", 0, {}, []].map(showTicketLinks => ({ ...saved.draft, settings: { ...saved.draft.settings, showTicketLinks } })),
  { ...saved.draft, settings: { ...saved.draft.settings, unknown: true } },
  ...[{ date: "2026-02-29" }, { status: "unknown" }, { ticketUrl: "javascript:alert(1)" }, { ticketUrl: "https://user:pass@example.com" }, { privateNotes: "extra" }].map(patch => ({ ...saved.draft, events: [{ ...event, ...patch }] })),
];
for (const invalid of invalidDrafts) {
  assert.equal(await valid(invalid), false);
  await assert.rejects(() => save(saved.updatedAt, invalid), error => error.code === "22023");
}
assert.deepEqual(await snapshot(), saved);

for (const showTicketLinks of [true, false]) {
  const previous = saved;
  saved = await save(previous.updatedAt, { ...previous.draft, settings: { ...previous.draft.settings, showTicketLinks } });
  assert.notEqual(saved.updatedAt, previous.updatedAt);
  assert.deepEqual(saved.draft.events, legacy.draft.events);
  const projected = await publicData();
  assert.equal(projected.settings.showTicketLinks, showTicketLinks);
  assert.deepEqual(projected.events, saved.draft.events.filter(item => item.published).map(item => ({ ...item, ticketUrl: showTicketLinks ? item.ticketUrl : "" })));
  await db.exec(migration);
  assert.deepEqual(await snapshot(), saved, "reruns preserve both the owner choice and its exact CAS version");
  await assertChecks();
  await assert.rejects(() => save(previous.updatedAt, saved.draft), error => error.code === "40001");
}

for (const role of ["anon", "authenticated", "service_role"]) {
  await db.exec(`set role ${role}`);
  await assert.rejects(() => db.query("select * from public.booking_calendar"), error => error.code === "42501");
  await assert.rejects(() => db.query("update public.booking_calendar set updated_at = clock_timestamp()"), error => error.code === "42501");
  await assert.rejects(() => db.query("select public.is_valid_booking_calendar_v2($1)", [saved.draft]), error => error.code === "42501");
  assert.ok((await publicData()).events.every(item => item.ticketUrl === ""));
  if (role !== "service_role") {
    await assert.rejects(snapshot, error => error.code === "42501");
    await assert.rejects(() => save(saved.updatedAt, saved.draft), error => error.code === "42501");
  } else {
    assert.deepEqual(await snapshot(), saved);
    const previous = saved;
    saved = await save(previous.updatedAt, { ...previous.draft, settings: { ...previous.draft.settings, enabled: false } });
    assert.equal(await publicData(), null);
    assert.deepEqual(saved.draft.events, previous.draft.events);
  }
  await db.exec("reset role");
}
await assertChecks();
await db.exec(migration);
assert.deepEqual(await snapshot(), saved);

// A fresh disabled calendar is upgraded without invented announcements.
await db.exec("drop table public.booking_calendar");
await db.exec(baseMigration);
const emptyLegacy = await snapshot();
await db.exec(migration);
const empty = await snapshot();
assert.deepEqual(empty.draft, { ...emptyLegacy.draft, settings: { ...emptyLegacy.draft.settings, showTicketLinks: false } });
assert.equal(await publicData(), null);
await assertChecks();
await db.close();
console.log(`Ticket visibility migration passed: ${invalidDrafts.length} invalid drafts, preserved events/URLs/statuses, CAS, unchanged private RPCs, public projection, permissions, fresh install, safe reruns and 10 read-only checks (plus all 8 from 0053).`);
