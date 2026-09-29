// Disposable PostgreSQL WASM only. No credentials, network or hosted SQL.
// Usage: node scripts/test-site-sharing-migration.mjs <PGlite dist/index.js>
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
  "0028_music_page_editor", "0029_batch_5a_music_and_nav_links", "0030_bio_page_editor", "0031_gallery_page_editor", "0032_showreel_page_editor", "0033_contact_page_editor",
  "0034_media_optimization_foundation", "0035_media_pipeline_integrity_guards", "0036_media_upload_intents", "0037_home_page_editor",
  "0039_footer_content_editor", "0040_media_library_v2", "0041_content_archive_navbar", "0042_content_archive_music", "0043_content_archive_bio", "0044_content_archive_gallery_showreel",
  "0046_hero_media_framing", "0051_photo_framing", "0055_home_editorial_sections"])
  await db.exec(await sql(name));
await db.exec(`insert into public.site_settings(id,artist_name,description) values('main','Franky Fugazi','Official actor and musician portfolio featuring biography, headshots, acting credits, showreel, releases, videos, and contact information.')`);
const identityBefore = (await db.query("select to_jsonb(settings) as data from public.site_settings settings where id='main'")).rows[0].data;
const migration = await sql("0056_site_sharing_metadata");
const checks = await readFile(new URL("../supabase/checks/0056_site_sharing_metadata.sql", import.meta.url), "utf8");
await db.exec("alter table public.site_settings disable trigger zz_media_library_reference_guard_v2");
await assert.rejects(() => db.exec(migration), error => error.code === "55000");
await db.exec("rollback");
await db.exec("alter table public.site_settings enable trigger zz_media_library_reference_guard_v2");
await db.exec(migration);
const snapshot = async () => (await db.query("select public.get_site_sharing_editor_v2('main') as data")).rows[0].data;
const projection = async () => (await db.query("select public.get_public_site_sharing_v2() as data")).rows[0].data;
const initial = await snapshot();
assert.equal(initial.draft.title, "Franky Fugazi | Cigar Box Blues");
assert.equal(initial.draft.description, "Raw cigar box blues, garage and swamp sounds. Discover Franky Fugazi’s music, videos and live dates.");
assert.equal(initial.draft.imageSrc, "");
assert.deepEqual((await db.query("select to_jsonb(settings) as data from public.site_settings settings where id='main'")).rows[0].data, identityBefore, "Do not rewrite existing identity or its CAS");
await db.exec("begin read only");
const verified = (await db.query(checks)).rows;
assert.equal(verified.length, 10); assert.ok(verified.every(check => check.passed), JSON.stringify(verified));
await db.exec("rollback");
const save = async (payload, version) => (await db.query("select public.save_site_sharing_v2('main',$1,$2) as data", [version ?? (await snapshot()).versions.updatedAt, payload])).rows[0].data;
const reject = async (payload, expected = "22023") => {
  const before = await snapshot(); await assert.rejects(() => save(payload), error => error.code === expected);
  assert.deepEqual(await snapshot(), before, "Rejected payload must preserve owner content and version");
};
const clean = { title: "Owner's title", description: "Owner description", imageSrc: "", imageAlt: "" };
for (const payload of [null, [], {}, { ...clean, extra: true }, { ...clean, title: null }, { ...clean, title: 5 },
  { ...clean, title: "x".repeat(121) }, { ...clean, description: "x".repeat(321) }, { ...clean, imageAlt: "x".repeat(501) },
  { ...clean, title: "line\nbreak" }, { ...clean, description: "tab\ttext" }, { ...clean, imageSrc: "x".repeat(2049) }]) await reject(payload);
for (const imageSrc of ["javascript:alert(1)", "//evil.example/a.jpg", "https://user:pass@evil.example/a.jpg", "https://evil.example:444/a.jpg",
  "/api/image.jpg", "/images/../secret.jpg", "/images/%2e%2e/image.jpg", "/images/a.svg", "/images/a.jpg?token=1", "https://unknown.example/a.jpg"]) await reject({ ...clean, imageSrc });
await assert.rejects(() => db.query("select public.save_site_sharing_v2('other',$1,$2)", [initial.versions.updatedAt, clean]), error => error.code === "22023");
await assert.rejects(() => db.query("select public.save_site_sharing_v2('main',null,$1)", [clean]), error => error.code === "22023");
await assert.rejects(() => db.query("select public.get_site_sharing_editor_v2('other')"), error => error.code === "22023");
const changed = await save({ ...clean, title: "  Owner's title  " }, initial.versions.updatedAt);
assert.deepEqual(changed.canonical, clean);
assert.notEqual(changed.versions.updatedAt, initial.versions.updatedAt);
await assert.rejects(() => save(clean, initial.versions.updatedAt), error => error.code === "40001");
assert.deepEqual((await snapshot()).versions, changed.versions);

