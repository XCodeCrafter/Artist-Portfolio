// Disposable PostgreSQL runtime checks; never contacts Supabase or reads secrets.
// Usage: node scripts/test-contact-optional-copy-migration.mjs <PGlite dist/index.js>
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
if (!process.argv[2]) throw new Error("Pass a local @electric-sql/pglite/dist/index.js path.");
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const sql = name => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql as $$ select null::uuid $$;`);
await db.exec((await sql("0001_initial_schema")).replace("create extension if not exists pgcrypto;", ""));
await db.exec((await sql("0002_media_manager")).split("insert into storage.buckets")[0]);
for (const name of ["0013_gallery_media_placements", "0014_gallery_studio", "0023_admin_operations_hardening"]) await db.exec(await sql(name));
const migration = await sql("0045_contact_optional_copy");
// The forward migration fails atomically when its predecessor or parent is absent.
await assert.rejects(() => db.exec(migration), error => error.code === "55000"); await db.exec("rollback");
assert.equal((await db.query("select to_regprocedure('public.get_contact_copy_capabilities_v2()') as rpc")).rows[0].rpc, null);
await db.exec(await sql("0033_contact_page_editor"));
await assert.rejects(() => db.exec(migration), error => error.code === "55000"); await db.exec("rollback");
await db.exec(`insert into public.site_settings(id,artist_name,tagline,description,location,contact_blurb,spotify_artist_url)
  values('main','Artist','Tagline','Description','Prague','Bookings welcome.','https://open.spotify.com/artist/test');
  insert into public.booking_inquiries(name,email,message,admin_notes) values('Existing visitor','visitor@example.test','Existing inquiry','Private inbox note');`);
const settings = async () => (await db.query("select to_jsonb(item) as data from public.site_settings item where id='main'")).rows[0]?.data;
const snapshot = async () => (await db.query("select public.get_contact_page_v2_snapshot('main') as data")).rows[0].data;
const allContent = async () => (await db.query(`select * from (
  select 'settings' as kind,to_jsonb(item) as data from public.site_settings item
  union all select 'hero',to_jsonb(item) from public.page_heroes item
  union all select 'inquiry',to_jsonb(item) from public.booking_inquiries item
  union all select 'media',to_jsonb(item) from public.media_assets item
  ) content order by kind,data::text`)).rows;
const functionDefinition = async signature => (await db.query("select pg_get_functiondef($1::regprocedure) as definition", [signature])).rows[0].definition.replaceAll("\r\n", "\n");
const save = async (payload, options = {}) => (await db.query("select public.save_contact_details_v2($1,$2,$3) as data", [options.site ?? "main", options.version ?? (await settings())?.updated_at, JSON.stringify(payload)])).rows[0].data;
const capabilities = async () => (await db.query("select public.get_contact_copy_capabilities_v2() as data")).rows[0].data;
const originalDetails = await functionDefinition("public.save_contact_details_v2(text,timestamp with time zone,jsonb)");
const originalHero = await functionDefinition("public.save_contact_hero_v2(text,timestamp with time zone,jsonb)");
const originalSnapshot = await functionDefinition("public.get_contact_page_v2_snapshot(text)");
const originalTrigger = await functionDefinition("public.set_updated_at()");
const inquiryBefore = (await db.query("select to_jsonb(item) as data from public.booking_inquiries item")).rows;
await assert.rejects(() => save({ location: "", contactBlurb: "Before migration" }), error => error.code === "22023");
assert.ok((await save({ location: "Before", contactBlurb: "Ordinary filled saves still work" })).versions.updatedAt);
const beforeMigration = await allContent(); await db.exec(migration);
assert.deepEqual(await allContent(), beforeMigration, "Deployment preserves every content row and timestamp");
assert.equal(await functionDefinition("public.save_contact_details_v2(text,timestamp with time zone,jsonb)"), originalDetails
  .replace("char_length(pg_catalog.btrim(p_payload ->> 'location')) not between 1 and 220", "char_length(pg_catalog.btrim(p_payload ->> 'location')) > 220")
  .replace("char_length(pg_catalog.btrim(p_payload ->> 'contactBlurb')) not between 1 and 1000", "char_length(pg_catalog.btrim(p_payload ->> 'contactBlurb')) > 1000"),
  "Only the two minimum lengths change in the existing save RPC");
assert.equal(await functionDefinition("public.save_contact_hero_v2(text,timestamp with time zone,jsonb)"), originalHero);
assert.equal(await functionDefinition("public.get_contact_page_v2_snapshot(text)"), originalSnapshot);
assert.equal(await functionDefinition("public.set_updated_at()"), originalTrigger);
assert.deepEqual(await capabilities(), { optionalDetails: true });
assert.deepEqual(await allContent(), beforeMigration, "Capability reads are entirely read-only");

for (const payload of [
  { location: "", contactBlurb: "" }, { location: "", contactBlurb: "Keep this introduction" },
  { location: "Keep this location", contactBlurb: "" }, { location: "   ", contactBlurb: "     " },
  { location: " Prague ", contactBlurb: " Bookings welcome. " },
  { location: "x".repeat(220), contactBlurb: "y".repeat(1000) },
  { location: "  " + "x".repeat(220) + "  ", contactBlurb: "  " + "y".repeat(1000) + "  " },
]) {
  const before = await settings(); const oldHero = (await snapshot()).hero;
  const result = await save(payload); const after = await settings();
  assert.equal(after.location, payload.location.trim()); assert.equal(after.contact_blurb, payload.contactBlurb.trim());
  assert.deepEqual(result, { versions: { updatedAt: after.updated_at } });
  assert.deepEqual({ ...after, location: before.location, contact_blurb: before.contact_blurb, updated_at: before.updated_at }, before, "Only Contact details and the common timestamp change");
  assert.deepEqual((await snapshot()).hero, oldHero, "Details never alter the independent Hero");
  assert.deepEqual((await snapshot()).details, { location: after.location, contactBlurb: after.contact_blurb, updatedAt: after.updated_at });
}
const beforeInvalid = await allContent();
for (const bad of [null, [], "bad", {}, { location: "" }, { contactBlurb: "" },
  { location: null, contactBlurb: "" }, { location: "", contactBlurb: null },
  { location: false, contactBlurb: "" }, { location: "", contactBlurb: [] },
  { location: "", contactBlurb: "", extra: "no" },
  { location: "x".repeat(221), contactBlurb: "" }, { location: "", contactBlurb: "y".repeat(1001) },
]) await assert.rejects(() => save(bad), error => error.code === "22023");
await assert.rejects(() => save({ location: "", contactBlurb: "" }, { site: "other" }), error => error.code === "22023");
await assert.rejects(() => db.query("select public.save_contact_details_v2('main',null,$1)", [{ location: "", contactBlurb: "" }]), error => error.code === "22023");
await assert.rejects(() => save({ location: "", contactBlurb: "" }, { version: "2001-01-01T00:00:00Z" }), error => error.code === "40001");
assert.deepEqual(await allContent(), beforeInvalid, "Invalid inputs and stale versions never mutate content");

// Appearance and Contact intentionally share site_settings.updated_at. The row
// predicate matches Appearance's .eq('updated_at', expected) optimistic save.
const beforeAppearance = await settings();
const appearance = (await db.query("update public.site_settings set artist_name='Appearance edit' where id='main' and updated_at=$1 returning updated_at", [beforeAppearance.updated_at])).rows;
assert.equal(appearance.length, 1);
await assert.rejects(() => save({ location: "", contactBlurb: "" }, { version: beforeAppearance.updated_at }), error => error.code === "40001", "A concurrent Appearance edit invalidates the Contact snapshot");
const beforeContact = await settings(); await save({ location: "", contactBlurb: "" });
const staleAppearance = (await db.query("update public.site_settings set artist_name='Must not overwrite' where id='main' and updated_at=$1 returning updated_at", [beforeContact.updated_at])).rows;
assert.equal(staleAppearance.length, 0, "A Contact edit invalidates the Appearance snapshot too");
assert.equal((await settings()).artist_name, "Appearance edit");
const beforeMissing = await allContent(); await db.exec("begin; delete from public.site_settings where id='main'");
await assert.rejects(() => save({ location: "", contactBlurb: "" }, { version: beforeContact.updated_at }), error => error.code === "23503");
await db.exec("rollback"); assert.deepEqual(await allContent(), beforeMissing);

// Prove the unchanged 0033 Hero remains functional and independently versioned.
const beforeHero = await settings(); const heroSnapshot = (await snapshot()).hero;
const heroPayload = { ...heroSnapshot, title: "Contact independently edited" }; delete heroPayload.updatedAt;
const heroResult = (await db.query("select public.save_contact_hero_v2('main',$1,$2) as data", [heroSnapshot.updatedAt, heroPayload])).rows[0].data;
assert.ok(heroResult.versions.updatedAt); assert.equal((await snapshot()).hero.title, heroPayload.title);
assert.deepEqual(await settings(), beforeHero);
await assert.rejects(() => db.query("select public.save_contact_hero_v2('main',$1,$2)", [heroSnapshot.updatedAt, heroPayload]), error => error.code === "40001");
assert.deepEqual((await db.query("select to_jsonb(item) as data from public.booking_inquiries item")).rows, inquiryBefore, "Historical inquiries never change");

const beforeRerun = await allContent(); await db.exec(migration); assert.deepEqual(await allContent(), beforeRerun);
const serviceVersion = (await settings()).updated_at;
for (const role of ["anon", "authenticated", "service_role"]) {
  await db.exec(`set role ${role}`);
  if (role === "service_role") {
    assert.deepEqual(await capabilities(), { optionalDetails: true });
    assert.ok((await save({ location: "", contactBlurb: "" }, { version: serviceVersion })).versions.updatedAt);
    assert.equal((await snapshot()).details.contactBlurb, "");
  } else {
    await assert.rejects(() => capabilities(), error => error.code === "42501");
    await assert.rejects(() => save({ location: "", contactBlurb: "" }, { version: serviceVersion }), error => error.code === "42501");
  }
  await db.exec("reset role");
}
const checks = await db.exec(await readFile(new URL("../supabase/checks/0045_contact_optional_copy.sql", import.meta.url), "utf8"));
assert.equal(checks[0].rows.length, 6); assert.ok(checks[0].rows.every(check => check.passed), JSON.stringify(checks[0].rows));
await db.close();
console.log("Contact optional copy SQL passed: prerequisite rollback, zero/space/max limits, strict payloads, exact two-line RPC change, private capability, shared Appearance CAS, unchanged Hero/inquiries, missing-parent failure and content-preserving reruns.");
