// Disposable PostgreSQL WASM only. No credentials, network or hosted writes.
// Usage: node scripts/test-optional-hero-titles-migration.mjs <local-PGlite-dist/index.js>
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

if (!process.argv[2]) throw new Error("Pass a local @electric-sql/pglite/dist/index.js path.");
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const sql = name => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
const migration = await sql("0058_optional_hero_titles");
const pages = ["home", "bio", "music", "gallery", "video", "booking"];
const editor = page => ({ home: "home", bio: "bio", music: "music", gallery: "gallery", video: "showreel", booking: "contact" })[page];
const definition = async signature => (await db.query("select pg_get_functiondef($1::regprocedure) as definition", [signature])).rows[0].definition;
const functions = async () => (await db.query(`select oid, proname, proowner, proacl::text, proconfig,
  pg_get_function_identity_arguments(oid) as arguments, pg_get_functiondef(oid) as definition
  from pg_proc where pronamespace='public'::regnamespace order by oid`)).rows;
const content = async () => (await db.query(`select * from (
  select 'hero' as kind,to_jsonb(item) as data from public.page_heroes item
  union all select 'home',to_jsonb(item) from public.home_page_config item
  union all select 'settings',to_jsonb(item) from public.site_settings item
  union all select 'media',to_jsonb(item) from public.media_assets item
  union all select 'archive',to_jsonb(item) from public.content_archive_v2 item
  union all select 'inquiry',to_jsonb(item) from public.booking_inquiries item
) content order by kind,data::text`)).rows;
const guards = async () => (await db.query(`select c.oid, c.relname, c.relrowsecurity, c.relacl::text,
  (select jsonb_agg(to_jsonb(p) order by p.policyname) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as policies,
  (select jsonb_agg(pg_get_triggerdef(t.oid) order by t.tgname) from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal) as triggers,
  (select jsonb_agg(jsonb_build_object('name',conname,'validated',convalidated,'definition',pg_get_constraintdef(oid)) order by conname)
    from pg_constraint where conrelid=c.oid) as constraints
  from pg_class c where c.oid in ('public.page_heroes'::regclass,'public.home_page_config'::regclass) order by c.oid`)).rows;
const parent = async page => (await db.query(page === "home"
  ? "select to_jsonb(item) as data from public.home_page_config item where id='main'"
  : "select to_jsonb(item) as data from public.page_heroes item where page_slug=$1", page === "home" ? [] : [page])).rows[0]?.data;
const snapshot = async page => (await db.query("select public.get_hero_editor_with_framing_v2($1,'main') as data", [page])).rows[0].data;
const hero = (page, value) => page === "home" ? value.draft.hero : value.hero;
const payload = async page => { const value = { ...hero(page, await snapshot(page)) }; delete value.updatedAt; return value; };
const save = async (page, value, version) => (await db.query("select public.save_hero_with_framing_v2($1,'main',$2,$3) as data",
  [page, version ?? (await parent(page)).updated_at, value])).rows[0].data;
const legacySave = async (page, value, version) => (await db.query(page === "home"
  ? "select public.save_home_section_v2('main','hero',$1,$2) as data"
  : `select public.save_${editor(page)}_hero_v2('main',$1,$2) as data`,
  [version ?? (await parent(page)).updated_at, value])).rows[0].data;

