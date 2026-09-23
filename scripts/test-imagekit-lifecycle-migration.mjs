// Disposable PostgreSQL tests in an existing local PGlite runtime. No network,
// provider credentials, live database, or persistent files are used.
// Usage: node scripts/test-imagekit-lifecycle-migration.mjs <PGlite dist/index.js>
// PGlite executes one connection: lock ordering is a contract check, not a
// claim that these tests have proved multi-session race/deadlock behavior.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";

// PGlite's default error includes its minified bundle and the entire migration;
// keep failures readable while preserving useful assertion/SQL diagnostics.
process.on("uncaughtException", error => {
  console.error(error.name, error.message, error.code ?? "", error.where ?? "");
  if (error.actual instanceof Error) console.error(error.actual.message, error.actual.code ?? "", error.actual.where ?? "");
  if (error.internalQuery) console.error(error.internalQuery);
  if (error.query && error.position) console.error(error.query.slice(Math.max(0, Number(error.position) - 250), Number(error.position) + 250));
  console.error(error.stack?.split("\n").filter(line => line.includes("test-imagekit-lifecycle-migration.mjs")).join("\n") ?? "");
  process.exit(1);
});

if (!process.argv[2]) throw new Error("Pass a local @electric-sql/pglite/dist/index.js path.");
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const sql = name => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
const names = await readdir(new URL("../supabase/migrations/", import.meta.url));
const lifecycleName = names.find(name => name.startsWith("0047_") && name.endsWith(".sql"))?.slice(0, -4);
const libraryName = names.find(name => name.startsWith("0048_") && name.endsWith(".sql"))?.slice(0, -4);
const readinessName = names.find(name => name.startsWith("0049_") && name.endsWith(".sql"))?.slice(0, -4);
assert.ok(lifecycleName && libraryName && readinessName, "Lifecycle, library and readiness migrations must exist");
const lifecycleMigration = await sql(lifecycleName);
const libraryMigration = await sql(libraryName);
const readinessMigration = await sql(readinessName);
const actor = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const inactive = "00000000-0000-4000-8000-000000000003";
let sequence = 100;
const uuid = () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`;
const metadata = { label: "Isolated upload", alt: "Fictional portrait", usageKey: "gallery", sortOrder: 3, isPublished: true };
const scalar = async (query, values = []) => Object.values((await db.query(query, values)).rows[0])[0];
const row = async (table, id, key = "id") => scalar(`select to_jsonb(item) from public.${table} item where ${key}=$1`, [id]);
const snapshot = async () => (await db.query(`select * from (
  select 'asset' as kind,to_jsonb(item) as data from public.media_assets item
  union all select 'object',to_jsonb(item) from public.media_physical_objects item
  union all select 'variant',to_jsonb(item) from public.media_asset_variants item
  union all select 'intent',to_jsonb(item) from public.media_upload_intents item
  union all select 'lifecycle',to_jsonb(item) from public.media_imagekit_upload_lifecycle item
  union all select 'file-binding',to_jsonb(item) from public.media_imagekit_file_bindings item
  union all select 'hero',to_jsonb(item) from public.page_heroes item
  union all select 'archive',to_jsonb(item) from public.content_archive_v2 item
  union all select 'audit',to_jsonb(item) from public.audit_logs item
) data order by kind,data::text`)).rows;
const expectReject = async (operation, codes = ["22023", "23505", "42501", "40001", "55000", "23514"]) =>
  assert.rejects(operation, error => codes.includes(error.code));

await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql as $$ select null::uuid $$;`);
await db.exec((await sql("0001_initial_schema")).replace("create extension if not exists pgcrypto;", ""));
await expectReject(() => db.exec(readinessMigration), ["55000"]); await db.exec("rollback");
assert.equal(await scalar("select to_regprocedure('public.get_imagekit_upload_readiness_v1()')"), null,
  "0049 rolls back rather than exposing readiness when all prerequisites are absent");
await expectReject(() => db.exec(lifecycleMigration), ["55000"]); await db.exec("rollback");
assert.equal(await scalar("select to_regclass('public.media_imagekit_upload_lifecycle')"), null,
  "A missing predecessor must fail before publishing new capabilities");
await db.exec((await sql("0002_media_manager")).split("insert into storage.buckets")[0]);
for (const name of ["0013_gallery_media_placements", "0014_gallery_studio", "0016_footer_effect", "0023_admin_operations_hardening",
  "0028_music_page_editor", "0029_batch_5a_music_and_nav_links", "0030_bio_page_editor", "0031_gallery_page_editor", "0032_showreel_page_editor", "0033_contact_page_editor",
  "0034_media_optimization_foundation", "0035_media_pipeline_integrity_guards", "0036_media_upload_intents", "0037_home_page_editor",
  "0039_footer_content_editor", "0040_media_library_v2", "0041_content_archive_navbar", "0042_content_archive_music", "0043_content_archive_bio", "0044_content_archive_gallery_showreel"]) await db.exec(await sql(name));
await db.exec(`insert into public.site_settings(id,artist_name) values('main','Isolated artist');
  insert into public.bio_profile(id,top_label,intro_text,caption) values('main','BIO','Fictional introduction','Fictional caption');
  insert into public.actor_resume(id) values('main');`);