const actor = "00000000-0000-4000-8000-000000000001";
await db.query("insert into auth.users values($1)", [actor]);
await db.query("insert into public.admin_profiles(user_id,email,role) values($1,'isolated@example.test','owner')", [actor]);
await db.exec(`insert into public.media_assets(id,label,src,media_type,mime_type,is_published) values
  ('share-cover','Cover','https://media.example/cover.jpg','image','image/jpeg',true),
  ('share-replacement','Replacement','https://media.example/replacement.png','image','image/png',true),
  ('share-local','Local image','/images/sharing-local.webp','image','image/webp',true),
  ('share-legacy','Legacy MIME','https://media.example/legacy.JPG','image','',true),
  ('share-draft','Unpublished image','https://media.example/draft.jpg','image','image/jpeg',false),
  ('share-gif','GIF','https://media.example/cover.gif','image','image/gif',true),
  ('share-video','Video','https://media.example/cover.mp4','video','video/mp4',true);`);
for (const imageSrc of ["https://media.example/draft.jpg", "https://media.example/cover.gif", "https://media.example/cover.mp4", "/images/not-in-library.jpg"]) await reject({ ...clean, imageSrc });
for (const imageSrc of ["/images/sharing-local.webp", "https://media.example/legacy.JPG"]) assert.equal((await save({ ...clean, imageSrc })).canonical.imageSrc, imageSrc);
const cover = { ...clean, imageSrc: "https://media.example/cover.jpg", imageAlt: "Owner cover" };
await save(cover);
assert.deepEqual(await projection(), cover);
assert.ok((await db.query("select * from public.media_asset_references('https://media.example/cover.jpg')")).rows.some(item => item.reference_label === "Site sharing preview"));
await db.exec("update public.media_assets set is_published=false where id='share-cover'");
assert.deepEqual(await projection(), clean, "Unpublished cover must not leak; retain title and description");
await reject(cover);
await db.exec("update public.media_assets set is_published=true where id='share-cover'");
const mediaVersion = async id => (await db.query("select updated_at::text as version from public.media_assets where id=$1", [id])).rows[0].version;
const mutate = async (operation, replacement) => (await db.query("select public.mutate_media_asset_v2('share-cover',$1,$2,$3,$4,$5) as data",
  [await mediaVersion("share-cover"), actor, operation, replacement ?? null, replacement ? await mediaVersion(replacement) : null])).rows[0].data;
assert.equal((await mutate("trash")).outcome, "in_use");
const beforeReplacement = await snapshot();
await assert.rejects(() => mutate("replace_and_trash", "share-gif"), error => error.code === "22023");
assert.deepEqual(await snapshot(), beforeReplacement, "Incompatible replacement must roll back all references");
assert.equal((await db.query("select deleted_at from public.media_assets where id='share-cover'")).rows[0].deleted_at, null);
assert.equal((await mutate("replace_and_trash", "share-draft")).outcome, "invalid_replacement");
assert.equal((await mutate("replace_and_trash", "share-video")).outcome, "invalid_replacement");
assert.equal((await mutate("replace_and_trash", "share-replacement")).outcome, "replaced_and_trashed");
const afterReplacement = await snapshot();
assert.equal(afterReplacement.draft.imageSrc, "https://media.example/replacement.png");
assert.notEqual(afterReplacement.versions.updatedAt, beforeReplacement.versions.updatedAt);
await assert.rejects(() => save(cover, beforeReplacement.versions.updatedAt), error => error.code === "40001");
await reject(cover);
await assert.rejects(() => db.query("update public.site_sharing_config set payload=$1 where id='main'", [{ ...clean, privateDraft: true }]), error => error.code === "22023");
const expectedProjection = await projection();
assert.deepEqual(Object.keys(expectedProjection).sort(), ["description", "imageAlt", "imageSrc", "title"]);
for (const role of ["anon", "authenticated", "service_role"]) {
  await db.exec(`set role ${role}`);
  await assert.rejects(() => db.query("select * from public.site_sharing_config"), error => error.code === "42501");
  await assert.rejects(() => db.query("update public.site_sharing_config set payload='{}'::jsonb"), error => error.code === "42501");
  await assert.rejects(() => db.query("select public.validate_site_sharing_v2($1)", [clean]), error => error.code === "42501");
  assert.deepEqual(await projection(), expectedProjection);
  if (role !== "service_role") {
    await assert.rejects(() => snapshot(), error => error.code === "42501");
    await assert.rejects(() => db.query("select public.save_site_sharing_v2('main',clock_timestamp(),$1)", [clean]), error => error.code === "42501");
  } else {
    assert.deepEqual(await snapshot(), afterReplacement);
    await save(clean, afterReplacement.versions.updatedAt);
  }
  await db.exec("reset role");
}
const beforeRerun = await snapshot();
await db.exec(migration);
assert.deepEqual(await snapshot(), beforeRerun, "Migration replay must preserve owner edits and CAS");
await db.exec("begin read only");
assert.ok((await db.query(checks)).rows.every(item => item.passed));
await db.exec("rollback");
await db.close();
console.log(`Site sharing migration passed: ${verified.length} checks, private roles, exact projection, validation, CAS, owner seed preservation, published image filtering, references/trash, atomic replacement and idempotent replay.`);
