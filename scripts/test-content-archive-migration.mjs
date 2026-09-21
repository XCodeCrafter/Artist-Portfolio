// Isolated real PostgreSQL checks in an existing PGlite runtime. No credentials,
// network or production writes. Pass a local @electric-sql/pglite/dist/index.js.
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
  "0039_footer_content_editor", "0040_media_library_v2"]) await db.exec(await sql(name));
const actor = "00000000-0000-4000-8000-000000000001";
await db.query("insert into auth.users values($1)", [actor]);
await db.query("insert into public.admin_profiles(user_id,email,role) values($1,'isolated@example.test','owner')", [actor]);
await db.exec("insert into public.site_settings(id,artist_name) values('main','Isolated artist')");
const initialRows = () => db.query("select to_jsonb(social) as data from public.social_links social order by id");
const add = (id, href = `https://example.test/${id}`) => db.query(
  "insert into public.social_links(id,label,platform,href,icon_key,sort_order) values($1,$1,'link',$2,'link',10)", [id, href]);
await add("spotify", "https://open.spotify.com/artist/123");
await add("youtube", "https://youtube.com/example");
const beforeMigration = await initialRows();
const migration = await sql("0041_content_archive_navbar");
await db.exec(migration);
assert.deepEqual(await initialRows(), beforeMigration, "Deploying 0041 must not rewrite or archive existing content");

// Keep PostgreSQL microseconds in JSON; native Date would truncate CAS tokens.
const snapshot = async () => (await db.query("select public.get_navbar_social_links_v2_snapshot('main') as data")).rows[0].data;
const versions = async () => Object.fromEntries((await snapshot()).items.map((item) => [item.id, item.updatedAt]));
const archive = async (offset = 0) => (await db.query("select public.get_navbar_shortcut_archive_v2($1) as data", [offset])).rows[0].data;
const archived = async (id) => (await db.query("select to_jsonb(item) as data from public.content_archive_v2 item where source_id=$1", [id])).rows[0]?.data;
const source = async (id) => (await db.query("select to_jsonb(item) as data from public.social_links item where id=$1", [id])).rows[0]?.data;
const mutate = async (operation, id, expected = undefined, archiveExpected = undefined) => (await db.query(
  "select public.mutate_navbar_shortcut_archive_v2($1,$2,$3,$4,$5) as data",
  [operation, id, expected ?? await versions(), actor, archiveExpected ?? (operation === "restore" ? (await archived(id))?.updated_at ?? null : null)]
)).rows[0].data;
const oldSnapshot = await snapshot();
const oldVersions = await versions();
assert.deepEqual(await archive(), { items: [], total: 0, offset: 0 });

const result = await mutate("archive", "spotify");
assert.equal(result.outcome, "archived");
assert.deepEqual(result.snapshot.items.map((item) => item.id), ["youtube"]);
assert.equal(result.archive.total, 1);
assert.deepEqual(Object.keys(result.archive.items[0]).sort(), ["id", "label", "platform", "archivedAt", "updatedAt"].sort());
assert.equal(result.archive.items[0].id, "spotify");
assert.equal(await source("spotify"), undefined);
assert.deepEqual((await archived("spotify")).row_data, beforeMigration.rows[0].data, "Store the complete trusted original row");
assert.equal((await mutate("archive", "youtube", oldVersions)).outcome, "conflict", "Whole-collection stale membership must fail");
const oldItems = oldSnapshot.items.map((item) => Object.fromEntries(Object.entries(item).filter(([key]) => key !== "updatedAt")));
await assert.rejects(() => db.query("select public.save_navbar_social_links_v2('main',$1,$2)", [oldVersions, oldItems]), error => error.code === "40001");
await assert.rejects(() => add("spotify"), error => error.code === "23514", "A stale Classic upsert cannot recreate an archived ID");
await assert.rejects(() => db.query("insert into public.social_links(id,label,platform,href) values('spotify','Stale','link','https://example.test') on conflict(id) do update set label=excluded.label"), error => error.code === "23514");
await assert.rejects(() => db.query("update public.social_links set id='spotify' where id='youtube'"), error => error.code === "23514");

// A change to any other active shortcut rejects both archive and restore.
const staleVersions = await versions();
await db.exec("update public.social_links set label='New label' where id='youtube'");
assert.equal((await mutate("restore", "spotify", staleVersions)).outcome, "conflict");
assert.equal((await mutate("archive", "youtube", staleVersions)).outcome, "conflict");
assert.equal((await mutate("restore", "spotify", undefined, "2001-01-01T00:00:00Z")).outcome, "conflict");
const restored = await mutate("restore", "spotify");
assert.equal(restored.outcome, "restored");
assert.equal((await source("spotify")).is_published, false);
assert.equal(restored.archive.total, 0);
assert.equal(await archived("spotify"), undefined);
assert.notEqual((await source("spotify")).updated_at, oldVersions.spotify, "Archive / restore cannot revive an old CAS token");
assert.equal((await mutate("archive", "spotify", oldVersions)).outcome, "conflict");
assert.equal((await source("spotify")).href, "https://open.spotify.com/artist/123");

