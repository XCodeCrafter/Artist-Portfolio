// Disposable PostgreSQL WASM only. No credentials, providers or hosted SQL.
// Usage: node scripts/test-home-editorial-migration.mjs <PGlite dist/index.js>
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { ACCEPTANCE_HOME_DRAFT } from "./acceptance/fixtures.mjs";
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
  "0028_music_page_editor", "0029_batch_5a_music_and_nav_links", "0030_bio_page_editor", "0031_gallery_page_editor", "0032_showreel_page_editor", "0033_contact_page_editor",
  "0034_media_optimization_foundation", "0035_media_pipeline_integrity_guards", "0036_media_upload_intents", "0037_home_page_editor",
  "0039_footer_content_editor", "0040_media_library_v2", "0041_content_archive_navbar", "0042_content_archive_music", "0043_content_archive_bio", "0044_content_archive_gallery_showreel",
  "0046_hero_media_framing", "0051_photo_framing"])
  await db.exec(await sql(name));
const snapshot = async () => (await db.query("select public.get_photo_editor_with_framing_v2('home','main') as data")).rows[0].data;
const raw = async () => (await db.query("select to_jsonb(home) as data from public.home_page_config home where id='main'")).rows[0].data;
const migration = await sql("0055_home_editorial_sections");
const checks = await readFile(new URL("../supabase/checks/0055_home_editorial_sections.sql", import.meta.url), "utf8");
const initial = await raw();
const legacyLayout = [...initial.draft.layout].reverse().map(item => ({ ...item, enabled: item.id !== "cnc" }));
await db.query("select public.save_home_section_v2('main','layout',$1,$2)", [initial.updated_at, legacyLayout]);
await db.query("update public.home_page_config set draft=jsonb_set(draft,'{stories,images,0,src}',to_jsonb('/images/retired-story.jpg'::text)) where id='main'");
const before = await raw();
await db.exec("alter table public.home_page_config disable trigger zz_media_library_reference_guard_v2");
await assert.rejects(() => db.exec(migration), error => error.code === "55000");
await db.exec("rollback");
assert.deepEqual(await raw(), before);
await db.exec("alter table public.home_page_config enable trigger zz_media_library_reference_guard_v2");
await db.exec(migration);
const seeded = await raw();
assert.deepEqual(seeded.draft.stories, before.draft.stories, "Retired stories stay available for recovery");
for (const section of ["hero", "about", "cnc", "feature"]) assert.deepEqual(seeded.draft[section], before.draft[section]);
assert.deepEqual(seeded.draft.layout.map(item => item.id), ["release", "work", "press", "feature", "cnc", "about", "hero"]);
assert.equal(seeded.draft.layout.find(item => item.id === "cnc").enabled, false);
assert.equal(seeded.draft.layout.find(item => item.id === "release").enabled, false);
assert.equal(seeded.draft.layout.find(item => item.id === "press").enabled, false);
assert.equal(seeded.draft.layout.find(item => item.id === "work").enabled, true);
assert.deepEqual(seeded.draft.press.items, []);
assert.equal(seeded.draft.release.background.src, "/images/home-editorial/press.webp", "New release background uses the requested microphone photo");
assert.equal(seeded.draft.release.background.alt, "Illustrative microphone backstage");
const portraitFraming = { desktop: { fit: "cover", x: 75, y: 50, zoom: 1 }, mobile: { fit: "cover", x: 75, y: 50, zoom: 1 } };
for (const card of seeded.draft.work.cards) assert.deepEqual(card.image.framing, card.id === "live" ? null : portraitFraming);
for (const image of [seeded.draft.work.background, seeded.draft.release.cover, seeded.draft.release.background, seeded.draft.press.background]) assert.equal(image.framing, null);
await db.exec(migration);
assert.deepEqual(await raw(), seeded, "Rerun must preserve content and CAS version");
await db.exec("begin read only");
const verified = (await db.query(checks)).rows;
assert.ok(verified.length >= 8 && verified.every(check => check.passed), JSON.stringify(verified));
await db.exec("rollback");
const save = async (section, payload, version) => (await db.query("select public.save_home_editorial_section_v2('main',$1,$2,$3) as data", [section, version ?? (await snapshot()).versions.updatedAt, payload])).rows[0].data;
const crop = { desktop: { fit: "cover", x: 23, y: 40, zoom: 1.3 }, mobile: { fit: "contain", x: 50, y: 50, zoom: 1 } };
let current = await snapshot();
for (const section of ["layout", "release", "work", "press"]) {
  const prior = await snapshot();
  const result = await save(section, prior.draft[section], prior.versions.updatedAt);
  assert.deepEqual(result.canonicalSection, prior.draft[section]);
  assert.deepEqual((await snapshot()).versions, result.versions);
  await assert.rejects(() => save(section, prior.draft[section], prior.versions.updatedAt), error => error.code === "40001");
}
// Old tabs cannot restore the removed story block or old five-slot layout.
current = await snapshot();
for (const section of ["stories", "layout"]) {
  await assert.rejects(() => db.query("select public.save_home_section_v2('main',$1,$2,$3)", [section, current.versions.updatedAt, before.draft[section]]), error => error.code === "22023");
}
// Existing parent writers, hero framing and photo framing remain functional.
current = await snapshot();
await db.query("select public.save_home_section_v2('main','cnc',$1,$2)", [current.versions.updatedAt, { ...current.draft.cnc, title: "Kept existing editor" }]);
current = await snapshot();
await db.query("select public.save_photo_section_with_framing_v2('home','about','main',$1,$2)", [{ ...current.draft.about, imageSrc: "/images/fixture.jpg", framing: crop }, current.versions]);
assert.deepEqual((await snapshot()).draft.about.framing, crop);