await db.exec(await sql("0045_contact_optional_copy"));
await db.exec(await sql("0046_hero_media_framing"));
await db.query("insert into auth.users values($1),($2),($3)", [actor, other, inactive]);
await db.query(`insert into public.admin_profiles(user_id,email,role,is_active) values
  ($1,'owner@example.test','owner',true),($2,'other@example.test','admin',true),($3,'inactive@example.test','admin',false)`, [actor, other, inactive]);
await db.exec(`insert into public.media_assets(id,label,src,media_type,storage_path,file_size) values
    ('legacy-original','Legacy original','https://legacy.example.test/old.jpg','image','old.jpg',1024),
    ('legacy-replacement','Legacy replacement','https://legacy.example.test/new.jpg','image','new.jpg',2048);
  insert into public.page_heroes(page_slug,title,background_src) values('bio','Original biography','https://legacy.example.test/old.jpg');`);
const beforeDeploy = (await db.query("select to_jsonb(item) as data from public.media_assets item order by id")).rows;
await db.exec(lifecycleMigration);
assert.deepEqual((await db.query("select to_jsonb(item) as data from public.media_assets item order by id")).rows, beforeDeploy,
  "0047 must never backfill or rewrite original content");

const prepare = async (assetId, options = {}) => {
  const id = options.id ?? uuid();
  const value = await scalar("select public.prepare_imagekit_upload_v1($1,$2,$3,$4,$5,$6,$7,$8,$9)", [
    id, assetId, options.metadata ?? metadata, options.container ?? "isolated_artist", options.mime ?? "image/jpeg",
    options.bytes ?? 1024, options.sha ?? "a".repeat(64), options.actor ?? actor, options.ttl ?? 600,
  ]);
  return { id, assetId, value };
};
const resolve = (intent, admin = actor) => scalar("select public.resolve_imagekit_upload_v1($1,$2)", [intent.id, admin]);
const claim = (intent, admin = actor) => scalar("select public.claim_imagekit_upload_v1($1,$2)", [intent.id, admin]);
const close = (intent, status = "cancelled", admin = actor) => scalar("select public.close_imagekit_upload_v1($1,$2,$3)", [intent.id, admin, status]);
const intentRow = intent => row("media_upload_intents", intent.id);
const lifecycle = intent => row("media_imagekit_upload_lifecycle", intent.id, "intent_id");
const evidence = async (intent, overrides = {}) => {
  const reserved = await intentRow(intent);
  return { storageProvider: "imagekit", storageContainer: reserved.storage_container, objectKey: reserved.object_key,
    fileId: `file_${intent.id.replaceAll("-", "")}`, versionId: "version_1", versionToken: "v".repeat(256),
    deliveryUrl: `https://ik.imagekit.io/${reserved.storage_container}/${reserved.object_key}`,
    mimeType: reserved.expected_mime_type, byteSize: Number(reserved.expected_byte_size), checksumSha256: reserved.expected_checksum_sha256, ...overrides };
};
const finalize = async (intent, value, admin = actor) => scalar("select public.finalize_imagekit_upload_v1($1,$2,$3)", [intent.id, admin, JSON.stringify(value === undefined ? await evidence(intent) : value)]);
const mutate = async (assetId, operation, replacementId = null, version, replacementVersion) => scalar(
  "select public.mutate_media_asset_v2($1,$2,$3,$4,$5,$6)", [assetId, version ?? (await row("media_assets", assetId)).updated_at,
    actor, operation, replacementId, replacementVersion ?? (replacementId ? (await row("media_assets", replacementId)).updated_at : null)]);

const uninstalledLibrary = await prepare("waiting-for-library");
assert.equal((await claim(uninstalledLibrary)).outcome, "issued");
const beforeUnsafePublish = await snapshot();
await expectReject(() => finalize(uninstalledLibrary), ["55000"]);
assert.deepEqual(await snapshot(), beforeUnsafePublish, "Finalization is closed until provider-aware Trash is installed");
await expectReject(() => db.exec(readinessMigration), ["55000"]); await db.exec("rollback");
assert.deepEqual(await snapshot(), beforeUnsafePublish, "Readiness installation cannot modify lifecycle rows when 0048 is missing");
await db.exec(libraryMigration);
await db.exec(readinessMigration);
const readiness = () => scalar("select public.get_imagekit_upload_readiness_v1()");
assert.deepEqual(await readiness(), { version: 1, ready: true });

