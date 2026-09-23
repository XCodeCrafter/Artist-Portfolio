# Batch 13G — isolated acceptance preparation

Checkpoint: 2026-09-22. The local stack and fictional app are now **running**;
the owner completed login and the browser renders the AAL2-protected V2 dashboard.
This is not a passed live save/upload/recovery acceptance gate. No new production
SQL migration is required by this acceptance harness.
Classic remains available; 13H still requires acceptance and owner approval.

## What is isolated

- `npm run acceptance:prepare` creates a new UUID-named directory under the OS
  user's temporary directory. It never resets, deletes or reuses an older run.
- The shadow app copies tracked application inputs from the current working
  tree, including `styles/`, but excludes `.env*`, `.git`, `.next`, provider
  credentials and original public media. It shares installed `node_modules`
  through a checked junction; it has its own build output. Do not run npm install
  in the shadow app because that dependency directory is shared.
- Two generated geometric PNGs replace artist media. All six Heroes use an
  image. Showreel has no clips yet; video acceptance remains pending.
- A copied local-only migration sequence preserves every original SQL file's
  bytes. Copies receive sortable timestamps to insert a fictional bootstrap
  immediately after 0001. This supplies the singleton required before 0045.
  The final fictional seed runs only on the marked fresh database, before an
  Auth user is created. **Never copy these local migrations into production.**
- A private per-workspace database marker is RLS-protected and service-role-read
  only. The launcher checks this marker, exact loopback URL, local JWT metadata,
  enabled email sign-in and closed signup/anonymous sign-ins before starting Next.
  JWT parsing alone is not proof of database identity. Preflight uses direct loopback HTTP without
  environment HTTP proxies or redirects; errors do not reveal keys/responses.
- Next receives only basic OS variables and explicit local settings. No Resend,
  ImageKit, R2, Vercel, hosted Supabase or parent `NODE_OPTIONS` configuration is
  inherited. A fresh auth security secret is generated in memory on each start.
  Restarting therefore invalidates fixture recovery proofs/rate-limit hashes.

This is **production credential/write-target isolation, not an offline sandbox**.
The app still requests Google Fonts. Its existing development fallback may show
bundled demo copy/links if the local database fails; original owner media files
are not copied. Stop and fix any local DB errors before treating UI results as
fixture acceptance. No production security guard is loosened for this harness.

| Surface | Dedicated address |
| --- | --- |
| Fictional app | `http://127.0.0.1:3101` |
| Supabase API | `http://127.0.0.1:55431` |
| Postgres / shadow | `127.0.0.1:55432` / `127.0.0.1:55430` |
| Studio | `http://127.0.0.1:55433` |
| Local test email | `http://127.0.0.1:55434` |

Ports 3000/3001 are untouched. Use **127.0.0.1**, not localhost, for the fixture
app: browser cookies are host-scoped, not port-scoped. Do not run another admin
test application on that same host while checking auth/cookies.

## Current runtime and next action

The owner started Docker Desktop successfully. Elevated read-only inspection
confirmed Linux Engine 28.3.2 / Desktop 4.43.2. The original unprivileged probe
was denied by the sandbox, not evidence that Docker was stopped; `doctor` now
distinguishes those states. Official CLI 2.117.0 was installed in npm's npx cache,
without adding project dependencies or installing a global CLI on PATH.

Current workspace (no secrets are stored in this repository):
`%TEMP%/portfolio-acceptance-995ddf824f63/0a8361f7-0fd5-4e5a-b50a-088e5000c68c`.
`local-owner.json` there holds the generated test password for `owner@portfolio.test`.
`local-status.json` holds only that local stack's keys. Do not paste either file.

Login handoff completed: owner confirmed success and the browser visibly renders
`http://127.0.0.1:3101/admin/v2` with the fictional artist. The unchanged layout
requires AAL2. No factor secret was read or modified by the agent. Keep the
separate test factor; do not use or replace the real owner's existing factor.

### Local login-provider correction (2026-09-22)

The reported `Invalid admin credentials` was not a wrong password: real GoTrue
returned `422 email_provider_disabled`. In CLI 2.117.0,
`[auth.email].enable_signup = false` disables the email provider itself. The
fixture template now keeps that flag **true**, while global
`[auth].enable_signup = false` and anonymous sign-ins remain disabled. Startup
and provisioning now require `external.email === true` as well as closed signup.

