// Disposable, single-connection PostgreSQL WASM. No .env, hosted database,
// credentials, ImageKit calls or persistent writes. This is NOT a race test.
// Usage: node scripts/test-imagekit-observation-admission.mjs <PGlite dist/index.js>
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { installFixture } from "./imagekit-concurrency/fixture.mjs";

process.on("uncaughtException", error => {
  console.error(error.name, error.message, error.code ?? "", error.where ?? "");
  if (error.actual instanceof Error) console.error(error.actual.message, error.actual.code ?? "");
  console.error(error.stack?.split("\n").filter(line => line.includes("test-imagekit-observation-admission.mjs")).join("\n") ?? "");
  process.exit(1);
});
if (process.argv.length!==3) throw new Error("Pass one local @electric-sql/pglite/dist/index.js path.");
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const migration = await readFile(new URL("../supabase/migrations/0052_imagekit_observation_admission.sql", import.meta.url),"utf8");
const checks = await readFile(new URL("../supabase/checks/0052_imagekit_observation_admission.sql", import.meta.url),"utf8");
const scalar = async (sql,args=[]) => Object.values((await db.query(sql,args)).rows[0])[0];
const reject = (operation,code) => assert.rejects(operation,error=>error.code===code);
const owner="00000000-0000-4000-8000-000000000001";
const admin="00000000-0000-4000-8000-000000000002";
const inactive="00000000-0000-4000-8000-000000000003";
const secondOwner="00000000-0000-4000-8000-000000000004";
let sequence=200;
const uuid=()=>`00000000-0000-4000-8000-${String(++sequence).padStart(12,"0")}`;
const account="fixture_artist", binding="a".repeat(64);
const url=name=>`https://ik.imagekit.io/${name}`;
const params=(approval,actor=admin,name=account,digest=binding)=>[actor,name,url(name),digest,approval.revision,"fixture-worker"];
const read=(actor=admin,name=account,digest=binding)=>scalar("select public.get_imagekit_observation_approval_v1($1,$2,$3,$4)",[actor,name,url(name),digest]);
const approve=(name=account,digest=binding,actor=owner,interval="1 hour")=>scalar(`select public.approve_imagekit_observation_account_v1($1,$2,$3,$4,clock_timestamp()+$5::interval)`,[actor,name,url(name),digest,interval]);
const revoke=(approval,actor=owner,name=account)=>scalar("select public.revoke_imagekit_observation_account_v1($1,$2,$3)",[actor,name,approval.revision]);
const claim=(approval,actor=admin,name=account,digest=binding)=>db.query("select * from public.claim_imagekit_observation_v1($1,$2,$3,$4,$5,$6)",params(approval,actor,name,digest)).then(result=>result.rows.map(row=>Object.values(row)[0]));
const finish=(approval,lease,result="absent",name=account,actor=admin)=>scalar("select public.finish_imagekit_observation_v1($1,$2,$3,$4,$5,$6,$7,$8,$9)",[...params(approval,actor,name),lease.intentId,lease.leaseId,result]);
const all=()=>scalar(`select jsonb_build_object(
  'approvals',(select coalesce(jsonb_agg(to_jsonb(t) order by storage_container),'[]') from public.media_imagekit_observation_accounts t),
  'intents',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.media_upload_intents t),
  'lifecycle',(select coalesce(jsonb_agg(to_jsonb(t) order by intent_id),'[]') from public.media_imagekit_upload_lifecycle t),
  'objects',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.media_physical_objects t),
  'assets',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.media_assets t),
  'audit',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.audit_logs t))`);