// Runtime readiness is a bounded schema capability proof, not a provider
// account check or a general defense against a malicious database owner.
// Each drift happens only in this disposable database and is rolled back.
const readinessDrifts = [
  "alter table public.media_upload_intents disable trigger imagekit_intent_guard",
  "alter table public.media_upload_intents disable trigger imagekit_intent_cleanup",
  "alter table public.media_imagekit_upload_lifecycle disable trigger imagekit_lifecycle_guard",
  "alter table public.media_physical_objects disable trigger imagekit_ready_object_guard",
  "alter table public.media_physical_objects disable trigger media_physical_objects_integrity_guard",
  "alter table public.media_asset_variants disable trigger media_asset_variants_integrity_guard",
  "alter table public.media_optimization_jobs disable trigger media_optimization_jobs_integrity_guard",
  "alter table public.content_archive_v2 disable trigger zz_media_library_reference_guard_v2",
  "alter table public.page_heroes disable trigger zz_media_library_reference_guard_v2",
  "grant execute on function public.claim_imagekit_upload_v1(uuid,uuid) to anon",
  "grant execute on function public.finalize_imagekit_upload_v1(uuid,uuid,jsonb) to public",
  "revoke execute on function public.resolve_imagekit_upload_v1(uuid,uuid) from service_role",
  "grant execute on function public.imagekit_upload_snapshot_v1(uuid) to service_role",
  "alter function public.claim_imagekit_upload_v1(uuid,uuid) security invoker",
  "alter function public.claim_imagekit_upload_v1(uuid,uuid) set search_path=public",
  "alter function public.media_library_reference_registry_v2() volatile",
  "grant select on public.media_imagekit_upload_lifecycle to service_role",
  "grant select(file_id) on public.media_imagekit_file_bindings to authenticated",
  "alter table public.media_imagekit_upload_lifecycle disable row level security",
  "alter table public.media_asset_variants disable row level security",
  "create policy test_imagekit_public on public.media_imagekit_file_bindings for select to anon using(true)",
  "alter table public.media_imagekit_upload_lifecycle drop constraint imagekit_cleanup_shape",
  "alter table public.media_imagekit_file_bindings drop constraint imagekit_file_binding_identity",
  "alter table public.media_upload_intents drop constraint media_upload_intents_asset_metadata_check",
  "alter table public.media_upload_intents drop constraint media_upload_intents_object_binding_fk",
  "alter table public.media_upload_intents alter constraint media_upload_intents_object_binding_fk deferrable",
  "alter table public.media_asset_variants drop constraint media_asset_variants_ready_object_fk",
  "alter table public.media_imagekit_file_bindings drop constraint media_imagekit_file_bindings_pkey",
  "alter table public.media_imagekit_file_bindings drop constraint media_imagekit_file_bindings_intent_id_key",
  "drop index public.media_upload_intents_active_asset_idx",
  "alter table public.media_asset_variants alter column required_physical_object_status drop expression",
  "alter table public.media_imagekit_file_bindings rename to test_missing_imagekit_bindings",
  "drop function public.imagekit_mime_extension_v1(text)",
  "drop function public.is_imagekit_media_source_trashable_v1(text)",
  `do $$ declare target record; begin
    select t.tgname into target from pg_catalog.pg_trigger t join pg_catalog.pg_constraint c on c.oid=t.tgconstraint
    where c.conrelid='public.media_asset_variants'::regclass and c.conname='media_asset_variants_ready_object_fk'
      and t.tgrelid=c.conrelid and t.tgisinternal limit 1;
    execute format('alter table public.media_asset_variants disable trigger %I',target.tgname);
  end; $$`,
  `alter table public.media_imagekit_upload_lifecycle drop constraint imagekit_cleanup_shape;
    alter table public.media_imagekit_upload_lifecycle add constraint imagekit_cleanup_shape check(cleanup_state is not null) not valid`,
];
for (const drift of readinessDrifts) {
  await db.exec("begin");
  await db.exec(drift);
  assert.deepEqual(await readiness(), { version: 1, ready: false }, `Incomplete schema must fail closed: ${drift}`);
  await db.exec("rollback");
  assert.deepEqual(await readiness(), { version: 1, ready: true }, "Rollback restores readiness");
}
for (const [signature, original, replacement] of [
  ["public.mutate_media_asset_v2(text,timestamptz,uuid,text,text,timestamptz)",
    "not public.is_imagekit_media_source_trashable_v1(p_asset_id)", "false"],
  ["public.finalize_imagekit_upload_v1(uuid,uuid,jsonb)",
    "not public.is_imagekit_media_source_trashable_v1(v_i.asset_id)", "false"],
]) {
  await db.exec("begin");
  const definition = await scalar("select pg_get_functiondef($1::regprocedure)", [signature]);
  assert.ok(definition.includes(original));
  await db.exec(definition.replaceAll(original, replacement));
  assert.deepEqual(await readiness(), { version: 1, ready: false }, "Missing Trash/finalize integration cannot authorize a token");
  await db.exec("rollback");
}
await db.exec("begin read only");
assert.deepEqual(await readiness(), { version: 1, ready: true }, "Readiness makes no data writes or row/advisory locks");
await db.exec("commit");

