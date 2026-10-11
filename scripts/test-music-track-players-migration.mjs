// Disposable PostgreSQL WASM only. No credentials, hosted database or network.
// Usage: node scripts/test-music-track-players-migration.mjs <PGlite dist/index.js>
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
for (const name of ["0013_gallery_media_placements", "0014_gallery_studio", "0016_footer_effect", "0023_admin_operations_hardening",
  "0028_music_page_editor", "0029_batch_5a_music_and_nav_links", "0034_media_optimization_foundation",
  "0035_media_pipeline_integrity_guards", "0036_media_upload_intents", "0037_home_page_editor",
  "0039_footer_content_editor", "0040_media_library_v2", "0041_content_archive_navbar", "0042_content_archive_music"]) {
  await db.exec(await sql(name));
}
const actor = "00000000-0000-4000-8000-000000000001";
await db.query("insert into auth.users values($1)", [actor]);
await db.query("insert into public.admin_profiles(user_id,email,role) values($1,'isolated@example.test','owner')", [actor]);
await db.exec("insert into public.site_settings(id,artist_name) values('main','Isolated artist')");
await db.exec("insert into public.soundcloud_tracks(id,title,embed_url,sort_order) values('sc-old','','https://soundcloud.com/artist/mix',30), ('sc-archived','Archived SoundCloud','https://api.soundcloud.com/tracks/123',40), ('spotify-legacy','Old Spotify share URL','https://open.spotify.com/track/Abc123?si=share',50)");
const snapshot = async () => (await db.query("select public.get_music_page_v2_snapshot('main') as data")).rows[0].data;
const source = async id => (await db.query("select to_jsonb(item) as data from public.soundcloud_tracks item where id=$1", [id])).rows[0]?.data;
const archived = async id => (await db.query("select to_jsonb(item) as data from public.content_archive_v2 item where collection='music-soundcloud' and source_id=$1", [id])).rows[0]?.data;
const versions = saved => Object.fromEntries(saved.soundcloud.tracks.map(item => [item.id, item.updatedAt]));
const payload = saved => ({ mixesHeading: saved.soundcloud.mixesHeading, items: saved.soundcloud.tracks.map(({ id, title, embedUrl, isPublished }) => ({ id, title, embedUrl, isPublished })) });
const save = async (saved, draft = payload(saved), legacy = false) => (await db.query(
  `select public.${legacy ? "save_music_soundcloud_v2" : "save_music_tracks_v2"}('main',$1,$2,$3) as data`,
  [saved.soundcloud.presentationUpdatedAt, versions(saved), draft]
)).rows[0].data;
const archivePage = async () => (await db.query("select public.get_music_content_archive_v2('soundcloud',0) as data")).rows[0].data;
const mutate = async (operation, id, expected) => {
  const saved = expected ?? await snapshot();
  return (await db.query("select public.mutate_music_content_archive_v2('soundcloud',$1,$2,$3,$4,$5,$6) as data", [
    operation, id, versions(saved), actor, saved.soundcloud.presentationUpdatedAt,
    operation === "restore" ? (await archived(id))?.updated_at ?? null : null,
  ])).rows[0].data;
};
const content = async () => (await db.query(`select * from (
  select 'track' as kind,to_jsonb(item) as data from public.soundcloud_tracks item
  union all select 'archive',to_jsonb(item) from public.content_archive_v2 item
  union all select 'presentation',to_jsonb(item) from public.music_presentation item
  union all select 'settings',to_jsonb(item) from public.site_settings item
  union all select 'hero',to_jsonb(item) from public.page_heroes item
  union all select 'platform',to_jsonb(item) from public.music_platform_links item
) content order by kind,data->>'id',data->>'page_slug'`)).rows;
const oldContracts = async () => (await db.query(`select oid::regprocedure::text as name,
  pg_get_functiondef(oid) as definition,proacl::text as acl from pg_proc where oid in (
    'public.save_music_soundcloud_v2(text,timestamptz,jsonb,jsonb)'::regprocedure,
    'public.get_music_page_v2_snapshot(text)'::regprocedure,
    'public.mutate_music_content_archive_v2(text,text,text,jsonb,uuid,timestamptz,timestamptz)'::regprocedure
  ) order by name`)).rows;
