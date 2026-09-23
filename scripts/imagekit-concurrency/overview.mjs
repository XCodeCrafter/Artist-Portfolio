import assert from "node:assert/strict";

// Disposable fixture only. All synthetic rows and deliberate drift live in a
// rollback-only transaction; none survive to the lifecycle race scenarios.
export async function runOverviewChecks({ a, observer, report }) {
  const actor = "00000000-0000-4000-8000-000000000001";
  const missingActor = "00000000-0000-4000-8000-000000009999";
  const inactiveActor = "00000000-0000-4000-8000-000000009998";
  const literal = value => `'${String(value).replaceAll("'", "''")}'`;
  const json = value => `${literal(JSON.stringify(value))}::jsonb`;
  const metadata = { label: "  Overview fixture  ", alt: "Synthetic image", usageKey: "gallery", sortOrder: 0, isPublished: true };
  let sequence = 8000;
  let passed = 0;
  const sql = (id = actor, limit = "20") => `select public.get_imagekit_reconciliation_overview_v1(${id === null ? "null" : `${literal(id)}::uuid`},${limit})`;
  const read = (limit = "20") => observer.scalar(sql(actor, limit));
  const check = async (name, action) => { await action(); passed += 1; report(name); };
  const prepare = async (issued = true) => {
    const id = `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`;
    const asset = `overview-fixture-${sequence}`;
    await observer.scalar(`select public.prepare_imagekit_upload_v1(${literal(id)}::uuid,${literal(asset)},${json(metadata)},'overview_fixture','image/jpeg',1024,${literal("a".repeat(64))},${literal(actor)}::uuid,600)`);
    if (issued) await observer.scalar(`select public.claim_imagekit_upload_v1(${literal(id)}::uuid,${literal(actor)}::uuid)`);
    return { id, asset };
  };
  const close = intent => observer.scalar(`select public.close_imagekit_upload_v1(${literal(intent.id)}::uuid,${literal(actor)}::uuid,'cancelled')`);
  const lifecycle = (intent, assignments) => observer.query(`update public.media_imagekit_upload_lifecycle set ${assignments} where intent_id=${literal(intent.id)}::uuid`);
  const expectedError = async (statement, code) => {
    await observer.query("SAVEPOINT overview_expected_error");
    try { await assert.rejects(observer.query(statement), error => error.code === code); }
    finally { await observer.query("ROLLBACK TO SAVEPOINT overview_expected_error"); }
  };
  const keys = (value, expected) => assert.deepEqual(Object.keys(value).sort(), expected.split(",").sort());
  const assertProjection = overview => {
    keys(overview, "version,generatedAt,total,counts,items,hasMore");
    keys(overview.counts, "uploading,waiting,due,checking,attention");
    assert.equal(overview.version, 1);
    assert.ok(Number.isFinite(Date.parse(overview.generatedAt)));
    assert.equal(Object.values(overview.counts).reduce((sum, count) => sum + count, 0), overview.total);
    for (const item of overview.items) {
      keys(item, "intentId,label,mediaType,sizeBytes,stage,attempts,lastObservation,nextCheckAt,updatedAt");
      assert.equal(item.label, "Overview fixture");
      assert.equal(item.mediaType, "image");
      assert.equal(item.sizeBytes, 1024);
      assert.ok(Number.isFinite(Date.parse(item.updatedAt)));
      assert.ok(item.nextCheckAt === null || Number.isFinite(Date.parse(item.nextCheckAt)));
      assert.ok(Number.isInteger(item.attempts) && item.attempts >= 0 && item.attempts <= 5);
      assert.ok([null, "absent", "retry", "unsafe", "exhausted"].includes(item.lastObservation));
    }
    assert.doesNotMatch(JSON.stringify(overview), /overview_fixture|media\/source|file_|versionToken|checksum|leaseId|workerId|actorId|https?:/);
  };

  await check("overview is empty and executable inside a service-role read-only transaction", async () => {
    await a.query("BEGIN READ ONLY");
    try {
      const result = await a.scalar(sql());
      assertProjection(result);
      assert.equal(result.total, 0);
      assert.deepEqual(result.items, []);
      assert.equal(result.hasMore, false);
    } finally { await a.query("ROLLBACK"); }
  });

  await observer.query("BEGIN");
  try {
    await check("overview denies anonymous/authenticated roles and inactive, missing or null administrators", async () => {
      for (const role of ["anon", "authenticated"]) {
        await observer.query(`SET LOCAL ROLE ${role}`);
        await expectedError(sql(), "42501");
        await observer.query("RESET ROLE");
      }
      await observer.query("SET LOCAL ROLE service_role");
      await expectedError(sql(null), "42501");
      await expectedError(sql(missingActor), "42501");
      await observer.query("RESET ROLE");
      // The fixture owner must remain active: production correctly protects the
      // last owner. A separate inactive administrator exercises this boundary.
      await observer.query(`insert into auth.users(id) values(${literal(inactiveActor)}::uuid)`);
      await observer.query(`insert into public.admin_profiles(user_id,email,role,is_active) values(${literal(inactiveActor)}::uuid,'inactive-overview@example.test','admin',false)`);
      await expectedError(sql(inactiveActor), "42501");
    });
    await check("overview validates bounded limits without coercion or silent clipping", async () => {
      for (const limit of ["null", "0", "-1", "51", "2147483647"]) await expectedError(sql(actor, limit), "22023");
      for (const limit of ["1", "50"]) assert.equal((await read(limit)).total, 0);
    });

    const uploading = await prepare();
    const expiredPrepared = await prepare();
    // Time travel only in the disposable transaction; all guards are reenabled
    // before invoking any overview/readiness RPC.
    await observer.query("alter table public.media_upload_intents disable trigger user");
    await observer.query(`update public.media_upload_intents set created_at=clock_timestamp()-interval '20 minutes',expires_at=clock_timestamp()-interval '10 minutes' where id=${literal(expiredPrepared.id)}::uuid`);
    await observer.query("alter table public.media_upload_intents enable trigger user");
    const waiting = await prepare(); await close(waiting);
    const due = await prepare(); await close(due);
    await lifecycle(due, "cleanup_after=clock_timestamp()-interval '1 minute',cleanup_attempts=1,last_cleanup_code='retry'");
    const checking = await prepare(); await close(checking);
    await lifecycle(checking, "cleanup_state='leased',cleanup_after=clock_timestamp()-interval '1 minute',cleanup_attempts=1,cleanup_lease_id=gen_random_uuid(),cleanup_worker_id='overview_worker',cleanup_lease_expires_at=clock_timestamp()+interval '5 minutes'");
    const expiredLease = await prepare(); await close(expiredLease);
    await lifecycle(expiredLease, "cleanup_state='leased',cleanup_after=clock_timestamp()-interval '2 minutes',cleanup_attempts=1,cleanup_lease_id=gen_random_uuid(),cleanup_worker_id='overview_worker',cleanup_lease_expires_at=clock_timestamp()-interval '1 minute'");
    const attention = await prepare(); await close(attention);
    await lifecycle(attention, "cleanup_state='attention',cleanup_attempts=1,last_cleanup_code='unsafe'");
    const unissued = await prepare(false);
    const unissuedClosed = await prepare(false); await close(unissuedClosed);
    const consumed = await prepare();
    const objectKey = `media/source/${consumed.asset}/${consumed.id}.jpg`;
    await observer.scalar(`select public.finalize_imagekit_upload_v1(${literal(consumed.id)}::uuid,${literal(actor)}::uuid,${json({
      storageProvider: "imagekit", storageContainer: "overview_fixture", objectKey, fileId: "overview_file",
      versionId: "version_1", versionToken: "v1", deliveryUrl: `https://ik.imagekit.io/overview_fixture/${objectKey}`,
      mimeType: "image/jpeg", byteSize: 1024, checksumSha256: "a".repeat(64),
    })})`);

    await check("overview classifies all stages, excludes unissued/consumed rows, and omits provider identities", async () => {
      await observer.query("SET LOCAL ROLE service_role");
      const result = await read();
      await observer.query("RESET ROLE");
      assertProjection(result);
      assert.equal(result.total, 7);
      assert.deepEqual(result.counts, { uploading: 1, waiting: 1, due: 3, checking: 1, attention: 1 });
      assert.deepEqual(result.items.map(item => item.stage), ["attention", "due", "due", "due", "checking", "waiting", "uploading"]);
      for (const [intent, stage] of [[uploading, "uploading"], [expiredPrepared, "due"], [waiting, "waiting"], [due, "due"], [checking, "checking"], [expiredLease, "due"], [attention, "attention"]]) {
        const item = result.items.find(row => row.intentId === intent.id);
        assert.equal(item.stage, stage);
        assert.equal(item.nextCheckAt === null, stage === "attention");
      }
      for (const intent of [unissued, unissuedClosed, consumed]) assert.ok(!result.items.some(item => item.intentId === intent.id));
      const limited = await read("2");
      assert.equal(limited.total, 7);
      assert.deepEqual(limited.counts, result.counts);
      assert.deepEqual(limited.items, result.items.slice(0, 2));
      assert.equal(limited.hasMore, true);
    });

    await check("overview preserves absent/retry/unsafe/exhausted observations without treating absence as deletion", async () => {
      await lifecycle(waiting, "cleanup_attempts=1,last_cleanup_code='absent'");
      await lifecycle(attention, "cleanup_attempts=5,last_cleanup_code='exhausted'");
      const result = await read();
      assert.equal(result.items.find(item => item.intentId === waiting.id).lastObservation, "absent");
      assert.equal(result.items.find(item => item.intentId === waiting.id).stage, "waiting");
      assert.equal(result.items.find(item => item.intentId === due.id).lastObservation, "retry");
      assert.equal(result.items.find(item => item.intentId === attention.id).lastObservation, "exhausted");
    });

    await check("overview default and maximum page bounds preserve global totals", async () => {
      await observer.query("SAVEPOINT overview_extra_rows");
      for (let index = 0; index < 47; index += 1) await prepare();
      const defaultPage = await observer.scalar(`select public.get_imagekit_reconciliation_overview_v1(${literal(actor)}::uuid)`);
      assert.equal(defaultPage.total, 54);
      assert.equal(defaultPage.items.length, 20);
      assert.equal(defaultPage.hasMore, true);
      const maxPage = await read("50");
      assert.equal(maxPage.items.length, 50);
      assert.equal(maxPage.total, 54);
      assert.equal(maxPage.hasMore, true);
      await observer.query("ROLLBACK TO SAVEPOINT overview_extra_rows");
    });

    await check("repeated overview reads leave every public/auth table byte-for-byte unchanged", async () => {
      const tables = await observer.scalar(`select jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname) order by n.nspname,c.relname)
        from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname in ('public','auth')`);
      const identifier = value => `"${value.replaceAll('"', '""')}"`;
      const snapshotSql = `select jsonb_object_agg(name,rows) from (${tables.map(table =>
        `select ${literal(`${table.schema}.${table.table}`)} as name,coalesce((select jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) from ${identifier(table.schema)}.${identifier(table.table)} t),'[]'::jsonb) as rows`
      ).join(" union all ")}) snapshots`;
      const before = await observer.scalar(snapshotSql);
      for (let index = 0; index < 3; index += 1) assertProjection(await read());
      assert.deepEqual(await observer.scalar(snapshotSql), before);
      assert.equal(await observer.scalar(`select to_jsonb(status) from public.media_upload_intents where id=${literal(expiredPrepared.id)}::uuid`), "prepared");
    });

    await check("overview refuses contradictory lifecycle state and schema-readiness drift", async () => {
      await observer.query("SAVEPOINT overview_corrupt_state");
      await lifecycle(uploading, "cleanup_state='pending',cleanup_after=clock_timestamp()+interval '1 hour'");
      await expectedError(sql(), "55000");
      await observer.query("ROLLBACK TO SAVEPOINT overview_corrupt_state");
      await observer.query("SAVEPOINT overview_guard_drift");
      await observer.query("alter table public.media_imagekit_upload_lifecycle disable trigger imagekit_lifecycle_guard");
      await expectedError(sql(), "55000");
      await observer.query("ROLLBACK TO SAVEPOINT overview_guard_drift");
      await observer.query("SAVEPOINT overview_missing_readiness");
      await observer.query("drop function public.get_imagekit_upload_readiness_v1()");
      await expectedError(sql(), "55000");
      await observer.query("ROLLBACK TO SAVEPOINT overview_missing_readiness");
      assert.deepEqual(await observer.scalar("select public.get_imagekit_upload_readiness_v1()"), { version: 1, ready: true });
    });
  } finally {
    await observer.query("ROLLBACK");
  }
  assert.equal((await a.scalar(sql())).total, 0, "Overview fixture must leave no synthetic rows behind");
  return passed;
}
