import { readFile } from "node:fs/promises";

// Deliberately synthetic prerequisites, matching the offline PGlite fixture.
// This is not a Supabase deployment tool or a general migration runner.
export async function installFixture(runtime) {
  const sql = name => readFile(new URL(`../../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
  await runtime.execSql(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;`);
  await runtime.execSql(await sql("0001_initial_schema"));
  // No Storage service in this isolated cluster; omit only bucket provisioning.
  await runtime.execSql((await sql("0002_media_manager")).split("insert into storage.buckets")[0]);
  for (const name of ["0013_gallery_media_placements", "0014_gallery_studio", "0016_footer_effect", "0023_admin_operations_hardening",
    "0028_music_page_editor", "0029_batch_5a_music_and_nav_links", "0030_bio_page_editor", "0031_gallery_page_editor",
    "0032_showreel_page_editor", "0033_contact_page_editor", "0034_media_optimization_foundation",
    "0035_media_pipeline_integrity_guards", "0036_media_upload_intents", "0037_home_page_editor", "0039_footer_content_editor",
    "0040_media_library_v2", "0041_content_archive_navbar", "0042_content_archive_music", "0043_content_archive_bio",
    "0044_content_archive_gallery_showreel"]) await runtime.execSql(await sql(name));
  await runtime.execSql(`insert into public.site_settings(id,artist_name) values('main','Concurrency fixture artist');
    insert into public.bio_profile(id,top_label,intro_text,caption) values('main','BIO','Fictional introduction','Fictional caption');
    insert into public.actor_resume(id) values('main');
    insert into auth.users(id) values('00000000-0000-4000-8000-000000000001');
    insert into public.admin_profiles(user_id,email,role,is_active)
      values('00000000-0000-4000-8000-000000000001','owner@example.test','owner',true);`);
  for (const name of ["0045_contact_optional_copy", "0046_hero_media_framing", "0047_imagekit_upload_lifecycle",
    "0048_imagekit_source_trash", "0049_imagekit_upload_readiness", "0050_imagekit_reconciliation_overview"]) await runtime.execSql(await sql(name));
}
