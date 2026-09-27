// Real multi-session PostgreSQL in a new network-less/tmpfs Docker container.
// Reuses the ownership-checked runtime; never connects to any existing DB,
// loads credentials, calls ImageKit, mounts host paths or publishes a port.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRuntime } from "./imagekit-concurrency/runtime.mjs";
import { installFixture } from "./imagekit-concurrency/fixture.mjs";

if(process.argv.length!==2) throw new Error("No database/container/provider arguments accepted.");
let runtime;
try {
  runtime=await createRuntime();
  await installFixture(runtime);
  const migration=await readFile(new URL("../supabase/migrations/0052_imagekit_observation_admission.sql",import.meta.url),"utf8");
  await runtime.execSql(migration);
  const observer=await runtime.session(), a=await runtime.session({serviceRole:true}), b=await runtime.session({serviceRole:true});
  assert.equal(new Set([a.pid,b.pid,observer.pid]).size,3);
  const owner="00000000-0000-4000-8000-000000000001", admin="00000000-0000-4000-8000-000000000002", secondOwner="00000000-0000-4000-8000-000000000003";
  await observer.query(`insert into auth.users(id) values('${admin}'),('${secondOwner}')`);
  await observer.query(`insert into public.admin_profiles(user_id,email,role,is_active) values('${admin}','admin@example.test','admin',true),('${secondOwner}','second@example.test','owner',true)`);
  let sequence=3000,passed=0;
  const q=value=>`'${String(value).replaceAll("'","''")}'`;
  const hash="a".repeat(64),url=account=>`https://ik.imagekit.io/${account}`;
  const approve=(account,interval="1 hour")=>`select public.approve_imagekit_observation_account_v1('${owner}',${q(account)},${q(url(account))},'${hash}',clock_timestamp()+${q(interval)}::interval)`;
  const args=(account,approval,worker="fixture-worker")=>`'${admin}',${q(account)},${q(url(account))},'${hash}',${q(approval.revision)},${q(worker)}`;
  const claim=(account,approval,worker)=>`select coalesce(jsonb_agg(t),'[]'::jsonb) from public.claim_imagekit_observation_v1(${args(account,approval,worker)}) t`;
  const finish=(account,approval,lease,result="absent")=>`select public.finish_imagekit_observation_v1(${args(account,approval)},${q(lease.intentId)},${q(lease.leaseId)},${q(result)})`;
  const revoke=(account,approval)=>`select public.revoke_imagekit_observation_account_v1('${owner}',${q(account)},${q(approval.revision)})`;
  const intent=async account=>{
    const id=`00000000-0000-4000-8000-${String(++sequence).padStart(12,"0")}`,asset=`imagekit-${id}`;
    const metadata={label:"Synthetic race photo",alt:"Fictional photo",usageKey:"gallery",sortOrder:0,isPublished:false};
    await a.scalar(`select public.prepare_imagekit_upload_v1('${id}','${asset}',${q(JSON.stringify(metadata))}::jsonb,${q(account)},'image/jpeg',1024,'${hash}','${owner}',600)`);
    await a.scalar(`select public.claim_imagekit_upload_v1('${id}','${owner}')`);
    await a.scalar(`select public.close_imagekit_upload_v1('${id}','${owner}','cancelled')`);
    await observer.query(`update public.media_imagekit_upload_lifecycle set cleanup_after=clock_timestamp()-interval '1 minute' where intent_id='${id}'`);
    return id;
  };
  const state=id=>observer.scalar(`select jsonb_build_object('intent',to_jsonb(i),'lifecycle',to_jsonb(l),'audits',
    (select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.audit_logs t where record_id=i.id::text))
    from public.media_upload_intents i join public.media_imagekit_upload_lifecycle l on l.intent_id=i.id where i.id='${id}'`);
  const settled=promise=>promise.then(value=>({value}),error=>({error}));
  const value=async pending=>{const result=await pending;if(result.error) throw result.error;return result.value;};
  const fails=async(pending,code)=>{const result=await pending;assert.equal(result.error?.code,code);};
  const blocked=async(blocker=a.pid,target=b.pid)=>{
    const deadline=Date.now()+6000;
    while(Date.now()<deadline){
      if((await observer.scalar(`select to_jsonb(pg_blocking_pids(${target}))`)).includes(blocker)) return;
      await new Promise(resolve=>setTimeout(resolve,25));
    }
    assert.fail(`Backend ${target} did not block on ${blocker}`);
  };
  const run=async(name,test)=>{
    try{await test();passed++;console.log(`PASS ${name}`);}
    finally{for(const session of [a,b]){await session.idle();await session.query("ROLLBACK");}}
  };

  await run("revocation committed before waiting claim blocks all lease/audit writes",async()=>{
    const account="race_revoke_first",approval=await a.scalar(approve(account)),id=await intent(account),before=await state(id);
    await a.query("BEGIN");await a.scalar(revoke(account,approval));
    const pending=settled(b.scalar(claim(account,approval)));await blocked();await a.query("COMMIT");
    await fails(pending,"42501");assert.deepEqual(await state(id),before);
  });
  await run("claim holds approval lock until commit; later revocation blocks finish",async()=>{
    const account="race_claim_first",approval=await a.scalar(approve(account)),id=await intent(account);
    await a.query("BEGIN");const lease=(await a.scalar(claim(account,approval)))[0];assert.equal(lease.intentId,id);
    const pending=settled(b.scalar(revoke(account,approval)));await blocked();await a.query("COMMIT");await value(pending);
    const before=await state(id);await fails(settled(a.scalar(finish(account,approval,lease))),"42501");assert.deepEqual(await state(id),before);
  });
  await run("reapproval committed before waiting finish invalidates old revision without observation",async()=>{
    const account="race_reapprove_first",approval=await a.scalar(approve(account)),id=await intent(account),lease=(await a.scalar(claim(account,approval)))[0];
    const before=await state(id);await a.query("BEGIN");const next=await a.scalar(approve(account));assert.notEqual(next.revision,approval.revision);
    const pending=settled(b.scalar(finish(account,approval,lease)));await blocked();await a.query("COMMIT");
    await fails(pending,"42501");assert.deepEqual(await state(id),before);
  });
  await run("finish holds approval lock against reapproval; exactly one fenced observation",async()=>{
    const account="race_finish_first",approval=await a.scalar(approve(account)),id=await intent(account),lease=(await a.scalar(claim(account,approval)))[0];
    await a.query("BEGIN");assert.equal((await a.scalar(finish(account,approval,lease))).cleanupState,"pending");
    const pending=settled(b.scalar(approve(account)));await blocked();await a.query("COMMIT");await value(pending);
    const result=await state(id);assert.equal(result.lifecycle.cleanup_state,"pending");
    assert.equal(result.audits.filter(item=>item.action==="imagekit_cleanup_observed").length,1);
  });
  await run("inactive approver committed while claim waits on profile rejects claim",async()=>{
    const account="race_owner_disable",approval=await a.scalar(approve(account)),id=await intent(account),before=await state(id);
    await observer.query("BEGIN");await observer.query(`update public.admin_profiles set is_active=false where user_id='${owner}'`);
    const pending=settled(b.scalar(claim(account,approval)));await blocked(observer.pid);await observer.query("COMMIT");
    await fails(pending,"42501");assert.deepEqual(await state(id),before);
    await observer.query(`update public.admin_profiles set is_active=true where user_id='${owner}'`);
  });
  await run("approval expiry while finish waits on intent lock is rechecked after lock",async()=>{
    const account="race_expiry_lock",approval=await a.scalar(approve(account)),id=await intent(account),lease=(await a.scalar(claim(account,approval)))[0];
    await a.query("BEGIN");await a.scalar(`select public.resolve_imagekit_upload_v1('${id}','${owner}')`);
    await observer.query(`update public.media_imagekit_observation_accounts set expires_at=clock_timestamp()+interval '8 seconds' where storage_container=${q(account)}`);
    const before=await state(id),pending=settled(b.scalar(finish(account,approval,lease)));await blocked();
    await observer.query("select pg_sleep(9)");await a.query("COMMIT");await fails(pending,"42501");assert.deepEqual(await state(id),before);
  });
  await run("two scoped claims never lease the same intent twice",async()=>{
    const account="race_duplicate_claim",approval=await a.scalar(approve(account)),id=await intent(account);
    await a.query("BEGIN");const first=(await a.scalar(claim(account,approval,"worker-a")))[0];
    assert.equal(first.intentId,id);assert.deepEqual(await b.scalar(claim(account,approval,"worker-b")),[]);
    await a.query("COMMIT");const result=await state(id);assert.equal(result.lifecycle.cleanup_attempts,1);
    assert.equal(result.audits.filter(item=>item.action==="imagekit_cleanup_claimed").length,1);
  });
  await run("concurrent unrelated account work cannot be claimed or expired",async()=>{
    const account="race_scope_local",other="race_scope_foreign",approval=await a.scalar(approve(account)),id=await intent(other),before=await state(id);
    assert.deepEqual(await b.scalar(claim(account,approval)),[]);assert.deepEqual(await state(id),before);
  });
  const checks=(await runtime.execSql(await readFile(new URL("../supabase/checks/0052_imagekit_observation_admission.sql",import.meta.url),"utf8"))).split(/\r?\n/);
  assert.equal(checks.length,9);assert.ok(checks.every(line=>line.endsWith("|t")));
  assert.deepEqual(await a.scalar("select public.get_imagekit_upload_readiness_v1()"),{version:1,ready:true});
  console.log(`PASS ${passed} real multi-session admission scenarios and all 9 deployment checks.`);
} catch(error){console.error(error.stack??error.message);process.exitCode=1;}
finally{if(runtime){try{await runtime.cleanup();}catch(error){console.error(`CLEANUP FAILED: ${error.message}`);process.exitCode=1;}}}
