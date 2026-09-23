// Disposable PostgreSQL WASM only. No credentials, providers or hosted SQL.
// Usage: node scripts/test-photo-framing-migration.mjs <PGlite dist/index.js>
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
if (!process.argv[2]) throw new Error("Pass a local @electric-sql/pglite/dist/index.js path.");
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const sql = name => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
const migration = await sql("0051_photo_framing");
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql as $$ select null::uuid $$;`);
await db.exec((await sql("0001_initial_schema")).replace("create extension if not exists pgcrypto;", ""));
await db.exec((await sql("0002_media_manager")).split("insert into storage.buckets")[0]);
for (const name of ["0013_gallery_media_placements","0014_gallery_studio","0016_footer_effect","0023_admin_operations_hardening",
  "0028_music_page_editor","0029_batch_5a_music_and_nav_links","0030_bio_page_editor","0031_gallery_page_editor","0032_showreel_page_editor","0033_contact_page_editor",
  "0034_media_optimization_foundation","0035_media_pipeline_integrity_guards","0036_media_upload_intents","0037_home_page_editor",
  "0039_footer_content_editor","0040_media_library_v2","0041_content_archive_navbar","0042_content_archive_music","0043_content_archive_bio","0044_content_archive_gallery_showreel"])
  await db.exec(await sql(name));
await assert.rejects(() => db.exec(migration), error => error.code === "55000"); await db.exec("rollback");
assert.equal((await db.query("select to_regclass('public.photo_framings') as present")).rows[0].present,null);
await db.exec(await sql("0046_hero_media_framing"));
const actor = "00000000-0000-4000-8000-000000000001";
await db.query("insert into auth.users values($1)",[actor]);
await db.query("insert into public.admin_profiles(user_id,email,role) values($1,'isolated@example.test','owner')",[actor]);
await db.exec(`insert into public.site_settings(id,artist_name) values('main','Isolated artist');
  insert into public.bio_profile(id,top_label,intro_text,caption) values('main','BIO','Biography','Caption');
  insert into public.actor_resume(id) values('main');
  insert into public.page_heroes(page_slug,title,background_src) values('bio','Bio','/bio.jpg'),('gallery','Gallery','/gallery.jpg'),('video','Video','/video.jpg');
  insert into public.bio_gallery_images(id,src,alt) values('portrait','/shared.jpg','Portrait');
  insert into public.bio_paragraphs(id,body) values('paragraph','Biography');
  insert into public.music_platform_links(id,title,href,icon_key,image_src) values('platform','Platform','https://example.test','link','/shared.jpg');
  insert into public.gallery_images(id,title,src,is_mosaic,is_freelance_story) values('frame','Gallery','/shared.jpg',true,false),('home-only','Story','/story.jpg',false,true);
  insert into public.videos(id,title,embed_url,platform,thumbnail_src,video_type) values('work','Work','https://www.youtube.com/embed/test','youtube','/shared.jpg','showreel');`);
await db.exec(await sql("0045_contact_optional_copy"));
const tables = ["site_settings","page_heroes","home_page_config","bio_profile","bio_gallery_images","bio_paragraphs","music_platform_links","gallery_images","videos","content_archive_v2"];
const allContent = async () => (await db.query("select * from ("+tables.map(table => `select '${table}' as kind,to_jsonb(item) as data from public.${table} item`).join(" union all ")+") content order by kind,data::text")).rows;
const stored = async () => (await db.query("select * from public.photo_framings order by placement")).rows;
const publicCrops = async () => (await db.query("select public.get_public_photo_framings_v1() as data")).rows[0].data;
const snapshot = async page => (await db.query("select public.get_photo_editor_with_framing_v2($1,'main') as data",[page])).rows[0].data;
const plain = item => { const result = {...item}; delete result.updatedAt; return result; };
const sectionFor = page => ({bio:"biography",music:"platforms",gallery:"frames",video:"works"})[page];
const itemsFor = (page,snap) => page === "bio" ? snap.biography.galleryImages : page === "music" ? snap.platforms : snap[sectionFor(page)].items;
const value = async (page, section = sectionFor(page)) => {
  const snap = await snapshot(page);
  if (page === "home") return { payload:snap.draft[section],versions:snap.versions };
  const items = itemsFor(page,snap);
  if (page === "bio") return {payload:{topLabel:snap.biography.topLabel,introText:snap.biography.introText,caption:snap.biography.caption,
    galleryImages:items.map(plain),paragraphs:snap.biography.paragraphs.map(plain)},versions:{profileUpdatedAt:snap.biography.profileUpdatedAt,
      galleryItems:Object.fromEntries(items.map(item=>[item.id,item.updatedAt])),paragraphItems:Object.fromEntries(snap.biography.paragraphs.map(item=>[item.id,item.updatedAt]))}};
  return {payload:{items:items.map(plain)},versions:{items:Object.fromEntries(items.map(item=>[item.id,item.updatedAt]))}};
};
const save = async (page,section,payload,versions) => (await db.query("select public.save_photo_section_with_framing_v2($1,$2,'main',$3,$4) as data",[page,section,payload,versions])).rows[0].data;
const crop = {desktop:{fit:"cover",x:22.25,y:15,zoom:1.3},mobile:{fit:"contain",x:100,y:0,zoom:3}};
const otherCrop = {desktop:{fit:"cover",x:70,y:90,zoom:1},mobile:{fit:"cover",x:50,y:50,zoom:1.1}};
const before = await allContent();
const originalShowreel = (await db.query("select prosrc,proacl::text as acl,proconfig from pg_proc where oid='public.save_showreel_works_v2(text,jsonb,jsonb)'::regprocedure")).rows[0];
const untouchedSignatures = ["public.get_hero_editor_with_framing_v2(text,text)","public.save_home_section_v2(text,text,timestamp with time zone,jsonb)",
  "public.save_bio_biography_v2(text,timestamp with time zone,jsonb,jsonb,jsonb)","public.save_music_platforms_v2(text,jsonb,jsonb)","public.save_gallery_frames_v2(text,jsonb,jsonb)",
  "public.mutate_bio_content_archive_v2(text,text,text,jsonb,uuid,timestamp with time zone)","public.mutate_visual_content_archive_v2(text,text,text,jsonb,uuid,timestamp with time zone)",
  "public.guard_media_library_references_v2()","public.media_library_reference_registry_v2()"];
const definitions = new Map();
for(const signature of untouchedSignatures) definitions.set(signature,(await db.query("select pg_get_functiondef($1::regprocedure) as definition",[signature])).rows[0].definition);
await db.exec("alter table public.gallery_images disable trigger zz_media_library_reference_guard_v2");
await assert.rejects(()=>db.exec(migration),error=>error.code==="55000"); await db.exec("rollback");
await db.exec("alter table public.gallery_images enable trigger zz_media_library_reference_guard_v2");
await db.exec("alter table public.videos disable trigger archived_visual_content_guard_v2");
await assert.rejects(()=>db.exec(migration),error=>error.code==="55000"); await db.exec("rollback");
await db.exec("alter table public.videos enable trigger archived_visual_content_guard_v2");
await db.exec(migration); assert.deepEqual(await allContent(),before); assert.deepEqual(await stored(),[]);
const repairedShowreel = (await db.query("select prosrc,proacl::text as acl,proconfig from pg_proc where oid='public.save_showreel_works_v2(text,jsonb,jsonb)'::regprocedure")).rows[0];
assert.equal(repairedShowreel.prosrc,originalShowreel.prosrc.replace("pg_catalog.greatest(120, v_current_count)","greatest(120, v_current_count)"));
assert.equal(repairedShowreel.acl,originalShowreel.acl); assert.deepEqual(repairedShowreel.proconfig,originalShowreel.proconfig);
for (const page of ["home","bio","music","gallery","video"]) {
  const snap = await snapshot(page); assert.equal(snap.photoFramingAvailable,true);
  assert.equal(page==="home" ? snap.draft.about.framing : itemsFor(page,snap)[0].framing,null);
}
for (const page of ["bio","music","gallery","video"]) {
  const original = await value(page); const updated = structuredClone(original.payload);
  (page==="bio" ? updated.galleryImages : updated.items)[0].framing = page==="music" ? otherCrop : crop;
  const saved = await save(page,sectionFor(page),updated,original.versions);
  assert.ok(saved.versions);
  assert.deepEqual(itemsFor(page,await snapshot(page))[0].framing,page==="music" ? otherCrop : crop);
  if(page==="music") assert.deepEqual(saved.items[0].framing,otherCrop);
  await assert.rejects(()=>save(page,sectionFor(page),updated,original.versions),error=>error.code==="40001");
}
for(const section of ["about","feature","stories"]) {
  const current = await value("home",section); const updated = structuredClone(current.payload);
  if(section==="stories") updated.images = updated.images.map((item,index)=>({...item,src:`/story-${index}.jpg`,framing:crop}));
  else updated[section==="about" ? "framing" : "posterFraming"] = crop;
  const saved = await save("home",section,updated,current.versions);
  assert.deepEqual(saved.canonicalSection,updated);
  assert.deepEqual((await snapshot("home")).draft[section],updated);
  await assert.rejects(()=>save("home",section,updated,current.versions),error=>error.code==="40001");
}
assert.deepEqual((await publicCrops())["bio:image:portrait"],{src:"/shared.jpg",framing:crop});
assert.deepEqual((await publicCrops())["music:platform:platform"],{src:"/shared.jpg",framing:otherCrop});
assert.equal((await publicCrops())["gallery:image:home-only"],undefined);
// A source change through an old writer does not apply yesterday's crop to a
// different photo. The private record survives, but no URL is stored in it.
await db.exec("update public.bio_gallery_images set src='/new.jpg' where id='portrait'");
assert.equal(itemsFor("bio",await snapshot("bio"))[0].framing,null);
assert.equal((await publicCrops())["bio:image:portrait"],undefined);
assert.ok((await stored()).some(item=>item.placement==="bio:image:portrait"));
await db.exec("update public.bio_gallery_images set src='/shared.jpg',is_published=false where id='portrait'");
assert.deepEqual(itemsFor("bio",await snapshot("bio"))[0].framing,crop);
assert.equal((await publicCrops())["bio:image:portrait"],undefined);
await db.exec("update public.bio_gallery_images set is_published=true where id='portrait'");
// Source archive/restore does not delete a crop or leak an archived source.
let current = await value("bio");
await db.query("select public.mutate_bio_content_archive_v2('portraits','archive','portrait',$1,$2,null)",[current.versions,actor]);
assert.equal((await publicCrops())["bio:image:portrait"],undefined);
const archived = (await db.query("select updated_at::text as version from public.content_archive_v2 where collection='bio-portraits' and source_id='portrait'")).rows[0].version;
current = await value("bio");
await db.query("select public.mutate_bio_content_archive_v2('portraits','restore','portrait',$1,$2,$3)",[current.versions,actor,archived]);
assert.deepEqual(itemsFor("bio",await snapshot("bio"))[0].framing,crop);
assert.equal((await publicCrops())["bio:image:portrait"],undefined,"Restored originals remain hidden until explicitly published");
await db.exec("update public.bio_gallery_images set is_published=true where id='portrait'");
assert.deepEqual((await publicCrops())["bio:image:portrait"].framing,crop);
for(const [page,collection,id,storedCollection] of [["music","platforms","platform","music-platforms"],["gallery","gallery","frame","gallery-frames"],["video","showreel","work","showreel-works"]]) {
  const isMusic=page==="music"; const placement=({music:"music:platform:",gallery:"gallery:image:",video:"showreel:thumbnail:"})[page]+id;
  const beforeCrop=structuredClone((await publicCrops())[placement].framing);
  const mutate=async(operation,archiveVersion=null)=>{
    const current=await value(page);
    return db.query(isMusic ? "select public.mutate_music_content_archive_v2($1,$2,$3,$4,$5,null,$6)" : "select public.mutate_visual_content_archive_v2($1,$2,$3,$4,$5,$6)",
      [collection,operation,id,isMusic ? current.versions.items : current.versions,actor,archiveVersion]);
  };
  await mutate("archive"); assert.equal((await publicCrops())[placement],undefined);
  assert.ok((await stored()).some(item=>item.placement===placement));
  const archivedVersion=(await db.query("select updated_at::text as version from public.content_archive_v2 where collection=$1 and source_id=$2",[storedCollection,id])).rows[0].version;
  await mutate("restore",archivedVersion);
  assert.deepEqual(itemsFor(page,await snapshot(page)).find(item=>item.id===id).framing,beforeCrop);
  assert.equal((await publicCrops())[placement],undefined);
  const restored=await value(page); restored.payload.items.find(item=>item.id===id).isPublished=true;
  await save(page,sectionFor(page),restored.payload,restored.versions);
  assert.deepEqual((await publicCrops())[placement].framing,beforeCrop);
}
// Historical Showreel IDs are not normalized or shortened into another placement.
const legacyId="Legacy " + "x".repeat(505);
await db.query("insert into public.videos(id,title,embed_url,platform,thumbnail_src,video_type) values($1,'Legacy','https://www.youtube.com/embed/legacy','youtube','/legacy.jpg','showreel')",[legacyId]);
const legacy=await value("video"); legacy.payload.items.find(item=>item.id===legacyId).framing=crop;
await save("video","works",legacy.payload,legacy.versions);
assert.deepEqual((await publicCrops())["showreel:thumbnail:"+legacyId],{src:"/legacy.jpg",framing:crop});
// Existing actions allow 256k characters of version tokens. A smaller SQL byte
// cap would reject a valid historical catalog before the unchanged CAS checks.
await db.exec("insert into public.videos(id,title,embed_url,platform,thumbnail_src,video_type) select 'Cap '||lpad(i::text,4,'0')||repeat('x',504),'Historical','https://www.youtube.com/embed/legacy','youtube','/legacy.jpg','showreel' from generate_series(1,380) i");
const largeLegacy=await value("video");
assert.ok(JSON.stringify(largeLegacy.versions).length>200000); assert.ok(JSON.stringify(largeLegacy.versions).length<256000);
await save("video","works",largeLegacy.payload,largeLegacy.versions);
// Strict framing shape and unchanged parent validation: extra fields cannot be
// smuggled through, even when nested beside an otherwise valid crop.
const invalidBefore = await allContent(); const cropsBefore = await stored();
const badFrames = [false,1,"cover",[],{}, {desktop:crop.desktop}, {...crop,extra:true},
  {...crop,mobile:{...crop.mobile,zoom:0.5}}, {...crop,desktop:{...crop.desktop,x:101}},
  {...crop,desktop:{...crop.desktop,zoom:"1"}}];
for(const framing of badFrames) {
  const {payload,versions}=await value("gallery"); payload.items[0].framing=framing;
  await assert.rejects(()=>save("gallery","frames",payload,versions),error=>error.code==="22023");
}
for(const mutation of [item=>{delete item.framing;},item=>{item.evil=true;},item=>{item.src="javascript:alert(1)";}]) {
  const {payload,versions}=await value("gallery"); mutation(payload.items[0]);
  await assert.rejects(()=>save("gallery","frames",payload,versions),error=>error.code==="22023");
}
const gallery = await value("gallery");
for(const versions of [null,[],{}, {...gallery.versions,extra:true},{items:null}])
  await assert.rejects(()=>save("gallery","frames",gallery.payload,versions),error=>error.code==="22023");
for(const [page,section] of [[null,"frames"],["gallery",null],["music","frames"],["booking","hero"],["home","hero"]])
  await assert.rejects(()=>save(page,section,gallery.payload,gallery.versions),error=>error.code==="22023");
assert.deepEqual(await allContent(),invalidBefore); assert.deepEqual(await stored(),cropsBefore);
for(const query of ["update public.photo_framings set framing='{}'::jsonb", "update public.photo_framings set source_fingerprint='invalid'", "update public.photo_framings set placement='unowned:place'"])
  await assert.rejects(()=>db.query(query),error=>error.code==="23514");
assert.deepEqual(await stored(),cropsBefore);
// A crop-only edit still advances the original row CAS; reset removes only
// that placement, never the crop for another use of the same file.
const reset = await value("gallery"); reset.payload.items[0].framing=null;
await save("gallery","frames",reset.payload,reset.versions);
assert.equal(itemsFor("gallery",await snapshot("gallery"))[0].framing,null);
assert.deepEqual((await publicCrops())["bio:image:portrait"].framing,crop);
// Fail the sidecar write after the original save and prove full transaction rollback.
await db.exec(`create function public.test_reject_photo_crop() returns trigger language plpgsql as $$ begin raise exception 'isolated crop failure' using errcode='23514'; end; $$;
  create trigger test_reject_photo_crop before insert or update on public.photo_framings for each row execute function public.test_reject_photo_crop()`);
const rollbackBefore = await allContent(); const rollbackCrops = await stored();
const failing = await value("gallery"); failing.payload.items[0].title="Must roll back"; failing.payload.items[0].framing=crop;
await assert.rejects(()=>save("gallery","frames",failing.payload,failing.versions),error=>error.code==="23514");
assert.deepEqual(await allContent(),rollbackBefore); assert.deepEqual(await stored(),rollbackCrops);
await db.exec("drop trigger test_reject_photo_crop on public.photo_framings; drop function public.test_reject_photo_crop()");
// Referencing trashed media still fails in the original save before any crop publication.
await db.exec("insert into public.media_assets(id,label,src,media_type,deleted_at,is_published) values('trashed','Trashed','https://media.example.test/trashed.jpg','image',clock_timestamp(),false)");
const blocked = await value("gallery"); blocked.payload.items[0].src="https://media.example.test/trashed.jpg"; blocked.payload.items[0].framing=crop;
await assert.rejects(()=>save("gallery","frames",blocked.payload,blocked.versions),error=>error.code==="23514");
assert.deepEqual(await stored(),rollbackCrops);
// Explicit RLS + ACL denies direct table access even to service_role. Only the
// two service RPCs and the public, filtered read projection are exposed.
for(const role of ["anon","authenticated","service_role"]) {
  await db.exec(`set role ${role}`);
  for(const query of ["select * from public.photo_framings","delete from public.photo_framings","select public.photo_framing_for_source_v2('home:about','/images/about.jpg')"])
    await assert.rejects(()=>db.query(query),error=>error.code==="42501");
  assert.ok(await publicCrops());
  if(role!=="service_role") {
    await assert.rejects(()=>snapshot("gallery"),error=>error.code==="42501");
    await assert.rejects(()=>save("gallery","frames",gallery.payload,gallery.versions),error=>error.code==="42501");
  } else assert.equal((await snapshot("gallery")).photoFramingAvailable,true);
  await db.exec("reset role");
}
const rerunContent=await allContent(); const rerunCrops=await stored();
await db.exec(migration); assert.deepEqual(await allContent(),rerunContent); assert.deepEqual(await stored(),rerunCrops);
for(const [signature,definition] of definitions) assert.equal((await db.query("select pg_get_functiondef($1::regprocedure) as definition",[signature])).rows[0].definition,definition);
// The one forward repair must never replay a guessed definition over owner edits.
await db.exec("begin");
await db.exec("do $$ declare definition text; begin select pg_get_functiondef('public.save_showreel_works_v2(text,jsonb,jsonb)'::regprocedure) into definition; execute replace(definition,'v_work_count > greatest(120, v_current_count)','v_work_count > greatest(121, v_current_count)'); end $$");
await assert.rejects(()=>db.exec(migration),error=>error.code==="55000"); await db.exec("rollback");
await db.exec("begin read only");
for(const name of ["0040_media_library_v2","0043_content_archive_bio","0044_content_archive_gallery_showreel","0046_hero_media_framing","0051_photo_framing"]) {
  const result=await db.exec(await readFile(new URL(`../supabase/checks/${name}.sql`,import.meta.url),"utf8"));
  const rows=result.flatMap(item=>item.rows); assert.ok(rows.length>0); assert.ok(rows.every(item=>item.passed===true),`${name}: ${JSON.stringify(rows)}`);
}
await db.exec("commit"); await db.close();
console.log("Photo framing SQL passed: all seven non-Hero sections, independent placements, current-source binding, all four archives + hidden restore, legacy 512-character IDs, reset, exact CAS, rollback, media guard, private ACL/RLS, strict forward Showreel repair, unchanged other predecessors and idempotent deployment.");
