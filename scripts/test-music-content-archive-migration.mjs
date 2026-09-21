// Real PostgreSQL in a disposable PGlite runtime. No credentials, network,
// Supabase connection or production writes. Pass local PGlite dist/index.js.
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
  "0028_music_page_editor", "0029_batch_5a_music_and_nav_links", "0034_media_optimization_foundation",
  "0035_media_pipeline_integrity_guards", "0036_media_upload_intents", "0037_home_page_editor",
  "0039_footer_content_editor", "0040_media_library_v2", "0041_content_archive_navbar"]) await db.exec(await sql(name));
const actor = "00000000-0000-4000-8000-000000000001";
await db.query("insert into auth.users values($1)", [actor]);
await db.query("insert into public.admin_profiles(user_id,email,role) values($1,'isolated@example.test','owner')", [actor]);
await db.exec("insert into public.site_settings(id,artist_name) values('main','Isolated artist')");
const table = (section) => section === "platforms" ? "music_platform_links" : "soundcloud_tracks";
const collection = (section) => section === "platforms" ? "music-platforms" : "music-soundcloud";
const add = (section, id, url, title = id) => section === "platforms"
  ? db.query("insert into public.music_platform_links(id,title,label,href,icon_key,image_src,sort_order) values($1,$2,'small label','https://example.test','link',$3,20)", [id, title, url ?? "https://media.example/cover.jpg"])
  : db.query("insert into public.soundcloud_tracks(id,title,embed_url,sort_order) values($1,$2,$3,20)", [id, title, url ?? "https://soundcloud.com/artist/mix"]);
const source = async (section, id) => (await db.query(`select to_jsonb(item) as data from public.${table(section)} item where id=$1`, [id])).rows[0]?.data;
const archived = async (section, id) => (await db.query("select to_jsonb(item) as data from public.content_archive_v2 item where collection=$1 and source_id=$2", [collection(section), id])).rows[0]?.data;
const versions = async (section) => (await db.query(`select coalesce(jsonb_object_agg(id,to_jsonb(updated_at)),'{}'::jsonb) as data from public.${table(section)}`)).rows[0].data;
const presentation = async () => (await db.query("select to_jsonb(item) as data from public.music_presentation item where id='main'")).rows[0]?.data;
const archivePage = async (section, offset = 0) => (await db.query("select public.get_music_content_archive_v2($1,$2) as data", [section, offset])).rows[0].data;
const mutate = async (section, operation, id, options = {}) => (await db.query(
  "select public.mutate_music_content_archive_v2($1,$2,$3,$4,$5,$6,$7) as data",
  [section, operation, id, options.versions ?? await versions(section), options.actor ?? actor,
    options.presentation ?? (section === "soundcloud" ? (await presentation())?.updated_at ?? null : null),
    options.archive ?? (operation === "restore" ? (await archived(section, id))?.updated_at ?? null : null)]
)).rows[0].data;
const allContent = async () => (await db.query(`select * from (select 'platform' as kind,to_jsonb(item) as data from public.music_platform_links item
  union all select 'soundcloud',to_jsonb(item) from public.soundcloud_tracks item
  union all select 'archive',to_jsonb(item) from public.content_archive_v2 item
  union all select 'presentation',to_jsonb(item) from public.music_presentation item) content order by kind,data->>'id'`)).rows;
