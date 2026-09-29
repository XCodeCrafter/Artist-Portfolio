// Disposable PostgreSQL WASM only. No credentials, network or hosted SQL.
// Usage: node scripts/test-home-section-transitions-migration.mjs <local-PGlite-dist/index.js>
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

if (!process.argv[2]) throw new Error("Pass a local @electric-sql/pglite/dist/index.js path.");
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const sql = name => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
`);
await db.exec((await sql("0001_initial_schema")).replace("create extension if not exists pgcrypto;", ""));
await db.exec(`
  grant usage on schema public to anon, authenticated, service_role;
  grant select, update on public.site_settings to anon, authenticated;
  grant all on public.site_settings to service_role;
  insert into public.site_settings(id,artist_name,tagline) values('main','Existing owner','Existing tagline');
  create table public.home_page_config(id text primary key, draft jsonb not null);
  insert into public.home_page_config values('main','{"layout":[{"id":"about","enabled":false},{"id":"hero","enabled":true}],"hero":{"title":"Existing heading"}}');
`);
const read = async () => (await db.query("select to_jsonb(settings) as data from public.site_settings settings where id='main'")).rows[0].data;
const home = async () => (await db.query("select draft from public.home_page_config where id='main'")).rows[0].draft;
const guards = async () => (await db.query(`select jsonb_build_object(
  'rls', c.relrowsecurity, 'acl', c.relacl::text,
  'policies', (select jsonb_agg(to_jsonb(p) order by p.policyname) from pg_policies p where p.schemaname='public' and p.tablename='site_settings'),
  'triggers', (select jsonb_agg(pg_get_triggerdef(t.oid) order by t.tgname) from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal)
) as data from pg_class c where c.oid='public.site_settings'::regclass`)).rows[0].data;
const initial = await read();
const initialHome = await home();
const initialGuards = await guards();
const migration = await sql("0057_home_section_transitions");
await db.exec(migration);
let saved = await read();
assert.deepEqual(saved, { ...initial, home_section_transitions_enabled: false }, "Adding the OFF default must not rewrite existing values or versions");
assert.deepEqual(await guards(), initialGuards, "Existing grants, policies and version trigger must be unchanged");
assert.deepEqual(await home(), initialHome, "Home JSON and layout must stay untouched");

for (const role of ["anon", "authenticated"]) {
  await db.exec(`set role ${role}`);
  const published = (await db.query("select home_section_transitions_enabled from public.site_settings where id='main'")).rows;
  assert.deepEqual(published, [{ home_section_transitions_enabled: false }]);
  const denied = await db.query("update public.site_settings set home_section_transitions_enabled=true where id='main' returning id");
  assert.equal(denied.rows.length, 0, `${role} must not gain write access through the new column`);
  await db.exec("reset role");
}
await db.exec("set role service_role");
const enabled = (await db.query("update public.site_settings set home_section_transitions_enabled=true where id='main' and updated_at=$1::timestamptz returning to_jsonb(site_settings) as data", [saved.updated_at])).rows[0].data;
assert.equal(enabled.home_section_transitions_enabled, true);
assert.notEqual(enabled.updated_at, saved.updated_at);
assert.equal((await db.query("update public.site_settings set home_section_transitions_enabled=false where id='main' and updated_at=$1::timestamptz returning id", [saved.updated_at])).rows.length, 0, "Stale settings CAS must not overwrite ON");
await db.exec("reset role");
await db.exec(migration);
assert.deepEqual(await read(), enabled, "Rerunning migration must preserve ON and its saved version");

await db.exec("set role service_role");
saved = (await db.query("update public.site_settings set home_section_transitions_enabled=false where id='main' and updated_at=$1::timestamptz returning to_jsonb(site_settings) as data", [enabled.updated_at])).rows[0].data;
assert.equal(saved.home_section_transitions_enabled, false);
assert.notEqual(saved.updated_at, enabled.updated_at);
await assert.rejects(() => db.exec("update public.site_settings set home_section_transitions_enabled=null where id='main'"), error => error.code === "23502");
await assert.rejects(() => db.exec("update public.site_settings set home_section_transitions_enabled='invalid' where id='main'"), error => error.code === "22P02");
await db.exec("reset role");
const remaining = { ...saved };
delete remaining.updated_at;
delete remaining.home_section_transitions_enabled;
const initialRemaining = { ...initial };
delete initialRemaining.updated_at;
assert.deepEqual(remaining, initialRemaining, "Toggle saves must preserve all unrelated settings");
assert.deepEqual(await home(), initialHome);
assert.deepEqual(await guards(), initialGuards);
await db.exec(migration);
assert.deepEqual(await read(), saved, "Rerunning migration must preserve OFF and its saved version");

const checks = await readFile(new URL("../supabase/checks/0057_home_section_transitions.sql", import.meta.url), "utf8");
const results = (await db.query(checks)).rows;
assert.equal(results.length, 4);
for (const result of results) assert.equal(result.passed, true, result.check_name);
await db.close();
console.log("0057 Home transitions: OFF default, schema, permissions, CAS, ON/OFF, preserved settings/layout and reruns passed; four read-only checks passed.");