// Exact idempotency and generated path policy are database contracts too.
const upload = await prepare("uploaded-portrait");
const prepared = await snapshot();
const retried = await prepare(upload.assetId, { id: upload.id });
assert.deepEqual(retried.value, upload.value);
assert.deepEqual(await snapshot(), prepared, "Equivalent preparation cannot rewrite versions or duplicate audit events");
assert.equal((await intentRow(upload)).object_key, `media/source/${upload.assetId}/${upload.id}.jpg`);
assert.equal((await lifecycle(upload)).cleanup_state, "not_needed");
assert.ok(await resolve(upload));
await expectReject(() => resolve(upload, other), ["42501"]);
await expectReject(() => claim(upload, inactive), ["42501"]);
await expectReject(() => claim(upload, other), ["42501"]);
await expectReject(() => prepare(upload.assetId, { id: upload.id, metadata: { ...metadata, label: "Changed retry" } }), ["23505"]);
await expectReject(() => prepare(upload.assetId), ["23505"]);
const beforeUnissued = await snapshot();
await expectReject(() => finalize(upload));
assert.deepEqual(await snapshot(), beforeUnissued);
assert.equal((await claim(upload)).outcome, "issued");
const issued = await snapshot();
assert.equal((await claim(upload)).outcome, "already_issued");
assert.deepEqual(await snapshot(), issued, "Signing authority is claimed once, never refreshed on retry");

const validEvidence = await evidence(upload);
const malformed = [null, [], {}, "evidence", { ...validEvidence, unexpected: true }];
for (const key of Object.keys(validEvidence)) {
  const missing = { ...validEvidence }; delete missing[key]; malformed.push(missing);
  malformed.push({ ...validEvidence, [key]: null });
}
for (const overrides of [
  { storageProvider: "supabase" }, { storageContainer: "another_account" }, { objectKey: "media/other.jpg" },
  { fileId: "../file" }, { versionId: "" }, { versionToken: "token?redirect=1" }, { versionToken: "v".repeat(257) },
  { deliveryUrl: "https://attacker.example/file.jpg" }, { deliveryUrl: validEvidence.deliveryUrl + "?tr=w-100" },
  { deliveryUrl: validEvidence.deliveryUrl + "#fragment" }, { deliveryUrl: validEvidence.deliveryUrl.replace("https:", "http:") },
  { mimeType: "image/png" }, { byteSize: 1023 }, { byteSize: "1024" }, { checksumSha256: "b".repeat(64) },
]) malformed.push({ ...validEvidence, ...overrides });
const beforeInvalid = await snapshot();
for (const value of malformed) await expectReject(() => finalize(upload, value));
await expectReject(() => finalize(upload, validEvidence, other), ["42501"]);
await expectReject(() => finalize(upload, validEvidence, inactive), ["42501"]);
assert.deepEqual(await snapshot(), beforeInvalid, "Rejected identity/facts/actor data cannot partially publish");

const finalized = await finalize(upload);
assert.equal(finalized.outcome, "consumed");
const publication = await row("media_assets", upload.assetId);
const consumedIntent = await intentRow(upload);
const readyObject = await row("media_physical_objects", consumedIntent.physical_object_id);
const publicationLifecycle = await lifecycle(upload);
const source = await row("media_asset_variants", publicationLifecycle.source_variant_id);
assert.equal(consumedIntent.status, "consumed");
assert.equal(readyObject.status, "ready");
assert.equal(readyObject.delivery_url, validEvidence.deliveryUrl);
assert.equal(Number(readyObject.byte_size), 1024);
assert.equal(readyObject.checksum_sha256, validEvidence.checksumSha256);
assert.equal(publication.src, readyObject.delivery_url);
assert.equal(publication.label, metadata.label);
assert.equal(publication.alt, metadata.alt);
assert.equal(publication.is_published, true);
assert.equal(source.variant_kind, "source");
assert.equal(source.status, "ready");
assert.equal(source.physical_object_id, readyObject.id);
assert.equal(publicationLifecycle.file_id, validEvidence.fileId);
assert.equal(publicationLifecycle.version_id, validEvidence.versionId);
assert.equal(publicationLifecycle.cleanup_state, "not_needed");
const beforeConsumedRetry = await snapshot();
assert.equal((await finalize(upload)).outcome, "already_consumed");
assert.deepEqual(await snapshot(), beforeConsumedRetry, "A duplicate callback cannot mutate assets, versions, or audit events");
await expectReject(() => finalize(upload, { ...validEvidence, versionId: "different_version" }));
assert.deepEqual(await snapshot(), beforeConsumedRetry);
for (const operation of [
  () => db.query("update public.media_upload_intents set expected_byte_size=2048 where id=$1", [upload.id]),
  () => db.query("update public.media_upload_intents set status='prepared',resolved_at=null where id=$1", [upload.id]),
  () => db.query("update public.media_imagekit_upload_lifecycle set file_id='different_file' where intent_id=$1", [upload.id]),
  () => db.query("update public.media_imagekit_upload_lifecycle set issued_at=issued_at+interval '1 second' where intent_id=$1", [upload.id]),
  () => db.query("update public.media_physical_objects set delivery_url='https://ik.imagekit.io/other/file.jpg' where id=$1", [readyObject.id]),
  () => db.query("delete from public.media_upload_intents where id=$1", [upload.id]),
  () => db.query("delete from public.media_imagekit_upload_lifecycle where intent_id=$1", [upload.id]),
]) await expectReject(operation, ["23514"]);
assert.deepEqual(await snapshot(), beforeConsumedRetry, "Database guards also protect already verified identity from direct writes");

// A second intent cannot bind the same provider file to a different asset.
const duplicate = await prepare("duplicate-provider-file"); await claim(duplicate);
const beforeDuplicate = await snapshot();
await expectReject(async () => finalize(duplicate, await evidence(duplicate, { fileId: validEvidence.fileId })), ["23505", "23514"]);
assert.deepEqual(await snapshot(), beforeDuplicate);

