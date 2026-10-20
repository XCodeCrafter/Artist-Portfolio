// Disposable PostgreSQL WASM only. No credentials, network or hosted database.
// Usage: node scripts/test-music-release-provider-migration.mjs <PGlite dist/index.js>
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

if (!process.argv[2]) throw new Error("Pass a local @electric-sql/pglite/dist/index.js path.");
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const sql = name => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
const migration = await sql("0063_music_release_provider");
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql as $$ select null::uuid $$;`);
await db.exec((await sql("0001_initial_schema")).replace("create extension if not exists pgcrypto;", ""));
await assert.rejects(() => db.exec(migration), error => error.code === "55000");
await db.exec("rollback");
await db.exec((await sql("0002_media_manager")).split("insert into storage.buckets")[0]);
await db.exec(`insert into public.site_settings(id,artist_name,spotify_artist_url,spotify_embed_url)
  values('main','Isolated artist','https://open.spotify.com/artist/Abc123','https://open.spotify.com/embed/artist/Abc123');`);
for (const name of [
  "0013_gallery_media_placements", "0014_gallery_studio", "0016_footer_effect", "0023_admin_operations_hardening",
  "0028_music_page_editor", "0029_batch_5a_music_and_nav_links", "0030_bio_page_editor",
  "0031_gallery_page_editor", "0032_showreel_page_editor", "0033_contact_page_editor",
  "0034_media_optimization_foundation", "0035_media_pipeline_integrity_guards", "0036_media_upload_intents",
  "0037_home_page_editor", "0039_footer_content_editor", "0040_media_library_v2",
  "0041_content_archive_navbar", "0042_content_archive_music", "0043_content_archive_bio",
  "0044_content_archive_gallery_showreel", "0045_contact_optional_copy", "0046_hero_media_framing",
  "0051_photo_framing", "0062_music_track_players",
]) await db.exec(await sql(name));
await db.exec(`update public.music_presentation set releases_heading='Original releases',mixes_heading='Original mixes' where id='main';
  insert into public.music_platform_links(id,title,href,icon_key,image_src)
    values('original-platform','Platform','https://example.test','link','/shared.jpg');
  insert into public.soundcloud_tracks(id,title,embed_url) values('original-track','Track','https://soundcloud.com/artist/track');`);
const tables = ["site_settings","page_heroes","music_presentation","music_platform_links","soundcloud_tracks","photo_framings","content_archive_v2"];
const content = async () => (await db.query("select * from (" + tables.map(table =>
  `select '${table}' as kind,to_jsonb(item) as data from public.${table} item`
).join(" union all ") + ") content order by kind,data::text")).rows;
const legacyContracts = async () => (await db.query(`select oid::regprocedure::text as name,
  pg_get_functiondef(oid) as definition,proacl::text as acl from pg_proc where oid in (
    'public.save_music_spotify_v2(text,timestamptz,timestamptz,jsonb)'::regprocedure,
    'public.save_music_tracks_v2(text,timestamptz,jsonb,jsonb)'::regprocedure,
    'public.get_photo_editor_with_framing_v2(text,text)'::regprocedure,
    'public.get_hero_editor_with_framing_v2(text,text)'::regprocedure
  ) order by name`)).rows;
const snapshot = async () => (await db.query("select public.get_photo_editor_with_framing_v2('music','main') as data")).rows[0].data;
const payload = snapshot => {
  const { releasesHeading, artistUrl, embedUrl, provider, soundcloudPlaylistUrl } = snapshot.spotify;
  return { releasesHeading, artistUrl, embedUrl, provider, soundcloudPlaylistUrl };
};
const save = async (snap, draft = payload(snap), legacy = false, site = "main") => (await db.query(
  `select public.${legacy ? "save_music_spotify_v2" : "save_music_releases_v2"}($1,$2,$3,$4) as data`,
  [site,snap.spotify.settingsUpdatedAt,snap.spotify.presentationUpdatedAt,draft]
)).rows[0].data;
const legacyPayload = snap => {
  const { releasesHeading, artistUrl, embedUrl } = snap.spotify;
  return { releasesHeading, artistUrl, embedUrl };
};
const oldContent = await content();
const contracts = await legacyContracts();
const oldSnapshot = await snapshot();
// An existing column with the same name is not sufficient to trust its contract.
for (const definition of [
  "release_provider text default 'spotify'",
  "release_provider text not null default 'soundcloud'",
  "release_provider varchar(20) not null default 'spotify'",
  "soundcloud_playlist_url text default ''",
  "soundcloud_playlist_url text not null default 'https://soundcloud.com/artist/sets/wrong-default'",
]) {
  await db.exec(`begin; alter table public.music_presentation add column ${definition};`);
  await assert.rejects(() => db.exec(migration), error => error.code === "55000" && error.message === "music_releases_columns_contract_changed");
  await db.exec("rollback");
  assert.deepEqual(await content(), oldContent);
}
await db.exec(migration);
assert.deepEqual(await legacyContracts(), contracts);
assert.deepEqual((await content()).map(row => {
  if (row.kind !== "music_presentation") return row;
  const { release_provider, soundcloud_playlist_url, ...data } = row.data;
  assert.equal(release_provider, "spotify");
  assert.equal(soundcloud_playlist_url, "");
  return { ...row, data };
}), oldContent, "Adding default columns changes no existing content or timestamps");
let current = await snapshot();
assert.deepEqual(current, { ...oldSnapshot, spotify: { ...oldSnapshot.spotify, provider: "spotify", soundcloudPlaylistUrl: "" } });
let draft = { ...payload(current), provider: "soundcloud", soundcloudPlaylistUrl: "https://soundcloud.com/artist/sets/new-release" };
let result = await save(current, draft);
let saved = await snapshot();
assert.deepEqual(result, { section: draft, versions: { settingsUpdatedAt: saved.spotify.settingsUpdatedAt, presentationUpdatedAt: saved.spotify.presentationUpdatedAt } });
assert.deepEqual(payload(saved), draft);
assert.equal(saved.soundcloud.mixesHeading, oldSnapshot.soundcloud.mixesHeading);
assert.deepEqual(saved.soundcloud.tracks, oldSnapshot.soundcloud.tracks);
assert.deepEqual(saved.platforms, oldSnapshot.platforms);
assert.deepEqual(saved.hero, oldSnapshot.hero);
await assert.rejects(() => save(current, legacyPayload(current), true), error => error.code === "40001", "Old Spotify draft cannot overwrite a newer selection");

// A freshly opened legacy client may edit Spotify, but never switch the provider or erase its playlist.
const legacyEdit = { ...legacyPayload(saved), releasesHeading: "Edited from legacy", embedUrl: "https://open.spotify.com/embed/album/Album123" };
await save(saved, legacyEdit, true);
current = await snapshot();
assert.deepEqual(payload(current), { ...draft, ...legacyEdit });
await assert.rejects(() => save(saved, draft), error => error.code === "40001");
const playlist = current.spotify.soundcloudPlaylistUrl;
await save(current, { ...payload(current), provider: "spotify" });
current = await snapshot();
assert.equal(current.spotify.soundcloudPlaylistUrl, playlist);
await save(current, { ...payload(current), provider: "soundcloud" });
current = await snapshot();
assert.equal(current.spotify.embedUrl, legacyEdit.embedUrl);

const invalidUrls = [
  "", "http://soundcloud.com/artist/sets/album", "//soundcloud.com/artist/sets/album",
  "https://soundcloud.com/artist/track", "https://soundcloud.com/artist", "https://api.soundcloud.com/playlists/123",
  "https://on.soundcloud.com/abc", "https://w.soundcloud.com/player/?url=https://soundcloud.com/artist/sets/album",
  "https://soundcloud.com.evil.test/artist/sets/album", "https://user:pass@soundcloud.com/artist/sets/album",
  "https://soundcloud.com:444/artist/sets/album", "https://www.soundcloud.com/artist/sets/album",
  "https://soundcloud.com/artist/sets/album?secret_token=s-private", "https://soundcloud.com/artist/sets/album?si=shared",
  "https://soundcloud.com/artist/sets/album#shared", "https://soundcloud.com/artist/sets/album/extra",
  "https://soundcloud.com/artist/sets/album%2Fsecret", "https://soundcloud.com/artist/sets/a b",
  "https://soundcloud.com/artist/sets/a\\b", "https://soundcloud.com/artist/sets/albüm",
  "https://soundcloud.com/artist/sets/a\u0001b", "javascript:alert(1)",
  '<iframe src="https://w.soundcloud.com/player"></iframe>',
  "https://soundcloud.com/artist/sets/" + "a".repeat(2048),
];
for (const soundcloudPlaylistUrl of invalidUrls) {
  await assert.rejects(() => save(current, { ...payload(current), soundcloudPlaylistUrl }), error => error.code === "22023", soundcloudPlaylistUrl);
}
const invalidPayloads = [
  null, [], {}, { ...payload(current), provider: "youtube" }, { ...payload(current), provider: "" },
  { ...payload(current), soundcloudPlaylistUrl: null }, { ...payload(current), provider: true },
  { ...payload(current), releasesHeading: " " }, { ...payload(current), releasesHeading: "a".repeat(221) },
  { ...payload(current), provider: "spotify", soundcloudPlaylistUrl: "https://evil.test/playlist" },
  { ...payload(current), extra: "field" }, legacyPayload(current),
  { ...payload(current), artistUrl: "https://evil.test/artist/a" },
  { ...payload(current), embedUrl: '<iframe src="https://open.spotify.com/embed/album/A"></iframe>' },
];
for (const invalid of invalidPayloads) await assert.rejects(() => save(current, invalid), error => error.code === "22023");
const invalidSpotifyEmbeds = [
  "https://open.spotify.com/embed/not-a-type/A123",
  "https://open.spotify.com/embed/track/", "https://open.spotify.com/embed/track/Abc123/extra",
  "https://open.spotify.com/embed/track/A-bc", "https://open.spotify.com/embed/track/A%2Fbc",
  "https://open.spotify.com/embed/track/A?theme=bad\\option",
  "https://open.spotify.com/embed/track/A?theme=bad\u0001option",
  "https://open.spotify.com/embed/track/A?theme=bad option",
  "https://open.spotify.com/embed/track/A#bad\u007foption",
  "https://open.spotify.com/embed/track/A\n",
];
for (const embedUrl of invalidSpotifyEmbeds) {
  await assert.rejects(() => save(current, { ...payload(current), embedUrl }), error => error.code === "22023", embedUrl);
}
for (const field of ["artistUrl","embedUrl","soundcloudPlaylistUrl"]) {
  for (const suffix of ["\\bad", "\u0001bad", "\u007fbad", "\t", " "]) {
    await assert.rejects(() => save(current, {
      ...payload(current), [field]: payload(current)[field] + suffix,
    }), error => error.code === "22023", field + JSON.stringify(suffix));
  }
}
await assert.rejects(() => save(current, payload(current), false, "other"), error => error.code === "22023");
assert.deepEqual(await snapshot(), current, "Every rejected payload leaves content and versions unchanged");
for (const kind of ["artist","playlist","album","track","show","episode"]) {
  for (const options of ["","/","?utm_source=generator&theme=0#player"]) {
    const embedUrl = `https://open.spotify.com/embed/${kind}/Abc123${options}`;
    await save(current, { ...payload(current), embedUrl });
    current = await snapshot();
    assert.equal(current.spotify.embedUrl, embedUrl);
  }
}
// Both row versions independently reject concurrent changes.
await db.exec("update public.site_settings set artist_name='Concurrent identity edit' where id='main'");
await assert.rejects(() => save(current), error => error.code === "40001");
current = await snapshot();
await db.exec("update public.music_presentation set mixes_heading='Concurrent mixes edit' where id='main'");
await assert.rejects(() => save(current), error => error.code === "40001");
current = await snapshot();
for (const [provider, soundcloudPlaylistUrl] of [["spotify",""],["soundcloud","https://soundcloud.com/Artist_1/sets/Album-2/"]]) {
  draft = { ...payload(current), provider, soundcloudPlaylistUrl };
  result = await save(current, draft);
  current = await snapshot();
  assert.deepEqual(result.section, draft);
}
for (const [provider,url] of [["evil",""],["soundcloud",""],["spotify","https://evil.test/a"]]) {
  await assert.rejects(() => db.query("update public.music_presentation set release_provider=$1,soundcloud_playlist_url=$2", [provider,url]), error => error.code === "23514");
}
for (const column of ["release_provider","soundcloud_playlist_url"]) {
  await assert.rejects(() => db.exec(`update public.music_presentation set ${column}=null`), error => error.code === "23502");
}
const beforeRerun = await content();
await db.exec(migration);
assert.deepEqual(await content(), beforeRerun);
assert.deepEqual(await legacyContracts(), contracts);
for (const role of ["anon","authenticated","service_role"]) {
  await db.exec(`set role ${role}`);
  if (role !== "service_role") {
    await assert.rejects(() => save(current), error => error.code === "42501");
    await assert.rejects(snapshot, error => error.code === "42501");
    await assert.rejects(() => db.exec("update public.music_presentation set release_provider='spotify'"), error => error.code === "42501");
    const publicRow = (await db.query("select release_provider,soundcloud_playlist_url from public.music_presentation")).rows[0];
    assert.equal(publicRow.release_provider, current.spotify.provider);
  } else await save(current);
  await db.exec("reset role");
}
await db.exec("begin read only");
const checks = (await db.query(await readFile(new URL("../supabase/checks/0063_music_release_provider.sql", import.meta.url), "utf8"))).rows;
assert.equal(checks.length, 10);
assert.ok(checks.every(row => row.passed), JSON.stringify(checks));
await db.exec("rollback");

