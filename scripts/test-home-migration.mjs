// Optional real PostgreSQL smoke test, isolated in PGlite memory. No credentials,
// network or production database. Pass the installed PGlite dist/index.js path.
// Example: node scripts/test-home-migration.mjs C:/Temp/sql-test/node_modules/@electric-sql/pglite/dist/index.js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

if (!process.argv[2]) throw new Error("Pass a local @electric-sql/pglite/dist/index.js path.");
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create table public.page_heroes(page_slug text, title text, subtitle text, cta_label text, cta_href text, background_src text, poster_src text, media_type text);
  create table public.about_home(id text, heading text, body text, cta_label text, cta_href text, image_src text, image_alt text);
  create table public.media_assets(id text primary key, src text, media_type text, metadata jsonb, deleted_at timestamptz, is_published boolean default true);
  create table public.gallery_presentation(id text, interlude_label text, interlude_meta text, interlude_eyebrow text, interlude_video_src text, interlude_poster_src text, story_label text, story_scroll_label text);
  create table public.gallery_images(src text, title text, alt text, caption text, freelance_story_order integer, is_published boolean, is_freelance_story boolean);
  create table public.home_updates(avatar_src text);
  create table public.music_platform_links(image_src text);
  create table public.bio_gallery_images(src text);
  create table public.videos(thumbnail_src text, embed_url text);
  insert into public.page_heroes values('home', 'Existing artist', 'Original tagline', '', '#home-about', '/custom/hero.jpg', '', 'image');
  insert into public.about_home values('main', 'Original about', 'Keep this copy', 'More', '/bio', '/custom/about.jpg', 'Original portrait');
  insert into public.media_assets(id,src,media_type,metadata,deleted_at) values('home-studio-settings', '/settings', 'image', '{"featureTitle":"SHOWREEL","featureBody":"Selected screen work, performance clips, and showreel material in one focused place.","storyImage2Title":"Custom second title","storyImage1Src":"/custom/story.jpg"}', null);
  insert into public.gallery_presentation values('main', 'Original label', 'Original meta', 'Original eyebrow', '/custom/feature.mp4', '/custom/poster.jpg', 'Original stories', 'Scroll through the practice');
  insert into public.gallery_images values('/custom/base.jpg', 'Base frame', 'Base alt', 'Base body', 10, true, true);
  insert into public.media_assets(id,src,media_type,metadata,deleted_at) values('remote-image', 'https://media.example/image.jpg', 'image', '{}', null), ('remote-video', 'https://media.example/video.mp4', 'video', '{}', null), ('trashed', 'https://media.example/trashed.jpg', 'image', '{}', now());
