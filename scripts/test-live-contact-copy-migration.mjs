// Disposable PostgreSQL WASM only. No credentials, providers or hosted SQL.
// Usage: node scripts/test-live-contact-copy-migration.mjs <PGlite dist/index.js>
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

if (!process.argv[2]) throw new Error("Pass a local @electric-sql/pglite/dist/index.js path.");
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const read = name => readFile(new URL(`../supabase/${name}`, import.meta.url), "utf8");
const initial = await read("migrations/0001_initial_schema.sql");
const contact = await read("migrations/0033_contact_page_editor.sql");
const calendar = await read("migrations/0053_booking_calendar.sql");
const migration = await read("migrations/0054_live_contact_page_copy.sql");
const checks = await read("checks/0054_live_contact_page_copy.sql");

await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
for (const table of ["site_settings", "page_heroes", "media_assets"]) {
  const tableSql = initial.match(new RegExp(`create table if not exists public\\.${table} \\([\\s\\S]*?\\n\\);`))?.[0];
  assert.ok(tableSql, `Missing original ${table} definition`);
  await db.exec(tableSql);
}
const triggerFunction = initial.match(/create or replace function public\.set_updated_at\(\)[\s\S]*?\$\$;/)?.[0];
const trigger = initial.match(/create trigger page_heroes_updated_at[\s\S]*?;/)?.[0];
assert.ok(triggerFunction); assert.ok(trigger);
await db.exec(triggerFunction);
await db.exec(trigger);
await db.exec("alter table public.page_heroes enable row level security; alter table public.page_heroes add column media_framing jsonb; alter table public.media_assets add column deleted_at timestamptz; insert into public.site_settings(id, artist_name) values ('main','Isolated fixture');");
await db.exec(contact);
await db.exec(calendar);
await db.exec("insert into public.page_heroes(page_slug,title,background_src) values ('home','CONTACT','/images/home.jpg');");
const row = async slug => (await db.query("select pg_catalog.to_jsonb(hero) as data from public.page_heroes hero where page_slug=$1", [slug])).rows[0]?.data;
const calendarRow = async () => (await db.query("select pg_catalog.to_jsonb(calendar) as data from public.booking_calendar calendar")).rows[0].data;
const contactSnapshot = async () => (await db.query("select public.get_contact_page_v2_snapshot('main') as data")).rows[0].data;
const unchangedHome = await row("home");
const unchangedCalendar = await calendarRow();
const framing = { desktop: { x: 22, y: 37, scale: 1.3 }, mobile: { x: 30, y: 80, scale: 0.8 } };
await db.query("update public.page_heroes set subtitle='Owner subtitle', cta_label='Owner CTA', cta_href='#form', background_src='/images/owner.jpg', poster_src='/images/poster.jpg', media_type='video', media_framing=$1 where page_slug='booking'", [framing]);
const stockTitles = ["CONTACT", "Contact", "contact", "BOOKING", "Booking", "booking", "BOOKINGS", "Bookings", "bookings", "  CoNtAcT  "];
for (const title of stockTitles) {
  await db.query("update public.page_heroes set title=$1 where page_slug='booking'", [title]);
  const before = await row("booking");
  const stale = await contactSnapshot();
  await db.exec(migration);
  const after = await row("booking");
  assert.equal(after.title, "LIVE & CONTACT");
  assert.notEqual(after.updated_at, before.updated_at);
  assert.deepEqual({ ...after, title: before.title, updated_at: before.updated_at }, before);
  const { updatedAt: ignored, ...payload } = stale.hero;
  assert.ok(ignored);
  await assert.rejects(
    () => db.query("select public.save_contact_hero_v2('main',$1,$2)", [stale.hero.updatedAt, payload]),
    error => error.code === "40001",
  );
  await db.exec(migration);
  assert.deepEqual(await row("booking"), after, "A repeated migration must not bump the version");
}
const customTitles = ["", "   ", "CONTACT THE BAND", "Bookings & press", "Live dates", "LIVE & CONTACT", "Kontakt", "Let's talk"];
for (const title of customTitles) {
  await db.query("update public.page_heroes set title=$1 where page_slug='booking'", [title]);
  const before = await row("booking");
  await db.exec(migration);
  assert.deepEqual(await row("booking"), before, "Custom or blank titles must remain byte-for-byte unchanged");
}
assert.deepEqual(await row("home"), unchangedHome);
assert.deepEqual(await calendarRow(), unchangedCalendar);
await db.exec("begin read only");
const verified = (await db.query(checks)).rows;
assert.equal(verified.length, 5);
assert.ok(verified.every(check => check.passed), JSON.stringify(verified));
await db.exec("rollback");

await db.query("update public.page_heroes set title='CONTACT' where page_slug='booking'");
const failClosedBefore = await row("booking");
await db.exec("alter table public.page_heroes disable trigger page_heroes_updated_at");
await assert.rejects(() => db.exec(migration), error => error.code === "55000");
await db.exec("rollback");
assert.deepEqual(await row("booking"), failClosedBefore);
await db.exec("alter table public.page_heroes enable trigger page_heroes_updated_at");
// A same-name trigger with broken version behavior must also roll back the copy.
await db.exec("create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin return new; end; $$;");
await assert.rejects(() => db.exec(migration), error => error.code === "55000");
await db.exec("rollback");
assert.deepEqual(await row("booking"), failClosedBefore);
await db.exec(triggerFunction);
await db.exec(migration);
assert.deepEqual(await calendarRow(), unchangedCalendar);
await db.close();
console.log(`Live & Contact migration passed: ${stockTitles.length} stock titles, ${customTitles.length} custom/blank titles, stale-save CAS, preserved media/framing/CTA/calendar, idempotent rerun, fail-closed version guards and 5 read-only checks.`);
