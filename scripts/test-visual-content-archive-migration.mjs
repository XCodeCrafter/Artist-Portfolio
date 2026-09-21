// Disposable real PostgreSQL; no network, credentials or Supabase writes.
// Usage: node scripts/test-visual-content-archive-migration.mjs <PGlite dist/index.js>
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
for (const name of ["0013_gallery_media_placements", "0014_gallery_studio", "0023_admin_operations_hardening",
  "0028_music_page_editor", "0029_batch_5a_music_and_nav_links", "0030_bio_page_editor", "0031_gallery_page_editor", "0032_showreel_page_editor",
  "0034_media_optimization_foundation", "0035_media_pipeline_integrity_guards", "0036_media_upload_intents", "0037_home_page_editor",
  "0039_footer_content_editor", "0040_media_library_v2", "0041_content_archive_navbar", "0042_content_archive_music", "0043_content_archive_bio"]) await db.exec(await sql(name));
const actor = "00000000-0000-4000-8000-000000000001";
await db.query("insert into auth.users values($1)", [actor]);
await db.query("insert into public.admin_profiles(user_id,email,role) values($1,'isolated@example.test','owner')", [actor]);
await db.exec("insert into public.site_settings(id,artist_name) values('main','Isolated artist'); insert into public.bio_profile(id,top_label,intro_text,caption) values('main','BIO','Introduction','A portrait')");
const collections = ["gallery", "showreel"];
const table = collection => collection === "gallery" ? "gallery_images" : "videos";
const stored = collection => collection === "gallery" ? "gallery-frames" : "showreel-works";
const predicate = collection => collection === "gallery" ? "where is_freelance_story=false" : "";
const add = (collection, id, src = collection === "gallery" ? "/gallery/test.jpg" : "https://www.youtube.com/embed/test") => db.query(collection === "gallery"
  ? "insert into public.gallery_images(id,title,src,alt,caption,category,sort_order,is_mosaic,is_freelance_story) values($1,'Frame',$2,'Alt','Caption','Portrait',30,true,false)"
  : "insert into public.videos(id,title,description,embed_url,platform,thumbnail_src,video_type,sort_order) values($1,'Work','Description',$2,'youtube','/gallery/poster.jpg','music_video',30)", [id, src]);
const source = async (collection, id) => (await db.query(`select to_jsonb(item) as data from public.${table(collection)} item where id=$1`, [id])).rows[0]?.data;
const versions = async collection => ({ items: (await db.query(`select coalesce(jsonb_object_agg(id,to_jsonb(updated_at)),'{}'::jsonb) as data from public.${table(collection)} ${predicate(collection)}`)).rows[0].data });
const archived = async (collection, id) => (await db.query("select to_jsonb(item) as data from public.content_archive_v2 item where collection=$1 and source_id=$2", [stored(collection), id])).rows[0]?.data;
const archivePage = async (collection, offset = 0) => (await db.query("select public.get_visual_content_archive_v2($1,$2) as data", [collection, offset])).rows[0].data;
const mutate = async (collection, operation, id, options = {}) => (await db.query(
  "select public.mutate_visual_content_archive_v2($1,$2,$3,$4,$5,$6) as data",
  [collection, operation, id, options.versions ?? await versions(collection), options.actor ?? actor,
    options.archive ?? (operation === "restore" ? (await archived(collection, id))?.updated_at ?? null : null)]
)).rows[0].data;
const allContent = async () => (await db.query(`select * from (
  select 'gallery' as kind,to_jsonb(item) as data from public.gallery_images item
  union all select 'video',to_jsonb(item) from public.videos item
  union all select 'navbar',to_jsonb(item) from public.social_links item
  union all select 'platform',to_jsonb(item) from public.music_platform_links item
  union all select 'soundcloud',to_jsonb(item) from public.soundcloud_tracks item
  union all select 'portrait',to_jsonb(item) from public.bio_gallery_images item
  union all select 'paragraph',to_jsonb(item) from public.bio_paragraphs item
  union all select 'credit',to_jsonb(item) from public.actor_credits item
  union all select 'profile',to_jsonb(item) from public.bio_profile item
  union all select 'archive',to_jsonb(item) from public.content_archive_v2 item) content order by kind,data->>'id'`)).rows;