await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql as $$ select null::uuid $$;`);
await db.exec((await sql("0001_initial_schema")).replace("create extension if not exists pgcrypto;", ""));
await assert.rejects(() => db.exec(migration), error => error.code === "55000");
await db.exec("rollback");
await db.exec((await sql("0002_media_manager")).split("insert into storage.buckets")[0]);
for (const name of ["0013_gallery_media_placements", "0014_gallery_studio", "0016_footer_effect", "0023_admin_operations_hardening",
  "0028_music_page_editor", "0029_batch_5a_music_and_nav_links", "0030_bio_page_editor", "0031_gallery_page_editor", "0032_showreel_page_editor", "0033_contact_page_editor",
  "0034_media_optimization_foundation", "0035_media_pipeline_integrity_guards", "0036_media_upload_intents", "0037_home_page_editor",
  "0039_footer_content_editor", "0040_media_library_v2", "0041_content_archive_navbar", "0042_content_archive_music", "0043_content_archive_bio", "0044_content_archive_gallery_showreel"])
  await db.exec(await sql(name));
await db.exec(`insert into public.site_settings(id,artist_name) values('main','Existing owner');
  insert into public.bio_profile(id,top_label,intro_text,caption) values('main','BIO','Introduction','A portrait');
  insert into public.actor_resume(id) values('main');
  insert into public.page_heroes(page_slug,title,background_src) values
    ('home','Dormant original HOME','/images/home.jpg'),('bio','Biography','/images/bio.jpg'),
    ('gallery','Gallery','/images/gallery.jpg'),('video','Showreel','/media/showreel.mp4');
  insert into public.booking_inquiries(name,email,message) values('Visitor','visitor@example.test','Existing inquiry');
  grant select on public.page_heroes to anon, authenticated;
  grant select, update on public.page_heroes to service_role;`);
for (const name of ["0045_contact_optional_copy", "0046_hero_media_framing", "0051_photo_framing", "0055_home_editorial_sections", "0056_site_sharing_metadata", "0057_home_section_transitions"])
  await db.exec(await sql(name));

// Refuse missing guards or unknown/security-modified predecessors atomically.
const initialContent = await content();
const initialFunctions = await functions();
const initialGuards = await guards();
await db.exec("alter table public.page_heroes disable trigger zz_media_library_reference_guard_v2");
await assert.rejects(() => db.exec(migration), error => error.code === "55000");
await db.exec("rollback");
await db.exec("alter table public.page_heroes enable trigger zz_media_library_reference_guard_v2");
const helperSignature = "public.validate_home_section_v2(text,jsonb)";
const originalHelper = await definition(helperSignature);
// The last function in the patch deliberately drifts: preceding five replacements
// must roll back too, rather than leaving a partly upgraded editor contract.
await db.exec(originalHelper.replace("declare", "-- isolated unknown predecessor\ndeclare"));
const driftedFunctions = await functions();
await assert.rejects(() => db.exec(migration), error => error.code === "55000");
await db.exec("rollback");
assert.deepEqual(await functions(), driftedFunctions, "Unknown last contract rolls back earlier replacements");
await db.exec(originalHelper);
await db.exec("alter function public.validate_home_section_v2(text,jsonb) set search_path=public");
const insecureFunctions = await functions();
await assert.rejects(() => db.exec(migration), error => error.code === "55000");
await db.exec("rollback");
assert.deepEqual(await functions(), insecureFunctions, "A changed security setting is not silently repaired");
await db.exec(originalHelper);
assert.deepEqual(await functions(), initialFunctions);
assert.deepEqual(await content(), initialContent);

await db.exec(migration);
assert.deepEqual(await content(), initialContent, "Migration does not rewrite any content or timestamp");
assert.deepEqual(await guards(), initialGuards, "No table grants, policies, constraints or triggers change");
const modified = new Set(["save_music_hero_v2", "save_bio_hero_v2", "save_gallery_hero_v2", "save_showreel_hero_v2", "save_contact_hero_v2", "validate_home_section_v2"]);
const changedFunctions = await functions();
assert.equal(changedFunctions.length, initialFunctions.length, "No extra public/admin API is introduced");
for (const [index, original] of initialFunctions.entries()) {
  const saved = changedFunctions[index];
  let expectedDefinition = original.definition;
  if (modified.has(original.proname)) expectedDefinition = expectedDefinition.replace(
    original.proname === "validate_home_section_v2"
      ? "v_result ->> 'title' = '' or v_result ->> 'backgroundSrc' = ''"
      : "pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'title')) not between 1 and 220",
    original.proname === "validate_home_section_v2"
      ? "v_result ->> 'backgroundSrc' = ''"
      : "pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'title')) > 220");
  assert.deepEqual(saved, { ...original, definition: expectedDefinition }, `${original.proname}: only intended title minimum may change; OID, ACL, owner and settings remain`);
}
await db.exec(migration);
assert.deepEqual(await functions(), changedFunctions);
assert.deepEqual(await content(), initialContent, "Safe rerun changes neither content nor versions");

const framing = { desktop: { fit: "cover", x: 24, y: 68, zoom: 1.4 }, mobile: { fit: "contain", x: 45, y: 20, zoom: 1 } };
for (const page of pages) {
  const original = await payload(page);
  const unrelated = await parent(page);
  for (const mediaType of ["image", "video"]) for (const title of ["", "   ", `  Restored ${page}  `, "x".repeat(220)]) {
    const before = await parent(page);
    const submitted = { ...original, title, mediaType, backgroundSrc: mediaType === "image" ? "/images/hero.jpg" : "/media/hero.mp4", framing };
    const result = await save(page, submitted);
    const after = await parent(page);
    const readback = hero(page, await snapshot(page));
    assert.equal(readback.title, title.trim(), `${page} ${mediaType}: explicit blank/nonblank title survives snapshot`);
    assert.equal(readback.backgroundSrc, submitted.backgroundSrc);
    assert.deepEqual(readback.framing, framing);
    assert.notEqual(after.updated_at, before.updated_at, "Save still advances CAS version");
    assert.equal(result.versions.updatedAt, after.updated_at, "Wrapper returns final version after framing write");
    if (page === "home") {
      assert.equal(result.canonicalSection.title, title.trim());
      const withoutHero = draft => { const copy = { ...draft }; delete copy.hero; return copy; };
      assert.deepEqual(withoutHero(after.draft), withoutHero(unrelated.draft), "Hero title edits cannot alter Home order, enabled flags or other sections");
    }
    await assert.rejects(() => save(page, { ...submitted, title: "" }, before.updated_at), error => error.code === "40001");
    assert.deepEqual(await parent(page), after, "Stale blank-title saves cannot overwrite newer content");
  }
  const legacy = { ...await payload(page), title: "" }; delete legacy.framing;
  const beforeLegacy = await parent(page);
  await legacySave(page, legacy);
  assert.equal(hero(page, await snapshot(page)).title, "", `${page}: existing direct RPC also allows explicit blank`);
  assert.deepEqual(hero(page, await snapshot(page)).framing, framing, "Legacy save preserves responsive framing");
  await assert.rejects(() => legacySave(page, { ...legacy, title: "" }, beforeLegacy.updated_at), error => error.code === "40001");

  const valid = await payload(page);
  const missing = { ...valid }; delete missing.title;
  for (const invalid of [missing, { ...valid, title: null }, { ...valid, title: false }, { ...valid, title: 12 },
    { ...valid, title: [] }, { ...valid, title: {} }, { ...valid, title: "x".repeat(221) },
    { ...valid, extra: true }, { ...valid, backgroundSrc: "" }, { ...valid, mediaType: "audio" },
    { ...valid, ctaHref: "javascript:alert(1)" }, { ...valid, backgroundSrc: "//invalid.example/a.jpg" }]) {
    const beforeInvalid = await content();
    await assert.rejects(() => save(page, invalid), error => error.code === "22023", `${page} must reject malformed/unsafe payload`);
    const oldPayload = { ...invalid }; delete oldPayload.framing;
    await assert.rejects(() => legacySave(page, oldPayload), error => error.code === "22023");
    assert.deepEqual(await content(), beforeInvalid, "Invalid submissions preserve all content and versions");
  }
  const beforeFraming = await content();
  await assert.rejects(() => save(page, { ...valid, title: "", framing: { ...framing, mobile: { ...framing.mobile, zoom: 0.9 } } }), error => error.code === "22023");
  assert.deepEqual(await content(), beforeFraming);
}
assert.equal((await db.query("select title from public.page_heroes where page_slug='home'")).rows[0].title, "Dormant original HOME", "HOME editor still only writes its active config row");
await assert.rejects(() => db.exec("update public.page_heroes set title=null where page_slug='gallery'"), error => error.code === "23502");

// Empty titles do not weaken media references, transaction rollback or permissions.
await db.exec(`insert into public.media_assets(id,label,src,media_type) values('optional-title-trashed','Trashed','https://media.example.test/trashed.jpg','image');
  update public.media_assets set deleted_at=clock_timestamp(),is_published=false where id='optional-title-trashed'`);
for (const page of pages) {
  const before = await content();
  await assert.rejects(async () => save(page, { ...await payload(page), title: "", mediaType: "image", backgroundSrc: "https://media.example.test/trashed.jpg" }),
    error => error.code === "22023" || error.code === "23514");
  assert.deepEqual(await content(), before);
}
await db.exec(`create function public.test_fail_title_framing_update() returns trigger language plpgsql as $$ begin
  if new.media_framing is distinct from old.media_framing then raise exception 'isolated second-write failure' using errcode='23514'; end if;
  return new; end; $$;
  create trigger aa_test_title_framing_failure before update on public.page_heroes for each row execute function public.test_fail_title_framing_update()`);
const rollbackSeed = { ...await payload("music"), title: "Kept if rollback" };
delete rollbackSeed.framing;
await legacySave("music", rollbackSeed);
const beforeRollback = await content();
await assert.rejects(async () => save("music", { ...await payload("music"), title: "", framing: null }), error => error.code === "23514");
assert.deepEqual(await content(), beforeRollback, "Failure in framing update rolls back the preceding title clear");
await db.exec("drop trigger aa_test_title_framing_failure on public.page_heroes; drop function public.test_fail_title_framing_update()");
await save("music", { ...await payload("music"), title: "" });

for (const page of pages) {
  const value = await payload(page);
  const legacy = { ...value }; delete legacy.framing;
  const version = (await parent(page)).updated_at;
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    await assert.rejects(() => save(page, value, version), error => error.code === "42501");
    await assert.rejects(() => legacySave(page, legacy, version), error => error.code === "42501");
    await assert.rejects(() => db.query("select public.validate_home_section_v2('hero',$1)", [legacy]), error => error.code === "42501");
    const published = await db.query(page === "home"
      ? "select draft#>>'{hero,title}' as title from public.home_page_config where id='main'"
      : "select title from public.page_heroes where page_slug=$1", page === "home" ? [] : [page]);
    assert.equal(published.rows[0].title, "", "Existing public read projection retains intentional empty title");
    await db.exec("reset role");
  }
  await db.exec("set role service_role");
  assert.ok((await save(page, value, version)).versions.updatedAt);
  await assert.rejects(() => db.query("select public.validate_home_section_v2('hero',$1)", [legacy]), error => error.code === "42501");
  await db.exec("reset role");
}
const beforeRerun = await content();
await db.exec(migration);
assert.deepEqual(await content(), beforeRerun, "Rerun preserves owner-cleared titles and final versions");
assert.deepEqual(await guards(), initialGuards);

let count = 0;
await db.exec("begin read only");
for (const name of ["0045_contact_optional_copy", "0046_hero_media_framing", "0051_photo_framing", "0055_home_editorial_sections", "0056_site_sharing_metadata", "0057_home_section_transitions", "0058_optional_hero_titles"]) {
  const checks = (await db.exec(await readFile(new URL(`../supabase/checks/${name}.sql`, import.meta.url), "utf8"))).flatMap(result => result.rows);
  assert.ok(checks.length > 0 && checks.every(check => check.passed === true), `${name}: ${JSON.stringify(checks)}`);
  count += checks.length;
}
await db.exec("commit");
assert.deepEqual(await content(), beforeRerun, "Deployment checks are genuinely read-only");
await db.close();
console.log(`0058 optional Hero titles passed: all six current/legacy editors, blank/whitespace/restored/220-char titles, image/video, snapshots, final-version CAS, strict payloads, safe media/framing, rollback, public/service boundaries, exact-only patches, drift refusal, preserved content/security/reruns; ${count} read-only checks passed.`);
