# Batch 13G — isolated acceptance preparation

Historical checkpoint: 2026-09-22. The local stack and fictional app ran then;
the owner completed login and the browser rendered the AAL2-protected V2 dashboard.
This is not a current runtime assertion or a passed live save/upload/recovery gate.
No new production
SQL migration is required by this acceptance harness.
Classic remains available; 13H still requires acceptance and owner approval.

Current follow-up (2026-10-08): Docker Engine 28.3.2 is running. The historical
temporary workspace is gone, but its containers and volumes remain and must not
be reset, relabelled, reseeded or removed. A new workspace uses the separate
`artist-portfolio-acceptance-v3` Docker namespace. Do not reuse old login/runtime
evidence as verification of today's code. Fresh preparation includes all 58
migrations through 0058; the 46-migration results below are historical.
ImageKit and live Resend/domain activation remain deferred at the owner's request.

The v2 workspace
`%TEMP%/portfolio-acceptance-995ddf824f63/1055ef58-4ab6-4988-9452-ff7edd9d93e3`
successfully ran all 58 migrations and the fictional bootstrap/seed. Its nine
containers and volumes are preserved, stopped, without a provisioned owner.
Windows repeatedly refused Studio port 55433; a read-only probe observed another
process holding that port. No antivirus, firewall or system setting was changed.
The new v3 port range 45430–45434 passed a simultaneous loopback bind probe and is
outside this machine's dynamic TCP range (49152–65535). V3 startup completed
successfully; all nine services are running and all four published ports were
independently verified as IPv4 loopback only. A fresh no-service canary demonstrated that this Docker Desktop still
publishes unspecified-host ports on both `0.0.0.0` and `::`, despite the bridge's
loopback default. The canary was stopped and removed; the dedicated v2 network
remains. Do not start the stack with an unguarded `supabase start` command.

Current verified v3 workspace:
`%TEMP%/portfolio-acceptance-995ddf824f63/1634e3a0-cbda-4869-a015-c662b670007b`.
All 58 original migrations plus the local bootstrap ran (59 migration records),
followed by fictional seed data. All **150 checks in 0038–0058** passed in a
read-only transaction. The older 0037 file has seven passing security/singleton
checks and one now-obsolete `five_distinct_sections` assertion; 0055's current
seven-section validator passes. Its seven diagnostic layout rows are not boolean
checks. Do not mistake that historical five-section expectation for a missing
migration or change today's layout to satisfy it.

One confirmed fictional owner and the test media bucket were provisioned.
The browser renders `Admin Login | Acceptance Artist` at `127.0.0.1:3101`;
an anonymous V2 request contains the expected Next.js streamed login redirect
(HTTP 200 plus refresh/NEXT_REDIRECT, not an authenticated dashboard response).
All 417 workspace hashes still pass after the first Next compilation. Owner
password login/TOTP was completed on 2026-10-09 (see the checkpoint below);
editor save/reload acceptance is **not yet completed**.

Recovery check (2026-10-08): the owner reported `ERR_CONNECTION_REFUSED` on
3101. The existing v3 Docker services remained running; only the app listener
was absent. Restarted the same guarded `scripts/acceptance.mjs start-app`
launcher in a hidden Windows background process, with fresh private stdout and
stderr logs in the current workspace. An initial API preflight failed closed;
both local API checks subsequently returned 200 and the retry succeeded.
A separate check after the launching command exited verified the loopback
listener and HTTP 200 containing `Admin Login` / `Acceptance Artist`.
No database reset, provisioning, account change or production action occurred.
The browser's existing error tab could not be controlled because of its URL
policy, so browser refresh was handed back to the owner.

`npm run acceptance:start` is a foreground process: keep its terminal/session
alive. On Windows a background handoff may use `Start-Process -WindowStyle
Hidden` with the same guarded Node launcher, the exact existing workspace and
new, distinct private output/error log paths. Check for an existing 3101
listener first and independently verify HTTP after the launch command returns;
a returned PID alone does not establish readiness. This is not a Windows
service and does not arrange startup after reboot. To recover a stopped app,
do not rerun preparation, provisioning or the fresh-stack startup helper.