// Insert-only publication never overwrites a legacy writer that won the ID.
const collision = await prepare("legacy-raced-id"); await claim(collision);
await db.query("insert into public.media_assets(id,label,src,media_type) values($1,'Legacy winner','https://legacy.example.test/winner.jpg','image')", [collision.assetId]);
const existing = await row("media_assets", collision.assetId);
const beforeCollision = await snapshot();
await expectReject(() => finalize(collision), ["23505", "40001"]);
assert.deepEqual(await row("media_assets", collision.assetId), existing);
assert.notEqual((await intentRow(collision)).status, "consumed");
assert.deepEqual(await snapshot(), beforeCollision, "A winning legacy insert also rolls back provider binding and ready-object publication");

// Force a late publication failure: every prior write in the RPC rolls back.
const rollback = await prepare("rollback-publication"); await claim(rollback);
await db.exec(`create function public.test_reject_imagekit_source() returns trigger language plpgsql as $$ begin
  if new.asset_id='rollback-publication' then raise exception 'isolated variant rejection' using errcode='23514'; end if; return new; end; $$;
  create trigger test_reject_imagekit_source before insert on public.media_asset_variants for each row execute function public.test_reject_imagekit_source();`);
const beforeRollback = await snapshot();
await expectReject(() => finalize(rollback), ["23514"]);
assert.deepEqual(await snapshot(), beforeRollback, "Object, asset, source, lifecycle and intent consume are atomic");
await db.exec("drop trigger test_reject_imagekit_source on public.media_asset_variants; drop function public.test_reject_imagekit_source()");

// In-memory owner-only fixture time travel, not exposed application behavior.
// No clock sleeps and no real provider authority are needed for expiry tests.
const expire = async intent => {
  await db.exec("alter table public.media_upload_intents disable trigger user");
  await db.query("update public.media_upload_intents set created_at=clock_timestamp()-interval '20 minutes', expires_at=clock_timestamp()-interval '10 minutes' where id=$1", [intent.id]);
  await db.exec("alter table public.media_upload_intents enable trigger user");
};
const unissuedCancel = await prepare("unissued-cancel");
await close(unissuedCancel);
assert.equal((await intentRow(unissuedCancel)).status, "cancelled");
assert.equal((await lifecycle(unissuedCancel)).cleanup_state, "not_needed");
const beforeCancelRetry = await snapshot(); await close(unissuedCancel);
assert.deepEqual(await snapshot(), beforeCancelRetry, "A duplicate cancellation cannot schedule extra work or change versions");
const issuedCancel = await prepare("issued-cancel"); await claim(issuedCancel); await close(issuedCancel);
const closed = await lifecycle(issuedCancel);
assert.equal(closed.cleanup_state, "pending");
assert.ok(Date.parse(closed.cleanup_after) >= Date.now() + 59 * 60 * 1000, "Cleanup waits until outstanding upload authority plus grace has elapsed");
await expectReject(() => finalize(issuedCancel));
assert.equal((await claim(issuedCancel)).outcome, "terminal");
const expired = await prepare("expired-upload"); await claim(expired); await expire(expired); await resolve(expired);
assert.equal((await intentRow(expired)).status, "expired");
assert.equal((await lifecycle(expired)).cleanup_state, "pending");
await expectReject(() => finalize(expired));
const neverIssuedExpired = await prepare("unissued-expired"); await expire(neverIssuedExpired); await resolve(neverIssuedExpired);
assert.equal((await intentRow(neverIssuedExpired)).status, "expired");
assert.equal((await lifecycle(neverIssuedExpired)).cleanup_state, "not_needed");
const tooLate = await prepare("authority-too-late");
await db.exec("alter table public.media_upload_intents disable trigger user");
await db.query("update public.media_upload_intents set expires_at=clock_timestamp()+interval '20 seconds' where id=$1", [tooLate.id]);
await db.exec("alter table public.media_upload_intents enable trigger user");
assert.equal((await claim(tooLate)).outcome, "too_late");
assert.equal((await lifecycle(tooLate)).issued_at, null);
assert.equal((await lifecycle(tooLate)).cleanup_state, "not_needed");
for (const status of ["consumed", "expired", "prepared", "removed", "", null]) await expectReject(() => close(rollback, status), ["22023"]);
await expectReject(() => close(rollback, "cancelled", other), ["42501"]);

// Cleanup is a bounded private queue, not authority to delete provider files.
const cleanupClaim = (worker = "isolated-worker", limit = 10) => db.query("select * from public.claim_imagekit_upload_cleanup_v1($1,$2)", [worker, limit]);
const cleanupFinish = (intent, lease, result, worker = "isolated-worker") => scalar(
  "select public.finish_imagekit_upload_cleanup_v1($1,$2,$3,$4)", [intent.id, lease, worker, result]);