`);
const sql = await readFile(new URL("../supabase/migrations/0037_home_page_editor.sql", import.meta.url), "utf8");
await db.exec(sql);
const snapshot = async () => (await db.query("select public.get_home_page_v2_snapshot('main') as data")).rows[0].data;
let saved = await snapshot();
assert.equal(saved.draft.hero.title, "Existing artist");
assert.equal(saved.draft.about.body, "Keep this copy");
assert.equal(saved.draft.feature.videoSrc, "/custom/feature.mp4");
assert.equal(saved.draft.feature.title, "THE INTERLUDE");
assert.equal(saved.draft.stories.images[0].src, "/custom/story.jpg");
assert.equal(saved.draft.stories.images[0].alt, "Base alt");
assert.equal(saved.draft.stories.images[1].src, "");
assert.equal(saved.draft.stories.images[1].title, "Custom second title");
assert.equal(saved.draft.stories.images.length, 4);
assert.notEqual(saved.draft.stories.scrollLabel, "Scroll through the practice");
const publish = async (section, payload, expected = saved.versions.updatedAt) =>
  (await db.query("select public.save_home_section_v2('main',$1,$2,$3::jsonb) as data", [section, expected, JSON.stringify(payload)])).rows[0].data;
const rejects = async (section, payload, code = "22023", version) => {
  await assert.rejects(() => publish(section, payload, version), (error) => error.code === code);
};

const baseline = structuredClone(saved);
const layout = [...saved.draft.layout].reverse().map((row) => ({ ...row, enabled: row.id !== "cnc" }));
await publish("layout", layout);
saved = await snapshot();
assert.deepEqual(saved.draft.layout, layout);
assert.deepEqual(saved.draft.cnc, baseline.draft.cnc);
assert.deepEqual(saved.draft.about, baseline.draft.about);
assert.notEqual(saved.versions.updatedAt, baseline.versions.updatedAt);
await rejects("about", saved.draft.about, "40001", baseline.versions.updatedAt);
await rejects("layout", layout.slice(1));
await rejects("layout", layout.map(() => layout[0]));
await rejects("layout", layout.map((row) => ({ ...row, enabled: false })));
await rejects("layout", layout.map((row) => ({ ...row, enabled: "yes" })));
await rejects("_story_image", saved.draft.stories.images[0]);
await rejects("stories", { ...saved.draft.stories, images: [] });
await rejects("stories", { ...saved.draft.stories, images: [{ ...saved.draft.stories.images[0], extra: true }, ...saved.draft.stories.images.slice(1)] });
await rejects("cnc", { ...saved.draft.cnc, body: "x".repeat(10_001) });
await rejects("cnc", { ...saved.draft.cnc, title: 12 });
await rejects("cnc", { ...saved.draft.cnc, surprise: true });
for (const imageSrc of ["//evil.example/a.jpg", "/\\evil.example/a.jpg", "javascript:alert(1)", "https://unmanaged.example/a.jpg", "https://media.example/video.mp4", "https://media.example/trashed.jpg"]) {
  await rejects("about", { ...saved.draft.about, imageSrc });
}
await rejects("hero", { ...saved.draft.hero, ctaLabel: "Open", ctaHref: "" });
await rejects("hero", { ...saved.draft.hero, ctaHref: "https://user:secret@evil.example/a" });
await rejects("hero", { ...saved.draft.hero, ctaHref: "https://evil.example:4000/a" });
assert.deepEqual(await snapshot(), saved);

const canonical = await publish("about", { ...saved.draft.about, heading: "  Trim this  ", imageSrc: "https://media.example/image.jpg" });
assert.equal(canonical.canonicalSection.heading, "Trim this");
saved = await snapshot();
assert.deepEqual(canonical.versions, saved.versions);
const mediaReferences = await db.query("select * from public.media_asset_references($1)", ["https://media.example/image.jpg"]);
assert.ok(mediaReferences.rows.some((row) => row.reference_label === "Home V2" && Number(row.reference_count) === 1));
assert.equal((await db.query("select * from public.media_asset_references('/custom/about.jpg')")).rows.length, 0, "Replaced HOME media must not be retained by obsolete legacy rows");

await publish("layout", saved.draft.layout.map((row) => ({ ...row, enabled: row.id === "hero" })));
saved = await snapshot();
assert.ok((await db.query("select * from public.media_asset_references($1)", ["https://media.example/image.jpg"])).rows.some((row) => row.reference_label === "Home V2"), "Disabled HOME sections retain their media references");
await publish("hero", { ...saved.draft.hero, title: "Saved hero", backgroundSrc: "https://media.example/video.mp4", posterSrc: "https://media.example/image.jpg", mediaType: "video" });
saved = await snapshot();
await publish("feature", { ...saved.draft.feature, videoSrc: "https://media.example/video.mp4", posterSrc: "https://media.example/image.jpg" });
saved = await snapshot();
await publish("stories", { ...saved.draft.stories, images: saved.draft.stories.images.map((image) => ({ ...image, src: "https://media.example/image.jpg" })) });
saved = await snapshot();
assert.equal(saved.draft.hero.mediaType, "video");
assert.equal(saved.draft.stories.images.filter((image) => image.src === "https://media.example/image.jpg").length, 4);

await db.exec(sql);
assert.deepEqual(await snapshot(), saved, "Rerunning migration must not reset content or versions");
await db.exec("set role anon");
assert.equal((await db.query("select id from public.home_page_config")).rows[0].id, "main");
await assert.rejects(() => db.query("update public.home_page_config set draft = '{}'"), (error) => error.code === "42501");
await assert.rejects(() => snapshot(), (error) => error.code === "42501");
await assert.rejects(() => db.query("select public.validate_home_section_v2('cnc', '{}'::jsonb)"), (error) => error.code === "42501");
await db.exec("reset role; set role authenticated");
await assert.rejects(() => db.query("delete from public.home_page_config"), (error) => error.code === "42501");
await db.exec("reset role; set role service_role");
assert.equal((await snapshot()).draft.hero.title, "Saved hero");
await publish("cnc", { ...saved.draft.cnc, title: "New title" });
await db.exec("reset role");
const verification = await db.exec(await readFile(new URL("../supabase/checks/0037_home_page_editor.sql", import.meta.url), "utf8"));
assert.ok(verification[0].rows.every((row) => row.passed === true), "Read-only deployment checks should all pass");
await db.close();
console.log("HOME migration: real PostgreSQL seed, rerun, section saves, locking versions, nested validation, media references and role permissions passed.");