const payload = async collection => ({ items: (await db.query(`select to_jsonb(item) as data from public.${table(collection)} item ${predicate(collection)} order by sort_order,id`)).rows.map(({ data: item }) => collection === "gallery"
  ? { id: item.id, title: item.title, src: item.src, alt: item.alt, caption: item.caption, category: item.category, isMosaic: item.is_mosaic, isPublished: item.is_published }
  : { id: item.id, title: item.title, description: item.description, embedUrl: item.embed_url, platform: item.platform, thumbnailSrc: item.thumbnail_src, videoType: item.video_type, isFeatured: item.is_featured, isPublished: item.is_published }) });
const save = (collection, version, value) => db.query(`select public.${collection === "gallery" ? "save_gallery_frames_v2" : "save_showreel_works_v2"}('main',$1,$2)`, [version.items, value]);

// Existing older archives and all active rows survive deployment byte-for-byte.
await db.exec(`insert into public.social_links(id,label,platform,href,icon_key) values('nav','Navbar','link','https://example.test','link');
  insert into public.music_platform_links(id,title,href,icon_key,image_src) values('platform','Music','https://example.test','link','/gallery/music.jpg');
  insert into public.soundcloud_tracks(id,title,embed_url) values('mix','Mix','https://soundcloud.com/artist/mix');
  insert into public.bio_gallery_images(id,src,alt) values('portrait','/gallery/bio.jpg','Bio');
  insert into public.bio_paragraphs(id,body) values('paragraph','Biography');
  insert into public.actor_credits(id,title,credit_type) values('credit','Credit','film');
  insert into public.gallery_images(id,title,src,is_mosaic,is_freelance_story,freelance_story_order) values('home-story','HOME','/gallery/home.jpg',false,true,8)`);
const legacy = async (kind, operation) => {
  const config = { navbar: ["social_links", "nav", "navbar-shortcuts"], platforms: ["music_platform_links", "platform", "music-platforms"], soundcloud: ["soundcloud_tracks", "mix", "music-soundcloud"], portraits: ["bio_gallery_images", "portrait", "bio-portraits"], paragraphs: ["bio_paragraphs", "paragraph", "bio-paragraphs"], credits: ["actor_credits", "credit", "bio-credits"] }[kind];
  const [sourceTable, id, archiveCollection] = config;
  const current = (await db.query(`select coalesce(jsonb_object_agg(id,to_jsonb(updated_at)),'{}'::jsonb) as data from public.${sourceTable}`)).rows[0].data;
  const timestamp = operation === "restore" ? (await db.query("select updated_at::text from public.content_archive_v2 where collection=$1 and source_id=$2", [archiveCollection, id])).rows[0].updated_at : null;
  if (kind === "navbar") return (await db.query("select public.mutate_navbar_shortcut_archive_v2($1,$2,$3,$4,$5) as data", [operation, id, current, actor, timestamp])).rows[0].data;
  if (["platforms", "soundcloud"].includes(kind)) return (await db.query("select public.mutate_music_content_archive_v2($1,$2,$3,$4,$5,case when $1='soundcloud' then (select updated_at from public.music_presentation where id='main') else null end,$6) as data", [kind, operation, id, current, actor, timestamp])).rows[0].data;
  const boundary = kind === "credits" ? { items: current } : (await db.query(`select jsonb_build_object('profileUpdatedAt',(select updated_at from public.bio_profile where id='main'),
    'galleryItems',(select coalesce(jsonb_object_agg(id,to_jsonb(updated_at)),'{}'::jsonb) from public.bio_gallery_images),
    'paragraphItems',(select coalesce(jsonb_object_agg(id,to_jsonb(updated_at)),'{}'::jsonb) from public.bio_paragraphs)) as data`)).rows[0].data;
  return (await db.query("select public.mutate_bio_content_archive_v2($1,$2,$3,$4,$5,$6) as data", [kind, operation, id, boundary, actor, timestamp])).rows[0].data;
};
const previous = ["navbar", "platforms", "soundcloud", "portraits", "paragraphs", "credits"];
for (const kind of previous) assert.equal((await legacy(kind, "archive")).outcome, "archived");
for (const collection of collections) { await add(collection, "first"); await add(collection, "second"); }
for (let i = 0; i < 121; i++) await add("showreel", `historical-${i}`);
const beforeMigration = await allContent();
const migration = await sql("0044_content_archive_gallery_showreel"); await db.exec(migration);
assert.deepEqual(await allContent(), beforeMigration, "Deployment never rewrites content");
assert.equal((await archivePage("showreel")).activeLimit, 123, "Historical capacity is seeded before the first archive");
for (const kind of previous) { assert.equal((await legacy(kind, "restore")).outcome, "restored"); assert.equal((await legacy(kind, "archive")).outcome, "archived"); }
for (let i = 0; i < 121; i++) assert.equal((await mutate("showreel", "archive", `historical-${i}`)).outcome, "archived");
assert.equal((await archivePage("showreel")).activeLimit, 123, "Repeated archives do not ratchet historical capacity down");
for (let i = 0; i < 121; i++) assert.equal((await mutate("showreel", "restore", `historical-${i}`)).outcome, "restored");
assert.equal(Object.keys((await versions("showreel")).items).length, 123);
await db.exec("delete from public.videos where id like 'historical-%'");