Only the verified fixture Auth container was replaced with identical settings
except `GOTRUE_EXTERNAL_EMAIL_ENABLED=true`; its stopped original is retained as
`supabase_auth_artist-portfolio-acceptance-email-disabled-backup` with restart
disabled. Do not restart it. No password, DB volume or production setting changed.
The already-verified workspace received the exact reviewed config template and
only its corresponding manifest hash was updated after byte-equality validation;
this controlled fixture repair is not permission to bypass integrity checks.

Real password authentication with the unchanged fixture credential returned 200.
Only that diagnostic session was signed out (204), and a negative registration
probe was rejected with `signup_disabled`. Browser TOTP/editor acceptance remains
separate from this diagnostic. The owner subsequently completed browser login,
and the protected V2 dashboard was observed successfully.

`npm run acceptance:doctor` is read-only and exits nonzero if Docker/CLI cannot
be verified. A cached CLI can work while the PATH-only check still says missing.
It does not download packages or start services.

## Guarded startup runbook (after prerequisites)

Follow the [official Supabase local-development setup](https://supabase.com/docs/guides/local-development)
for a current CLI and container engine. The CLI must be available as `supabase`
for the commands below. Local Docker volumes/images consume local disk; this
preparation does not copy the hosted database or its media.

From the original repo:

```powershell
npm run acceptance:doctor
npm run acceptance:prepare
```

Keep the generated path printed by `prepare`. In PowerShell assign that exact
path to `$acceptanceDir` (not a repo path). Verify ports 3101 and 55430–55434 are
unused; stop if another service owns them. Only one dedicated stack can run at
a time. Creating another workspace does not authorize stopping/removing an
existing stack or its data.

Local Supabase must bind to loopback, not the LAN. Create a dedicated bridge:

```powershell
docker network create --driver bridge --opt com.docker.network.bridge.host_binding_ipv4=127.0.0.1 portfolio-acceptance-loopback
docker network inspect portfolio-acceptance-loopback --format '{{json .Options}}'
```

If the network already exists, inspect it rather than deleting/recreating it.
Proceed only when `com.docker.network.bridge.host_binding_ipv4` is `127.0.0.1`.
Then, **using the generated directory, never the repository's Supabase project**:

```powershell
supabase --workdir "$acceptanceDir" start --network-id portfolio-acceptance-loopback
```

**Mandatory actual-port check:** inspect the project's running containers and
their published addresses before capturing credentials or creating an account.
On the tested Desktop version the network option was present, yet ports actually
bound to `0.0.0.0` / `[::]`. All four exposed fixture services were stopped
immediately, before account creation. Merely seeing the driver option is not
proof of isolation. See the [Docker port-publishing documentation](https://docs.docker.com/engine/network/port-publishing/).

The one-time Windows fallback `scripts/acceptance/rebind.mjs` was executed on
those exact stopped containers. It checks project/workspace labels, names,
network, mount/port shapes and stopped state; retains writable-layer snapshots
and the existing DB volume; preserves originals as stopped `-unbound-backup`
containers with restart disabled; and explicitly publishes replacements on
127.0.0.1. Every actual published address was verified after startup. Nothing
was deleted, no daemon/firewall/security setting changed, and no hosted project
was accessed. Do not restart those unbound backups or push their snapshot images.
Do not rerun this one-time fallback against the current repaired stack.

Both provisioning and app startup now independently read-check **actual**
Docker port bindings (including unexpected running project-labelled backups),
not only network options or status URLs. The runtime binding probe currently
targets the Windows Docker Desktop Linux-engine socket; other platforms need
an equivalent explicit check before use. Restricted access must be approved,
not worked around by disabling the check.

Treat generated `local-status.json` as a local secret file: do not paste, attach, commit or
copy it to the project. The launcher accepts only local demo JWT credentials and
an API identity matching this workspace; it refuses a linked `project-ref`,
altered tracked inputs, environment files or unexpected file links. Credentials
are never supplied as command-line arguments.

The copied `next-env.d.ts` is deliberately omitted: Next creates its own dev
declarations. If Next or a developer changes another hashed input, prepare a
fresh workspace rather than editing its manifest to bypass the check. Do not
rerun the seed after account creation. Do not use `db push`, `link`, production
reset commands or migration-history repair for this test setup.

### Test owner provisioning (completed in the current workspace)

The guarded helper is:

```powershell
node scripts/acceptance/provision.mjs "$acceptanceDir" "<absolute verified supabase.exe path>"
npm run acceptance:start -- "$acceptanceDir"
```

Do **not** rerun provisioning in the current workspace. It already created a
confirmed Auth user `owner@portfolio.test`, matching active owner profile, and
the `portfolio-acceptance-media` bucket (100 MiB and the app's allowed MIME list).
It captures local CLI status privately after identity/port checks, refuses any
existing credential files/accounts, and exclusively saves a random password
before user creation so partial failures remain recoverable. Errors never
trigger deletion, overwrite or mutation retries. It does not enroll MFA or
manufacture an AAL2 session. Recovery emails stay in local mail capture.

No account or credential from production was modified. Password authentication
passed against real GoTrue; the owner then completed browser login through the
AAL2 gate. Save/reload and recovery remain pending. Authenticator setup was handed
to the owner, not bypassed by browser automation.

## Acceptance matrix and limits

- [x] Start the real Docker/Supabase stack; verify actual loopback port bindings,
      all 72 schema checks, confirmed owner profile and bucket setup.
- [x] Browser login page renders fictional identity/media; unauthenticated
      `/admin/v2` redirects to `/admin/login`. Source integrity remains valid
      after Next's first compilation.
- [x] Owner completes login with the prepared local owner; browser renders the
      AAL2-protected dashboard. No agent-created factor or bypass session.
- [ ] Save/reload each V2 section and all six image Hero placements; inspect
      desktop/mobile public reflection using the synthetic PNGs.
- [ ] Open two independent sessions; confirm stale saves conflict without losing
      the other section's draft.
- [ ] Test archive/restore and recoverable media Trash using disposable fixtures.
- [ ] Add a real generated video clip before claiming Showreel/video acceptance.
- [ ] Complete recovery / second-admin / revocation tests with approved fixture
      accounts; do not log out or reconfigure the real owner.
- [ ] Finish genuine Storage upload → placement → replace → Trash/restore and
      production-cookie acceptance under **trusted isolated HTTPS**.

The current local HTTP API cannot complete that last row: application, SQL and
image/CSP guards intentionally require HTTPS media on standard port 443.
Repo-relative synthetic images permit content/framing/reference checks but do
not prove integrated Storage delivery. Production Secure/`__Host-` cookie flows
also cannot be certified by a development HTTP run. Before those tests, agree
on trusted local TLS (browser and Node trust) or an owner-approved separate
hosted test project. Do **not** allow HTTP media globally or bypass MFA for tests.

## Evidence so far

- All 46 original migration bodies plus the bootstrap/final seed executed in
  isolated PGlite with minimal Auth/Storage stubs; only its unsupported pgcrypto
  extension statement was omitted in that SQL test. All **72 readiness checks**
  (0037–0046) and six Hero snapshots passed. Original migration files unchanged.
- Workspace preparation and integrity validation executed successfully on
  Windows, generating only synthetic public media and no production env files.
- Guard/parser regression tests cover wrong targets, credentials, IDs, migration
  ordering, source paths, inherited secrets, endpoint mismatches and Auth status.
- Real PostgreSQL ran all 46 migrations + bootstrap/seed, and all 72 read-only
  checks 0037–0046 returned true. GoTrue owner creation/read-back and Storage
  bucket creation/read-back passed. Browser login rendering and the logged-out
  V2 gate passed. Owner then completed login and protected V2 rendered. This is
  still not save/upload/replace or recovery acceptance.
- Real password authentication passed after the email-provider correction;
  diagnostic logout and closed-signup enforcement were also verified.
- Final regression: **2,843 tests / 147 files**, TypeScript, full ESLint and diff
  whitespace checks pass. No production application/schema edit was needed.

## Owner production setting (separate from the fixture stack)

In the **real** project's Supabase Authentication settings, disable public new
user signup and anonymous sign-ins. Keep email sign-in and TOTP enabled so
existing approved admins retain access. Readiness previously reported public
signup enabled; it is not marked fixed until owner confirmation/recheck.

Next implementation priority is **ImageKit 7A.2f**; it does not depend on owner
completion of fixture MFA. Gmail notifications via Resend 7B remain a separate
follow-up. Only after 13G passes, ask for explicit 13H Classic-retirement approval.