Two failed startup attempts are retained as private logs in workspaces
`ffbd0c5a-5a87-4544-960c-8ac1a073d03f` and
`f03f25d0-d124-44e8-80cd-b930501e504d`. Their exact new containers/volumes were
removed only after explicit inspection: the first DB had never started and its
volume contained no files; the second had zero public application tables, zero
Auth users and no application migration history. No historical stack was touched.
The wrapper now handles Docker copy's destination `HEAD` and flushes streaming
response headers so `/wait` registration cannot deadlock container startup.

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
- A generated 1200 x 630 geometric JPEG supplies the exact background path used
  by `/opengraph-image` and `/twitter-image`. Original owner media remains
  excluded; generated PNGs and the JPEG are covered by manifest integrity hashes.
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
| Supabase API | `http://127.0.0.1:45431` |
| Postgres / shadow | `127.0.0.1:45432` / `127.0.0.1:45430` |
| Studio | `http://127.0.0.1:45433` |
| Local test email | `http://127.0.0.1:45434` |

Ports 3000/3001 are untouched. Use **127.0.0.1**, not localhost, for the fixture
app: browser cookies are host-scoped, not port-scoped. Do not run another admin
test application on that same host while checking auth/cookies.

## Historical runtime and guarded restart

The owner started Docker Desktop successfully. Elevated read-only inspection
confirmed Linux Engine 28.3.2 / Desktop 4.43.2. The original unprivileged probe
was denied by the sandbox, not evidence that Docker was stopped; `doctor` now
distinguishes those states. Official CLI 2.117.0 was installed in npm's npx cache,
without adding project dependencies or installing a global CLI on PATH.

Historical workspace, now missing (no secrets are stored in this repository):
`%TEMP%/portfolio-acceptance-995ddf824f63/0a8361f7-0fd5-4e5a-b50a-088e5000c68c`.
That run stored its generated test password in `local-owner.json` and local keys
in `local-status.json`. Neither file is available now. Do not reconstruct them
by overwriting the retained database's owner or changing its identity marker.

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
for a CLI and container engine. Use the verified cached CLI 2.117.0 for this
Windows harness. Local Docker volumes/images consume local disk; this
preparation does not copy the hosted database or its media.

From the original repo:

```powershell
npm run acceptance:doctor
npm run acceptance:prepare
```

Keep the generated path printed by `prepare`. In PowerShell assign that exact
path to `$acceptanceDir` (not a repo path). Verify ports 3101 and 45430–45434 are
unused; stop if another service owns them. Only one dedicated stack can run at
a time. Creating another workspace does not authorize stopping/removing an
existing stack or its data.

Local Supabase must bind to loopback, not the LAN. The new dedicated bridge is:

```powershell
docker network inspect portfolio-acceptance-v3-loopback --format '{{json .Options}}'
```

The v3 network already exists. Inspect it rather than deleting/recreating it.
Its loopback driver option is necessary but **not sufficient** on this engine.
Every published port must have an explicit `127.0.0.1` host binding before the
container starts. The guarded startup helper uses a temporary Windows named pipe
for this CLI child only; it does not expose the Docker API over TCP or alter
daemon settings. It limits mutations to freshly created v3 resources, validates
mounts/labels/network, pins published ports before creation and refuses persistent
deletion. Its private logs use exclusive creation, and failures never trigger
automatic cleanup or retries. Only the generated directory is a valid target,
never the repository's linked Supabase project:

```powershell
node scripts/acceptance/start.mjs "$acceptanceDir" "<absolute verified supabase.exe path>"
```

This is a fresh-start command, not a restart/reset tool. Existing v3 containers
or volumes cause refusal. On an incomplete run, inspect exact resource identities
and data before deciding recovery; do not remove freshness checks or just rerun
with an existing blank volume (the CLI may then skip database bootstrap).

