// Real PostgreSQL test in isolated PGlite memory; no remote credentials or writes.
// node scripts/test-media-library-migration.mjs <local-pglite-dist/index.js>
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

if (!process.argv[2]) throw new Error("Pass a local @electric-sql/pglite/dist/index.js path.");
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const sql = async (name) => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
`);
await db.exec((await sql("0001_initial_schema")).replace("create extension if not exists pgcrypto;", ""));
await db.exec((await sql("0002_media_manager")).split("insert into storage.buckets")[0]);
for (const name of ["0013_gallery_media_placements", "0014_gallery_studio", "0023_admin_operations_hardening", "0034_media_optimization_foundation", "0035_media_pipeline_integrity_guards", "0036_media_upload_intents", "0037_home_page_editor", "0039_footer_content_editor"]) await db.exec(await sql(name));
const actor = "00000000-0000-4000-8000-000000000001";
await db.query("insert into auth.users values($1);", [actor]);
await db.query("insert into public.admin_profiles(user_id,email,role) values($1,'isolated@example.test','owner')", [actor]);
const migration = await sql("0040_media_library_v2");
await db.exec(migration);
// JSON preserves PostgreSQL microseconds; JS Date would truncate CAS versions.
const asset = async (id) => (await db.query("select to_jsonb(asset) as data from public.media_assets asset where id=$1", [id])).rows[0]?.data;
const refs = async (src) => (await db.query("select * from public.media_asset_references($1)", [src])).rows;
const mutate = async (id, operation, replacement = null, expected, replacementExpected) => {
  const version = expected ?? (await asset(id)).updated_at;
  const replacementVersion = replacementExpected ?? (replacement ? (await asset(replacement))?.updated_at : null);
  return (await db.query("select public.mutate_media_asset_v2($1,$2,$3,$4,$5,$6) as data", [id, version, actor, operation, replacement, replacementVersion])).rows[0].data;
};
const oldSrc = "https://media.example/old.jpg";
const newSrc = "https://media.example/new.jpg";
await db.query(`insert into public.media_assets(id,label,src,media_type,storage_path,file_size)
  values('old','Old portrait',$1,'image','old.jpg',1024),('new','New portrait',$2,'image','new.jpg',2048),
    ('video','Video','https://media.example/clip.mp4','video','clip.mp4',4000),
    ('unused','Unused','https://media.example/unused.jpg','image','unused.jpg',3000),
    ('hidden','Hidden','https://media.example/hidden.jpg','image','hidden.jpg',2000)`, [oldSrc,newSrc]);
await db.exec("update public.media_assets set is_published=false where id='hidden'");
await db.query("insert into public.page_heroes(page_slug,title,background_src,poster_src,cta_href) values('bio','Bio',$1,$1,$1)", [oldSrc]);
await db.query("insert into public.about_home(id,image_src,cta_href) values('main',$1,$1)", [oldSrc]);
await db.query("insert into public.actor_resume(id,resume_url) values('main',$1)", [oldSrc]);
await db.query("insert into public.actor_credits(id,title,href) values('credit','Credit',$1)", [oldSrc]);
await db.query("insert into public.bio_gallery_images(id,src) values('bio',$1)", [oldSrc]);
await db.query("insert into public.gallery_images(id,title,src,is_published) values('gallery','Frame',$1,false)", [oldSrc]);
await db.query("update public.gallery_presentation set interlude_poster_src=$1", [oldSrc]);
await db.query("insert into public.home_updates(id,text,avatar_src,href) values('update','Update',$1,$1)", [oldSrc]);
await db.query("insert into public.music_platform_links(id,title,href,icon_key,image_src) values('platform','Platform',$1,'spotify',$1)", [oldSrc]);
await db.query("insert into public.site_settings(id,artist_name,spotify_artist_url,spotify_embed_url) values('main','Artist',$1,$1)", [oldSrc]);
await db.query("update public.site_settings set footer_content=jsonb_set(footer_content,'{primaryHref}',$1::jsonb)", [JSON.stringify(oldSrc)]);
await db.query("insert into public.social_links(id,label,platform,href) values('social','Link','link',$1)", [oldSrc]);
await db.query("insert into public.soundcloud_tracks(id,embed_url) values('track',$1)", [oldSrc]);
await db.query("insert into public.videos(id,title,embed_url,thumbnail_src) values('reel','Reel',$1,$1)", [oldSrc]);
await db.query("insert into public.media_assets(id,label,src,media_type,metadata) values('home-studio-settings','Settings','/settings','document',$1)", [JSON.stringify({ featurePosterSrc:oldSrc, storyImage1Src:oldSrc, body:`Do not change prose: ${oldSrc}`, nested:[{src:oldSrc}] })]);
await db.query("update public.home_page_config set draft = jsonb_set(jsonb_set(draft,'{about,imageSrc}',$1::jsonb),'{stories,images,0,src}',$1::jsonb)", [JSON.stringify(oldSrc)]);

assert.equal((await refs(oldSrc)).length, 15, "Every registered table, including dormant and linked references, is tracked");
const usage = (await db.query("select * from public.get_media_library_v2_usage() where asset_id='old'")).rows;
assert.equal(usage.length,15);
assert.equal((await mutate("old","trash")).outcome,"in_use");
assert.equal((await mutate("old","replace_and_trash","video")).outcome,"invalid_replacement");
assert.equal((await mutate("old","replace_and_trash","hidden")).outcome,"invalid_replacement");
assert.equal((await mutate("old","replace_and_trash","old")).outcome,"invalid_replacement");
const staleReplacementVersion = (await asset("new")).updated_at;
await db.exec("update public.media_assets set label='Edited candidate' where id='new'");
assert.equal((await mutate("old","replace_and_trash","new",undefined,staleReplacementVersion)).outcome,"conflict");
assert.equal((await refs(oldSrc)).length,15,"Candidate CAS failure cannot partially replace references");
const originalVersion = (await asset("old")).updated_at;
const homeVersion = (await db.query("select updated_at::text from public.home_page_config")).rows[0].updated_at;
const heroVersion = (await db.query("select updated_at::text from public.page_heroes where page_slug='bio'")).rows[0].updated_at;
const result = await mutate("old","replace_and_trash","new");
assert.equal(result.outcome,"replaced_and_trashed");
assert.equal(result.referenceTotal,15);
assert.equal((await refs(oldSrc)).length,0);
assert.equal((await refs(newSrc)).length,15);
assert.equal((await asset("old")).is_published,false);
assert.ok((await asset("old")).deleted_at);
assert.equal((await asset("old")).file_size,1024,"Trash preserves bytes and storage identity");
assert.equal((await asset("old")).storage_path,"old.jpg");
assert.notEqual((await db.query("select updated_at::text from public.home_page_config")).rows[0].updated_at,homeVersion);
assert.notEqual((await db.query("select updated_at::text from public.page_heroes where page_slug='bio'")).rows[0].updated_at,heroVersion);
assert.equal((await asset("home-studio-settings")).metadata.body,`Do not change prose: ${oldSrc}`);
assert.equal((await asset("home-studio-settings")).metadata.nested[0].src,newSrc);
assert.equal((await db.query("select footer_content ->> 'primaryHref' as href from public.site_settings")).rows[0].href,newSrc);
assert.equal((await mutate("old","restore",null,originalVersion)).outcome,"conflict");
await assert.rejects(() => db.query("update public.page_heroes set background_src=$1 where page_slug='bio'",[oldSrc]),error => error.code === "23514");
await assert.rejects(() => db.query("insert into public.gallery_images(id,title,src) values('stale','Stale',$1)",[oldSrc]),error => error.code === "23514");
await assert.rejects(() => db.query("update public.home_page_config set draft=jsonb_set(draft,'{about,imageSrc}',$1::jsonb)",[JSON.stringify(oldSrc)]),error => error.code === "23514");
assert.equal((await mutate("old","restore")).outcome,"restored");
assert.equal((await asset("old")).is_published,true);
assert.equal((await refs(newSrc)).length,15,"Restoring does not undo page replacements");
assert.equal((await mutate("old","restore")).outcome,"conflict");
assert.equal((await mutate("old","trash")).outcome,"trashed");
assert.equal((await mutate("unused","trash")).outcome,"trashed");
const deleted = await asset("unused");
assert.equal((await mutate("unused","trash")).outcome,"conflict");
assert.equal((await mutate("missing","trash",null,deleted.updated_at)).outcome,"missing");
await assert.rejects(() => mutate("home-studio-settings","trash"),error => error.code === "22023");
await assert.rejects(() => mutate("new","purge"),error => error.code === "22023");
await assert.rejects(() => db.query("select public.mutate_media_asset_v2('new',now(),'00000000-0000-4000-8000-000000000099','trash')"),error => error.code === "22023");

// A pending provider variant blocks trash without touching the pipeline.
await db.exec("insert into public.media_asset_variants(asset_id,variant_kind,preset_key) values('new','source','source')");
assert.equal((await mutate("new","trash")).outcome,"pipeline_busy");
assert.equal((await asset("new")).deleted_at,null);
assert.equal((await refs(newSrc)).length,15);
await db.exec("update public.media_asset_variants set status='failed' where asset_id='new'");
assert.equal((await mutate("new","trash")).outcome,"pipeline_busy","Even terminal variant relations are protected until provider alias retirement exists");
await db.exec("delete from public.media_asset_variants where asset_id='new'");

// A real queued optimization job is also protected. The pipeline's own RPC
// creates it against a ready source/object; no provider is contacted.
const objectId = "00000000-0000-4000-8000-000000000010";
const variantId = "00000000-0000-4000-8000-000000000011";
await db.query(`insert into public.media_physical_objects(id,storage_provider,storage_container,object_key,delivery_url,media_type,mime_type,byte_size,checksum_sha256,status)
  values($1,'supabase','test','clip.mp4','https://media.example/clip.mp4','video','video/mp4',4000,$2,'ready')`,[objectId,"a".repeat(64)]);
await db.query("insert into public.media_asset_variants(id,asset_id,physical_object_id,variant_kind,preset_key,status) values($1,'video',$2,'source','source','ready')",[variantId,objectId]);
assert.equal((await mutate("video","trash")).outcome,"pipeline_busy","Ready provider URL aliases cannot be silently stranded");
await db.query(`select public.enqueue_media_optimization_v1('00000000-0000-4000-8000-000000000012','video',$1,'optimized','balanced',
  (select updated_at from public.media_assets where id='video'),(select updated_at from public.media_asset_variants where id=$1),$2)`,[variantId,actor]);
assert.equal((await mutate("video","trash")).outcome,"pipeline_busy");
assert.equal((await asset("video")).deleted_at,null);

// Replacement must be one transaction even if one content writer rejects it.
await db.exec(`create function public.test_reject_replacement() returns trigger language plpgsql as $$ begin raise exception 'deliberate_test_failure'; end $$;
  create trigger test_reject before update on public.videos for each row execute function public.test_reject_replacement();`);
await mutate("old","restore");
await assert.rejects(() => mutate("new","replace_and_trash","old"),error => error.message.includes("deliberate_test_failure"));
assert.equal((await refs(newSrc)).length,15);
assert.equal((await asset("new")).deleted_at,null);
await db.exec("drop trigger test_reject on public.videos; drop function public.test_reject_replacement()");
const beforeRerun = await asset("new");
await db.exec(migration);
assert.deepEqual(await asset("new"),beforeRerun,"Migration rerun must never rewrite assets");

for (const role of ["anon","authenticated"]) {
  await db.exec(`set role ${role}`);
  await assert.rejects(() => db.query("select * from public.get_media_library_v2_usage()"),error => error.code === "42501");
  await assert.rejects(() => db.query("select public.mutate_media_asset_v2('new',now(),$1,'trash')",[actor]),error => error.code === "42501");
  await db.exec("reset role");
}
await db.exec("set role service_role");
assert.ok((await db.query("select * from public.get_media_library_v2_usage()")).rows.length > 0);
await assert.rejects(() => db.query("select public.media_library_reference_registry_v2()"),error => error.code === "42501");
await db.exec("reset role");
const checks = await db.exec(await readFile(new URL("../supabase/checks/0040_media_library_v2.sql",import.meta.url),"utf8"));
assert.ok(checks[0].rows.every(check => check.passed),"Deployment checks must pass");
await db.close();
console.log("Media V2 SQL: all 15 reference tables, CAS, atomic replacement/rollback, stale-write guards, trash/restore, pending pipeline, rerun and service-only permissions passed.");