const homeBefore = await source("gallery", "home-story");
for (const collection of collections) {
  const initial = await source(collection, "first"); const oldVersions = await versions(collection); const oldPayload = await payload(collection);
  const result = await mutate(collection, "archive", "first");
  assert.equal(result.outcome, "archived"); assert.equal(result.collection, collection); assert.equal(result.section, collection === "gallery" ? "frames" : "works");
  assert.deepEqual(result.canonicalSection, await payload(collection)); assert.deepEqual(result.versions, await versions(collection));
  assert.deepEqual((await archived(collection, "first")).row_data, initial); assert.equal(await source(collection, "first"), undefined);
  assert.deepEqual(Object.keys(result.archive.items[0]).sort(), ["id", "label", "platform", "archivedAt", "updatedAt"].sort());
  assert.equal((await mutate(collection, "archive", "second", { versions: oldVersions })).outcome, "conflict");
  await assert.rejects(() => save(collection, oldVersions, oldPayload), error => error.code === "40001");
  await assert.rejects(() => add(collection, "first"), error => error.code === "23514");
  await assert.rejects(() => db.query(`update public.${table(collection)} set id='first' where id='second'`), error => error.code === "23514");
  const beforeEdit = await versions(collection); await db.exec(`update public.${table(collection)} set sort_order=50 where id='second'`);
  assert.equal((await mutate(collection, "restore", "first", { versions: beforeEdit })).outcome, "conflict");
  assert.equal((await mutate(collection, "restore", "first", { archive: "2001-01-01T00:00:00Z" })).outcome, "conflict");
  const restored = await mutate(collection, "restore", "first"); assert.equal(restored.outcome, "restored");
  assert.deepEqual(restored.canonicalSection, await payload(collection));
  const restoredRow = await source(collection, "first");
  assert.deepEqual({ ...restoredRow, updated_at: initial.updated_at, is_published: initial.is_published }, initial, "Full row and original order survive");
  assert.equal(restoredRow.is_published, false); assert.notEqual(restoredRow.updated_at, initial.updated_at);
  assert.equal((await mutate(collection, "archive", "first", { versions: oldVersions })).outcome, "conflict");
  await db.exec("begin"); const beforeCycle = (await source(collection, "first")).updated_at;
  await mutate(collection, "archive", "first"); await mutate(collection, "restore", "first");
  assert.equal((await db.query(`select updated_at > $1::timestamptz as later from public.${table(collection)} where id='first'`, [beforeCycle])).rows[0].later, true, "ABA is safe in one transaction");
  await db.exec("commit");
  await mutate(collection, "archive", "first"); await mutate(collection, "archive", "second");
  assert.deepEqual((await payload(collection)).items, []);
  assert.equal((await mutate(collection, "archive", "missing")).outcome, "missing");
  assert.equal((await mutate(collection, "restore", "missing", { archive: "2001-01-01T00:00:00Z" })).outcome, "missing");
  const capacity = collection === "gallery" ? 120 : 123;
  for (let i = 0; i < capacity; i++) await add(collection, `filler-${i}`);
  assert.equal((await mutate(collection, "restore", "first")).outcome, "capacity");
  await mutate(collection, "archive", "filler-0"); assert.equal((await mutate(collection, "restore", "first")).outcome, "restored");
  await mutate(collection, "archive", "first");
  await db.exec(`alter table public.${table(collection)} disable trigger archived_visual_content_guard_v2`); await add(collection, "first");
  await db.exec(`alter table public.${table(collection)} enable trigger archived_visual_content_guard_v2`);
  assert.equal((await mutate(collection, "restore", "first")).outcome, "id_in_use");
  await db.exec(`delete from public.${table(collection)} ${predicate(collection)}`); await db.query("delete from public.content_archive_v2 where collection=$1", [stored(collection)]);
}
assert.deepEqual(await source("gallery", "home-story"), homeBefore, "HOME is never archived, reordered or changed");
assert.equal((await mutate("gallery", "archive", "home-story")).outcome, "missing");
await add("gallery", "reserved"); await mutate("gallery", "archive", "reserved");
await assert.rejects(() => db.exec("insert into public.gallery_images(id,title,src,is_mosaic,is_freelance_story) values('reserved','HOME','/home.jpg',false,true)"), error => error.code === "23514");
const beforeHomeEdit = await versions("gallery"); await db.exec("update public.gallery_images set caption='Home changed' where id='home-story'");
assert.equal((await mutate("gallery", "restore", "reserved", { versions: beforeHomeEdit })).outcome, "restored", "Unrelated HOME edits do not invalidate Gallery CAS");
await mutate("gallery", "archive", "reserved");
await db.exec("update public.content_archive_v2 set row_data=jsonb_set(row_data,'{is_freelance_story}','true') where collection='gallery-frames' and source_id='reserved'");
const corruptHomeArchive = await archived("gallery", "reserved");
await assert.rejects(() => mutate("gallery", "restore", "reserved"), error => error.code === "23514");
assert.deepEqual(await archived("gallery", "reserved"), corruptHomeArchive, "Corrupt HOME ownership cannot cross the Gallery restore boundary");
assert.equal(await source("gallery", "reserved"), undefined);
await db.exec("update public.content_archive_v2 set row_data=jsonb_set(row_data,'{is_freelance_story}','false') where collection='gallery-frames' and source_id='reserved'");
assert.equal((await mutate("gallery", "restore", "reserved")).outcome, "restored");