for (const section of ["platforms", "soundcloud"]) { await add(section, "first"); await add(section, "second", undefined, section === "soundcloud" ? "" : "Second"); }
await db.exec("insert into public.social_links(id,label,platform,href,icon_key) values('nav','Navbar','link','https://example.test','link')");
const navVersions = async () => (await db.query("select coalesce(jsonb_object_agg(id,to_jsonb(updated_at)),'{}'::jsonb) as data from public.social_links")).rows[0].data;
const navMutation = async (operation) => (await db.query("select public.mutate_navbar_shortcut_archive_v2($1,'nav',$2,$3,(select updated_at from public.content_archive_v2 where collection='navbar-shortcuts' and source_id='nav')) as data", [operation, await navVersions(), actor])).rows[0].data;
await navMutation("archive");
const beforeMigration = await allContent();
const migration = await sql("0042_content_archive_music");
await db.exec(migration);
assert.deepEqual(await allContent(), beforeMigration, "Deployment changes no active, archived or presentation row");
assert.equal((await navMutation("restore")).outcome, "restored", "The 0041 Navbar lifecycle remains operational");
assert.equal((await navMutation("archive")).outcome, "archived");

for (const section of ["platforms", "soundcloud"]) {
  const parentBefore = await presentation();
  const initial = await source(section, "first");
  const oldVersions = await versions(section);
  const oldRows = (await db.query(`select to_jsonb(item) as data from public.${table(section)} item order by sort_order,id`)).rows.map(row => row.data);
  const result = await mutate(section, "archive", "first");
  assert.equal(result.outcome, "archived");
  assert.equal(result.section, section);
  assert.deepEqual(result.canonicalSection.items.map(item => item.id), ["second"]);
  assert.deepEqual(result.versions.items, await versions(section));
  assert.equal(result.archive.total, 1);
  assert.deepEqual(Object.keys(result.archive.items[0]).sort(), ["id", "label", "platform", "archivedAt", "updatedAt"].sort());
  assert.equal(await source(section, "first"), undefined);
  assert.deepEqual((await archived(section, "first")).row_data, initial, "The original complete row remains recoverable");
  if (section === "soundcloud") {
    assert.equal(result.canonicalSection.mixesHeading, parentBefore.mixes_heading);
    assert.equal(result.versions.presentationUpdatedAt, parentBefore.updated_at);
  }
  assert.deepEqual(await presentation(), parentBefore, "Neither music collection archive rewrites shared presentation content");
  assert.equal((await mutate(section, "archive", "second", { versions: oldVersions })).outcome, "conflict");
  if (section === "platforms") {
    const staleItems = oldRows.map(item => ({ id: item.id, title: item.title, label: item.label, href: item.href, imageSrc: item.image_src, iconKey: item.icon_key, isPublished: item.is_published }));
    await assert.rejects(() => db.query("select public.save_music_platforms_v2('main',$1,$2)", [oldVersions, { items: staleItems }]), error => error.code === "40001", "Ordinary stale saves cannot recreate archived baseline rows");
  }
  await assert.rejects(() => add(section, "first"), error => error.code === "23514", "Stale Classic inserts cannot resurrect archived IDs");
  const staleUpsert = section === "platforms"
    ? "insert into public.music_platform_links(id,title,label,href,icon_key,image_src) values('first','Stale','','https://example.test','link','https://media.example/cover.jpg') on conflict(id) do update set title=excluded.title"
    : "insert into public.soundcloud_tracks(id,title,embed_url) values('first','Stale','https://soundcloud.com/artist/mix') on conflict(id) do update set title=excluded.title";
  await assert.rejects(() => db.query(staleUpsert), error => error.code === "23514");
  await assert.rejects(() => db.query(`update public.${table(section)} set id='first' where id='second'`), error => error.code === "23514");
  const staleVersions = await versions(section);
  await db.exec(`update public.${table(section)} set title='Changed title' where id='second'`);
  for (const [operation, id] of [["restore", "first"], ["archive", "second"]]) {
    assert.equal((await mutate(section, operation, id, { versions: staleVersions })).outcome, "conflict");
  }
  assert.equal((await mutate(section, "restore", "first", { archive: "2001-01-01T00:00:00Z" })).outcome, "conflict");
  const restored = await mutate(section, "restore", "first");
  assert.equal(restored.outcome, "restored");
  assert.equal((await source(section, "first")).is_published, false);
  assert.equal((await source(section, "first")).sort_order, initial.sort_order);
  assert.notEqual((await source(section, "first")).updated_at, initial.updated_at);
  assert.equal(await archived(section, "first"), undefined);
  assert.equal((await mutate(section, "archive", "first", { versions: oldVersions })).outcome, "conflict");
  await db.exec("begin");
  const beforeCycle = (await source(section, "first")).updated_at;
  await mutate(section, "archive", "first"); await mutate(section, "restore", "first");
  assert.equal((await db.query(`select updated_at > $1::timestamptz as later from public.${table(section)} where id='first'`, [beforeCycle])).rows[0].later, true, "ABA safety holds within one transaction");
  await db.exec("commit");
  await mutate(section, "archive", "first");
  const empty = await mutate(section, "archive", "second");
  assert.deepEqual(empty.canonicalSection.items, [], "Last archive returns intentionally empty content, never seeded fallback");
  assert.deepEqual(empty.versions.items, {});
  if (section === "soundcloud") {
    await add(section, "untitled", undefined, " "); await mutate(section, "archive", "untitled");
    assert.equal((await archivePage(section)).items.find(item => item.id === "untitled").label, "Untitled mix");
  }
  assert.equal((await mutate(section, "archive", "absent")).outcome, "missing");
  assert.equal((await mutate(section, "restore", "absent", { archive: "2001-01-01T00:00:00Z" })).outcome, "missing");
  const capacity = section === "platforms" ? 32 : 48;
  for (let i = 0; i < capacity; i++) await add(section, `filler-${i}`);
  assert.equal((await mutate(section, "restore", "first")).outcome, "capacity");
  await mutate(section, "archive", "filler-0");
  assert.equal((await mutate(section, "restore", "first")).outcome, "restored");
  assert.equal(Object.keys(await versions(section)).length, capacity);
  await mutate(section, "archive", "first");
  await db.exec(`alter table public.${table(section)} disable trigger archived_music_content_guard_v2`);
  await add(section, "first");
  await db.exec(`alter table public.${table(section)} enable trigger archived_music_content_guard_v2`);
  assert.equal((await mutate(section, "restore", "first")).outcome, "id_in_use");
  await db.exec(`delete from public.${table(section)} where id='first'`);
  await db.exec(`delete from public.${table(section)}`);
  await db.query("delete from public.content_archive_v2 where collection=$1", [collection(section)]);
}

