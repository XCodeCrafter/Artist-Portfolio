// Isolated real PostgreSQL checks. Uses an existing PGlite installation only;
// no network, project credentials, or remote database access.
// node scripts/test-admin-hardening-migration.mjs C:/Temp/sql-test/node_modules/@electric-sql/pglite/dist/index.js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

if (!process.argv[2]) throw new Error("Pass a local @electric-sql/pglite/dist/index.js path.");
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const user = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const session = "33333333-3333-4333-8333-333333333333";
const expired = "44444444-4444-4444-8444-444444444444";
const old = "55555555-5555-4555-8555-555555555555";
const newest = "66666666-6666-4666-8666-666666666666";
const used = "77777777-7777-4777-8777-777777777777";
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth;
  create table auth.users(id uuid primary key, email text);
  create table auth.sessions(id uuid primary key, user_id uuid references auth.users, not_after timestamptz);
  create table public.admin_profiles(user_id uuid primary key references auth.users, email text, role text, is_active boolean);
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
  $$;
  create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid; $$;
  insert into auth.users values ('${user}', 'owner@example.com'), ('${other}', 'other@example.com');
  insert into public.admin_profiles values ('${user}', 'owner@example.com', 'owner', true), ('${other}', 'other@example.com', 'admin', true);
  insert into auth.sessions values ('${session}', '${user}', null), ('${expired}', '${user}', now() - interval '1 minute');
`);
await db.exec(await readFile(new URL("../supabase/migrations/0015_admin_auth_hardening.sql", import.meta.url), "utf8"));
await db.exec(`
  insert into public.admin_recovery_challenges(id,user_id,token_hash,session_hash,expires_at,created_at,used_at) values
    ('${old}', '${user}', repeat('1',64), repeat('2',64), now()+interval '10 minutes', now()-interval '2 minutes', null),
    ('${newest}', '${user}', repeat('3',64), repeat('4',64), now()+interval '10 minutes', now()-interval '1 minute', null),
    ('${used}', '${user}', repeat('5',64), repeat('6',64), now()+interval '10 minutes', now(), now());
  create table public.private_content(id int);
  insert into public.private_content values (1);
  alter table public.private_content enable row level security;
  grant select on public.private_content to authenticated;
  create policy admin_only on public.private_content for select to authenticated using (public.is_admin());
`);
const migration = await readFile(new URL("../supabase/migrations/0038_admin_session_hardening.sql", import.meta.url), "utf8");
await db.exec(migration);
await db.exec(migration);
const scalar = async (sql, params = []) => Object.values((await db.query(sql, params)).rows[0])[0];
assert.equal(await scalar("select count(*)::int from auth.sessions"), 2, "Migration must preserve sessions");
assert.deepEqual((await db.query("select id from public.admin_recovery_challenges")).rows, [{ id: newest }]);
const checks = await db.query(await readFile(new URL("../supabase/checks/0038_admin_session_hardening.sql", import.meta.url), "utf8"));
for (const row of checks.rows) assert.equal(row.passed, true, row.check_name);

await db.exec("set role service_role");
assert.equal(await scalar("select public.is_admin_session_active($1,$2)", [user, session]), true);
assert.equal(await scalar("select public.is_admin_session_active($1,$2)", [other, session]), false);
assert.equal(await scalar("select public.is_admin_session_active($1,$2)", [user, expired]), false);
const issue = async (id, hash) => scalar(
  "select public.issue_admin_recovery_challenge($1,$2,$3,now()+interval '10 minutes')",
  [id, hash, "f".repeat(64)]
);
const replacement = await issue(user, "a".repeat(64));
assert.notEqual(replacement, newest);
assert.equal(await scalar("select count(*)::int from public.admin_recovery_challenges where user_id=$1", [user]), 1);
await issue(other, "b".repeat(64));
await assert.rejects(issue(user, "b".repeat(64)), { code: "23505" });
assert.equal(await scalar("select id from public.admin_recovery_challenges where user_id=$1", [user]), replacement,
  "A failed replacement must roll back its deletion");
await assert.rejects(issue(user, "bad-hash"), { code: "22023" });
await assert.rejects(db.query("select public.issue_admin_recovery_challenge($1,$2,$3,now()+interval '1 day')", [user, "c".repeat(64), "d".repeat(64)]), { code: "22023" });
await assert.rejects(db.query("insert into public.admin_recovery_challenges(user_id,token_hash,session_hash,expires_at) values($1,$2,$3,now())", [user, "c".repeat(64), "d".repeat(64)]), { code: "23505" });
await db.exec("reset role");
await db.query("update public.admin_profiles set is_active=false where user_id=$1", [other]);
await db.exec("set role service_role");
await assert.rejects(issue(other, "c".repeat(64)), { code: "42501" });

const setClaims = async (overrides = {}) => db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({
  sub: user, email: "owner@example.com", aal: "aal2", session_id: session, ...overrides,
})]);
await db.exec("reset role; set role authenticated");
await setClaims();
assert.equal(await scalar("select count(*)::int from public.private_content"), 1);
for (const overrides of [{ aal: "aal1" }, { session_id: expired }, { session_id: null }, { session_id: "invalid" }, { email: "forged@example.com" }]) {
  await setClaims(overrides);
  assert.equal(await scalar("select count(*)::int from public.private_content"), 0);
}
await setClaims();
await assert.rejects(db.query("select public.is_admin_session_active($1,$2)", [user, session]), { code: "42501" });
await assert.rejects(issue(user, "c".repeat(64)), { code: "42501" });
await assert.rejects(db.query("select * from public.admin_recovery_challenges"), { code: "42501" });
await db.exec("reset role; set role service_role");
await db.query("select public.revoke_admin_user_sessions($1)", [user]);
assert.equal(await scalar("select public.is_admin_session_active($1,$2)", [user, session]), false);
await db.exec("reset role; set role authenticated");
assert.equal(await scalar("select count(*)::int from public.private_content"), 0,
  "Replaying the same valid AAL2 claims after revocation must be denied by RLS");
await db.exec("reset role; set role anon");
await assert.rejects(db.query("select public.is_admin_session_active($1,$2)", [user, session]), { code: "42501" });
await assert.rejects(issue(user, "c".repeat(64)), { code: "42501" });

console.log("Admin 0038 PostgreSQL: rerun preservation, recovery uniqueness/rollback/expiry, private grants, live session binding and revoked-token RLS replay passed.");
await db.close();