// Legacy Showreel IDs are exact strings, including Unicode, whitespace and prototype-like names.
for (const id of ["legacy film/夏 2026", " x ", "x".repeat(512), "__proto__", "constructor", "toString"]) {
  await add("showreel", id); await mutate("showreel", "archive", id);
  assert.equal((await archived("showreel", id)).source_id, id);
  assert.equal((await mutate("showreel", "restore", id)).outcome, "restored"); assert.equal((await source("showreel", id)).id, id);
}
await add("showreel", "featured"); await add("showreel", "competitor");
await db.exec("update public.videos set is_featured=true where id='featured'"); await mutate("showreel", "archive", "featured");
const featuredArchive = await archived("showreel", "featured");
await db.exec("update public.videos set is_featured=true,is_published=false where id='competitor'");
assert.equal((await mutate("showreel", "restore", "featured")).outcome, "featured_conflict");
assert.deepEqual(await archived("showreel", "featured"), featuredArchive, "Featured conflicts preserve the full archive for a later restore");
await db.exec("update public.videos set is_featured=false where id='competitor'");
assert.equal((await mutate("showreel", "restore", "featured")).outcome, "restored");
assert.equal((await source("showreel", "featured")).is_featured, true); assert.equal((await source("showreel", "featured")).is_published, false);
await db.exec("begin");
await db.exec("insert into public.videos(id,title,embed_url,platform,video_type) select 'grown-'||n,'Grown catalog','https://www.youtube.com/embed/test','youtube','music_video' from generate_series(1,130) n");
const grownCount = Object.keys((await versions("showreel")).items).length;
const storedBeforeGrowth = (await db.query("select active_limit from public.visual_content_archive_limits_v2 where collection='showreel'")).rows[0].active_limit;
assert.equal((await archivePage("showreel")).activeLimit, grownCount);
assert.equal((await db.query("select active_limit from public.visual_content_archive_limits_v2 where collection='showreel'")).rows[0].active_limit, storedBeforeGrowth, "Read sees later growth without mutating the high-water row");
assert.equal((await mutate("showreel", "archive", "grown-1")).archive.activeLimit, grownCount);
assert.equal((await db.query("select active_limit from public.visual_content_archive_limits_v2 where collection='showreel'")).rows[0].active_limit, grownCount);
assert.equal((await mutate("showreel", "restore", "grown-1")).outcome, "restored");
await db.exec("rollback");

