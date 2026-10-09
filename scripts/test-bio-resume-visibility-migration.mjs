// Disposable PostgreSQL WASM only. No credentials, network or hosted SQL.
// Usage: node scripts/test-bio-resume-visibility-migration.mjs <local-PGlite-dist/index.js>
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

if (!process.argv[2]) throw new Error("Pass a local @electric-sql/pglite/dist/index.js path.");
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const sql = name => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
const initialSchema = (await sql("0001_initial_schema")).replace("create extension if not exists pgcrypto;", "");
const migration = await sql("0059_bio_resume_visibility");
const checks = await readFile(new URL("../supabase/checks/0059_bio_resume_visibility.sql", import.meta.url), "utf8");

for (const portfolioType of ["musician", "actor"]) {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    `);
    await db.exec(initialSchema);
    await db.exec(`
      grant usage on schema public to anon, authenticated, service_role;
      grant select, update on public.site_settings to anon, authenticated;
      grant all on public.site_settings to service_role;
      insert into public.actor_resume(id, headline, summary) values('main', 'Existing resume', 'Keep every word');
      insert into public.actor_credits(id, title, is_published) values('credit-1', 'Existing credit', true), ('credit-2', 'Private credit', false);
    `);
    await db.query("insert into public.site_settings(id, portfolio_type, artist_name, tagline) values('main', $1, 'Existing owner', 'Existing tagline')", [portfolioType]);
    const read = async () => (await db.query("select to_jsonb(settings) as data from public.site_settings settings where id='main'")).rows[0].data;
    const content = async () => (await db.query(`select jsonb_build_object(
      'resume', (select to_jsonb(resume) from public.actor_resume resume where id='main'),
      'credits', (select jsonb_agg(to_jsonb(credit) order by credit.id) from public.actor_credits credit)
    ) as data`)).rows[0].data;
    const guards = async () => (await db.query(`select jsonb_build_object(
      'rls', c.relrowsecurity, 'acl', c.relacl::text,
      'policies', (select jsonb_agg(to_jsonb(p) order by p.policyname) from pg_policies p where p.schemaname='public' and p.tablename='site_settings'),
      'triggers', (select jsonb_agg(pg_get_triggerdef(t.oid) order by t.tgname) from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal)
    ) as data from pg_class c where c.oid='public.site_settings'::regclass`)).rows[0].data;
    const initial = await read();
    const initialContent = await content();
    const initialGuards = await guards();
    const expectedEnabled = portfolioType === "actor";
    await db.exec(migration);
    let saved = await read();
    assert.equal(saved.bio_resume_credits_enabled, expectedEnabled, `${portfolioType} initial visibility`);
    if (expectedEnabled) assert.equal(saved.updated_at, initial.updated_at, "Actor initialization must not rewrite the settings row");
    else assert.notEqual(saved.updated_at, initial.updated_at, "Musician initialization must invalidate stale settings versions");
    assert.deepEqual(await content(), initialContent, "Migration must preserve all resume and credit content, including unpublished rows");
    assert.deepEqual(await guards(), initialGuards, "Migration must preserve policies, grants and timestamp trigger");

    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      assert.deepEqual((await db.query("select bio_resume_credits_enabled from public.site_settings where id='main'")).rows, [{ bio_resume_credits_enabled: expectedEnabled }]);
      assert.equal((await db.query("update public.site_settings set bio_resume_credits_enabled = not bio_resume_credits_enabled where id='main' returning id")).rows.length, 0, `${role} must not gain write access`);
      await db.exec("reset role");
    }

    for (const enabled of [true, false]) {
      const previous = saved;
      await db.exec("set role service_role");
      saved = (await db.query("update public.site_settings set bio_resume_credits_enabled=$1 where id='main' and updated_at=$2::timestamptz returning to_jsonb(site_settings) as data", [enabled, previous.updated_at])).rows[0].data;
      assert.equal(saved.bio_resume_credits_enabled, enabled);
      assert.notEqual(saved.updated_at, previous.updated_at);
      assert.equal((await db.query("update public.site_settings set bio_resume_credits_enabled=$1 where id='main' and updated_at=$2::timestamptz returning id", [!enabled, previous.updated_at])).rows.length, 0, "Stale CAS must not overwrite a later settings save");
      await db.exec("reset role");
      await db.exec(migration);
      assert.deepEqual(await read(), saved, "Rerunning migration must preserve either owner choice and its version");
      assert.deepEqual(await content(), initialContent, "Toggling must never rewrite resume or credits");
    }
    await assert.rejects(() => db.exec("update public.site_settings set bio_resume_credits_enabled=null where id='main'"), error => error.code === "23502");
    await assert.rejects(() => db.exec("update public.site_settings set bio_resume_credits_enabled='invalid' where id='main'"), error => error.code === "22P02");
    const unrelated = row => Object.fromEntries(Object.entries(row).filter(([key]) => !["bio_resume_credits_enabled", "updated_at"].includes(key)));
    assert.deepEqual(unrelated(await read()), unrelated(initial), "All unrelated settings must remain unchanged");
    assert.deepEqual(await guards(), initialGuards);
    const results = (await db.query(checks)).rows;
    assert.equal(results.length, 4);
    for (const result of results) assert.equal(result.passed, true, result.check_name);

    await db.exec("delete from public.site_settings where id='main'; insert into public.site_settings(id, artist_name) values('main', 'New site')");
    assert.equal((await read()).bio_resume_credits_enabled, true, "Future sites retain the compatible visible default");
  } finally {
    await db.close();
  }
}
console.log("0059 Bio visibility: musician/actor initialization, preserved content, RLS, CAS, ON/OFF, reruns, new-row default and four read-only checks passed.");