const rejects = async (section, payload, code = "22023") => {
  const unchanged = await raw();
  await assert.rejects(() => save(section, payload), error => error.code === code);
  assert.deepEqual(await raw(), unchanged, "Rejected input must not change content or version");
};
current = await snapshot();
const release = structuredClone(current.draft.release);
const work = structuredClone(current.draft.work);
const press = structuredClone(current.draft.press);
const pressItem = { id: "11111111-1111-4111-8111-111111111111", kind: "review", title: "Fixture review", quote: "Fixture quotation.", publication: "Isolated publication", date: "2026-09-29", href: "https://example.com/review", image: { src: "", alt: "", framing: null }, visible: true };
for (const [section, payload] of [[null, release], ["hero", release], ["_image", release.background], ["_playback", release.playback], ["release", null], ["release", []], ["release", {}], ["release", { ...release, extra: true }]]) await rejects(section, payload);
for (const payload of [current.draft.layout.slice(1), current.draft.layout.map(() => current.draft.layout[0]), current.draft.layout.map(item => ({ ...item, enabled: false })), [...current.draft.layout.slice(1), { id: "stories", enabled: true }]]) await rejects("layout", payload);
for (const framing of [false, {}, { desktop: crop.desktop }, { ...crop, hidden: true }, { ...crop, mobile: { ...crop.mobile, zoom: 0.9 } }, { ...crop, desktop: { ...crop.desktop, x: 101 } }, { ...crop, desktop: { ...crop.desktop, y: "20" } }]) await rejects("release", { ...release, background: { ...release.background, framing } });
await rejects("release", { ...release, background: { src: "", alt: "", framing: crop } });
await rejects("release", { ...release, title: "x".repeat(221) });
await rejects("release", { ...release, primaryLabel: "Listen", primaryHref: "" });
for (const href of ["javascript:alert(1)", "//evil.example/", "/\\evil.example/", "https://user:secret@example.com/", "https://example.com:444/", "https://exam ple.com/"]) await rejects("release", { ...release, primaryHref: href });
for (const href of ["https:example.com/song.mp3", "https:/example.com/song.mp3", "https:///example.com/song.mp3", "https:////example.com/song.mp3", "https://example.com:/song.mp3", "https://example.com:0443/song.mp3", "https://example.com:000443/song.mp3", "https://[::1]/song.mp3"]) {
  await rejects("release", { ...release, primaryHref: href });
  await rejects("release", { ...release, playback: { kind: "audio", url: href } });
}
for (const playback of [{ kind: "none", url: "https://example.com/a.mp3" }, { kind: "audio", url: "https://example.com/page" }, { kind: "audio", url: "javascript:alert(1).mp3" }, { kind: "spotify", url: "https://evil.example/track/1111111111111111111111" }, { kind: "spotify", url: "https://open.spotify.com/track/too-short" }, { kind: "youtube", url: "https://evil.example/watch?v=dQw4w9WgXcQ" }, { kind: "youtube", url: "https://youtube.com/watch?v=bad" }, { kind: "iframe", url: "https://example.com/" }]) await rejects("release", { ...release, playback });
for (const url of ["https://youtube.com/watch?v=bad&v=dQw4w9WgXcQ", "https://youtube.com/watch?foo=bar#&v=dQw4w9WgXcQ"]) await rejects("release", { ...release, playback: { kind: "youtube", url } });
for (const playback of [{ kind: "none", url: "" }, { kind: "audio", url: "/audio/sample.mp3" }, { kind: "audio", url: "https://cdn.example.com/sample.M4A?token=fixture" }, { kind: "spotify", url: "https://open.spotify.com/track/1111111111111111111111?si=fixture" }, { kind: "spotify", url: "https://open.spotify.com/intl-cs/embed/album/1111111111111111111111" }, { kind: "youtube", url: "https://youtu.be/dQw4w9WgXcQ" }, { kind: "youtube", url: "https://www.youtube.com/watch?feature=share&v=dQw4w9WgXcQ" }, { kind: "youtube", url: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" }]) assert.deepEqual((await save("release", { ...release, playback })).canonicalSection.playback, playback);
// The application resolves encoded/duplicate v keys before this boundary.
for (const url of ["https://www.youtube.com/watch?v=abcdefghijk", "https://www.youtube.com/watch?v=abcdefghijk&t=20"]) {
  const playback = { kind: "youtube", url };
  assert.deepEqual((await save("release", { ...release, playback })).canonicalSection.playback, playback);
}
for (const cards of [work.cards.slice(1), work.cards.map(() => work.cards[0]), work.cards.map((item, index) => index ? item : { ...item, id: "other" }), work.cards.map((item, index) => index ? item : { ...item, tone: "blue" })]) await rejects("work", { ...work, cards });
for (const item of [{ ...pressItem, title: "" }, { ...pressItem, publication: "" }, { ...pressItem, quote: "", href: "" }, { ...pressItem, id: "not-a-uuid" }, { ...pressItem, date: "2026-02-30" }, { ...pressItem, date: "2025-02-29" }, { ...pressItem, kind: "other" }, { ...pressItem, visible: "true" }, { ...pressItem, extra: true }]) await rejects("press", { ...press, items: [item] });
await rejects("press", { ...press, items: [pressItem, pressItem] });
await rejects("press", { ...press, featuredId: pressItem.id, items: [] });
await rejects("press", { ...press, featuredId: pressItem.id, items: [{ ...pressItem, visible: false }] });
const twentyItems = Array.from({ length: 20 }, (_, index) => ({ ...pressItem, id: `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`, image: { ...work.cards[0].image, framing: crop } }));
await save("press", { ...press, featuredId: twentyItems[0].id, items: twentyItems });
await rejects("press", { ...press, items: [...twentyItems, { ...pressItem, id: "22222222-2222-4222-8222-222222222222" }] });
assert.deepEqual((await snapshot()).draft.press.items[0].image.framing, crop);
const normalized = await save("release", { ...release, title: "  Owner title  " });
assert.equal(normalized.canonicalSection.title, "Owner title");

// Live managed references, type checks, trash protection and read-only checks.
const actor = "00000000-0000-4000-8000-000000000001";
await db.query("insert into auth.users values($1)", [actor]);
await db.query("insert into public.admin_profiles(user_id,email,role) values($1,'isolated@example.test','owner')", [actor]);
await db.exec(`insert into public.media_assets(id,label,src,media_type) values
  ('editorial-image','Fixture image','https://media.example/image.jpg','image'),
  ('editorial-replacement','Fixture replacement','https://media.example/replacement.jpg','image'),
  ('editorial-video','Fixture video','https://media.example/video.mp4','video');`);
for (const src of ["https://unmanaged.example/image.jpg", "https://media.example/video.mp4", "javascript:alert(1)", "//evil.example/image.jpg"]) await rejects("release", { ...release, background: { ...release.background, src } });
await save("release", { ...release, background: { ...release.background, src: "https://media.example/image.jpg", framing: crop } });
assert.ok((await db.query("select * from public.media_asset_references('https://media.example/image.jpg')")).rows.some(item => item.reference_label.includes("Home V2")));
await db.exec("begin read only");
assert.ok((await db.query(checks)).rows.every(item => item.passed), "Checks must not lock rows, including remote images");
await db.exec("rollback");
const mediaVersion = async id => (await db.query("select updated_at::text as version from public.media_assets where id=$1", [id])).rows[0].version;
const used = (await db.query("select public.mutate_media_asset_v2('editorial-image',$1,$2,'trash') as data", [await mediaVersion("editorial-image"), actor])).rows[0].data;
assert.equal(used.outcome, "in_use", "Even hidden release media remains protected");
const replaced = (await db.query("select public.mutate_media_asset_v2('editorial-image',$1,$2,'replace_and_trash','editorial-replacement',$3) as data", [await mediaVersion("editorial-image"), actor, await mediaVersion("editorial-replacement")])).rows[0].data;
assert.equal(replaced.outcome, "replaced_and_trashed");
assert.equal((await snapshot()).draft.release.background.src, "https://media.example/replacement.jpg");
// Retired stories can still participate in the same recursive replacement path.
await db.query("update public.home_page_config set draft=public.replace_media_library_source_v2(draft,$1,$2) where id='main'", [before.draft.stories.images[0].src, "/images/recovered-story.jpg"]);
await rejects("release", { ...release, background: { ...release.background, src: "https://media.example/image.jpg" } });
const savedBeforeDirect = await raw();
await assert.rejects(() => db.query("update public.home_page_config set draft=jsonb_set(draft,'{work,cards}','[]'::jsonb) where id='main'"), error => error.code === "22023");
assert.deepEqual(await raw(), savedBeforeDirect);
for (const role of ["anon", "authenticated"]) {
  await db.exec(`set role ${role}`);
  await assert.rejects(() => db.query("select public.save_home_editorial_section_v2('main','release',clock_timestamp(),$1)", [release]), error => error.code === "42501");
  await assert.rejects(() => db.query("select public.validate_home_editorial_section_v2('release',$1,false)", [release]), error => error.code === "42501");
  await db.exec("reset role");
}
await db.exec("set role service_role");
await assert.rejects(() => db.query("select public.validate_home_editorial_section_v2('release',$1,false)", [release]), error => error.code === "42501");
await db.exec("reset role");
await db.exec(migration);
assert.deepEqual(await raw(), savedBeforeDirect, "Rerun must preserve owner edits too");
const originalWriter = (await db.query("select pg_get_functiondef('public.save_home_section_v2(text,text,timestamptz,jsonb)'::regprocedure) as definition")).rows[0].definition;
await db.exec(originalWriter.replace("invalid_home_section_payload", "unknown_owner_modification"));
await assert.rejects(() => db.exec(migration), error => error.code === "55000");
await db.exec("rollback");
assert.deepEqual(await raw(), savedBeforeDirect, "Unknown predecessor contracts must roll back completely");
await db.exec(originalWriter);
await db.query("update public.home_page_config set draft=$1 where id='main'", [ACCEPTANCE_HOME_DRAFT]);
for (const section of ["layout", "release", "work", "press"]) assert.deepEqual((await snapshot()).draft[section], ACCEPTANCE_HOME_DRAFT[section], "Actual local acceptance fixture must pass the post-migration direct-write guard");

await db.close();
console.log(`Home editorial migration passed: preserved content and owner edits, disabled old layout/story writers, idempotent rerun, CAS, strict schemas/limits, playback allowlists, inline crops, managed references/replacement/trash, direct-write guard, role boundaries and ${verified.length} read-only checks.`);