const beforeInvalid = await allContent();
for (const offset of [-1, 1, 19, 1000020]) await assert.rejects(() => archivePage("gallery", offset), error => error.code === "22023");
await assert.rejects(() => archivePage("portraits"), error => error.code === "22023");
for (const collection of collections) {
  for (const bad of [[], {}, { items: [] }, { items: null }, { items: {}, extra: true }, { items: { reserved: null } }, { items: { reserved: "infinity" } }, { items: { reserved: "not-a-date" } }]) await assert.rejects(() => mutate(collection, "archive", "reserved", { versions: bad }), error => error.code === "22023");
  for (const id of ["", "\ncontrol", " ", "x".repeat(collection === "gallery" ? 161 : 513)]) await assert.rejects(() => mutate(collection, "archive", id), error => error.code === "22023");
  await assert.rejects(() => mutate(collection, "purge", "reserved"), error => error.code === "22023");
  await assert.rejects(() => mutate(collection, "archive", "reserved", { archive: "2026-01-01T00:00:00Z" }), error => error.code === "22023");
  await assert.rejects(() => mutate(collection, "restore", "reserved", { archive: "infinity" }), error => error.code === "22023");
  await assert.rejects(() => mutate(collection, "archive", "reserved", { actor: "00000000-0000-4000-8000-000000000099" }), error => error.code === "22023");
}
await assert.rejects(() => mutate("gallery", "archive", "legacy/film"), error => error.code === "22023");
await assert.rejects(() => mutate("showreel", "archive", "featured", { versions: { items: Object.fromEntries(Array.from({ length: 10001 }, (_, i) => [`x-${i}`, "2026-01-01T00:00:00Z"])) } }), error => error.code === "22023");
assert.deepEqual(await allContent(), beforeInvalid);
await db.exec("begin; update public.visual_content_archive_limits_v2 set active_limit=10001");
await assert.rejects(() => mutate("showreel", "archive", "featured"), error => error.code === "22023"); await db.exec("rollback");

// Archived Media refs remain protected and replacement updates the full row JSON.
const oldSrc = "https://media.example/old.jpg", newSrc = "https://media.example/new.jpg";
await db.query("insert into public.media_assets(id,label,src,media_type) values('old','Old',$1,'image'),('new','New',$2,'image')", [oldSrc, newSrc]);
await add("gallery", "media", oldSrc); await add("showreel", "media"); await db.query("update public.videos set thumbnail_src=$1 where id='media'", [oldSrc]);
const oldArchiveVersions = {};
for (const collection of collections) { await mutate(collection, "archive", "media"); oldArchiveVersions[collection] = (await archived(collection, "media")).updated_at; }
const assetVersion = async id => (await db.query("select updated_at::text from public.media_assets where id=$1", [id])).rows[0].updated_at;
const mediaMutation = async (operation, replacement = null) => (await db.query("select public.mutate_media_asset_v2('old',$1,$2,$3,$4,$5) as data", [await assetVersion("old"), actor, operation, replacement, replacement ? await assetVersion(replacement) : null])).rows[0].data;
assert.equal((await mediaMutation("trash")).outcome, "in_use");
const usage = (await db.query("select * from public.get_media_library_v2_usage() where asset_id='old'")).rows;
assert.equal(usage.length, 1); assert.equal(usage[0].reference_label, "Archived content");
assert.equal((await mediaMutation("replace_and_trash", "new")).outcome, "replaced_and_trashed");
for (const collection of collections) {
  const field = collection === "gallery" ? "src" : "thumbnail_src";
  assert.equal((await archived(collection, "media")).row_data[field], newSrc);
  assert.equal((await mutate(collection, "restore", "media", { archive: oldArchiveVersions[collection] })).outcome, "conflict");
  assert.equal((await mutate(collection, "restore", "media")).outcome, "restored"); assert.equal((await source(collection, "media"))[field], newSrc);
}
await db.exec(`create function public.test_visual_reject_delete() returns trigger language plpgsql as $$ begin raise exception 'deliberate_archive_failure'; end $$;
  create function public.test_visual_reject_insert() returns trigger language plpgsql as $$ begin raise exception 'deliberate_restore_failure'; end $$;`);