await mutate("archive", "sc-archived");
await mutate("archive", "spotify-legacy");
const beforeMigration = await content();
const contracts = await oldContracts();
const beforeSnapshot = await snapshot();
const migration = await sql("0062_music_track_players");
await db.exec(migration);
assert.deepEqual(await content(), beforeMigration, "Migration changes no active/archived content, order, publication or version");
assert.deepEqual(await oldContracts(), contracts, "Existing save, snapshot and archive mutation definitions/ACLs are unchanged");
assert.deepEqual(await snapshot(), beforeSnapshot);
assert.deepEqual((await archivePage()).items.map(item => [item.id, item.platform]).sort(), [["sc-archived", "soundcloud"], ["spotify-legacy", "spotify"]]);

// Both entry points preserve the existing SoundCloud-only request shape.
await save(await snapshot(), undefined, true);
await save(await snapshot());
const baseline = await snapshot();
const spotify = ["track", "album", "playlist"].map((kind, index) => ({
  id: `spotify-${kind}`, title: `Spotify ${kind}`, embedUrl: `https://open.spotify.com/embed/${kind}/Abc123${index}?utm_source=generator#player`, isPublished: index !== 1,
}));
const mixedPayload = { ...payload(baseline), items: [...payload(baseline).items, ...spotify] };
const mixedResult = await save(baseline, mixedPayload);
let saved = await snapshot();
assert.deepEqual(payload(saved), mixedPayload);
assert.deepEqual(mixedResult.items, saved.soundcloud.tracks);
assert.deepEqual(mixedResult.versions, { presentationUpdatedAt: saved.soundcloud.presentationUpdatedAt, items: versions(saved) });
assert.deepEqual(saved.spotify, { ...baseline.spotify, presentationUpdatedAt: saved.soundcloud.presentationUpdatedAt }, "Small players do not edit the main Spotify URLs or its heading");
assert.deepEqual(saved.hero, baseline.hero);
assert.deepEqual(saved.platforms, baseline.platforms);
await assert.rejects(() => save(baseline, payload(baseline), true), error => error.code === "40001", "Old SoundCloud clients cannot overwrite later mixed collections");
await assert.rejects(() => save(saved, payload(saved), true), error => error.code === "22023", "Old endpoint remains SoundCloud-only");
assert.deepEqual(await snapshot(), saved);

const invalidUrls = [
  "https://open.spotify.com/track/Abc123", "https://open.spotify.com/intl-cs/album/Abc123",
  "https://open.spotify.com/embed/artist/Abc123", "https://open.spotify.com/embed/show/Abc123", "https://open.spotify.com/embed/episode/Abc123",
  "https://open.spotify.com/embed/track/", "https://open.spotify.com/embed/track/Abc123/extra", "https://open.spotify.com/embed/track/Abc123/",
  "https://open.spotify.com.evil.example/embed/track/Abc123", "https://user:pass@open.spotify.com/embed/track/Abc123",
  "https://open.spotify.com:444/embed/track/Abc123", "http://open.spotify.com/embed/track/Abc123", "//open.spotify.com/embed/track/Abc123",
  "javascript:alert(1)", '<iframe src="https://open.spotify.com/embed/track/Abc123"></iframe>',
  "https://open.spotify.com/embed/track/Abc123?space here", "https://open.spotify.com/embed/track/Abc123?control\u0001here",
  "https://open.spotify.com/embed/track/Abc123?back\\slash", "https://w.soundcloud.com/player/?url=https://soundcloud.com/artist/mix",
  "https://soundcloud.com:444/artist/mix", "https://soundcloud.com.evil.example/artist/mix", "https://user:pass@soundcloud.com/artist/mix",
];
for (const embedUrl of invalidUrls) {
  const draft = payload(saved);
  draft.items[1] = { ...draft.items[1], embedUrl };
  await assert.rejects(() => save(saved, draft), error => error.code === "22023", embedUrl);
}
for (const draft of [
  { ...payload(saved), items: payload(saved).items.slice(1) },
  { ...payload(saved), items: [...payload(saved).items, { ...spotify[0] }] },
  { ...payload(saved), items: payload(saved).items.map(item => ({ ...item, provider: "spotify" })) },
  { ...payload(saved), items: Array.from({ length: 49 }, (_, index) => ({ ...spotify[0], id: `capacity-${index}` })) },
]) await assert.rejects(() => save(saved, draft), error => error.code === "22023");
assert.deepEqual(await snapshot(), saved, "Rejected requests leave collection and heading versions untouched");