const makeCleanupDue = async intent => {
  await db.exec("alter table public.media_imagekit_upload_lifecycle disable trigger user");
  await db.query("update public.media_imagekit_upload_lifecycle set cleanup_after=clock_timestamp()-interval '1 minute' where intent_id=$1", [intent.id]);
  await db.exec("alter table public.media_imagekit_upload_lifecycle enable trigger user");
};
const workerExpiry = await prepare("worker-expiry"); await claim(workerExpiry); await expire(workerExpiry);
assert.equal((await cleanupClaim()).rows.length, 0, "Outstanding upload authority/grace cannot be skipped by a worker");
assert.equal((await intentRow(workerExpiry)).status, "expired", "The bounded worker poll also discovers abandoned intents");
assert.equal((await lifecycle(workerExpiry)).cleanup_state, "pending");
await makeCleanupDue(issuedCancel);
assert.equal((await cleanupClaim()).rows.length, 1);
const cleanupLease = await lifecycle(issuedCancel);
assert.equal(cleanupLease.cleanup_state, "leased");
assert.equal(cleanupLease.cleanup_attempts, 1);
assert.ok(cleanupLease.cleanup_lease_id);
assert.equal((await cleanupClaim("other-worker")).rows.length, 0, "An active lease is not issued to a second worker");
const beforeWrongLease = await snapshot();
await expectReject(() => cleanupFinish(issuedCancel, uuid(), "retry"));
await expectReject(() => cleanupFinish(issuedCancel, cleanupLease.cleanup_lease_id, "retry", "other-worker"));
for (const result of ["removed", "completed", "deleted", "ready", null]) await expectReject(() => cleanupFinish(issuedCancel, cleanupLease.cleanup_lease_id, result), ["22023"]);
assert.deepEqual(await snapshot(), beforeWrongLease, "Neither guessed leases nor unsupported provider assertions can complete cleanup");
await cleanupFinish(issuedCancel, cleanupLease.cleanup_lease_id, "retry");
assert.equal((await lifecycle(issuedCancel)).cleanup_state, "pending");
assert.ok(Date.parse((await lifecycle(issuedCancel)).cleanup_after) > Date.now());
for (let attempt = 2; attempt <= 5; attempt += 1) {
  await makeCleanupDue(issuedCancel); await cleanupClaim();
  const leased = await lifecycle(issuedCancel);
  assert.equal(leased.cleanup_attempts, attempt);
  await cleanupFinish(issuedCancel, leased.cleanup_lease_id, "retry");
}
assert.equal((await lifecycle(issuedCancel)).cleanup_state, "attention", "A broken provider must not spin an unbounded cleanup loop");
assert.equal((await intentRow(issuedCancel)).status, "cancelled");
assert.equal((await row("media_physical_objects", (await intentRow(issuedCancel)).physical_object_id)).status, "failed");
await makeCleanupDue(expired); await cleanupClaim();
await cleanupFinish(expired, (await lifecycle(expired)).cleanup_lease_id, "absent");
assert.equal((await lifecycle(expired)).cleanup_state, "pending", "A provider's transient absence is not a successful deletion proof");
assert.ok(Date.parse((await lifecycle(expired)).cleanup_after) > Date.now() + 23 * 60 * 60 * 1000);
await makeCleanupDue(expired); await cleanupClaim();
await cleanupFinish(expired, (await lifecycle(expired)).cleanup_lease_id, "unsafe");
assert.equal((await lifecycle(expired)).cleanup_state, "attention");
await makeCleanupDue(workerExpiry); await cleanupClaim();
const oldLease = (await lifecycle(workerExpiry)).cleanup_lease_id;
await db.query("update public.media_imagekit_upload_lifecycle set cleanup_lease_expires_at=clock_timestamp()-interval '1 second' where intent_id=$1", [workerExpiry.id]);
await expectReject(() => cleanupFinish(workerExpiry, oldLease, "retry"), ["40001"]);
await cleanupClaim();
assert.notEqual((await lifecycle(workerExpiry)).cleanup_lease_id, oldLease, "Expired leases are fenced by a new UUID");
await expectReject(() => cleanupFinish(workerExpiry, oldLease, "retry"), ["40001"]);
await cleanupFinish(workerExpiry, (await lifecycle(workerExpiry)).cleanup_lease_id, "unsafe");
for (const kind of ["asset", "reference"]) {
  const item = await prepare(`cleanup-${kind}-in-use`); await claim(item); await close(item); await makeCleanupDue(item);
  const url = (await evidence(item)).deliveryUrl;
  if (kind === "asset") await db.query("insert into public.media_assets(id,label,src,media_type) values('external-url-use','URL use',$1,'image')", [url]);
  else await db.query("insert into public.home_updates(id,text,href) values('cleanup-url-reference','Existing content link',$1)", [url]);
  assert.equal((await cleanupClaim()).rows.length, 0);
  assert.equal((await lifecycle(item)).cleanup_state, "attention", `Cleanup cannot claim a canonical URL used by ${kind}`);
  assert.equal((await lifecycle(item)).last_cleanup_code, "unsafe");
}
for (const invalid of ["", "../worker", "worker\n", null]) await expectReject(() => cleanupClaim(invalid), ["22023"]);
for (const invalid of [0, -1, 101, null]) await expectReject(() => cleanupClaim("isolated-worker", invalid), ["22023"]);