for (const collection of collections) {
  await db.exec(`create trigger test_archive_reject before delete on public.${table(collection)} for each row execute function public.test_visual_reject_delete()`);
  await assert.rejects(() => mutate(collection, "archive", "media"), error => error.message.includes("deliberate_archive_failure"));
  assert.ok(await source(collection, "media")); assert.equal(await archived(collection, "media"), undefined);
  await db.exec(`drop trigger test_archive_reject on public.${table(collection)}`); await mutate(collection, "archive", "media");
  const beforeFailure = await archived(collection, "media");
  await db.exec(`create trigger test_restore_reject before insert on public.${table(collection)} for each row execute function public.test_visual_reject_insert()`);
  await assert.rejects(() => mutate(collection, "restore", "media"), error => error.message.includes("deliberate_restore_failure"));
  assert.equal(await source(collection, "media"), undefined); assert.deepEqual(await archived(collection, "media"), beforeFailure);
  await db.exec(`drop trigger test_restore_reject on public.${table(collection)}`);
}
for (let i = 0; i < 24; i++) { await add("gallery", `page-${i}`); await mutate("gallery", "archive", `page-${i}`); }
const firstPage = await archivePage("gallery"), secondPage = await archivePage("gallery", 20);
assert.equal(firstPage.total, 25); assert.equal(firstPage.items.length, 20); assert.equal(secondPage.items.length, 5);
assert.equal(new Set([...firstPage.items, ...secondPage.items].map(item => item.id)).size, 25);
for (const forbidden of ["row_data", "archived_by", "https://", "embed_url", "src"]) assert.equal(JSON.stringify(firstPage).includes(forbidden), false);
const limitsBeforeRead = (await db.query("select * from public.visual_content_archive_limits_v2")).rows;
await archivePage("showreel"); assert.deepEqual((await db.query("select * from public.visual_content_archive_limits_v2")).rows, limitsBeforeRead, "Read paging has no writes");
const beforeRerun = await allContent(); await db.exec(migration); assert.deepEqual(await allContent(), beforeRerun);
const serviceVersions = await versions("showreel"), serviceArchiveVersion = (await archived("showreel", "media")).updated_at;
for (const role of ["anon", "authenticated", "service_role"]) {
  await db.exec(`set role ${role}`);
  for (const name of ["content_archive_v2", "visual_content_archive_limits_v2"]) await assert.rejects(() => db.query(`select * from public.${name}`), error => error.code === "42501");
  if (role === "service_role") {
    assert.equal((await archivePage("gallery")).total, 25);
    await assert.rejects(() => db.query("select public.guard_archived_visual_content_v2()"), error => error.code === "42501");
    const restored = (await db.query("select public.mutate_visual_content_archive_v2('showreel','restore','media',$1,$2,$3) as data", [serviceVersions, actor, serviceArchiveVersion])).rows[0].data;
    assert.equal(restored.outcome, "restored");
    const moved = (await db.query("select public.mutate_visual_content_archive_v2('showreel','archive','media',$1,$2,null) as data", [restored.versions, actor])).rows[0].data; assert.equal(moved.outcome, "archived");
  } else {
    await assert.rejects(() => archivePage("gallery"), error => error.code === "42501");
    await assert.rejects(() => db.query("select public.mutate_visual_content_archive_v2('gallery','archive','reserved','{}',$1)", [actor]), error => error.code === "42501");
  }
  await db.exec("reset role");
}
for (const name of ["0041_content_archive_navbar", "0042_content_archive_music", "0043_content_archive_bio", "0044_content_archive_gallery_showreel"]) {
  const checks = await db.exec(await readFile(new URL(`../supabase/checks/${name}.sql`, import.meta.url), "utf8"));
  assert.ok(checks[0].rows.every(check => check.passed), `Every ${name} check must pass: ${JSON.stringify(checks[0].rows)}`);
}
await db.close();
console.log("Visual archive SQL passed: deploy/rerun preservation, all six predecessor lifecycles, HOME isolation, exact legacy IDs, historical capacity recovery, featured conflicts, hidden restore/order/ABA, full CAS, private paging, Media replacement, stale save/ID protection and atomic rollback.");