**Mandatory actual-port check:** inspect the project's running containers and
their published addresses before capturing credentials or creating an account.
On the tested Desktop version the network option was present, yet ports actually
bound to `0.0.0.0` / `[::]`. All four exposed fixture services were stopped
immediately, before account creation. Merely seeing the driver option is not
proof of isolation. See the [Docker port-publishing documentation](https://docs.docker.com/engine/network/port-publishing/).

Historically, the one-time Windows fallback `scripts/acceptance/rebind.mjs` ran on
those exact stopped containers. It checks project/workspace labels, names,
network, mount/port shapes and stopped state; retains writable-layer snapshots
and the existing DB volume; preserves originals as stopped `-unbound-backup`
containers with restart disabled; and explicitly publishes replacements on
127.0.0.1. Every actual published address was verified after startup. Nothing
was deleted, no daemon/firewall/security setting changed, and no hosted project
was accessed. Do not restart those unbound backups or push their snapshot images.
Do not rerun this fallback against the old retained stack or use it to justify
temporarily exposing a new stack. New startup must bind safely from the outset.

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

### Test owner provisioning (completed once for the current v3 workspace)

The guarded helper is:

```powershell
node scripts/acceptance/provision.mjs "$acceptanceDir" "<absolute verified supabase.exe path>"
npm run acceptance:start -- "$acceptanceDir"
```

Do not rerun provisioning in the current v3 workspace. For a future separately
approved fresh run, provision only after safe startup and actual-port checks pass.
The helper creates a
confirmed Auth user `owner@portfolio.test`, matching active owner profile, and
the `portfolio-acceptance-media` bucket (100 MiB and the app's allowed MIME list).
It captures local CLI status privately after identity/port checks, refuses any
existing credential files/accounts, and exclusively saves a random password
before user creation so partial failures remain recoverable. Errors never
trigger deletion, overwrite or mutation retries. It does not enroll MFA or
manufacture an AAL2 session. Recovery emails stay in local mail capture.

No account or credential from production is a valid target. Current v3 owner
and bucket creation/read-back passed. The owner completed this fixture's
password/MFA handoff on 2026-10-09 and its protected dashboard was verified.
Save/reload and recovery remain pending. Authenticator setup belongs to the
owner; do not bypass it with browser automation or manufactured sessions.

## Current v3 acceptance checkpoint (2026-10-09)

- [x] Fresh isolated stack, explicit pre-creation loopback bindings and final
      actual-port verification; all 58 original migrations plus bootstrap/seed.
- [x] 150 applicable checks in 0038–0058; historical 0037 layout change explicitly
      reconciled with 0055. No hosted SQL or production credentials used.
- [x] Confirmed fictional owner and media bucket, private credential files.
- [x] Login UI visibly shows the fictional artist, anonymous V2 login redirect,
      417 integrity hashes intact after Next compilation.
- [x] Owner completed genuine password/MFA login. Browser visibly rendered
      `Admin V2 | Acceptance Artist` at `/admin/v2` and the protected Events
      editor. The snapshot's `requireAdmin` requires AAL2; no factor secret,
      credential entry or session manufacture was performed by the agent.
- [ ] Current-code editor saves, conflict/reload, archive/restore and recovery.

Snapshot drift check on 2026-10-09: all 417 manifest hashes still pass, but the
repository now has 47 changed tracked app inputs and 11 new untracked app
inputs absent from this copy. Its 58 original migrations remain byte-identical;
0059 (BIO visibility), 0060 (Press/navigation) and 0061 (ticket visibility) are
not present. In particular, Events' current save contract differs. The login
result certifies this intact baseline, not acceptance of the current repository.
No editor values were saved during this handoff.

Before current-code acceptance, agree on a safe refreshed test environment and
preserve this workspace, its database and the owner's login. Do not rewrite its
manifest, reset/reseed it or blindly rerun preparation: the present preparer
copies tracked app inputs only, so those new untracked Press/BIO files need
deliberate handling before a new snapshot can represent current work. Sharing,
appearance/transitions and core auth/framing code remain identical, but changed
Home/BIO/Press/Events integration still requires a refreshed runtime.

Harness verification: **363 tests / eight acceptance suites**, full TypeScript,
targeted ESLint and whitespace checks pass. Live email/ImageKit activation,
production save acceptance and HTTPS Storage/cookie acceptance remain deferred.

## Historical acceptance matrix and current limits

The first three checked items below describe the September run only. All must be
reverified for the fresh v3 workspace before claiming current runtime acceptance.

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

The owner has deferred **ImageKit 7A.2f** and has neither a Resend account nor an
owned domain. Contact delivery code can be tested locally, but live activation
must wait for those prerequisites. Continue non-ImageKit acceptance. Only after
13G passes, ask for explicit 13H Classic-retirement approval.