// All allowed formats share one policy; test exact provider size boundaries.
for (const [mime, extension, limit] of [["image/avif", "avif", 10485760], ["image/gif", "gif", 10485760],
  ["image/jpeg", "jpg", 10485760], ["image/png", "png", 10485760], ["image/webp", "webp", 10485760],
  ["video/mp4", "mp4", 95000000], ["video/quicktime", "mov", 95000000], ["video/webm", "webm", 95000000]]) {
  const item = await prepare(`format-${extension}`, { mime, bytes: limit });
  assert.ok((await intentRow(item)).object_key.endsWith(`.${extension}`));
  await expectReject(() => prepare(`too-large-${extension}`, { mime, bytes: limit + 1 }), ["22023"]);
}
for (const mime of ["image/svg+xml", "image/heic", "text/html", "IMAGE/JPEG", "image/jpg", ""]) await expectReject(() => prepare("unsupported-format", { mime }), ["22023"]);

// The only provider exception is a finalized exact source-only publication.
await db.exec("begin");
await db.query("delete from public.media_imagekit_file_bindings where intent_id=$1", [upload.id]);
assert.equal((await mutate(upload.assetId, "trash")).outcome, "pipeline_busy", "An intact companion/source cannot substitute for the account/file ownership fence");
await db.exec("rollback");
await db.exec("begin");
await db.query("update public.media_imagekit_file_bindings set file_id='mismatched_file' where intent_id=$1", [upload.id]);
assert.equal((await mutate(upload.assetId, "trash")).outcome, "pipeline_busy");
await db.exec("rollback");
assert.equal((await mutate(upload.assetId, "trash")).outcome, "trashed");
assert.ok((await row("media_assets", upload.assetId)).deleted_at);
const beforeTrashedRetry = await snapshot();
assert.equal((await finalize(upload)).outcome, "already_consumed");
assert.deepEqual(await snapshot(), beforeTrashedRetry, "A delayed finalization callback cannot resurrect a trashed asset");
assert.equal((await row("media_physical_objects", readyObject.id)).status, "ready", "Recoverable Trash never deletes provider bytes");
assert.equal((await lifecycle(upload)).cleanup_state, "not_needed", "Published content must not enter abandoned-upload cleanup");
await db.exec("begin");
await db.query("delete from public.media_imagekit_file_bindings where intent_id=$1", [upload.id]);
assert.equal((await mutate(upload.assetId, "restore")).outcome, "pipeline_busy", "Restore also rejects missing provider ownership evidence");
await db.exec("rollback");
assert.equal((await mutate(upload.assetId, "restore")).outcome, "restored");
assert.equal((await mutate(upload.assetId, "trash", null, publication.updated_at)).outcome, "conflict");
await db.query("update public.page_heroes set background_src=$1 where page_slug='bio'", [publication.src]);
assert.equal((await mutate(upload.assetId, "trash")).outcome, "in_use");
assert.equal((await mutate(upload.assetId, "replace_and_trash", "legacy-replacement")).outcome, "replaced_and_trashed");
assert.equal(await scalar("select background_src from public.page_heroes where page_slug='bio'"), "https://legacy.example.test/new.jpg");
await expectReject(() => db.query("update public.page_heroes set background_src=$1 where page_slug='bio'", [publication.src]), ["23514"]);
await mutate(upload.assetId, "restore");
await db.query("insert into public.media_asset_variants(asset_id,source_variant_id,variant_kind,preset_key) values($1,$2,'optimized','balanced')", [upload.assetId, source.id]);
assert.equal((await mutate(upload.assetId, "trash")).outcome, "pipeline_busy", "Derived aliases remain closed until their full lifecycle exists");
for (const [id, provider] of [["unbound-imagekit", "imagekit"], ["other-provider", "supabase"]]) {
  const objectId = uuid(); const variantId = uuid(); const url = `https://legacy.example.test/${id}.jpg`;
  await db.query("insert into public.media_assets(id,label,src,media_type,file_size,mime_type) values($1,'Unbound source',$2,'image',1024,'image/jpeg')", [id, url]);
  await db.query(`insert into public.media_physical_objects(id,storage_provider,storage_container,object_key,delivery_url,media_type,mime_type,byte_size,checksum_sha256,status)
    values($1,$2,'isolated_artist',$3,$4,'image','image/jpeg',1024,$5,'ready')`, [objectId, provider, `${id}.jpg`, url, "a".repeat(64)]);
  await db.query("insert into public.media_asset_variants(id,asset_id,physical_object_id,variant_kind,preset_key,status) values($1,$2,$3,'source','source','ready')", [variantId, id, objectId]);
  assert.equal((await mutate(id, "trash")).outcome, "pipeline_busy", `${id} cannot use the consumed ImageKit exception`);
}
assert.equal((await mutate("legacy-original", "trash")).outcome, "trashed", "Unlinked legacy Supabase content preserves existing Trash behavior");
assert.equal((await mutate("legacy-original", "restore")).outcome, "restored");