// SoundCloud checks the heading shared with Spotify, but never rewrites it.
await add("soundcloud", "mix");
const oldParent = await presentation();
await db.exec("update public.music_presentation set releases_heading='Changed by Spotify', mixes_heading='Owner mix heading' where id='main'");
assert.equal((await mutate("soundcloud", "archive", "mix", { presentation: oldParent.updated_at })).outcome, "conflict");
const newParent = await presentation();
const oldTrackVersions = await versions("soundcloud");
const mixArchive = await mutate("soundcloud", "archive", "mix");
assert.equal(mixArchive.canonicalSection.mixesHeading, "Owner mix heading");
assert.deepEqual(await presentation(), newParent);
await assert.rejects(() => db.query("select public.save_music_soundcloud_v2('main',$1,$2,$3)", [newParent.updated_at, oldTrackVersions, { mixesHeading: "Outdated edit", items: [{ id: "mix", title: "mix", embedUrl: "https://soundcloud.com/artist/mix", isPublished: true }] }]), error => error.code === "40001");
await db.exec("update public.music_presentation set releases_heading='Another Spotify change' where id='main'");
assert.equal((await mutate("soundcloud", "restore", "mix", { presentation: newParent.updated_at })).outcome, "conflict");
assert.equal((await mutate("soundcloud", "restore", "mix")).outcome, "restored");