// Customized upstream contracts are never silently overwritten.
for (const definition of [
  "public.get_music_page_v2_snapshot(p_site_id text default 'main')",
  "public.save_music_releases_v2(p_site_id text,p_expected_settings_updated_at timestamptz,p_expected_presentation_updated_at timestamptz,p_payload jsonb)",
]) {
  await db.exec(`begin; create or replace function ${definition} returns jsonb language sql security definer set search_path='' as $$ select '{}'::jsonb $$;`);
  await assert.rejects(() => db.exec(migration), error => error.code === "55000");
  await db.exec("rollback");
}
const beforeDrift = await content();
for (const column of ["release_provider","soundcloud_playlist_url"]) {
  for (const drift of ["drop not null", "drop default", "set default 'unapproved'", "type varchar(2048)"]) {
    await db.exec(`begin; alter table public.music_presentation alter column ${column} ${drift};`);
    await assert.rejects(() => db.exec(migration), error => error.code === "55000" && error.message === "music_releases_columns_contract_changed");
    await db.exec("rollback");
    assert.deepEqual(await content(), beforeDrift);
  }
}
await db.close();
console.log(`Music releases migration passed: ${invalidUrls.length} invalid playlist URLs, ${invalidSpotifyEmbeds.length} invalid Spotify embeds, 18 valid Spotify embed variants, unsafe URL characters, exact payloads, provider switching, dormant URL retention, legacy compatibility, dual CAS, unchanged content/framing, RLS/grants, idempotence, column/function drift guards and 10 read-only checks.`);
