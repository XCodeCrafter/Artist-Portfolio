// Disposable real PostgreSQL, no network, credentials or Supabase writes.
// Usage: node scripts/test-bio-content-archive-migration.mjs <PGlite dist/index.js>
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
if (!process.argv[2]) throw new Error("Pass a local @electric-sql/pglite/dist/index.js path.");
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const sql = (name) => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql as $$ select null::uuid $$;`);
await db.exec((await sql("0001_initial_schema")).replace("create extension if not exists pgcrypto;", ""));
await db.exec((await sql("0002_media_manager")).split("insert into storage.buckets")[0]);
for (const name of ["0013_gallery_media_placements", "0014_gallery_studio", "0023_admin_operations_hardening",
  "0028_music_page_editor", "0029_batch_5a_music_and_nav_links", "0030_bio_page_editor", "0034_media_optimization_foundation",
  "0035_media_pipeline_integrity_guards", "0036_media_upload_intents", "0037_home_page_editor", "0039_footer_content_editor",
  "0040_media_library_v2", "0041_content_archive_navbar", "0042_content_archive_music"]) await db.exec(await sql(name));
const actor = "00000000-0000-4000-8000-000000000001";
await db.query("insert into auth.users values($1)", [actor]);
await db.query("insert into public.admin_profiles(user_id,email,role) values($1,'isolated@example.test','owner')", [actor]);
await db.exec("insert into public.site_settings(id,artist_name) values('main','Isolated artist'); insert into public.bio_profile(id,top_label,intro_text,caption) values('main','BIO','Introduction','A portrait')");
const collections = ["portraits", "paragraphs", "credits"];
const table = (collection) => ({ portraits: "bio_gallery_images", paragraphs: "bio_paragraphs", credits: "actor_credits" })[collection];
const add = (collection, id, value) => {
  const queries = {
    portraits: "insert into public.bio_gallery_images(id,src,alt,sort_order) values($1,$2,'Portrait',20)",
    paragraphs: "insert into public.bio_paragraphs(id,body,reveal_delay,sort_order) values($1,$2,250,20)",
    credits: "insert into public.actor_credits(id,title,credit_type,role,production,director,year,href,sort_order) values($1,'Credit','film','Lead','Production','Director','2026',$2,20)",
  };
  return db.query(queries[collection], [id, value ?? (collection === "paragraphs" ? "A plain biography paragraph." : "https://media.example/portrait.jpg")]);
};
const source = async (collection, id) => (await db.query(`select to_jsonb(item) as data from public.${table(collection)} item where id=$1`, [id])).rows[0]?.data;
const profile = async () => (await db.query("select to_jsonb(item) as data from public.bio_profile item where id='main'")).rows[0]?.data;
const rowVersions = async (collection) => (await db.query(`select coalesce(jsonb_object_agg(id,to_jsonb(updated_at)),'{}'::jsonb) as data from public.${table(collection)}`)).rows[0].data;
const versions = async (collection) => collection === "credits" ? { items: await rowVersions(collection) } : {
  profileUpdatedAt: (await profile())?.updated_at, galleryItems: await rowVersions("portraits"), paragraphItems: await rowVersions("paragraphs"),
};
const archived = async (collection, id) => (await db.query("select to_jsonb(item) as data from public.content_archive_v2 item where collection=$1 and source_id=$2", [`bio-${collection}`, id])).rows[0]?.data;
const archivePage = async (collection, offset = 0) => (await db.query("select public.get_bio_content_archive_v2($1,$2) as data", [collection, offset])).rows[0].data;
const mutate = async (collection, operation, id, options = {}) => (await db.query(
  "select public.mutate_bio_content_archive_v2($1,$2,$3,$4,$5,$6) as data",
  [collection, operation, id, options.versions ?? await versions(collection), options.actor ?? actor,
    options.archive ?? (operation === "restore" ? (await archived(collection, id))?.updated_at ?? null : null)]
)).rows[0].data;
const allContent = async () => (await db.query(`select * from (
  select 'portrait' as kind,to_jsonb(item) as data from public.bio_gallery_images item
  union all select 'paragraph',to_jsonb(item) from public.bio_paragraphs item
  union all select 'credit',to_jsonb(item) from public.actor_credits item
  union all select 'profile',to_jsonb(item) from public.bio_profile item
  union all select 'navbar',to_jsonb(item) from public.social_links item
  union all select 'platform',to_jsonb(item) from public.music_platform_links item
  union all select 'soundcloud',to_jsonb(item) from public.soundcloud_tracks item
  union all select 'archive',to_jsonb(item) from public.content_archive_v2 item) content order by kind,data->>'id'`)).rows;
const payload = async (collection) => {
  const rows = async (name) => (await db.query(`select to_jsonb(item) as data from public.${table(name)} item order by sort_order,id`)).rows.map(row => row.data);
  if (collection === "credits") return { items: (await rows("credits")).map(item => ({ id: item.id, creditType: item.credit_type, title: item.title, role: item.role, production: item.production, director: item.director, year: item.year, href: item.href, isPublished: item.is_published })) };
  const parent = await profile();
  return { topLabel: parent.top_label, introText: parent.intro_text, caption: parent.caption,
    galleryImages: (await rows("portraits")).map(item => ({ id: item.id, src: item.src, alt: item.alt, isPublished: item.is_published })),
    paragraphs: (await rows("paragraphs")).map(item => ({ id: item.id, body: item.body, revealDelay: item.reveal_delay, isPublished: item.is_published })) };
};
const save = (collection, version, value) => collection === "credits"
  ? db.query("select public.save_bio_credits_v2('main',$1,$2)", [version.items, value])
  : db.query("select public.save_bio_biography_v2('main',$1,$2,$3,$4)", [version.profileUpdatedAt, version.galleryItems, version.paragraphItems, value]);

for (const collection of collections) { await add(collection, "first"); await add(collection, "second"); }
await db.exec("insert into public.social_links(id,label,platform,href,icon_key) values('nav','Navbar','link','https://example.test','link'); insert into public.music_platform_links(id,title,href,icon_key,image_src) values('platform','Music','https://example.test','link','https://media.example/music.jpg'); insert into public.soundcloud_tracks(id,title,embed_url) values('mix','Mix','https://soundcloud.com/artist/mix')");
const legacy = async (kind, operation) => {
  const sourceTable = kind === "navbar" ? "social_links" : kind === "platforms" ? "music_platform_links" : "soundcloud_tracks";
  const id = kind === "navbar" ? "nav" : kind === "platforms" ? "platform" : "mix";
  const archiveCollection = kind === "navbar" ? "navbar-shortcuts" : `music-${kind}`;
  const current = (await db.query(`select coalesce(jsonb_object_agg(id,to_jsonb(updated_at)),'{}'::jsonb) as data from public.${sourceTable}`)).rows[0].data;
  const timestamp = operation === "restore" ? (await db.query("select updated_at::text from public.content_archive_v2 where collection=$1 and source_id=$2", [archiveCollection, id])).rows[0].updated_at : null;
  return kind === "navbar"
    ? (await db.query("select public.mutate_navbar_shortcut_archive_v2($1,$2,$3,$4,$5) as data", [operation, id, current, actor, timestamp])).rows[0].data
    : (await db.query("select public.mutate_music_content_archive_v2($1,$2,$3,$4,$5,case when $1='soundcloud' then (select updated_at from public.music_presentation where id='main') else null end,$6) as data", [kind, operation, id, current, actor, timestamp])).rows[0].data;
};
for (const kind of ["navbar", "platforms", "soundcloud"]) assert.equal((await legacy(kind, "archive")).outcome, "archived");
const beforeMigration = await allContent();
const migration = await sql("0043_content_archive_bio");
await db.exec(migration);
assert.deepEqual(await allContent(), beforeMigration, "Deployment preserves every active/archive/profile row");
for (const kind of ["navbar", "platforms", "soundcloud"]) {
  assert.equal((await legacy(kind, "restore")).outcome, "restored");
  assert.equal((await legacy(kind, "archive")).outcome, "archived");
}

for (const collection of collections) {
  const initial = await source(collection, "first"); const oldVersions = await versions(collection);
  const oldPayload = await payload(collection); const parentBefore = await profile();
  const result = await mutate(collection, "archive", "first");
  assert.equal(result.outcome, "archived"); assert.equal(result.collection, collection);
  assert.equal(result.section, collection === "credits" ? "credits" : "biography");
  assert.deepEqual(result.canonicalSection, await payload(collection)); assert.deepEqual(result.versions, await versions(collection));
  assert.deepEqual((await archived(collection, "first")).row_data, initial);
  assert.equal(await source(collection, "first"), undefined);
  assert.deepEqual(await profile(), parentBefore, "Archive does not rewrite the Biography profile or version");
  assert.deepEqual(Object.keys(result.archive.items[0]).sort(), ["id", "label", "platform", "archivedAt", "updatedAt"].sort());
  assert.equal((await mutate(collection, "archive", "second", { versions: oldVersions })).outcome, "conflict");
  await assert.rejects(() => save(collection, oldVersions, oldPayload), error => error.code === "40001", "Ordinary stale saves cannot resurrect an archived row");
  await assert.rejects(() => add(collection, "first"), error => error.code === "23514");
  await assert.rejects(() => db.query(`update public.${table(collection)} set id='first' where id='second'`), error => error.code === "23514");
  const beforeEdit = await versions(collection);
  await db.exec(`update public.${table(collection)} set sort_order=30 where id='second'`);
  for (const [operation, id] of [["restore", "first"], ["archive", "second"]]) assert.equal((await mutate(collection, operation, id, { versions: beforeEdit })).outcome, "conflict");
  assert.equal((await mutate(collection, "restore", "first", { archive: "2001-01-01T00:00:00Z" })).outcome, "conflict");
  const restored = await mutate(collection, "restore", "first");
  assert.equal(restored.outcome, "restored"); assert.deepEqual(restored.canonicalSection, await payload(collection));
  const restoredRow = await source(collection, "first");
  assert.deepEqual({ ...restoredRow, updated_at: initial.updated_at, is_published: initial.is_published }, initial, "Full original row and sort order are preserved");
  assert.equal(restoredRow.is_published, false); assert.notEqual(restoredRow.updated_at, initial.updated_at);
  assert.equal(await archived(collection, "first"), undefined);
  assert.equal((await mutate(collection, "archive", "first", { versions: oldVersions })).outcome, "conflict");
  await db.exec("begin");
  const beforeCycle = (await source(collection, "first")).updated_at;
  await mutate(collection, "archive", "first"); await mutate(collection, "restore", "first");
  assert.equal((await db.query(`select updated_at > $1::timestamptz as later from public.${table(collection)} where id='first'`, [beforeCycle])).rows[0].later, true, "ABA is safe in one transaction");
  await db.exec("commit");
  await mutate(collection, "archive", "first"); await mutate(collection, "archive", "second");
  const empty = await payload(collection);
  assert.deepEqual(collection === "credits" ? empty.items : collection === "portraits" ? empty.galleryImages : empty.paragraphs, []);
  assert.equal((await mutate(collection, "archive", "missing")).outcome, "missing");
  assert.equal((await mutate(collection, "restore", "missing", { archive: "2001-01-01T00:00:00Z" })).outcome, "missing");
  const capacity = { portraits: 32, paragraphs: 50, credits: 100 }[collection];
  for (let i = 0; i < capacity; i++) await add(collection, `filler-${i}`);
  assert.equal((await mutate(collection, "restore", "first")).outcome, "capacity");
  await mutate(collection, "archive", "filler-0"); assert.equal((await mutate(collection, "restore", "first")).outcome, "restored");
  assert.equal(Object.keys(await rowVersions(collection)).length, capacity);
  await mutate(collection, "archive", "first");
  await db.exec(`alter table public.${table(collection)} disable trigger archived_bio_content_guard_v2`); await add(collection, "first");
  await db.exec(`alter table public.${table(collection)} enable trigger archived_bio_content_guard_v2`);
  assert.equal((await mutate(collection, "restore", "first")).outcome, "id_in_use");
  await db.exec(`delete from public.${table(collection)}`);
  await db.query("delete from public.content_archive_v2 where collection=$1", [`bio-${collection}`]);
}

// Both sibling membership/version maps and the profile form ONE Biography CAS.
for (const collection of ["portraits", "paragraphs"]) await add(collection, "shared");
for (const collection of ["portraits", "paragraphs"]) {
  const sibling = collection === "portraits" ? "paragraphs" : "portraits";
  const stale = await versions(collection);
  await db.exec(`update public.${table(sibling)} set sort_order=sort_order+1 where id='shared'`);
  assert.equal((await mutate(collection, "archive", "shared", { versions: stale })).outcome, "conflict");
  const beforeParentEdit = await versions(collection);
  await db.exec("update public.bio_profile set caption=caption||'!' where id='main'");
  assert.equal((await mutate(collection, "archive", "shared", { versions: beforeParentEdit })).outcome, "conflict");
  await mutate(collection, "archive", "shared");
  const old = await versions(collection); await add(sibling, `sibling-${collection}`);
  assert.equal((await mutate(collection, "restore", "shared", { versions: old })).outcome, "conflict");
  const oldParent = await versions(collection); await db.exec("update public.bio_profile set caption=caption||'!' where id='main'");
  assert.equal((await mutate(collection, "restore", "shared", { versions: oldParent })).outcome, "conflict");
  assert.equal((await mutate(collection, "restore", "shared")).outcome, "restored");
}
await add("credits", "shared");
for (const collection of collections) await mutate(collection, "archive", "shared");
assert.equal((await db.query("select count(*)::integer as count from public.content_archive_v2 where source_id='shared'")).rows[0].count, 3, "The same ID can safely exist in three different archive collections");
for (const collection of collections) { assert.equal((await mutate(collection, "restore", "shared")).outcome, "restored"); assert.equal(await archived(collection, "shared"), undefined); }
const unchanged = await allContent();
for (const offset of [-1, 1, 19, 1000020]) await assert.rejects(() => archivePage("portraits", offset), error => error.code === "22023");
await assert.rejects(() => archivePage("platforms"), error => error.code === "22023");
for (const bad of [[], {}, { items: {} }, { ...await versions("portraits"), extra: true },
  { ...await versions("portraits"), galleryItems: [] }, { ...await versions("portraits"), paragraphItems: { shared: null } },
  { ...await versions("portraits"), profileUpdatedAt: "infinity" }, { ...await versions("portraits"), galleryItems: { shared: "not-a-date" } },
  { ...await versions("portraits"), paragraphItems: { shared: "infinity" } },
  { ...await versions("portraits"), galleryItems: { "../bad": "2026-01-01T00:00:00Z" } }]) {
  await assert.rejects(() => mutate("portraits", "archive", "shared", { versions: bad }), error => error.code === "22023");
}
await assert.rejects(async () => mutate("credits", "archive", "shared", { versions: { ...await versions("credits"), galleryItems: {} } }), error => error.code === "22023");
for (const [collection, key, capacity] of [["portraits", "galleryItems", 32], ["paragraphs", "paragraphItems", 50], ["credits", "items", 100]]) {
  const excessive = { ...await versions(collection), [key]: Object.fromEntries(Array.from({ length: capacity + 1 }, (_, i) => [`extra-${i}`, "2026-01-01T00:00:00Z"])) };
  await assert.rejects(() => mutate(collection, "archive", "shared", { versions: excessive }), error => error.code === "22023");
}
await assert.rejects(() => mutate("credits", "archive", "shared", { archive: "2026-01-01T00:00:00Z" }), error => error.code === "22023");
await assert.rejects(async () => db.query("select public.mutate_bio_content_archive_v2('credits','restore','shared',$1,$2,null)", [{ items: await rowVersions("credits") }, actor]), error => error.code === "22023");
await assert.rejects(() => mutate("credits", "archive", "../bad"), error => error.code === "22023");
await assert.rejects(() => mutate("credits", "purge", "shared"), error => error.code === "22023");
await assert.rejects(() => mutate("credits", "archive", "shared", { actor: "00000000-0000-4000-8000-000000000099" }), error => error.code === "22023");
assert.deepEqual(await allContent(), unchanged);
await db.exec("insert into auth.users values('00000000-0000-4000-8000-000000000002'); insert into public.admin_profiles(user_id,email,role) values('00000000-0000-4000-8000-000000000002','backup@example.test','owner')");
await db.query("update public.admin_profiles set is_active=false where user_id=$1", [actor]);
await assert.rejects(() => mutate("credits", "archive", "shared"), error => error.code === "22023");
await db.query("update public.admin_profiles set is_active=true where user_id=$1", [actor]);
const beforeMissing = await versions("portraits");
await db.exec("begin; delete from public.bio_profile where id='main'");
await assert.rejects(() => mutate("portraits", "archive", "shared", { versions: beforeMissing }), error => error.code === "23503");
await db.exec("rollback"); assert.deepEqual(await allContent(), unchanged);

// Archived portrait and credit Media links are protected and replaced in JSON.
const oldSrc = "https://media.example/old.jpg"; const newSrc = "https://media.example/new.jpg";
await db.query("insert into public.media_assets(id,label,src,media_type) values('old','Old',$1,'image'),('new','New',$2,'image')", [oldSrc, newSrc]);
for (const collection of ["portraits", "credits"]) { await add(collection, "media", oldSrc); await mutate(collection, "archive", "media"); }
const oldArchiveVersions = Object.fromEntries(await Promise.all(["portraits", "credits"].map(async collection => [collection, (await archived(collection, "media")).updated_at])));
const assetVersion = async (id) => (await db.query("select updated_at::text from public.media_assets where id=$1", [id])).rows[0].updated_at;
const mediaMutation = async (operation, replacement = null) => (await db.query("select public.mutate_media_asset_v2('old',$1,$2,$3,$4,$5) as data", [await assetVersion("old"), actor, operation, replacement, replacement ? await assetVersion(replacement) : null])).rows[0].data;
assert.equal((await mediaMutation("trash")).outcome, "in_use");
const usage = (await db.query("select * from public.get_media_library_v2_usage() where asset_id='old'")).rows;
assert.equal(usage.length, 1); assert.equal(usage[0].reference_label, "Archived content");
assert.equal((await mediaMutation("replace_and_trash", "new")).outcome, "replaced_and_trashed");
for (const collection of ["portraits", "credits"]) {
  const field = collection === "portraits" ? "src" : "href";
  assert.equal((await archived(collection, "media")).row_data[field], newSrc);
  assert.equal((await mutate(collection, "restore", "media", { archive: oldArchiveVersions[collection] })).outcome, "conflict");
  assert.equal((await mutate(collection, "restore", "media")).outcome, "restored"); assert.equal((await source(collection, "media"))[field], newSrc);
}

await db.exec(`create function public.test_bio_reject_delete() returns trigger language plpgsql as $$ begin raise exception 'deliberate_archive_failure'; end $$;
  create function public.test_bio_reject_insert() returns trigger language plpgsql as $$ begin raise exception 'deliberate_restore_failure'; end $$;`);
for (const collection of collections) {
  await db.exec(`create trigger test_archive_reject before delete on public.${table(collection)} for each row execute function public.test_bio_reject_delete()`);
  await assert.rejects(() => mutate(collection, "archive", "shared"), error => error.message.includes("deliberate_archive_failure"));
  assert.ok(await source(collection, "shared")); assert.equal(await archived(collection, "shared"), undefined);
  await db.exec(`drop trigger test_archive_reject on public.${table(collection)}`); await mutate(collection, "archive", "shared");
  const beforeFailure = await archived(collection, "shared");
  await db.exec(`create trigger test_restore_reject before insert on public.${table(collection)} for each row execute function public.test_bio_reject_insert()`);
  await assert.rejects(() => mutate(collection, "restore", "shared"), error => error.message.includes("deliberate_restore_failure"));
  assert.equal(await source(collection, "shared"), undefined); assert.deepEqual(await archived(collection, "shared"), beforeFailure);
  await db.exec(`drop trigger test_restore_reject on public.${table(collection)}`);
}
for (let i = 0; i < 24; i++) { await add("portraits", `page-${i}`); await mutate("portraits", "archive", `page-${i}`); }
const firstPage = await archivePage("portraits"); const secondPage = await archivePage("portraits", 20);
assert.equal(firstPage.total, 25); assert.equal(firstPage.items.length, 20); assert.equal(secondPage.items.length, 5);
assert.equal(new Set([...firstPage.items, ...secondPage.items].map(item => item.id)).size, 25);
assert.equal((await archivePage("paragraphs")).total, 1); assert.equal((await archivePage("credits")).total, 1);
await add("portraits", "untitled"); await db.exec("update public.bio_gallery_images set alt=' ' where id='untitled'");
await mutate("portraits", "archive", "untitled"); assert.equal((await archivePage("portraits")).items.find(item => item.id === "untitled").label, "Untitled portrait");
await add("paragraphs", "excerpt", "  A\n\tparagraph " + "x".repeat(160)); await mutate("paragraphs", "archive", "excerpt");
const excerpt = (await archivePage("paragraphs")).items.find(item => item.id === "excerpt").label;
assert.equal(excerpt.length, 120); assert.ok(excerpt.startsWith("A paragraph "));
for (const forbidden of ["row_data", "archived_by", "https://", "src", "href"]) assert.equal(JSON.stringify(firstPage).includes(forbidden), false);
const beforeRerun = await allContent(); await db.exec(migration); assert.deepEqual(await allContent(), beforeRerun);
const serviceVersions = await versions("credits");
const serviceArchiveVersion = (await archived("credits", "shared")).updated_at;
for (const role of ["anon", "authenticated", "service_role"]) {
  await db.exec(`set role ${role}`);
  await assert.rejects(() => db.query("select row_data from public.content_archive_v2"), error => error.code === "42501");
  if (role === "service_role") {
    assert.equal((await archivePage("portraits")).total, 26);
    await assert.rejects(() => db.query("select public.guard_archived_bio_content_v2()"), error => error.code === "42501");
    const restored = (await db.query("select public.mutate_bio_content_archive_v2('credits','restore','shared',$1,$2,$3) as data", [serviceVersions, actor, serviceArchiveVersion])).rows[0].data;
    assert.equal(restored.outcome, "restored", "Verified service-role calls can restore without direct archive-table access");
    const moved = (await db.query("select public.mutate_bio_content_archive_v2('credits','archive','shared',$1,$2,null) as data", [restored.versions, actor])).rows[0].data;
    assert.equal(moved.outcome, "archived");
  } else {
    await assert.rejects(() => archivePage("portraits"), error => error.code === "42501");
    await assert.rejects(() => db.query("select public.mutate_bio_content_archive_v2('credits','archive','shared','{}',$1)", [actor]), error => error.code === "42501");
  }
  await db.exec("reset role");
}
for (const name of ["0041_content_archive_navbar", "0042_content_archive_music", "0043_content_archive_bio"]) {
  const checks = await db.exec(await readFile(new URL(`../supabase/checks/${name}.sql`, import.meta.url), "utf8"));
  assert.ok(checks[0].rows.every(check => check.passed), `Every ${name} check must pass`);
}
await db.close();
console.log("BIO archive SQL passed: deploy/rerun preservation, Navbar/Music compatibility, three collection capacities/hidden restore/order/ABA, coupled Biography membership+profile CAS, private paging, Media replacement, stale save/ID protection and atomic rollback.");
