// Disposable PostgreSQL WASM only. No credentials, network or hosted SQL.
// Usage: node scripts/test-press-page-migration.mjs <local-PGlite-dist/index.js>
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

if (!process.argv[2]) throw new Error("Pass a local @electric-sql/pglite/dist/index.js path.");
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const sql = name => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;`);
  await db.exec((await sql("0001_initial_schema")).replace("create extension if not exists pgcrypto;", ""));
  await db.exec((await sql("0002_media_manager")).split("insert into storage.buckets")[0]);
  await db.exec("insert into public.site_settings(id,artist_name) values ('main','Existing musician')");
  for (const name of ["0013_gallery_media_placements", "0014_gallery_studio", "0016_footer_effect", "0021_navbar_visibility",
    "0023_admin_operations_hardening", "0025_site_navigation_items", "0026_mixed_public_portfolio", "0027_admin_v2_navigation_manager",
    "0028_music_page_editor", "0029_batch_5a_music_and_nav_links", "0030_bio_page_editor", "0031_gallery_page_editor", "0032_showreel_page_editor", "0033_contact_page_editor",
    "0034_media_optimization_foundation", "0035_media_pipeline_integrity_guards", "0036_media_upload_intents", "0037_home_page_editor",
    "0039_footer_content_editor", "0040_media_library_v2", "0041_content_archive_navbar", "0042_content_archive_music", "0043_content_archive_bio", "0044_content_archive_gallery_showreel",
    "0046_hero_media_framing", "0051_photo_framing", "0055_home_editorial_sections", "0059_bio_resume_visibility"]) await db.exec(await sql(name));
  const home = async () => (await db.query("select to_jsonb(home) as data from public.home_page_config home where id='main'")).rows[0].data;
  const nav = async () => (await db.query("select to_jsonb(item) as data from public.site_navigation_items item where site_id='main' order by sort_order,destination_key")).rows.map(row => row.data);
  const settings = async () => (await db.query("select to_jsonb(settings) as data from public.site_settings settings where id='main'")).rows[0].data;
  const guards = async () => (await db.query(`select c.relname, c.relrowsecurity, c.relacl::text,
    (select jsonb_agg(to_jsonb(p) order by p.policyname) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as policies,
    (select jsonb_agg(pg_get_triggerdef(t.oid) order by t.tgname) from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal) as triggers
    from pg_class c where c.oid in ('public.site_navigation_items'::regclass,'public.home_page_config'::regclass) order by c.relname`)).rows;
  const homeSave = async (section, payload, version) => (await db.query("select public.save_home_editorial_section_v2('main',$1,$2,$3) as data", [section, version, payload])).rows[0].data;
  const navVersions = rows => Object.fromEntries(rows.map(row => [row.destination_key, row.updated_at]));
  const navItems = rows => rows.map(row => ({ destinationKey: row.destination_key, isVisible: row.is_visible }));
  const navSave = async (rows, items = navItems(rows)) => (await db.query("select public.save_site_navigation_v2('main',$1::smallint,$2::jsonb,$3::jsonb) as data", [(await settings()).navigation_config_version, navVersions(rows), items])).rows[0].data;
  const item = { id: "11111111-1111-4111-8111-111111111111", kind: "review", title: "Existing review", quote: "Keep the original quotation.", publication: "Existing publication", date: "2026-10-08", href: "https://example.com/review", image: { src: "/images/saved-press.jpg", alt: "Existing clipping", framing: null }, visible: true };
  const original = await home();
  await homeSave("press", { ...original.draft.press, featuredId: item.id, items: [item, { ...item, id: "22222222-2222-4222-8222-222222222222", visible: false }] }, original.updated_at);
  // Occupy the slot before Contact to exercise collision-safe seeding without shifting any row.
  await db.exec("update public.site_navigation_items set sort_order=59 where destination_key='music.platforms'; update public.site_settings set hidden_nav_page_slugs_actor=array['gallery'], hidden_nav_page_slugs_musician=array['video']");
  const beforeHome = await home();
  const beforeNav = await nav();
  const beforeSettings = await settings();
  const beforeGuards = await guards();
  const migration = await sql("0060_press_page_navigation");
  await db.exec(migration);
  let rows = await nav();
  const pressRow = rows.find(row => row.destination_key === "press");
  assert.equal(pressRow.is_visible, true);
  assert.equal(pressRow.sort_order, 58, "Choose the nearest free rank before saved Contact without shifting existing rows");
  assert.deepEqual(rows.filter(row => row.destination_key !== "press"), beforeNav, "Preserve every existing navigation field, timestamp and relative order");
  assert.deepEqual(await home(), beforeHome, "No Press/Home JSON or version is migrated");
  assert.deepEqual(await settings(), beforeSettings, "Preserve Bio visibility and legacy profile choices");
  assert.deepEqual(await guards(), beforeGuards, "Preserve grants, RLS, policies and triggers");
  await assert.rejects(() => navSave(beforeNav), error => error.code === "40001", "A tab loaded before insertion must reload, never overwrite the new row");
  await assert.rejects(() => navSave(rows, navItems(rows).filter(row => row.destinationKey !== "press")), error => error.code === "22023");
  await assert.rejects(() => navSave(rows, navItems(rows).map(row => ({ ...row, isVisible: false }))), error => error.code === "23514");
  await assert.rejects(() => navSave(rows, [...navItems(rows), { destinationKey: "arbitrary", isVisible: true }]), error => error.code === "22023");

  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    assert.equal((await db.query("select destination_key from public.site_navigation_items where destination_key='press'")).rows.length, 1);
    assert.equal((await db.query("select draft->'press' as press from public.home_page_config where id='main'")).rows[0].press.items.length, 2, "Existing public-storage semantics must not change");
    await assert.rejects(() => db.query("select public.save_site_navigation_v2('main',0::smallint,'{}'::jsonb,'[]'::jsonb)"), error => error.code === "42501");
    await assert.rejects(() => db.query("select public.save_home_editorial_section_v2('main','press',now(),'{}'::jsonb)"), error => error.code === "42501");
    await assert.rejects(() => db.query("update public.site_navigation_items set is_visible=false where destination_key='press'"), error => error.code === "42501");
    await db.exec("reset role");
  }
  const currentSettings = await settings();
  await db.exec("set role service_role");
  const pressOnly = navItems(rows).map(row => ({ ...row, isVisible: row.destinationKey === "press" }));
  const confirmed = (await db.query("select public.save_site_navigation_v2('main',$1::smallint,$2::jsonb,$3::jsonb) as data", [currentSettings.navigation_config_version, navVersions(rows), pressOnly])).rows[0].data;
  assert.equal(confirmed.configVersion, 1);
  await db.exec("reset role");
  rows = await nav();
  const hiddenPress = navItems(rows).map(row => ({ ...row, isVisible: row.destinationKey === "home" }));
  await navSave(rows, hiddenPress);
  const ownerNav = await nav();
  await db.exec(migration);
  assert.deepEqual(await nav(), ownerNav, "Reruns preserve hidden/reordered Press and all CAS timestamps");
  assert.deepEqual(await home(), beforeHome);

  const saved = await homeSave("press", { ...beforeHome.draft.press, title: "Updated Press title" }, beforeHome.updated_at);
  await assert.rejects(() => homeSave("layout", beforeHome.draft.layout, beforeHome.updated_at), error => error.code === "40001");
  const afterPress = await home();
  assert.deepEqual(afterPress.draft, { ...beforeHome.draft, press: saved.canonicalSection }, "Press saves preserve every Home section and hidden Press item");
  const layout = afterPress.draft.layout.map(row => row.id === "press" ? { ...row, enabled: true } : row);
  await homeSave("layout", layout, afterPress.updated_at);
  assert.deepEqual((await home()).draft.press, saved.canonicalSection, "Legacy Home layout writes must not touch Press content");

  await db.exec("update public.site_settings set hidden_nav_page_slugs_actor=array['press'], hidden_nav_page_slugs_musician=array['press']");
  await assert.rejects(() => db.exec("update public.site_settings set hidden_nav_page_slugs_actor=array['home','bio','gallery','video','booking','press']"), error => error.code === "23514");
  await assert.rejects(() => db.exec("update public.site_settings set hidden_nav_page_slugs_musician=array['arbitrary']"), error => error.code === "23514");
  const checks = await readFile(new URL("../supabase/checks/0060_press_page_navigation.sql", import.meta.url), "utf8");
  await db.exec("begin read only");
  const verified = (await db.query(checks)).rows;
  assert.equal(verified.length, 8);
  for (const check of verified) assert.equal(check.passed, true, check.check_name);
  await db.exec("rollback");
  console.log("0060 Press: preserved data/navigation/permissions, collision-safe seed, repeatable migration, navigation/CAS validation, shared Press saves, legacy profiles and eight read-only checks passed.");
} finally {
  await db.close();
}