// Monotonicity still holds when both operations run in one transaction.
await db.exec("begin");
const beforeCycle = (await source("spotify")).updated_at;
assert.equal((await mutate("archive", "spotify")).outcome, "archived");
assert.equal((await mutate("restore", "spotify")).outcome, "restored");
assert.equal((await db.query("select updated_at > $1::timestamptz as later from public.social_links where id='spotify'", [beforeCycle])).rows[0].later, true);
await db.exec("commit");

// Removing the last item returns an intentionally empty active navbar.
await mutate("archive", "spotify");
const empty = await mutate("archive", "youtube");
assert.deepEqual(empty.snapshot.items, []);
assert.deepEqual(await versions(), {});
assert.equal((await mutate("archive", "not-present")).outcome, "missing");
assert.equal((await mutate("restore", "not-present", undefined, "2001-01-01T00:00:00Z")).outcome, "missing");
assert.equal((await mutate("restore", "spotify")).outcome, "restored");
for (let i = 0; i < 15; i++) await add(`filler-${i}`);
const full = await versions();
assert.equal(Object.keys(full).length, 16);
assert.equal((await mutate("restore", "youtube")).outcome, "capacity", "Hidden active rows still occupy active capacity");
assert.ok(await archived("youtube"));
assert.equal((await mutate("archive", "filler-0")).outcome, "archived", "Archiving frees one active slot");
assert.equal((await mutate("restore", "youtube")).outcome, "restored");
assert.equal(Object.keys(await versions()).length, 16);

// Collision recovery is fail-closed even if an operator bypassed the guard.
await mutate("archive", "youtube");
await db.exec("alter table public.social_links disable trigger archived_navbar_shortcut_guard_v2");
await add("youtube");
await db.exec("alter table public.social_links enable trigger archived_navbar_shortcut_guard_v2");
assert.equal((await mutate("restore", "youtube")).outcome, "id_in_use");
await db.exec("delete from public.social_links where id='youtube'");

// Invalid calls must not create, change or drop any archive row.
const beforeInvalid = await archive();
const invalidInputs = [
  ["purge", "spotify", await versions(), actor, null],
  ["archive", "../spotify", await versions(), actor, null],
  ["archive", "spotify", [], actor, null],
  ["archive", "spotify", { spotify: null }, actor, null],
  ["archive", "spotify", await versions(), "00000000-0000-4000-8000-000000000099", null],
  ["archive", "spotify", await versions(), actor, "2001-01-01T00:00:00Z"],
  ["restore", "youtube", await versions(), actor, null],
];
for (const input of invalidInputs) await assert.rejects(() => db.query(
  "select public.mutate_navbar_shortcut_archive_v2($1,$2,$3,$4,$5)", input), error => error.code === "22023");
await db.exec("insert into auth.users values('00000000-0000-4000-8000-000000000002'); insert into public.admin_profiles(user_id,email,role) values('00000000-0000-4000-8000-000000000002','backup@example.test','owner')");
await db.query("update public.admin_profiles set is_active=false where user_id=$1", [actor]);
await assert.rejects(() => mutate("archive", "spotify"), error => error.code === "22023");
await db.query("update public.admin_profiles set is_active=true where user_id=$1", [actor]);
assert.deepEqual(await archive(), beforeInvalid);
for (const offset of [-1, 1, 19, 1000020]) await assert.rejects(() => archive(offset), error => error.code === "22023");
await assert.rejects(() => db.query("insert into public.content_archive_v2(collection,source_id,row_data) values('navbar-shortcuts','broken','{}')"), error => error.code === "23514");

