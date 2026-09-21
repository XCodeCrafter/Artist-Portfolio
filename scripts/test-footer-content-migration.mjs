// Isolated PostgreSQL verification. Uses an already installed local PGlite runtime;
// no credentials, network, production database or content mutations.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

if (!process.argv[2]) throw new Error("Pass a local @electric-sql/pglite/dist/index.js path.");
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
await db.exec(`
  create table public.site_settings(id text primary key, artist_name text, tagline text, updated_at timestamptz default now());
  alter table public.site_settings enable row level security;
  create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at := clock_timestamp(); return new; end $$;
  create trigger site_settings_updated_at before update on public.site_settings for each row execute function public.set_updated_at();
  insert into public.site_settings(id,artist_name,tagline) values('main','Existing owner','Existing tagline');
`);
const migration = await readFile(new URL("../supabase/migrations/0039_footer_content_editor.sql", import.meta.url), "utf8");
const checks = await readFile(new URL("../supabase/checks/0039_footer_content_editor.sql", import.meta.url), "utf8");
await db.exec(migration);
const read = async () => (await db.query("select * from public.site_settings where id='main'")).rows[0];
let saved = await read();
assert.equal(saved.artist_name, "Existing owner");
assert.equal(saved.tagline, "Existing tagline");
assert.equal(saved.footer_content.heading, "Ready for the next story");
const valid = async (value) => (await db.query("select public.is_valid_footer_content_v2($1::jsonb) as valid", [JSON.stringify(value)])).rows[0].valid;
assert.equal(await valid(saved.footer_content), true);
for (const patch of [
  { heading: "" }, { heading: "   " }, { heading: "x".repeat(221) }, { heading: null }, { unknown: "value" },
  { primaryHref: "" }, { primaryLabel: "" }, { secondaryHref: "" }, { secondaryLabel: "" },
  { primaryHref: "javascript:alert(1)" }, { primaryHref: "//evil.example" },
  { primaryHref: "https://user:password@example.com" }, { primaryHref: "/back\\slash" },
  { primaryHref: "https://example.com\n" },
]) assert.equal(await valid({ ...saved.footer_content, ...patch }), false, JSON.stringify(patch));
for (const value of [null, [], "string", {}, { ...saved.footer_content, heading: {} }]) assert.equal(await valid(value), false);
for (const primaryHref of ["/", "/music", "/media/press.pdf", "#contact", "https://example.com/music"]) {
  assert.equal(await valid({ ...saved.footer_content, primaryHref }), true, primaryHref);
}
assert.equal(await valid({ ...saved.footer_content, primaryHref: "", primaryLabel: "" }), true);
const next = { ...saved.footer_content, heading: "Our custom footer", primaryHref: "/music", primaryLabel: "Listen" };
await db.query("update public.site_settings set footer_content=$1::jsonb where id='main' and updated_at=$2 returning id", [JSON.stringify(next), saved.updated_at]);
saved = await read();
assert.deepEqual(saved.footer_content, next);
await db.exec(migration);
assert.deepEqual((await read()).footer_content, next, "Re-running migration must preserve owner edits");
const results = (await db.query(checks)).rows;
for (const result of results) assert.equal(result.passed, true, result.check_name);
assert.equal(results.length, 5);
await db.close();
console.log("0039 footer content: defaults, validation, idempotency, preserved owner copy and all read-only checks passed.");