const archivedRow = await archived("sc-archived");
await assert.rejects(() => save(saved, { ...payload(saved), items: [...payload(saved).items, { id: "sc-archived", title: "Stale client", embedUrl: spotify[0].embedUrl, isPublished: true }] }), error => error.code === "23514");
assert.deepEqual(await snapshot(), saved);
assert.deepEqual(await archived("sc-archived"), archivedRow);

// Archive/restore share the old lock key and keep the exact Spotify URL and order.
const beforeArchive = saved;
const original = await source("spotify-track");
const parentBefore = saved.soundcloud.presentationUpdatedAt;
const archivedResult = await mutate("archive", "spotify-track");
assert.equal(archivedResult.outcome, "archived");
assert.deepEqual((await archived("spotify-track")).row_data, original);
assert.equal(archivedResult.archive.items.find(item => item.id === "spotify-track").platform, "spotify");
assert.equal(archivedResult.versions.presentationUpdatedAt, parentBefore);
await assert.rejects(() => save(beforeArchive), error => error.code === "40001");
const restored = await mutate("restore", "spotify-track");
assert.equal(restored.outcome, "restored");
const restoredRow = await source("spotify-track");
assert.equal(restoredRow.embed_url, original.embed_url);
assert.equal(restoredRow.sort_order, original.sort_order);
assert.equal(restoredRow.is_published, false);
assert.notEqual(restoredRow.updated_at, original.updated_at);
assert.equal(restored.versions.presentationUpdatedAt, parentBefore);
await assert.rejects(() => save(beforeArchive), error => error.code === "40001", "Pre-archive snapshots cannot revive an earlier version after restore");
assert.equal((await mutate("archive", "spotify-album", beforeArchive)).outcome, "conflict");

for (const embedUrl of [
  ...["api.soundcloud.com", "on.soundcloud.com", "soundcloud.com", "www.soundcloud.com"].map(host => `https://${host}/artist/mix`),
  "https://soundcloud.com:443/artist/mix", "https://soundcloud.com", "https://soundcloud.com?artist=mix", "https://soundcloud.com#artist",
]) {
  saved = await snapshot();
  const draft = payload(saved);
  draft.items[0].embedUrl = embedUrl;
  await save(saved, draft);
}
saved = await snapshot();
await db.exec("update public.music_presentation set releases_heading='Changed in main Spotify editor' where id='main'");
await assert.rejects(() => save(saved), error => error.code === "40001", "Shared heading CAS still detects main Spotify edits");
saved = await snapshot();

for (const role of ["anon", "authenticated", "service_role"]) {
  await db.exec(`set role ${role}`);
  if (role !== "service_role") {
    await assert.rejects(() => save(saved), error => error.code === "42501");
    await assert.rejects(archivePage, error => error.code === "42501");
  } else {
    await save(saved);
  }
  await db.exec("reset role");
}
const beforeRerun = await content();
await db.exec(migration);
assert.deepEqual(await content(), beforeRerun);
assert.deepEqual(await oldContracts(), contracts);

await db.exec("begin read only");
for (const [name, count] of [["0042_content_archive_music", 9], ["0062_music_track_players", 10]]) {
  const checks = await readFile(new URL(`../supabase/checks/${name}.sql`, import.meta.url), "utf8");
  const rows = (await db.query(checks)).rows;
  assert.equal(rows.length, count);
  assert.ok(rows.every(row => row.passed), JSON.stringify(rows));
}
await db.exec("rollback");

// Reruns fail closed on an unexpected customized save implementation.
await db.exec("begin; create or replace function public.save_music_tracks_v2(p_site_id text,p_expected_presentation_updated_at timestamptz,p_expected_versions jsonb,p_payload jsonb) returns jsonb language sql security definer set search_path='' as $$ select '{}'::jsonb $$;");
await assert.rejects(() => db.exec(migration), error => error.code === "55000");
await db.exec("rollback");
assert.deepEqual(await content(), beforeRerun);
await db.close();
console.log(`Mixed music players migration passed: ${invalidUrls.length} invalid URLs, legacy clients, mixed saves, row/parent CAS, no migration data changes, hidden archive restore, permissions, safe rerun, custom-function guard and 10 new read-only checks (plus all 9 from 0042).`);
