// Usage: npm run test:imagekit:concurrency
// Requires Docker Linux and the cached image documented in runtime.mjs.
// No .env, credentials, provider requests, existing DB or host ports are used.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRuntime } from "./imagekit-concurrency/runtime.mjs";
import { installFixture } from "./imagekit-concurrency/fixture.mjs";
import { runScenarios } from "./imagekit-concurrency/scenarios.mjs";
import { runOverviewChecks } from "./imagekit-concurrency/overview.mjs";

if (process.argv.length !== 2) throw new Error("This runner accepts no database, container or provider arguments.");
let runtime;
try {
  runtime = await createRuntime();
  await installFixture(runtime);
  const observer = await runtime.session();
  const a = await runtime.session({ serviceRole: true });
  const b = await runtime.session({ serviceRole: true });
  assert.equal(new Set([a.pid, b.pid, observer.pid]).size, 3, "Tests need three independent PostgreSQL backends");
  assert.equal(await a.scalar("select to_json(current_user::text)"), "service_role");
  assert.equal(await b.scalar("select to_json(current_user::text)"), "service_role");
  assert.deepEqual(await a.scalar("select public.get_imagekit_upload_readiness_v1()"), { version: 1, ready: true });
  const overviewCount = await runOverviewChecks({ a, observer, report: name => console.log(`PASS ${name}`) });
  // Additive migration reruns must not alter media, reservations or audit rows.
  const snapshotSql = `select jsonb_build_object(
    'intents',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.media_upload_intents t),
    'lifecycle',(select coalesce(jsonb_agg(to_jsonb(t) order by intent_id),'[]'::jsonb) from public.media_imagekit_upload_lifecycle t),
    'assets',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.media_assets t),
    'audits',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.audit_logs t))`;
  const count = await runScenarios({ a, b, observer, report: name => console.log(`PASS ${name}`) });
  const beforeRerun = await observer.scalar(snapshotSql);
  await runtime.execSql(await readFile(new URL("../supabase/migrations/0050_imagekit_reconciliation_overview.sql", import.meta.url), "utf8"));
  assert.deepEqual(await observer.scalar(snapshotSql), beforeRerun);
  const checks = (await runtime.execSql(await readFile(new URL("../supabase/checks/0050_imagekit_reconciliation_overview.sql", import.meta.url), "utf8"))).split(/\r?\n/);
  assert.equal(checks.length, 4);
  assert.ok(checks.every(line => line.endsWith("|t")), "All 0050 deployment checks must pass");
  console.log(`PASS ${overviewCount} read-only overview scenarios, preserving rerun and all 4 deployment checks.`);
  assert.deepEqual(await a.scalar("select public.get_imagekit_upload_readiness_v1()"), { version: 1, ready: true });
  console.log(`PASS ${count} real multi-session scenarios; all lifecycle guards remain ready.`);
} catch (error) {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
} finally {
  if (runtime) {
    try { await runtime.cleanup(); }
    catch (error) { console.error(`CLEANUP FAILED: ${error.message}`); process.exitCode = 1; }
  }
}