// Recoverable rows retain media usage, participate in exact replacement, and
// their CAS version changes. Content archive never deletes/trashes the file.
await db.exec("delete from public.social_links; delete from public.content_archive_v2");
const oldSrc = "https://media.example/old.jpg";
const newSrc = "https://media.example/new.jpg";
await db.query("insert into public.media_assets(id,label,src,media_type) values('old','Old',$1,'image'),('new','New',$2,'image')", [oldSrc, newSrc]);
await add("media-link", oldSrc);
await mutate("archive", "media-link");
const beforeReplacement = await archived("media-link");
const asset = async (id) => (await db.query("select to_jsonb(item) as data from public.media_assets item where id=$1", [id])).rows[0].data;
const mediaMutation = async (operation, replacement = null) => (await db.query(
  "select public.mutate_media_asset_v2('old',$1,$2,$3,$4,$5) as data",
  [(await asset("old")).updated_at, actor, operation, replacement, replacement ? (await asset(replacement)).updated_at : null]
)).rows[0].data;
assert.equal((await mediaMutation("trash")).outcome, "in_use");
const usage = (await db.query("select * from public.get_media_library_v2_usage() where asset_id='old'")).rows;
assert.equal(usage.length, 1);
assert.equal(usage[0].reference_label, "Archived content");
assert.equal((await mediaMutation("replace_and_trash", "new")).outcome, "replaced_and_trashed");
assert.equal((await archived("media-link")).row_data.href, newSrc);
assert.notEqual((await archived("media-link")).updated_at, beforeReplacement.updated_at);
assert.equal((await mutate("restore", "media-link", undefined, beforeReplacement.updated_at)).outcome, "conflict");
assert.equal((await mutate("restore", "media-link")).outcome, "restored");
assert.equal((await source("media-link")).href, newSrc);
assert.equal((await source("media-link")).is_published, false);
assert.ok((await asset("old")).deleted_at);

// Both move directions are atomic if a downstream source trigger rejects.
await db.exec(`create function public.test_archive_reject_delete() returns trigger language plpgsql as $$ begin raise exception 'deliberate_archive_failure'; end $$;
  create trigger test_archive_reject before delete on public.social_links for each row execute function public.test_archive_reject_delete();`);
await assert.rejects(() => mutate("archive", "media-link"), error => error.message.includes("deliberate_archive_failure"));
assert.ok(await source("media-link"));
assert.equal(await archived("media-link"), undefined, "Failed delete rolls archive insert back");
await db.exec("drop trigger test_archive_reject on public.social_links; drop function public.test_archive_reject_delete()");
await mutate("archive", "media-link");
const beforeRestoreFailure = await archived("media-link");
await db.exec(`create function public.test_archive_reject_insert() returns trigger language plpgsql as $$ begin raise exception 'deliberate_restore_failure'; end $$;
  create trigger test_restore_reject before insert on public.social_links for each row execute function public.test_archive_reject_insert();`);
await assert.rejects(() => mutate("restore", "media-link"), error => error.message.includes("deliberate_restore_failure"));
assert.equal(await source("media-link"), undefined);
assert.deepEqual(await archived("media-link"), beforeRestoreFailure, "Failed insert rolls archive deletion back");
await db.exec("drop trigger test_restore_reject on public.social_links; drop function public.test_archive_reject_insert()");

// Bounded, stable pages cover every archive item without raw row JSON.
for (let i = 0; i < 24; i++) { await add(`page-${String(i).padStart(2, "0")}`); await mutate("archive", `page-${String(i).padStart(2, "0")}`); }
const firstPage = await archive();
const secondPage = await archive(20);
assert.equal(firstPage.total, 25);
assert.equal(firstPage.items.length, 20);
assert.equal(secondPage.items.length, 5);
assert.equal(secondPage.offset, 20);
assert.equal(new Set([...firstPage.items, ...secondPage.items].map((item) => item.id)).size, 25);
assert.deepEqual((await archive(40)).items, []);
assert.equal(JSON.stringify(firstPage).includes("row_data"), false);
assert.equal(JSON.stringify(firstPage).includes("archived_by"), false);
assert.equal(JSON.stringify(firstPage).includes("href"), false);
const beforeRerun = (await db.query("select to_jsonb(item) as data from public.content_archive_v2 item order by source_id")).rows;
await db.exec(migration);
assert.deepEqual((await db.query("select to_jsonb(item) as data from public.content_archive_v2 item order by source_id")).rows, beforeRerun);

for (const role of ["anon", "authenticated", "service_role"]) {
  await db.exec(`set role ${role}`);
  await assert.rejects(() => db.query("select row_data from public.content_archive_v2"), error => error.code === "42501");
  if (role !== "service_role") {
    await assert.rejects(() => archive(), error => error.code === "42501");
    await assert.rejects(() => db.query("select public.mutate_navbar_shortcut_archive_v2('archive','media-link','{}',$1)", [actor]), error => error.code === "42501");
  } else {
    assert.equal((await archive()).total, 25);
    await assert.rejects(() => db.query("select public.guard_archived_navbar_shortcut_v2()"), error => error.code === "42501");
  }
  await db.exec("reset role");
}
const checks = await db.exec(await readFile(new URL("../supabase/checks/0041_content_archive_navbar.sql", import.meta.url), "utf8"));
assert.ok(checks[0].rows.every((check) => check.passed), "Every read-only deployment check must pass");
await db.close();
console.log("Content archive SQL passed: deploy/rerun preservation, whole-collection CAS, Classic ID guard, hidden restore/ABA, last-item empty state, capacity, private paging, media references/replacement and atomic rollback.");