// New operational table is private even from service-role direct access.
const exposed = [
  "public.prepare_imagekit_upload_v1(uuid,text,jsonb,text,text,bigint,text,uuid,integer)",
  "public.resolve_imagekit_upload_v1(uuid,uuid)", "public.claim_imagekit_upload_v1(uuid,uuid)",
  "public.close_imagekit_upload_v1(uuid,uuid,text)", "public.finalize_imagekit_upload_v1(uuid,uuid,jsonb)",
  "public.claim_imagekit_upload_cleanup_v1(text,integer)", "public.finish_imagekit_upload_cleanup_v1(uuid,uuid,text,text)",
  "public.get_imagekit_upload_readiness_v1()",
];
for (const role of ["anon", "authenticated", "service_role"]) {
  for (const signature of exposed) assert.equal(await scalar("select has_function_privilege($1,$2,'EXECUTE')", [role, signature]), role === "service_role");
  await db.exec(`set role ${role}`);
  await expectReject(() => db.query("select * from public.media_imagekit_upload_lifecycle"), ["42501"]);
  await expectReject(() => db.query("select * from public.media_imagekit_file_bindings"), ["42501"]);
  if (role !== "service_role") {
    await expectReject(() => resolve(upload), ["42501"]);
    await expectReject(() => finalize(upload, validEvidence), ["42501"]);
    await expectReject(() => cleanupClaim(), ["42501"]);
    await expectReject(() => readiness(), ["42501"]);
  } else {
    assert.equal((await resolve(upload)).status, "consumed", "Trusted service can use the RPC without direct operational table access");
    assert.deepEqual(await readiness(), { version: 1, ready: true }, "Readiness exposes only a version and boolean to the trusted service");
  }
  await db.exec("reset role");
}
assert.equal(await scalar("select relrowsecurity from pg_class where oid='public.media_imagekit_upload_lifecycle'::regclass"), true);
assert.equal(await scalar("select relrowsecurity from pg_class where oid='public.media_imagekit_file_bindings'::regclass"), true);
const helpers = (await db.query(`select p.oid::regprocedure::text as signature,p.proconfig from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like '%imagekit%'`)).rows;
for (const helper of helpers) {
  assert.ok(helper.proconfig?.some(value => value === 'search_path=""'), `${helper.signature} has a fixed empty search path`);
  const bare = helper.signature.startsWith("public.") ? helper.signature : `public.${helper.signature}`;
  if (!exposed.includes(bare)) for (const role of ["anon", "authenticated", "service_role"])
    assert.equal(await scalar("select has_function_privilege($1,$2,'EXECUTE')", [role, helper.signature]), false, `${helper.signature} stays private`);
}
const guardStates = (await db.query(`select tgname,tgenabled from pg_trigger
  where tgname like 'imagekit_%' and not tgisinternal`)).rows;
assert.ok(guardStates.length >= 4 && guardStates.every(item => item.tgenabled === "O"), "All guards are enabled after synthetic time fixtures");
// These are only ordering contracts. PGlite cannot simulate concurrent sessions.
for (const signature of ["public.prepare_imagekit_upload_v1(uuid,text,jsonb,text,text,bigint,text,uuid,integer)",
  "public.lock_imagekit_upload_v1(uuid,uuid)", "public.claim_imagekit_upload_cleanup_v1(text,integer)"]) {
  const definition = await scalar("select pg_get_functiondef($1::regprocedure)", [signature]);
  const intentLock = definition.indexOf("'media_upload_intent_v1:id:'");
  const pipelineLock = definition.indexOf("'media_pipeline_v1:'");
  const assetLock = definition.indexOf("'media_upload_intent_v1:asset:'");
  const rowLock = definition.indexOf("for update");
  assert.ok(intentLock >= 0 && pipelineLock > intentLock && assetLock > pipelineLock && rowLock > assetLock,
    `${signature} retains intent -> pipeline -> asset advisory -> row lock order`);
}

const beforeRerun = await snapshot();
await db.exec(lifecycleMigration); await db.exec(libraryMigration); await db.exec(readinessMigration);
assert.deepEqual(await snapshot(), beforeRerun, "Migration reruns preserve every owner/media version and lifecycle state");
const checkNames = ["0039_footer_content_editor", "0040_media_library_v2", "0041_content_archive_navbar", "0042_content_archive_music",
  "0043_content_archive_bio", "0044_content_archive_gallery_showreel", "0045_contact_optional_copy", "0046_hero_media_framing", lifecycleName, libraryName, readinessName];
let checkCount = 0;
await db.exec("begin read only");
for (const name of checkNames) {
  const results = await db.exec(await readFile(new URL(`../supabase/checks/${name}.sql`, import.meta.url), "utf8"));
  const checks = results.flatMap(result => result.rows);
  assert.ok(checks.length > 0, `${name} must return checks`);
  assert.ok(checks.every(check => check.passed === true), `${name}: ${JSON.stringify(checks)}`);
  checkCount += checks.length;
}
await db.exec("commit");
assert.deepEqual(await snapshot(), beforeRerun, "Deployment checks are genuinely read-only");
await db.close();
console.log(`ImageKit SQL: preparation, issuance, verified atomic insert-only finalize/idempotency, actor/ACL isolation, malformed proof rejection, expiry/cancel cleanup queue, source-only Trash, ${readinessDrifts.length + 2} readiness drift cases, rerun and ${checkCount} deployment checks passed. Concurrency requires a separate multi-session PostgreSQL test.`);