try {
  await reject(()=>db.exec(migration),"55000"); await db.exec("rollback");
  await installFixture({execSql:sql=>db.exec(sql.replace("create extension if not exists pgcrypto;",""))});
  await db.query("insert into auth.users values($1),($2),($3)",[admin,inactive,secondOwner]);
  await db.query(`insert into public.admin_profiles(user_id,email,role,is_active) values
    ($1,'admin@example.test','admin',true),($2,'inactive@example.test','owner',false),($3,'second@example.test','owner',true)`,[admin,inactive,secondOwner]);
  const originalFunctions=await scalar("select jsonb_agg(jsonb_build_object('oid',oid,'source',pg_get_functiondef(oid)) order by oid) from pg_proc where pronamespace='public'::regnamespace and prokind='f'");
  await db.exec(migration);
  assert.deepEqual(await scalar("select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.media_imagekit_observation_accounts t"),[]);
  assert.equal(await read(),null);
  const noApproval=await all();
  await reject(()=>claim({revision:uuid()}),"42501"); assert.deepEqual(await all(),noApproval);
  for(const actor of [admin,inactive]) await reject(()=>approve(account,binding,actor),"42501");
  for(const interval of ["0 seconds","20 seconds","25 hours"]) await reject(()=>approve(account,binding,owner,interval),"22023");
  await reject(()=>approve(account,"A".repeat(64)),"22023");
  await reject(()=>scalar("select public.approve_imagekit_observation_account_v1($1,$2,$3,$4,clock_timestamp()+interval '1 hour')",[owner,account,"https://other.example.test",binding]),"22023");
  let approval=await approve();
  assert.deepEqual(Object.keys(approval).sort(),["version","storageContainer","urlEndpoint","credentialBinding","revision","expiresAt"].sort());
  assert.equal(approval.version,1); assert.equal(approval.storageContainer,account); assert.equal(approval.credentialBinding,binding);
  const beforeRead=await all(); assert.deepEqual(await read(),approval); assert.deepEqual(await all(),beforeRead);
  assert.equal(await read(admin,account,"b".repeat(64)),null);
  await reject(()=>read(inactive),"42501");
  await db.query("update public.admin_profiles set is_active=false where user_id=$1",[owner]);
  assert.equal(await read(),null); await reject(()=>claim(approval),"42501");
  await db.query("update public.admin_profiles set is_active=true,role='admin' where user_id=$1",[owner]);
  assert.equal(await read(),null); await reject(()=>claim(approval),"42501");
  await db.query("update public.admin_profiles set role='owner' where user_id=$1",[owner]);
  const oldApproval=approval; approval=await approve(); assert.notEqual(approval.revision,oldApproval.revision);
  await reject(()=>claim(oldApproval),"42501"); await reject(()=>revoke(oldApproval),"40001");
  await reject(()=>revoke(approval,admin),"42501");
  const rotated=await approve(account,"b".repeat(64)); assert.equal(await read(),null);
  await reject(()=>claim(rotated),"42501"); approval=await approve();

  const prepare=async name=>{
    const id=uuid(),assetId=`imagekit-${id}`;
    await scalar("select public.prepare_imagekit_upload_v1($1,$2,$3,$4,'image/jpeg',1024,$5,$6,600)",[
      id,assetId,{label:"Synthetic image",alt:"Synthetic portrait",usageKey:"gallery",sortOrder:0,isPublished:false},name,binding,owner]);
    await scalar("select public.claim_imagekit_upload_v1($1,$2)",[id,owner]);
    return id;
  };
  const terminal=async name=>{
    const id=await prepare(name);
    await scalar("select public.close_imagekit_upload_v1($1,$2,'cancelled')",[id,owner]);
    await db.query("update public.media_imagekit_upload_lifecycle set cleanup_after=clock_timestamp()-interval '1 minute' where intent_id=$1",[id]);
    return id;
  };
  const foreign=await terminal("foreign_artist");
  const foreignPrepared=await prepare("foreign_artist");
  await db.exec("alter table public.media_upload_intents disable trigger user");
  await db.query("update public.media_upload_intents set created_at=clock_timestamp()-interval '20 minutes',expires_at=clock_timestamp()-interval '10 minutes' where id=$1",[foreignPrepared]);
  await db.exec("alter table public.media_upload_intents enable trigger user");
  const beforeEmpty=await all(); assert.deepEqual(await claim(approval),[]); assert.deepEqual(await all(),beforeEmpty);
  const own1=await terminal(account),own2=await terminal(account);
  const first=(await claim(approval))[0]; assert.equal(first.intentId,own1);
  assert.equal((await scalar("select to_jsonb(t) from public.media_imagekit_upload_lifecycle t where intent_id=$1",[own2])).cleanup_state,"pending");
  assert.equal((await scalar("select to_jsonb(t) from public.media_upload_intents t where id=$1",[foreignPrepared])).status,"prepared");
  assert.equal((await scalar("select to_jsonb(t) from public.media_imagekit_upload_lifecycle t where intent_id=$1",[foreign])).cleanup_state,"pending");
  const wrongScope={...first,intentId:foreign}; const beforeWrong=await all();
  await reject(()=>finish(approval,wrongScope),"42501"); assert.deepEqual(await all(),beforeWrong);
  const observed=await finish(approval,first); assert.equal(observed.cleanupState,"pending");
  await reject(()=>finish(approval,first),"40001");
  const second=(await claim(approval))[0]; assert.equal(second.intentId,own2);
  await revoke(approval); assert.equal(await read(),null); const revokedState=await all();
  await reject(()=>finish(approval,second),"42501"); await reject(()=>claim(approval),"42501");
  await revoke(approval); assert.deepEqual(await all(),revokedState,"Repeated revoke is idempotent");
  approval=await approve(); await reject(()=>finish(oldApproval,second),"42501");
  const unsafe=await finish(approval,second,"unsafe"); assert.equal(unsafe.cleanupState,"attention");

  await db.query("update public.media_imagekit_observation_accounts set expires_at=clock_timestamp()+interval '20 seconds' where storage_container=$1",[account]);
  await reject(()=>claim(approval),"42501");
  await db.query("update public.media_imagekit_observation_accounts set expires_at=clock_timestamp()+interval '3 seconds' where storage_container=$1",[account]);
  await reject(()=>finish(approval,second),"42501");
  await db.query("update public.media_imagekit_observation_accounts set created_at=clock_timestamp()-interval '2 minutes',expires_at=clock_timestamp()-interval '1 minute' where storage_container=$1",[account]);
  assert.equal(await read(),null);
  approval=await approve();
  const ownPrepared=await prepare(account);
  await db.exec("alter table public.media_upload_intents disable trigger user");
  await db.query("update public.media_upload_intents set created_at=clock_timestamp()-interval '20 minutes',expires_at=clock_timestamp()-interval '10 minutes' where id=$1",[ownPrepared]);
  await db.exec("alter table public.media_upload_intents enable trigger user");
  assert.deepEqual(await claim(approval),[]);
  assert.equal((await scalar("select to_jsonb(t) from public.media_upload_intents t where id=$1",[ownPrepared])).status,"expired");
  assert.equal((await scalar("select to_jsonb(t) from public.media_upload_intents t where id=$1",[foreignPrepared])).status,"prepared");

  for(const role of ["anon","authenticated","service_role"]) {
    await db.exec(`set role ${role}`);
    await reject(()=>db.query("select * from public.media_imagekit_observation_accounts"),"42501");
    await reject(()=>scalar("select public.lock_imagekit_observation_approval_v1($1,$2,$3,$4,$5,35)",[admin,account,url(account),binding,approval.revision]),"42501");
    if(role!=="service_role") await reject(()=>read(),"42501");
    else assert.deepEqual(await read(),approval);
    await db.exec("reset role");
  }
  const beforeRerun=await all(); await db.exec(migration); assert.deepEqual(await all(),beforeRerun);
  const deployment=(await db.query(checks)).rows; assert.equal(deployment.length,9); assert.ok(deployment.every(check=>check.passed===true),JSON.stringify(deployment));
  await db.exec("create policy unexpected_fixture_policy on public.media_imagekit_observation_accounts for select to service_role using(true)");
  assert.equal((await db.query(checks)).rows.find(check=>check.check_name==="imagekit_observation_accounts_private").passed,false);
  await reject(()=>db.exec(migration),"55000");await db.exec("rollback");assert.deepEqual(await all(),beforeRerun);
  assert.equal(await scalar("select count(*) from pg_policy where polrelid='public.media_imagekit_observation_accounts'::regclass"),1);
  await db.exec("drop policy unexpected_fixture_policy on public.media_imagekit_observation_accounts");
  await db.exec("alter table public.media_imagekit_observation_accounts add column unexpected_fixture_column text");
  await reject(()=>db.exec(migration),"55000");await db.exec("rollback");assert.deepEqual(await read(),approval);
  await db.exec("alter table public.media_imagekit_observation_accounts drop column unexpected_fixture_column");
  await db.exec("grant select(storage_container) on public.media_imagekit_observation_accounts to service_role");
  await reject(()=>db.exec(migration),"55000");await db.exec("rollback");
  assert.equal(await scalar("select has_column_privilege('service_role','public.media_imagekit_observation_accounts','storage_container','select')"),true);
  await db.exec("revoke select(storage_container) on public.media_imagekit_observation_accounts from service_role");
  const lifetime=await scalar("select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.media_imagekit_observation_accounts'::regclass and conname='imagekit_observation_account_lifetime'");
  await db.exec("alter table public.media_imagekit_observation_accounts drop constraint imagekit_observation_account_lifetime");
  await db.exec("alter table public.media_imagekit_observation_accounts add constraint imagekit_observation_account_lifetime check(true)");
  await reject(()=>db.exec(migration),"55000");await db.exec("rollback");
  assert.equal(await scalar("select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.media_imagekit_observation_accounts'::regclass and conname='imagekit_observation_account_lifetime'"),"CHECK (true)");
  await db.exec("alter table public.media_imagekit_observation_accounts drop constraint imagekit_observation_account_lifetime");
  await db.exec(`alter table public.media_imagekit_observation_accounts add constraint imagekit_observation_account_lifetime ${lifetime}`);
  assert.deepEqual(await all(),beforeRerun);
  for(const item of originalFunctions) assert.equal(await scalar("select pg_get_functiondef($1::oid)",[item.oid]),item.source,"Existing functions stay byte-for-byte unchanged");
  assert.deepEqual(await scalar("select public.get_imagekit_upload_readiness_v1()"),{version:1,ready:true});
  console.log("PASS 0052 isolated SQL: explicit owner approval, credential/revision binding, expiry/revocation, account isolation, one-candidate claims, fenced finish, private ACL/RLS, 9 checks and preserving rerun. No provider calls.");
} finally { await db.close(); }
