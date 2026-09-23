import assert from "node:assert/strict";

// Only the disposable runner may supply these sessions. The observer owns the
// synthetic fixture database; application sessions retain service_role ACLs.
export async function runScenarios({ a, b, observer, report }) {
  const actor = "00000000-0000-4000-8000-000000000001";
  const account = "concurrency_fixture";
  const hash = "a".repeat(64);
  let sequence = 1000;
  let passed = 0;
  const literal = value => `'${String(value).replaceAll("'", "''")}'`;
  const json = value => `${literal(JSON.stringify(value))}::jsonb`;
  const uuid = () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`;
  const metadata = { label: "Isolated concurrency fixture", alt: "Synthetic image", usageKey: "gallery", sortOrder: 0, isPublished: true };
  const newIntent = asset => ({ id: uuid(), asset, fileId: `file_${sequence}` });
  const prepareSql = intent => `select public.prepare_imagekit_upload_v1(${literal(intent.id)}::uuid,${literal(intent.asset)},${json(metadata)},${literal(account)},'image/jpeg',1024,${literal(hash)},${literal(actor)}::uuid,600)`;
  const claimSql = intent => `select public.claim_imagekit_upload_v1(${literal(intent.id)}::uuid,${literal(actor)}::uuid)`;
  const closeSql = intent => `select public.close_imagekit_upload_v1(${literal(intent.id)}::uuid,${literal(actor)}::uuid,'cancelled')`;
  const cleanupSql = worker => `select coalesce(jsonb_agg(result),'[]'::jsonb) from public.claim_imagekit_upload_cleanup_v1(${literal(worker)},50) result`;
  const finishCleanupSql = (intent, lease, worker, result) => `select public.finish_imagekit_upload_cleanup_v1(${literal(intent.id)}::uuid,${literal(lease.leaseId)}::uuid,${literal(worker)},${literal(result)})`;
  const finalizeSql = intent => {
    const objectKey = `media/source/${intent.asset}/${intent.id}.jpg`;
    return `select public.finalize_imagekit_upload_v1(${literal(intent.id)}::uuid,${literal(actor)}::uuid,${json({
      storageProvider: "imagekit", storageContainer: account, objectKey, fileId: intent.fileId,
      versionId: "version_1", versionToken: "v1", deliveryUrl: `https://ik.imagekit.io/${account}/${objectKey}`,
      mimeType: "image/jpeg", byteSize: 1024, checksumSha256: hash,
    })})`;
  };
  const state = intent => observer.scalar(`select jsonb_build_object(
    'status',i.status,'objectStatus',o.status,'cleanup',l.cleanup_state,'attempts',l.cleanup_attempts,
    'issuedAt',l.issued_at,'leaseId',l.cleanup_lease_id,'leaseWorker',l.cleanup_worker_id,
    'leaseExpiresAt',l.cleanup_lease_expires_at,'cleanupAfter',l.cleanup_after,
    'lastCleanupCode',l.last_cleanup_code,'sourceVariantId',l.source_variant_id,
    'assetCount',(select count(*) from public.media_assets where id=i.asset_id),
    'assetDeleted',(select deleted_at from public.media_assets where id=i.asset_id),
    'variantCount',(select count(*) from public.media_asset_variants where asset_id=i.asset_id),
    'readyVariants',(select count(*) from public.media_asset_variants where asset_id=i.asset_id and status='ready'),
    'bindingCount',(select count(*) from public.media_imagekit_file_bindings where intent_id=i.id),
    'preparedAudits',(select count(*) from public.audit_logs where action='imagekit_upload_prepared' and record_id=i.id::text),
    'issuedAudits',(select count(*) from public.audit_logs where action='imagekit_upload_issued' and record_id=i.id::text),
    'consumedAudits',(select count(*) from public.audit_logs where action='imagekit_upload_consumed' and record_id=i.id::text),
    'cleanupObservedAudits',(select count(*) from public.audit_logs where action='imagekit_cleanup_observed' and record_id=i.id::text)
    ) from public.media_upload_intents i join public.media_imagekit_upload_lifecycle l on l.intent_id=i.id
    join public.media_physical_objects o on o.id=i.physical_object_id where i.id=${literal(intent.id)}::uuid`);
  const prepared = async asset => {
    const intent = newIntent(asset);
    await a.scalar(prepareSql(intent));
    return intent;
  };
  const issued = async asset => {
    const intent = await prepared(asset);
    assert.equal((await a.scalar(claimSql(intent))).outcome, "issued");
    return intent;
  };
  const settled = promise => promise.then(value => ({ value }), error => ({ error }));
  const valueOf = async promise => {
    const result = await promise;
    if (result.error) throw result.error;
    return result.value;
  };
  const rejectsWith = async (promise, code) => {
    const result = await promise;
    assert.ok(result.error, `Expected SQLSTATE ${code}, received a successful result`);
    assert.equal(result.error.code, code);
  };
  const awaitBlocked = async () => {
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline) {
      const blockers = await observer.scalar(`select to_jsonb(pg_catalog.pg_blocking_pids(${b.pid}))`);
      if (blockers.includes(a.pid)) return;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.fail(`Session ${b.pid} did not demonstrably block on ${a.pid}`);
  };
  const committedState = async intent => {
    const result = await state(intent);
    assert.equal(result.status, "consumed");
    assert.equal(result.objectStatus, "ready");
    assert.equal(result.cleanup, "not_needed");
    assert.equal(result.assetCount, 1);
    assert.equal(result.variantCount, 1);
    assert.equal(result.readyVariants, 1);
    assert.equal(result.bindingCount, 1);
    assert.equal(result.preparedAudits, 1);
    assert.equal(result.issuedAudits, 1);
    assert.equal(result.consumedAudits, 1);
    return result;
  };
  const unpublishedState = async (intent, status, cleanup, objectStatus) => {
    const result = await state(intent);
    assert.equal(result.status, status);
    assert.equal(result.cleanup, cleanup);
    assert.equal(result.objectStatus, objectStatus);
    assert.equal(result.assetCount, 0);
    assert.equal(result.variantCount, 0);
    assert.equal(result.bindingCount, 0);
    assert.equal(result.consumedAudits, 0);
    assert.equal(result.sourceVariantId, null);
    return result;
  };
  const run = async (name, test) => {
    let scenarioError;
    const cleanupErrors = [];
    try {
      await test();
    } catch (error) {
      scenarioError = error;
    } finally {
      // Releasing A first also unblocks B on failed assertions/barrier timeouts.
      // Sessions reject overlapping queries. Drain each pending RPC before its
      // rollback, and still try B's cleanup if A's connection has failed.
      for (const session of [a, b]) {
        try {
          await session.idle();
          await session.query("ROLLBACK");
        } catch (error) {
          cleanupErrors.push(error);
        }
      }
    }
    if (cleanupErrors.length) {
      throw new AggregateError(scenarioError ? [scenarioError, ...cleanupErrors] : cleanupErrors,
        `Concurrency scenario cleanup failed: ${name}`, scenarioError ? { cause: scenarioError } : undefined);
    }
    if (scenarioError) throw scenarioError;
    passed += 1;
    report(name);
  };

  await run("identical preparation retries serialize to one reservation", async () => {
    const intent = newIntent("race-prepare-retry");
    await a.query("BEGIN");
    const first = await a.scalar(prepareSql(intent));
    const second = settled(b.scalar(prepareSql(intent)));
    await awaitBlocked();
    await a.query("COMMIT");
    assert.deepEqual(await valueOf(second), first);
    const result = await unpublishedState(intent, "prepared", "not_needed", "pending");
    assert.equal(result.preparedAudits, 1);
  });

  await run("competing preparations cannot reserve the same asset", async () => {
    const first = newIntent("race-prepare-asset");
    const second = newIntent(first.asset);
    await a.query("BEGIN");
    await a.scalar(prepareSql(first));
    const pending = settled(b.scalar(prepareSql(second)));
    await awaitBlocked();
    await a.query("COMMIT");
    await rejectsWith(pending, "23505");
    assert.equal(await observer.scalar(`select to_jsonb(count(*)) from public.media_upload_intents where asset_id=${literal(first.asset)}`), 1);
    assert.equal((await state(first)).preparedAudits, 1);
  });

  await run("concurrent authority requests issue exactly once", async () => {
    const intent = await prepared("race-authority");
    await a.query("BEGIN");
    const first = await a.scalar(claimSql(intent));
    const pending = settled(b.scalar(claimSql(intent)));
    await awaitBlocked();
    await a.query("COMMIT");
    const second = await valueOf(pending);
    assert.equal(first.outcome, "issued");
    assert.equal(second.outcome, "already_issued");
    assert.equal(second.issuedAt, first.issuedAt);
    assert.equal(second.authorityExpiresAt, first.authorityExpiresAt);
    const result = await unpublishedState(intent, "prepared", "not_needed", "pending");
    assert.equal(result.issuedAudits, 1);
  });

  await run("cancellation after issuance retains cleanup responsibility", async () => {
    const intent = await prepared("race-issue-then-cancel");
    await a.query("BEGIN");
    assert.equal((await a.scalar(claimSql(intent))).outcome, "issued");
    const pending = settled(b.scalar(closeSql(intent)));
    await awaitBlocked();
    await a.query("COMMIT");
    assert.equal((await valueOf(pending)).status, "cancelled");
    const result = await unpublishedState(intent, "cancelled", "pending", "failed");
    assert.ok(result.issuedAt);
    assert.equal(result.issuedAudits, 1);
  });

  await run("cancellation before issuance prevents new authority", async () => {
    const intent = await prepared("race-cancel-then-issue");
    await a.query("BEGIN");
    await a.scalar(closeSql(intent));
    const pending = settled(b.scalar(claimSql(intent)));
    await awaitBlocked();
    await a.query("COMMIT");
    assert.equal((await valueOf(pending)).outcome, "terminal");
    const result = await unpublishedState(intent, "cancelled", "not_needed", "failed");
    assert.equal(result.issuedAt, null);
    assert.equal(result.issuedAudits, 0);
  });

  await run("concurrent finalizations publish one complete source", async () => {
    const intent = await issued("race-finalize-retry");
    await a.query("BEGIN");
    assert.equal((await a.scalar(finalizeSql(intent))).outcome, "consumed");
    const pending = settled(b.scalar(finalizeSql(intent)));
    await awaitBlocked();
    await a.query("COMMIT");
    assert.equal((await valueOf(pending)).outcome, "already_consumed");
    await committedState(intent);
  });

  await run("winning cancellation fences concurrent finalization", async () => {
    const intent = await issued("race-cancel-then-finalize");
    await a.query("BEGIN");
    await a.scalar(closeSql(intent));
    const pending = settled(b.scalar(finalizeSql(intent)));
    await awaitBlocked();
    await a.query("COMMIT");
    await rejectsWith(pending, "55000");
    await unpublishedState(intent, "cancelled", "pending", "failed");
  });

  await run("winning finalization cannot become an abandoned upload", async () => {
    const intent = await issued("race-finalize-then-cancel");
    await a.query("BEGIN");
    await a.scalar(finalizeSql(intent));
    const pending = settled(b.scalar(closeSql(intent)));
    await awaitBlocked();
    await a.query("COMMIT");
    assert.equal((await valueOf(pending)).status, "consumed");
    await committedState(intent);
  });

  await run("provider file uniqueness rolls back the losing publication", async () => {
    const first = await issued("race-file-first");
    const second = await issued("race-file-second");
    second.fileId = first.fileId;
    await a.query("BEGIN");
    await a.scalar(finalizeSql(first));
    const pending = settled(b.scalar(finalizeSql(second)));
    await awaitBlocked();
    await a.query("COMMIT");
    await rejectsWith(pending, "23505");
    await committedState(first);
    const result = await unpublishedState(second, "prepared", "not_needed", "pending");
    assert.equal(result.issuedAudits, 1);
  });

  await run("rolled-back provider binding releases the waiting publication", async () => {
    const first = await issued("race-file-rollback-first");
    const second = await issued("race-file-rollback-second");
    second.fileId = first.fileId;
    await a.query("BEGIN");
    await a.scalar(finalizeSql(first));
    const pending = settled(b.scalar(finalizeSql(second)));
    await awaitBlocked();
    await a.query("ROLLBACK");
    assert.equal((await valueOf(pending)).outcome, "consumed");
    await unpublishedState(first, "prepared", "not_needed", "pending");
    await committedState(second);
  });

  await run("cleanup workers skip an owned lease without blocking", async () => {
    const intent = await issued("race-cleanup-workers");
    await a.scalar(closeSql(intent));
    // Move only this synthetic queue deadline. Never disable identity guards,
    // and leave all constraints, issuance and provider authority untouched.
    await observer.query("BEGIN");
    try {
      await observer.query(`update public.media_imagekit_upload_lifecycle set cleanup_after=clock_timestamp()-interval '1 minute' where intent_id=${literal(intent.id)}::uuid`);
      await observer.query("COMMIT");
    } catch (error) {
      await observer.query("ROLLBACK");
      throw error;
    }
    await a.query("BEGIN");
    const first = await a.scalar(cleanupSql("worker-a"));
    assert.equal(first.length, 1);
    assert.equal(first[0].intentId, intent.id);
    // This awaited query must finish while A remains open. A bounded runtime
    // statement timeout fails the test if SKIP/try-lock behavior regresses.
    assert.deepEqual(await b.scalar(cleanupSql("worker-b")), []);
    const during = await state(intent);
    assert.equal(during.cleanup, "pending", "Observer cannot see A's uncommitted lease");
    await a.query("COMMIT");
    assert.deepEqual(await b.scalar(cleanupSql("worker-b")), []);
    const after = await unpublishedState(intent, "cancelled", "leased", "failed");
    assert.equal(after.attempts, 1);
    assert.equal(after.leaseId, first[0].leaseId);
    assert.equal(await observer.scalar(`select to_jsonb(count(*)) from public.audit_logs where action='imagekit_cleanup_claimed' and record_id=${literal(intent.id)}`), 1);
  });

  await run("concurrent cleanup observations consume a lease only once", async () => {
    const intent = await issued("race-cleanup-finish-retry");
    await a.scalar(closeSql(intent));
    // Fixture-only scheduling: no provider files and no guard bypasses.
    await observer.query(`update public.media_imagekit_upload_lifecycle set cleanup_after=clock_timestamp()-interval '1 minute' where intent_id=${literal(intent.id)}::uuid`);
    const claimed = await a.scalar(cleanupSql("finish-worker"));
    assert.equal(claimed.length, 1);
    const lease = claimed[0];
    assert.equal(lease.intentId, intent.id);
    await a.query("BEGIN");
    const first = await a.scalar(finishCleanupSql(intent, lease, "finish-worker", "absent"));
    assert.equal(first.cleanupState, "pending");
    const pending = settled(b.scalar(finishCleanupSql(intent, lease, "finish-worker", "absent")));
    await awaitBlocked();
    const during = await unpublishedState(intent, "cancelled", "leased", "failed");
    assert.equal(during.cleanupObservedAudits, 0);
    await a.query("COMMIT");
    await rejectsWith(pending, "40001");
    const after = await unpublishedState(intent, "cancelled", "pending", "failed");
    assert.equal(after.cleanupObservedAudits, 1);
    assert.equal(after.attempts, 1);
    assert.equal(after.lastCleanupCode, "absent");
    assert.equal(after.leaseId, null);
    assert.equal(after.leaseWorker, null);
    assert.equal(after.leaseExpiresAt, null);
    assert.equal(await observer.scalar(`select to_jsonb(cleanup_after>clock_timestamp()+interval '23 hours') from public.media_imagekit_upload_lifecycle where intent_id=${literal(intent.id)}::uuid`), true);
  });

  await run("reclaimed cleanup lease fences an old worker observation", async () => {
    const intent = await issued("race-cleanup-reclaim-finish");
    await a.scalar(closeSql(intent));
    await observer.query(`update public.media_imagekit_upload_lifecycle set cleanup_after=clock_timestamp()-interval '1 minute' where intent_id=${literal(intent.id)}::uuid`);
    const oldClaims = await a.scalar(cleanupSql("old-finish-worker"));
    assert.equal(oldClaims.length, 1);
    const oldLease = oldClaims[0];
    assert.equal(oldLease.intentId, intent.id);
    // Advance only this synthetic lease deadline, leaving identity guards on.
    await observer.query(`update public.media_imagekit_upload_lifecycle set cleanup_lease_expires_at=clock_timestamp()-interval '1 second' where intent_id=${literal(intent.id)}::uuid`);
    await a.query("BEGIN");
    const freshClaims = await a.scalar(cleanupSql("fresh-finish-worker"));
    assert.equal(freshClaims.length, 1);
    const freshLease = freshClaims[0];
    assert.equal(freshLease.intentId, intent.id);
    assert.notEqual(freshLease.leaseId, oldLease.leaseId);
    const pending = settled(b.scalar(finishCleanupSql(intent, oldLease, "old-finish-worker", "unsafe")));
    await awaitBlocked();
    await a.query("COMMIT");
    await rejectsWith(pending, "40001");
    const after = await unpublishedState(intent, "cancelled", "leased", "failed");
    assert.equal(after.leaseId, freshLease.leaseId);
    assert.equal(after.leaseWorker, "fresh-finish-worker");
    assert.equal(after.leaseExpiresAt, freshLease.leaseExpiresAt);
    assert.equal(after.attempts, 2);
    assert.equal(after.lastCleanupCode, null);
    assert.equal(after.cleanupObservedAudits, 0);
    const finished = await a.scalar(finishCleanupSql(intent, freshLease, "fresh-finish-worker", "retry"));
    assert.equal(finished.cleanupState, "pending");
    const final = await unpublishedState(intent, "cancelled", "pending", "failed");
    assert.equal(final.cleanupObservedAudits, 1);
    assert.equal(final.attempts, 2);
    assert.equal(final.lastCleanupCode, "retry");
    assert.equal(final.leaseId, null);
    assert.equal(final.leaseWorker, null);
    assert.equal(final.leaseExpiresAt, null);
  });

  await run("late finalization cannot resurrect concurrently trashed media", async () => {
    const intent = await issued("race-trash-finalize");
    await a.scalar(finalizeSql(intent));
    const version = await observer.scalar(`select to_jsonb(updated_at) from public.media_assets where id=${literal(intent.asset)}`);
    await a.query("BEGIN");
    const trash = await a.scalar(`select public.mutate_media_asset_v2(${literal(intent.asset)},${literal(version)}::timestamptz,${literal(actor)}::uuid,'trash',null,null)`);
    assert.equal(trash.outcome, "trashed");
    const pending = settled(b.scalar(finalizeSql(intent)));
    await awaitBlocked();
    await a.query("COMMIT");
    assert.equal((await valueOf(pending)).outcome, "already_consumed");
    const result = await committedState(intent);
    assert.ok(result.assetDeleted);
  });

  return passed;
}