// Invalid sections, privilege assertions and bounded input cannot mutate content.
const beforeInvalid = await allContent();
for (const offset of [-1, 1, 19, 1000020]) await assert.rejects(() => archivePage("platforms", offset), error => error.code === "22023");
await assert.rejects(() => archivePage("navbar-shortcuts"), error => error.code === "22023");
for (const args of [
  ["platforms", "purge", "mix", {}, actor, null, null],
  ["platforms", "archive", "../mix", {}, actor, null, null],
  ["platforms", "archive", "mix", [], actor, null, null],
  ["platforms", "archive", "mix", { mix: null }, actor, null, null],
  ["platforms", "archive", "mix", {}, actor, "2001-01-01T00:00:00Z", null],
  ["soundcloud", "archive", "mix", await versions("soundcloud"), actor, null, null],
  ["soundcloud", "restore", "mix", await versions("soundcloud"), actor, (await presentation()).updated_at, null],
  ["platforms", "archive", "mix", {}, "00000000-0000-4000-8000-000000000099", null, null],
]) await assert.rejects(() => db.query("select public.mutate_music_content_archive_v2($1,$2,$3,$4,$5,$6,$7)", args), error => error.code === "22023");
assert.deepEqual(await allContent(), beforeInvalid);
await db.exec("insert into auth.users values('00000000-0000-4000-8000-000000000002'); insert into public.admin_profiles(user_id,email,role) values('00000000-0000-4000-8000-000000000002','backup@example.test','owner')");
await db.query("update public.admin_profiles set is_active=false where user_id=$1", [actor]);
await assert.rejects(() => mutate("soundcloud", "archive", "mix"), error => error.code === "22023");
await db.query("update public.admin_profiles set is_active=true where user_id=$1", [actor]);
const badTimestampVersions = { ...await versions("soundcloud"), mix: "not-a-date" };
await assert.rejects(() => mutate("soundcloud", "archive", "mix", { versions: badTimestampVersions }), error => error.code === "22023");
assert.deepEqual(await allContent(), beforeInvalid);

// A missing shared parent fails before any archive write, not after a move.
await db.exec("begin; delete from public.music_presentation where id='main'");
await assert.rejects(() => mutate("soundcloud", "archive", "mix", { presentation: "2001-01-01T00:00:00Z" }), error => error.code === "23503");
await db.exec("rollback");
assert.deepEqual(await allContent(), beforeInvalid);

// Both archived collection types remain visible to Media replacement. Even a
// historical SoundCloud row can contain a Media URL; restore preserves it.
const oldSrc = "https://media.example/old.jpg";
const newSrc = "https://media.example/new.jpg";
await db.query("insert into public.media_assets(id,label,src,media_type) values('old','Old',$1,'image'),('new','New',$2,'image')", [oldSrc, newSrc]);
for (const section of ["platforms", "soundcloud"]) { await add(section, "media", oldSrc); await mutate(section, "archive", "media"); }
const oldArchiveVersions = Object.fromEntries(await Promise.all(["platforms", "soundcloud"].map(async section => [section, (await archived(section, "media")).updated_at])));
const asset = async (id) => (await db.query("select to_jsonb(item) as data from public.media_assets item where id=$1", [id])).rows[0].data;
const mediaMutation = async (operation, replacement = null) => (await db.query("select public.mutate_media_asset_v2('old',$1,$2,$3,$4,$5) as data", [(await asset("old")).updated_at, actor, operation, replacement, replacement ? (await asset(replacement)).updated_at : null])).rows[0].data;
assert.equal((await mediaMutation("trash")).outcome, "in_use");
const usage = (await db.query("select * from public.get_media_library_v2_usage() where asset_id='old'")).rows;
assert.equal(usage.length, 1); assert.equal(usage[0].reference_label, "Archived content");
assert.equal((await mediaMutation("replace_and_trash", "new")).outcome, "replaced_and_trashed");
for (const section of ["platforms", "soundcloud"]) {
  const field = section === "platforms" ? "image_src" : "embed_url";
  assert.equal((await archived(section, "media")).row_data[field], newSrc);
  assert.notEqual((await archived(section, "media")).updated_at, oldArchiveVersions[section]);
  assert.equal((await mutate(section, "restore", "media", { archive: oldArchiveVersions[section] })).outcome, "conflict");
  assert.equal((await mutate(section, "restore", "media")).outcome, "restored");
  assert.equal((await source(section, "media"))[field], newSrc);
  assert.equal((await source(section, "media")).is_published, false);
}

