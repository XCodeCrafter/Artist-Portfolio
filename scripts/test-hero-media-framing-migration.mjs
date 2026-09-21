// Disposable real PostgreSQL; no network, credentials or Supabase writes.
// Usage: node scripts/test-hero-media-framing-migration.mjs <PGlite dist/index.js>
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
if (!process.argv[2]) throw new Error("Pass a local @electric-sql/pglite/dist/index.js path.");
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const sql = name => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
const migration = await sql("0046_hero_media_framing");
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql as $$ select null::uuid $$;`);
await db.exec((await sql("0001_initial_schema")).replace("create extension if not exists pgcrypto;", ""));
await assert.rejects(() => db.exec(migration), error => error.code === "55000"); await db.exec("rollback");
assert.equal((await db.query("select to_regprocedure('public.get_hero_editor_with_framing_v2(text,text)') as rpc")).rows[0].rpc, null);
await db.exec((await sql("0002_media_manager")).split("insert into storage.buckets")[0]);
for (const name of ["0013_gallery_media_placements", "0014_gallery_studio", "0016_footer_effect", "0023_admin_operations_hardening",
  "0028_music_page_editor", "0029_batch_5a_music_and_nav_links", "0030_bio_page_editor", "0031_gallery_page_editor", "0032_showreel_page_editor", "0033_contact_page_editor",
  "0034_media_optimization_foundation", "0035_media_pipeline_integrity_guards", "0036_media_upload_intents", "0037_home_page_editor",
  "0039_footer_content_editor", "0040_media_library_v2", "0041_content_archive_navbar", "0042_content_archive_music", "0043_content_archive_bio", "0044_content_archive_gallery_showreel"]) await db.exec(await sql(name));
await db.exec(`insert into public.site_settings(id,artist_name) values('main','Isolated artist');
  insert into public.bio_profile(id,top_label,intro_text,caption) values('main','BIO','Introduction','A portrait');
  insert into public.actor_resume(id) values('main');
  insert into public.page_heroes(page_slug,title,background_src) values
    ('home','Original HOME','/images/home.jpg'),('bio','Biography','/images/bio.jpg'),
    ('gallery','Gallery','/images/gallery.jpg'),('video','Showreel','/media/showreel.mp4');
  insert into public.booking_inquiries(name,email,message) values('Visitor','visitor@example.test','An existing inquiry');
  grant select on public.page_heroes to anon, authenticated;
  grant select, update on public.page_heroes to service_role;`);
await db.exec(await sql("0045_contact_optional_copy"));
// A disabled predecessor trigger must fail before adding columns/functions.
await db.exec("alter table public.page_heroes disable trigger zz_media_library_reference_guard_v2");
await assert.rejects(() => db.exec(migration), error => error.code === "55000"); await db.exec("rollback");
await db.exec("alter table public.page_heroes enable trigger zz_media_library_reference_guard_v2");
const pages = ["home", "bio", "music", "gallery", "video", "booking"];
const editor = page => ({ home: "home", bio: "bio", music: "music", gallery: "gallery", video: "showreel", booking: "contact" })[page];
const allContent = async (withFraming = true) => {
  const rows = (await db.query(`select * from (
    select 'hero' as kind,to_jsonb(item) as data from public.page_heroes item
    union all select 'home',to_jsonb(item) from public.home_page_config item
    union all select 'settings',to_jsonb(item) from public.site_settings item
    union all select 'media',to_jsonb(item) from public.media_assets item
    union all select 'archive',to_jsonb(item) from public.content_archive_v2 item
    union all select 'inquiry',to_jsonb(item) from public.booking_inquiries item
  ) content order by kind,data::text`)).rows;
  if (!withFraming) for (const row of rows) { delete row.data.media_framing; delete row.data.hero_media_framing; }
  return rows;
};
const parent = async page => (await db.query(page === "home"
  ? "select to_jsonb(item) as data from public.home_page_config item where id='main'"
  : "select to_jsonb(item) as data from public.page_heroes item where page_slug=$1", page === "home" ? [] : [page])).rows[0]?.data;
const frame = async page => { const value = await parent(page); return page === "home" ? value?.hero_media_framing : value?.media_framing; };
const snapshot = async (page, site = "main") => (await db.query("select public.get_hero_editor_with_framing_v2($1,$2) as data", [page, site])).rows[0].data;
const legacySnapshot = async page => (await db.query(`select public.get_${editor(page)}_page_v2_snapshot('main') as data`)).rows[0].data;
const hero = (page, value) => page === "home" ? value.draft.hero : value.hero;
const payload = async page => { const value = { ...hero(page, await snapshot(page)) }; delete value.updatedAt; return value; };
const save = async (page, value, options = {}) => (await db.query("select public.save_hero_with_framing_v2($1,$2,$3,$4) as data",
  [page, options.site ?? "main", options.version ?? (await parent(page))?.updated_at, JSON.stringify(value)])).rows[0].data;
const legacySave = async (page, value, version = undefined) => (await db.query(page === "home"
  ? "select public.save_home_section_v2('main','hero',$1,$2) as data"
  : `select public.save_${editor(page)}_hero_v2('main',$1,$2) as data`, [version ?? (await parent(page)).updated_at, value])).rows[0].data;
const definition = async signature => (await db.query("select pg_get_functiondef($1::regprocedure) as definition", [signature])).rows[0].definition;
const originalDefinitions = new Map();
for (const page of pages) {
  const read = `public.get_${editor(page)}_page_v2_snapshot(text)`;
  const write = page === "home" ? "public.save_home_section_v2(text,text,timestamp with time zone,jsonb)" : `public.save_${editor(page)}_hero_v2(text,timestamp with time zone,jsonb)`;
  for (const signature of [read, write]) originalDefinitions.set(signature, await definition(signature));
}
for (const signature of ["public.guard_media_library_references_v2()", "public.media_library_reference_registry_v2()", "public.set_updated_at()", "public.save_contact_details_v2(text,timestamp with time zone,jsonb)"])
  originalDefinitions.set(signature, await definition(signature));
const beforeMigration = await allContent(false); await db.exec(migration);
assert.deepEqual(await allContent(false), beforeMigration, "Deployment preserves all existing content and timestamps");
for (const [signature, original] of originalDefinitions) assert.equal(await definition(signature), original, `${signature} remains byte-for-byte unchanged`);
const cover = { fit: "cover", x: 50, y: 50, zoom: 1 };
const custom = { desktop: { fit: "cover", x: 23.25, y: 4.5, zoom: 1.2 }, mobile: { fit: "contain", x: 100, y: 0, zoom: 3 } };
for (const page of pages) {
  const current = await snapshot(page); const old = await legacySnapshot(page);
  assert.equal(await frame(page), null, "New nullable columns preserve automatic framing");
  assert.deepEqual(hero(page, current).framing, null);
  delete hero(page, current).framing;
  assert.deepEqual(current, old, "The whole original page snapshot remains unchanged apart from framing");
  const before = await parent(page); const originalPayload = await payload(page);
  const result = await save(page, { ...originalPayload, title: ` Framed ${page} `, framing: custom });
  const after = await parent(page); assert.deepEqual(await frame(page), custom);
  assert.deepEqual(result.versions, { updatedAt: after.updated_at }, "Only the final version is returned, not the first update's version");
  assert.deepEqual(Object.keys(result).sort(), page === "home" ? ["canonicalSection", "versions"] : ["versions"]);
  if (page === "home") assert.deepEqual(result.canonicalSection, { ...after.draft.hero, framing: custom }, "HOME retains its normalized canonical-section response");
  assert.notEqual(after.updated_at, before.updated_at);
  assert.equal(hero(page, await snapshot(page)).title, `Framed ${page}`);
  assert.deepEqual(hero(page, await snapshot(page)).framing, custom);
  // Old editor reads and old RPC payloads remain valid and never drop framing.
  const legacyValue = { ...originalPayload, title: `Legacy ${page}` }; delete legacyValue.framing;
  await legacySave(page, legacyValue); assert.deepEqual(await frame(page), custom);
  await assert.rejects(() => save(page, { ...originalPayload, framing: custom }, { version: before.updated_at }), error => error.code === "40001");
  await assert.rejects(() => legacySave(page, legacyValue, before.updated_at), error => error.code === "40001");
  await save(page, { ...originalPayload, framing: null }); assert.equal(await frame(page), null, "Explicit Reset restores automatic mode");
  await db.exec("begin");
  const first = await save(page, { ...originalPayload, framing: custom });
  const second = await save(page, { ...originalPayload, framing: null });
  assert.ok(Date.parse(second.versions.updatedAt) >= Date.parse(first.versions.updatedAt));
  assert.notEqual(second.versions.updatedAt, first.versions.updatedAt, "ABA advances even inside one transaction");
  await db.exec("commit");
}
// Invalid inputs must not mutate content, including unsupported pages/prototype keys.
const beforeInvalid = await allContent(); const original = await payload("music");
const badFrames = [false, true, [], "cover", 1, {}, { desktop: cover }, { mobile: cover },
  { desktop: cover, mobile: cover, extra: true }, { desktop: null, mobile: cover },
  { desktop: cover, mobile: [] }, { desktop: { ...cover, extra: true }, mobile: cover },
  JSON.parse('{"desktop":{"fit":"cover","x":50,"y":50,"zoom":1},"mobile":{"fit":"cover","x":50,"y":50,"zoom":1},"__proto__":{}}')];
for (const key of ["x", "y", "zoom", "fit"]) {
  for (const bad of [null, false, true, [], {}, "1"])
    badFrames.push({ desktop: { ...cover, [key]: bad }, mobile: cover });
  const missing = { ...cover }; delete missing[key]; badFrames.push({ desktop: cover, mobile: missing });
}
for (const bad of [-0.01, 100.01, 1e200]) {
  badFrames.push({ desktop: { ...cover, x: bad }, mobile: cover }, { desktop: cover, mobile: { ...cover, y: bad } });
}
for (const bad of [0.99, 3.01, -1, 1e200]) badFrames.push({ desktop: cover, mobile: { ...cover, zoom: bad } });
for (const bad of ["fill", "scale-down", " COVER "]) badFrames.push({ desktop: { ...cover, fit: bad }, mobile: cover });
for (const framing of badFrames) await assert.rejects(() => save("music", { ...original, framing }), error => error.code === "22023");
const withoutFraming = { ...original }; delete withoutFraming.framing;
for (const bad of [null, [], {}, "text", withoutFraming, { ...original, extra: true }, { ...original, title: null }, { ...original, title: "" }, { ...original, mediaType: "audio" },
  { ...original, ctaHref: "javascript:alert(1)" }, { ...original, backgroundSrc: "//evil.test/image.jpg" }, { ...original, posterSrc: "https://user:pass@evil.test/a.jpg" }])
  await assert.rejects(() => save("music", bad), error => error.code === "22023");
for (const page of [null, "", "showreel", "contact", "__proto__", "music;drop table page_heroes", "HOME"])
  await assert.rejects(async () => save(page, original, { version: (await parent("music")).updated_at }), error => error.code === "22023");
for (const [page, site] of [[null, "main"], ["unknown", "main"], ["music", "other"], ["home", null]])
  await assert.rejects(() => snapshot(page, site), error => error.code === "22023");
await assert.rejects(() => save("music", original, { site: "other" }), error => error.code === "22023");
await assert.rejects(() => db.query("select public.save_hero_with_framing_v2('music','main',null,$1)", [original]), error => error.code === "22023");
// Column constraints reject malformed direct writes, not just RPC submissions.
for (const [table, column] of [["page_heroes", "media_framing"], ["home_page_config", "hero_media_framing"]])
  for (const bad of ["null", ...badFrames.map(value => JSON.stringify(value))])
    await assert.rejects(() => db.query(`update public.${table} set ${column}=$1::jsonb`, [bad]), error => error.code === "23514");
assert.deepEqual(await allContent(), beforeInvalid, "Invalid input, stale writes and constraints never mutate content");
// Decimal boundary values are supported in both image and video placements.
for (const page of pages) for (const mediaType of ["image", "video"]) {
  const value = await payload(page);
  await save(page, { ...value, mediaType, backgroundSrc: mediaType === "video" ? "/media/framed.mp4" : "/images/framed.jpg",
    framing: { desktop: { fit: "contain", x: 0, y: 100, zoom: 1 }, mobile: { fit: "cover", x: 99.999, y: 0.001, zoom: 2.999 } } });
}
// HOME non-hero section saves share CAS and preserve the separate framing column.
const homeFrame = await frame("home"); const beforeHome = await parent("home");
await db.query("select public.save_home_section_v2('main','cnc',$1,$2)", [beforeHome.updated_at, { ...beforeHome.draft.cnc, title: "Independent CNC edit" }]);
assert.deepEqual(await frame("home"), homeFrame);
await assert.rejects(async () => save("home", await payload("home"), { version: beforeHome.updated_at }), error => error.code === "40001");
assert.equal((await db.query("select title from public.page_heroes where page_slug='home'")).rows[0].title, "Original HOME", "HOME never writes the dormant legacy page_heroes row");
// A failure after the delegated content write must roll back BOTH updates.
await db.exec(`create function public.test_fail_framing_update() returns trigger language plpgsql as $$ begin
  if new.media_framing is distinct from old.media_framing then raise exception 'isolated second-write failure' using errcode='23514'; end if;
  return new; end; $$;
  create trigger aa_test_framing_failure before update on public.page_heroes for each row execute function public.test_fail_framing_update()`);
const beforeRollback = await allContent();
await assert.rejects(async () => save("music", { ...await payload("music"), title: "MUST ROLL BACK", framing: null }), error => error.code === "23514");
assert.deepEqual(await allContent(), beforeRollback, "Second-write failure rolls the delegated Hero content save back");
await db.exec("drop trigger aa_test_framing_failure on public.page_heroes; drop function public.test_fail_framing_update()");
// Missing parent reads/writes never create a replacement row or fallback page.
for (const page of ["home", "music"]) {
  const before = await allContent(); const value = await payload(page); const version = (await parent(page)).updated_at;
  await db.exec("begin");
  await db.query(page === "home" ? "delete from public.home_page_config where id='main'" : "delete from public.page_heroes where page_slug='music'");
  await assert.rejects(() => snapshot(page), error => error.code === "23503"); await db.exec("rollback");
  await db.exec("begin");
  await db.query(page === "home" ? "delete from public.home_page_config where id='main'" : "delete from public.page_heroes where page_slug='music'");
  await assert.rejects(() => save(page, value, { version }), error => error.code === "23503"); await db.exec("rollback");
  assert.deepEqual(await allContent(), before);
}
// Existing trash guards and media usage still include the actual source URLs.
await db.exec(`insert into public.media_assets(id,label,src,media_type) values('framed-live','Live','https://media.example.test/framed.jpg','image'),
  ('framed-trashed','Trashed','https://media.example.test/trashed.jpg','image');
  update public.media_assets set deleted_at=clock_timestamp(),is_published=false where id='framed-trashed'`);
await save("music", { ...await payload("music"), mediaType: "image", backgroundSrc: "https://media.example.test/framed.jpg", framing: custom });
assert.ok((await db.query("select * from public.media_asset_references('https://media.example.test/framed.jpg')")).rows.some(row => Number(row.reference_count) > 0));
const beforeTrashed = await allContent();
await assert.rejects(async () => save("music", { ...await payload("music"), backgroundSrc: "https://media.example.test/trashed.jpg", framing: null }), error => error.code === "23514");
assert.deepEqual(await allContent(), beforeTrashed);
// Public columns are readable through existing SELECT policies; admin RPCs and
// the validation implementation remain inaccessible to public clients.
const servicePayload = await payload("music"); const serviceVersion = (await parent("music")).updated_at;
for (const role of ["anon", "authenticated", "service_role"]) {
  await db.exec(`set role ${role}`);
  await assert.rejects(() => db.query("select public.is_valid_hero_media_framing_v2($1)", [custom]), error => error.code === "42501");
  if (role === "service_role") {
    assert.deepEqual(hero("music", await snapshot("music")).framing, custom);
    assert.ok((await save("music", servicePayload, { version: serviceVersion })).versions.updatedAt);
    await db.query("update public.page_heroes set title=title where page_slug='music'");
    assert.deepEqual(hero("music", await snapshot("music")).framing, custom, "Existing authorized direct saves can retain valid framing despite the helper being private");
  } else {
    await assert.rejects(() => snapshot("music"), error => error.code === "42501");
    await assert.rejects(() => save("music", servicePayload, { version: serviceVersion }), error => error.code === "42501");
    assert.deepEqual((await db.query("select media_framing from public.page_heroes where page_slug='music'")).rows[0].media_framing, custom);
    assert.deepEqual((await db.query("select hero_media_framing from public.home_page_config where id='main'")).rows[0].hero_media_framing, homeFrame);
  }
  await db.exec("reset role");
}
const beforeRerun = await allContent(); await db.exec(migration); assert.deepEqual(await allContent(), beforeRerun, "Reruns retain owner-selected framing and every content version");
for (const [signature, originalDefinition] of originalDefinitions) assert.equal(await definition(signature), originalDefinition);
const checks = await db.exec(await readFile(new URL("../supabase/checks/0046_hero_media_framing.sql", import.meta.url), "utf8"));
assert.equal(checks[0].rows.length, 8); assert.ok(checks[0].rows.every(check => check.passed), JSON.stringify(checks[0].rows));
// Owners may re-run earlier verification scripts against the latest schema.
// They must remain compatible after 0046 without rewriting content or versions.
const beforePredecessorChecks = await allContent();
let predecessorCheckCount = 0;
await db.exec("begin read only");
for (const name of ["0039_footer_content_editor", "0040_media_library_v2", "0041_content_archive_navbar",
  "0042_content_archive_music", "0043_content_archive_bio", "0044_content_archive_gallery_showreel", "0045_contact_optional_copy"]) {
  const results = await db.exec(await readFile(new URL(`../supabase/checks/${name}.sql`, import.meta.url), "utf8"));
  const rows = results.flatMap(result => result.rows);
  assert.ok(rows.length > 0, `${name} must return deployment checks`);
  assert.ok(rows.every(check => check.passed === true), `${name} must still pass after 0046: ${JSON.stringify(rows)}`);
  predecessorCheckCount += rows.length;
}
await db.exec("commit");
assert.deepEqual(await allContent(), beforePredecessorChecks, "Predecessor checks preserve all content and versions");
await db.close();
console.log("Hero framing SQL passed: all six existing editor snapshots/saves, strict responsive shape, image/video boundaries, default/reset compatibility, final-version CAS/ABA, second-write rollback, parent failures, media guard, private RPCs, public reads and content-preserving rerun.");
console.log(`Latest-schema verification passed: all ${predecessorCheckCount} predecessor checks from 0039–0045 remain true after 0046, executed in a read-only transaction, alongside its eight Hero checks.`);