// Failures after either move's first write roll back the complete operation.
await db.exec(`create function public.test_music_reject_delete() returns trigger language plpgsql as $$ begin raise exception 'deliberate_archive_failure'; end $$;
  create function public.test_music_reject_insert() returns trigger language plpgsql as $$ begin raise exception 'deliberate_restore_failure'; end $$;`);
for (const section of ["platforms", "soundcloud"]) {
  await db.exec(`create trigger test_archive_reject before delete on public.${table(section)} for each row execute function public.test_music_reject_delete()`);
  await assert.rejects(() => mutate(section, "archive", "media"), error => error.message.includes("deliberate_archive_failure"));
  assert.ok(await source(section, "media")); assert.equal(await archived(section, "media"), undefined);
  await db.exec(`drop trigger test_archive_reject on public.${table(section)}`);
  await mutate(section, "archive", "media");
  const beforeFailure = await archived(section, "media");
  await db.exec(`create trigger test_restore_reject before insert on public.${table(section)} for each row execute function public.test_music_reject_insert()`);
  await assert.rejects(() => mutate(section, "restore", "media"), error => error.message.includes("deliberate_restore_failure"));
  assert.equal(await source(section, "media"), undefined); assert.deepEqual(await archived(section, "media"), beforeFailure);
  await db.exec(`drop trigger test_restore_reject on public.${table(section)}`);
}
for (let i = 0; i < 24; i++) { const id = `page-${i}`; await add("platforms", id); await mutate("platforms", "archive", id); }
const firstPage = await archivePage("platforms"); const secondPage = await archivePage("platforms", 20);
assert.equal(firstPage.total, 25); assert.equal(firstPage.items.length, 20); assert.equal(secondPage.items.length, 5);
assert.equal(new Set([...firstPage.items, ...secondPage.items].map(item => item.id)).size, 25);
assert.equal((await archivePage("soundcloud")).total, 1, "Archive pages are strictly collection-isolated");
for (const forbidden of ["row_data", "archived_by", "href", "embed_url"]) assert.equal(JSON.stringify(firstPage).includes(forbidden), false);
const beforeRerun = await allContent(); await db.exec(migration); assert.deepEqual(await allContent(), beforeRerun);
for (const role of ["anon", "authenticated", "service_role"]) {
  await db.exec(`set role ${role}`);
  await assert.rejects(() => db.query("select row_data from public.content_archive_v2"), error => error.code === "42501");
  if (role === "service_role") {
    assert.equal((await archivePage("platforms")).total, 25);
    await assert.rejects(() => db.query("select public.guard_archived_music_content_v2()"), error => error.code === "42501");
  } else {
    await assert.rejects(() => archivePage("platforms"), error => error.code === "42501");
    await assert.rejects(() => db.query("select public.mutate_music_content_archive_v2('platforms','archive','media','{}',$1)", [actor]), error => error.code === "42501");
  }
  await db.exec("reset role");
}
for (const name of ["0041_content_archive_navbar", "0042_content_archive_music"]) {
  const checks = await db.exec(await readFile(new URL(`../supabase/checks/${name}.sql`, import.meta.url), "utf8"));
  assert.ok(checks[0].rows.every(check => check.passed), `Every ${name} check must pass`);
}
await db.close();
console.log("Music archive SQL passed: deploy/rerun preservation, Navbar compatibility, both collection CAS/capacity/hidden restore/ABA, shared presentation conflicts, private isolated paging, Media references/replacement, stale ID protection and atomic failures.");
