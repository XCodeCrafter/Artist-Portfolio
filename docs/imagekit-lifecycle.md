# ImageKit 7A.2f — incremental lifecycle implementation

Checkpoint: 2026-09-23. **7A.2f.1, 7A.2f.2, reservation-only 7A.2f.3a and the
dormant 7A.2f.3b issuance/finalization coordinator are implemented.** The no-keys
7A.2f.3c.1 observation-worker core is now implemented separately below; it does
not delete provider objects or satisfy the remaining pilot-activation gates. Hosted
0047/0048 deployment is owner-confirmed with all 9 + 8 read-only checks true in
screenshots; 0049 schema-readiness rollout is now also owner-confirmed with all
three checks true in the supplied screenshot. Supabase
uploads remain unchanged; do not enable the
ImageKit pilot flag or switch providers yet. The agent has not used ImageKit
credentials, made live provider account requests or executed hosted SQL/deployments.

## Implemented evidence adapter

`lib/admin/imagekit-object-verification.ts` is server-only and not imported by
any route, action or UI. Given a trusted intent snapshot and a candidate file ID,
it reads authenticated current and version details, verifies account namespace,
canonical file path, MIME, byte size and public-file policy, then streams that
version's original bytes to SHA-256. It checks a bounded signature prefix as a
second MIME signal and re-reads current details to detect a concurrent change.

The signer and verifier share pilot MIME/extensions/size limits. Metadata is
capped at 64 KiB, media at its exact declared size and the pilot limit; only a
4 KiB media prefix is retained. All requests share a 45-second deadline. The
fixed API origin alone receives Basic credentials; the CDN receives none.
Redirects, unexpected compression, byte ranges, foreign paths, transformations,
unknown/duplicate URL parameters and partial/oversized bodies fail closed.
Errors contain reason codes, not raw provider responses or secrets.

The version-pinned original download URL is server-generated and deliberately
separate from the queryless public delivery URL required by existing validators.
No application URL/CSP/SQL policy was loosened. File signature checks are not a
full decoder, codec compatibility check or malware scan.

Success is **evidence, not authorization**: it does not prove a supplied intent
belongs to the current admin, that the public/private key pair matches, or that
an intent is still active. Never accept this result back from a browser, cache
it as a verification ticket, or use it alone to publish/delete. The coordinator
passes fresh evidence to the finalizer, which binds it to the locked, active, issued, unexpired DB
intent and current authorized actor. The module never retries, signs, writes,
cancels or deletes; failures must be reconciled by the later lifecycle.

## Implemented database lifecycle and recoverable Trash

`0047_imagekit_upload_lifecycle.sql` adds new canonical reservations with
MIME-specific extensions without adopting or rewriting legacy 0036 intents.
Private RLS-protected companion tables hold one-shot issuance, file/version
bindings and reconciliation state. Their direct table access is revoked even
from `service_role`; seven narrowly scoped service-only RPCs are the boundary.
Internal helpers are private and security-definer functions fix `search_path`.

Issuance is persisted before returning to the server. An ambiguous/lost response
cannot reissue it. Finalization checks locked ownership, deadline and exact
server-observed facts, then inserts the asset/source variant and consumes the
intent atomically. Existing asset IDs and provider account/file bindings are
never overwritten. A repeated successful finalize returns the consumed result
without restoring a trashed asset or resetting subsequent owner edits.

Expired/cancelled/failed issued intents enter a separate retained reconciliation
queue. Claims wait at least one hour beyond intent expiry/closure, use expiring
worker-specific leases and stop after five attempts. Referenced/ready objects
are refused. This batch only records `absent`, `retry` or `unsafe` observations:
there is deliberately **no provider deletion or successful-cleanup completion**
yet. A missing file is not proof that an in-flight upload can no longer finish.

`0048_imagekit_source_trash.sql` preserves the existing CAS/reference replacement
contract, including archived content. It permits only an exactly bound consumed
ImageKit source with no derivative/alias variants; active jobs/reservations still
block removal and restore. The verified object and source stay ready in logical
Trash, allowing recovery. Trash neither frees provider storage nor revokes a
public CDN URL, and restore does not reattach old placements. Finalization refuses
publication without this helper and verifies its result before committing.

### Manual rollout (no provider activation)

Completed by the owner: screenshots show all nine 0047 checks and all eight
0048 checks true. No independent agent database probe was performed. The
sequence below is retained for fresh environments, not as a request to rerun it.

After the existing migrations through 0046, apply these in SQL Editor:

1. `supabase/migrations/0047_imagekit_upload_lifecycle.sql`
2. `supabase/migrations/0048_imagekit_source_trash.sql`
3. `supabase/checks/0047_imagekit_upload_lifecycle.sql` — all nine checks true.
4. `supabase/checks/0048_imagekit_source_trash.sql` — all eight checks true.

Keep `MEDIA_UPLOAD_PROVIDER=supabase` and
`IMAGEKIT_PILOT_UPLOAD_ENABLED=false`. Migrations are additive and tested for
rerun preservation. They do not change stored media, page content, credentials,
or the current uploader. Do not use `db push` while hosted migration history
remains unreconciled.

## Required before wiring uploads

1. **7A.2f.3, authenticated actions and reconciliation.** Require AAL2,
   exact Origin, rate limits, same-account key-pair preflight and durable intent
   ownership. Claim issuance once before signing; a lost response must never
   reissue the token. Failures/expiry/cancellation need audited reconciliation
   after upload quiescence, not immediate deletion: a request may still finish
   after its browser disappears or its token expires. Exclude finalized objects
   under locks and never delete by an untrusted browser file ID. Before enabling
   the pilot, exercise concurrent issuance/finalization/Trash/cleanup on separate
   PostgreSQL connections. Existing SQL races are covered by the real-PostgreSQL
   runner below, including observation completion and expired-lease reclaim;
   future provider-resolution paths still require their own acceptance.
2. **7A.2g, real pilot.** With owner-configured restricted credentials, verify
   actual response shape and original-version delivery with one disposable image
   and video, then progress/retry/cleanup/Trash/restore. Mock tests do not establish
   same-account credentials, real delivery, quotas or CDN deletion behavior.

The current signer requests public files. Until reconciliation exists, failed
finalization can avoid portfolio references but can still leave a publicly
reachable orphan on ImageKit. The current verifier and database queue do not
yet solve provider-side orphan cleanup.

## Authenticated reservation boundary (7A.2f.3a)

`lib/admin/imagekit-reservation-actions.ts` adds only preparation, resolution
and logical cancellation. These server actions are not imported by the current
application UI or Supabase uploader. They require the existing exact pilot flag
and Supabase provider, but the flag remains off; this is not an upload cutover.

Each action requires the normal live-session/AAL2 admin guard plus an active DB
profile, canonical explicit `Origin` (no Referer fallback), configured origin
allowlist and HMAC-pseudonymized actor quotas. Preparation allows ten requests
per ten minutes; resolution and cancellation each allow sixty per minute in
separate fixed buckets. Their limiter explicitly denies on DB/configuration or
malformed-result failure even in development; unrelated callers keep their
existing development policy.

Preparation takes a canonical intent UUID as an idempotency key and derives
`imagekit-<intentId>` itself. Client input cannot choose account, actor, asset
identity, object path, evidence or authority. Metadata/files are strictly typed
and size-limited. Responses are strictly checked against the exact 0047 base
snapshot and expected account/identity; only intent ID, asset ID, status, expiry,
issued boolean and cleanup-pending boolean can reach the client. Lost or malformed
responses are unconfirmed, not safe to blindly retry with a new ID. Cancellation
does not remove bytes or revive a consumed asset.

This boundary never calls the signer, verifier, provider or worker lease RPCs.
No new migration is needed. The owner has now confirmed 0047/0048 with all
deployment checks true. This completes the manual schema prerequisite, not
the credential, authenticated upload, reconciliation or live pilot validation.

## Dormant issuance/finalization coordinator (7A.2f.3b)

`lib/admin/imagekit-upload-workflow.ts` joins the real signer and read-only
verifier to the actor-scoped 0047 RPCs. This is server-only code, **not a public
server action**, and no application page/action imports it. It requires an
explicit trusted admission callback with no default implementation. The future
production adapter must enforce AAL2/live session, canonical allowed Origin,
strict operation quotas, approved account setup and reconciliation readiness;
an environment flag or a browser boolean alone must never satisfy admission.
Production activation is therefore still pending, not inferred from unit tests.

Before claiming authority or fetching provider bytes, the coordinator checks
the exact versioned result of `get_imagekit_upload_readiness_v1()`. New migration
`0049_imagekit_upload_readiness.sql` provides this service-only, read-only
catalog check. It detects missing/drifted 0047/0048 guards, FKs, privacy, bindings
and Trash integration, returning only `{version:1,ready:boolean}`. It neither
validates credentials nor changes any media or provider. It is an operational
schema check, not protection against an arbitrarily malicious database owner.

Issuance resolves the owned reservation, claims once and signs only an exact
`issued` outcome. JWT time comes from persisted `issuedAt`; expiry must exactly
match `authorityExpiresAt`. A real-clock check and actor-scoped readback reject
too-short, cancelled, changed or ambiguous responses before returning a token.
`already_issued` never reconstructs it. A cancellation after token release cannot
revoke the provider authority and still requires durable reconciliation.

Finalization accepts only `{intentId,fileId}` from the caller, resolves the DB
reservation, obtains fresh server-only file/version/hash evidence, rechecks the
reservation and submits it to the atomic SQL finalizer. All immutable facts and
issuance timestamps must agree across responses. JWT expiry does not prevent
finalizing already-uploaded bytes while the reservation itself is still live.
Consumed retries with the matching file ID skip provider work and never revive
Trash or overwrite edits. Cache invalidation failure cannot turn a committed
publication into a reported failed upload. Neither method closes/deletes/retries
automatically on uncertainty.

### 0049 manual rollout — owner-confirmed

The owner supplied a screenshot of `supabase/checks/0049_imagekit_upload_readiness.sql`
with all three checks true: service-only access, read-only boundary and the exact
`{"version":1,"ready":true}` result. Record 0049 as applied and verified by the
owner; 0047/0048 are already confirmed as well. Do not request these migrations
again for this checkpoint. This is schema readiness, not account or live-upload
verification. Leave `MEDIA_UPLOAD_PROVIDER=supabase` and
`IMAGEKIT_PILOT_UPLOAD_ENABLED=false`. The agent has not run hosted SQL.

### Remaining account-preflight decision

Official [API-key documentation](https://imagekit.io/docs/api-keys) authenticates
management requests with the private key and describes the public key separately
as a client-upload identifier. The documented endpoint-list response does not
establish their pairing. No documented read-only key-pair proof was located in
the [official API inventory](https://github.com/imagekit-developer/imagekit-nodejs/blob/main/api.md).
Do not invent a validation endpoint or treat an empty/default endpoint record,
matching string formats or a successful private-key GET as proof of all three
configured values. Before coordinator activation, settle an explicit owner-attestation
and bounded pilot verification design; any weaker claim must be labelled as
such, not silently substituted for verification. Keep the current gate closed.

## Verification for this checkpoint

- 85 mocked verifier tests cover every allowed MIME, malformed/foreign URLs,
  response schemas, redirects, API-only credentials, shared deadline, bounded
  streaming/cancellation, metadata compression, exact hashes/signatures and
  version changes. No real ImageKit request or credential was used.
- `scripts/test-imagekit-lifecycle-migration.mjs` passes against disposable
  in-memory PostgreSQL (PGlite), with no network/provider/hosted DB. It exercises
  actual migrations and RPCs: all eight MIME types and limits; role/actor
  isolation; one-shot issuance; malformed evidence and exact 256/257 token
  bounds; atomic rollback including provider bindings; retry/collision/expiry;
  bounded cleanup, stale leases, absent/unsafe observations and reference guards;
  source-only Trash/restore/replacement; and no content changes on migration
  reruns. The 0049 extension adds **38 deliberate schema-drift scenarios**;
  all **78 read-only deployment checks for 0039–0049** pass afterwards. Readiness
  installation fails without its prerequisites and reruns preserve all media.
- Run the harness with an existing local PGlite runtime:
  `node scripts/test-imagekit-lifecycle-migration.mjs <absolute-path-to-@electric-sql/pglite/dist/index.js>`.
  PGlite executes through one connection; it does not prove actual multi-session
  contention. The separate real-PostgreSQL follow-up below covers those races.
- The f.3a request/snapshot, action and strict-limiter suites add **319 passing
  tests**. These mock authenticated services/RPCs; no hosted migration or real
  provider account was accessed. An independent boundary review found no
  blockers within reservation-only scope.
- The f.3b increment adds **51 claim/finalizer contract cases and 140 workflow
  tests**, including real JWT signing with fictional keys, lost replies,
  cancellation/expiry/readback races, consumed retries, evidence mismatches and
  synchronous/asynchronous cache failures. Provider verification and RPCs are
  mocked here; actual SQL runs separately in the disposable harness above.
  Independent review found no blockers within the dormant-core scope. These
  tests do not prove production admission, account pairing or live delivery.
- Full regression passes: **3,448 tests / 153 files**, using
  `node node_modules/vitest/vitest.mjs run --maxWorkers=2 --testTimeout=60000`.
  TypeScript, full ESLint and tracked diff whitespace checks also pass. This
  supersedes the earlier f.3a/f.2 regressions and resource-limited partial f.1 run.
- No production build or live provider pilot was performed for this server-only
  checkpoint. Hosted schema rollout is owner-confirmed by screenshots; real
  credential/account compatibility and the live upload path remain unverified.

## No-keys follow-up: real PostgreSQL concurrency (7A.2f.3b.1)

The owner explicitly deferred ImageKit API credentials/account setup. This
checkpoint therefore adds only repeatable, isolated database tests; it does not
expose an upload route, change feature flags, modify hosted SQL or need a new
migration. Hosted **0049 was subsequently owner-confirmed** with all three checks
true in a screenshot, separate from this local fixture.

Run `npm run test:imagekit:concurrency` with Docker Linux available and the
already-cached image `public.ecr.aws/supabase/postgres:17.6.1.167`. The runner
never pulls images, loads `.env`, accepts a database URL or targets an existing
container. It resolves the cached image to its immutable ID, creates a uniquely
labelled container, and verifies isolation before starting it and before setup.
Rootfs is read-only; data and sockets live in tmpfs; networking is `none`, no
ports or host paths are mounted, and PostgreSQL listens only on its internal
Unix socket. No application/PG/provider secrets are forwarded to child commands.
The local acceptance stack is not used or stopped. Normal success/failure closes
sessions, verifies exact container ownership and removes only that container;
the runner confirms removal. SIGINT/SIGTERM use the same idempotent cleanup;
an ambiguous create reply is recovered only by the exact generated name plus
verified immutable image, full ID and run label. A forcibly killed runner/daemon may need manual
cleanup of the exact printed test-container name, never the acceptance stack.

The synthetic prerequisite fixture installs the lifecycle through 0049. Two
separate PostgreSQL backends invoke RPCs as `service_role`; a third owner backend
observes locks and rows. Competing RPCs are held at an explicit transaction
barrier: `pg_blocking_pids` must identify the first session before its commit or
rollback. The cleanup-worker case instead must complete while the other worker
still holds its transaction. Bounded statement/lock/session timeouts prevent a
regression from hanging forever.

The original 12 cases and two 7A.2f.3c.1 additions now total **14 passing
scenarios** on real PostgreSQL 17:

1. Identical preparation retries produce one reservation/audit.
2. Competing intent IDs cannot reserve the same asset.
3. Concurrent issuance produces one authority and one audit.
4. Cancellation after issuance retains reconciliation responsibility.
5. Cancellation before issuance prevents new authority.
6. Concurrent finalizations publish exactly one asset/source/binding/audit.
7. Winning cancellation fences a waiting finalization.
8. Winning finalization cannot be converted into abandoned-upload cleanup.
9. Provider-file collision rolls back the losing publication completely.
10. Rolled-back provider binding allows the waiting publication to proceed.
11. Competing cleanup workers skip locked/already-leased work without duplicating
    its lease or attempt count.
12. Late finalize cannot resurrect an asset concurrently moved to Trash.
13. Competing observation finishes cannot consume one lease twice; the loser
    receives `40001`, and only one observation audit is retained.
14. Reclaiming an expired lease fences the old worker; it cannot overwrite the
    new worker/lease/attempt state, and the new owner can finish normally.

Durable states, row counts and audit counts are checked after the competing
transactions finish. The final readiness RPC remains true, and the temporary
container/data are removed. No production lifecycle defect was found in these
cases. This is not an exhaustive proof of all schedules, a live-provider test,
or end-to-end UI acceptance. New reconciliation paths still need their own tests.

Original 7A.2f.3b.1 verification: all 12 scenarios passed repeatedly, including the final cleanup
implementation; a separate graceful SIGTERM smoke test also removed its exact
container. The 66 added ownership/isolation unit tests pass. Full regression is
**3,514 tests / 154 files** with two Vitest workers; TypeScript, full ESLint and
diff whitespace checks pass. No production build was needed for these test-only
changes. No provider calls, hosted SQL, credential edits or Git push occurred.

Return later to **account/credential setup, production
admission, reconciliation and the disposable image/video pilot**. Keep
`MEDIA_UPLOAD_PROVIDER=supabase` and `IMAGEKIT_PILOT_UPLOAD_ENABLED=false` until
those gates are satisfied. Gmail/Resend 7B remains a separate pending batch.

## Dormant observation worker (7A.2f.3c.1)

This no-keys increment uses the already owner-confirmed 0047/0049 RPCs; **there
is no new migration**. It is deliberately only observation, not automatic orphan
resolution, provider deletion or successful cleanup. Current uploads, the pilot
flag, credentials, hosted data and the existing local acceptance stack are unchanged.

Three server-only modules form the boundary:

- `imagekit-reconciliation-contracts.ts` accepts only a terminal, issued,
  unbound reservation in the server-owned `imagekit-<intentId>` namespace and
  expected account. Observation waits at least one hour beyond reservation
  expiry. The lease must still have more than 30 seconds and at most five minutes
  plus five seconds of clock skew. Finished results must preserve all immutable
  reservation/issuance/status fields and report only `pending` or `attention`.
- `imagekit-reconciliation-observation.ts` makes at most one authenticated GET
  to the fixed ImageKit API. It derives the unique reservation folder itself,
  requests at most two results and never follows provider-supplied URLs or
  downloads media. A 64 KiB metadata limit and 15-second deadline cover response
  bodies and stalled requests. Only authenticated HTTP 200 with a valid empty
  JSON array means `absent` **at observation time**. Any item/ambiguous metadata
  means `unsafe`; HTTP errors (including 404/401/403/429), network failures and
  timeouts mean `retry`. No raw provider data or credentials are returned.
- `imagekit-reconciliation-workflow.ts` requires an explicit trusted server/job
  admission callback; there is no default production adapter. It checks schema
  readiness, claims at most one candidate, validates the lease, observes the
  whitelisted target, then rechecks readiness/time and records the observation
  through the exact worker/lease RPC. Overall waiting is bounded at 30 seconds.
  A malformed/lost/late reply stays unconfirmed and is never replayed. A remote
  RPC can still commit after the caller times out; no subsequent provider or
  finish operation is started based on such an uncertain reply.

The exact-folder `path`, `type=all`, `limit=2`, `skip=0` request follows the
[official generated ImageKit SDK contract](https://github.com/imagekit-developer/imagekit-nodejs/blob/main/src/resources/assets.ts).
No `searchQuery` or undocumented exact-file filter is invented. Listing the
whole unique folder is intentionally conservative: any content, including an
unexpected filename/subfolder, requires attention instead of automated deletion.
The list API excludes file-version results and can be indexing-sensitive; an
empty result cannot establish physical absence or upload quiescence.

The existing database policy retains an `absent` observation for a later check,
backs off retries, and escalates unsafe or exhausted work to `attention`. Neither
state frees storage, revokes a URL, changes portfolio content, or claims that an
orphan was removed. An empty claim reply only means this bounded poll returned
no lease, not that every item has been processed.

Activation is still blocked: authenticate and rate-limit the invoker, explicitly
approve the real account/keys, design operational invocation/status, and verify
ownership/version-safe resolution plus upload quiescence. Input format checks
are not key-pair/account proof. The current SQL claim is globally scoped and is
only suitable for this **single approved account**; a multi-account deployment
needs an account-scoped claim RPC first. No route, action, UI, timer or cron imports
this core. No cleanup code calls DELETE or trusts a browser-provided file ID.

Verification for 7A.2f.3c.1: **325 new tests** pass (154 contract, 88 mocked HTTP,
83 workflow cases), including stalled/oversized/malformed responses, strict
account/namespace gates, stale leases, lost RPC replies and late continuations.
The full regression passes **3,839 tests / 157 files**, plus TypeScript, full
ESLint and whitespace checks. The disposable real-PostgreSQL runner passes all
**14 scenarios** including the two new finish/reclaim races above, and removes
its own temporary container. Independent boundary review found no blocker in
this dormant observation-only scope. Provider compatibility/account ownership
and real orphan resolution remain unverified; no live provider call, hosted SQL,
credential edit, application activation, production build or Git push occurred.

## Read-only Media V2 overview (7A.2f.3c.2a)

Admin V2 → Media now includes a compact **ImageKit upload checks** disclosure
above the existing editor. It opens when review/due counts are nonzero; otherwise
it stays collapsed. Counts distinguish open upload windows, waiting, due,
checking and review-required records. The first 20 rows are ordered by urgency
and age, in a bounded keyboard-scrollable list. The panel states the total and
whether more rows are omitted; this is not a complete case-management UI.
Existing uploads, media editing and Trash remain independent. There is no
automatic refresh or navigation that could discard the current editor draft.

The data loader reuses the existing live-session/AAL2 `requireAdmin` gate and
requires an active admin profile. It invokes only the new service-role
`get_imagekit_reconciliation_overview_v1` RPC, with a server-selected actor and
limit. Reads have a five-second deadline, strict result/row/count validation and
safe error states: missing migration, missing configuration, unready schema and
unavailable data never become a false zero count. Provider keys are not needed.

New migration **0050** adds only this `STABLE`, security-definer, empty-search-path
read RPC and its explicit service-only ACL. It verifies the active administrator
and 0049 readiness, derives the counts and bounded list from one statement
snapshot, and refuses contradictory lifecycle combinations. It does not expire
reservations, acquire leases, run a worker, write audit records, read provider
credentials or contact ImageKit. The safe projection omits object paths, provider
URLs/accounts/file IDs, bindings, hashes, worker/lease identities and actor IDs.
Only issued, unfinished tracked reservations appear; empty means no such database
records, not empty provider storage. Dates are explicitly UTC and labelled as a
non-live snapshot. Checks are still dormant, and nothing is physically deleted.

### 0050 rollout — owner-confirmed 2026-09-23

The owner supplied a screenshot of `supabase/checks/0050_imagekit_reconciliation_overview.sql`
with all **four** checks true: service-only access, read-only boundary, ready
parent guards and retained private source tables. Record 0050 as applied and
verified by the owner; do not request a rerun for this checkpoint. This confirms
schema prerequisites, not live browser or provider acceptance.

The authenticated empty-state browser smoke is recorded below. In fresh
environments without 0050, only the
optional panel reports migration needed; existing media tools remain usable.

0047/0048/0049 remain owner-confirmed and must not be requested again. Leave
`MEDIA_UPLOAD_PROVIDER=supabase` and `IMAGEKIT_PILOT_UPLOAD_ENABLED=false`.
The agent has not applied 0050 to hosted Supabase or changed credentials.

Verification: **110 added unit/render cases** pass, including server auth/error
boundaries, strict projection consistency, escaped labels, all display states,
UTC dates, bounded disclosure and no mutation/navigation controls. Full regression
passes **3,949 tests / 159 files**, TypeScript and full ESLint. The disposable
PostgreSQL run passes **8 overview scenarios + all existing 14 concurrency cases**,
all four 0050 checks and a preserving migration rerun over populated lifecycle
fixtures. Repeated reads are compared against every public/auth table; all rows
remain unchanged. Initial inactive-admin fixture setup hit the existing
last-active-owner guard; the fixture was corrected to use a separate inactive
admin, without weakening production guards. The temporary container is removed.
Independent boundary review found no blocker in this read-only scope. Populated
and failure-state SSR tests are not claimed as live browser acceptance.

The production build also passes, including the Media V2 route. Only the existing
Edge Runtime deprecation/static-generation warnings remain.

### Read-only browser smoke — 2026-09-23

The current checkout was started on loopback `http://localhost:3102`, leaving
ports 3000/3001 and the old isolated acceptance stack untouched. The existing
browser session passed the normal admin gate against the configured hosted
database; no credentials or MFA factors were retrieved or changed. This is not
the older fictional shadow app and not a deployed-production browser test.

At **1440×900** and **390×844**, the new panel loads the verified zero-record
snapshot, starts collapsed, opens/closes with click/Enter/Space, shows keyboard
focus, and lays out five/two count columns without horizontal overflow. Media
search and thumbnail selection work; toggling the disclosure preserves the
selected inspector and search value. Changing to Videos preserves the inspector
with its outside-results notice. Mobile metadata controls remain reachable, and
the unchanged upload disclosure states Supabase is still active with no ImageKit
cutover. No save, file chooser, upload, Trash or provider action was invoked.
Console inspection returned no warnings/errors. Filters and viewport overrides
were cleared; the page is left open for the owner.

Review found insufficient contrast on the two small timestamp labels. Both now
use `text-white/50` instead of `/40`, approximately 5.3:1 on the panel background;
the browser confirms the new computed color. A token regression was added:
**111 targeted tests**, TypeScript and targeted ESLint pass. The earlier full
regression/production build numbers above precede this presentation-only fix.

Because the live queue is empty, nonempty/error behavior was checked separately
with the component fixtures below. Do not create test upload records or remove
RPCs in the owner's database to exercise these states. Full provider pilot,
fixture lifecycle acceptance and production HTTPS/cookies remain unproven.

### Populated/error component browser fixtures — 2026-09-23

Run `npm run test:imagekit:overview-browser`, then open
`http://127.0.0.1:3103/mixed`. Stop the local server with Ctrl+C when finished.
This repeatable helper renders the **actual** `ImageKitReconciliationOverview`
component and global Tailwind CSS with deterministic synthetic snapshots. All
available snapshots pass the production projection parser. It is not a new Next
route, admin authentication bypass, provider simulation or seed into any database.
No application data loader is imported. Custom hosted fonts/media are deliberately
not loaded; local font fallbacks apply, so this is not exact branding acceptance.

The compiler disables env-file/config loading, public assets, dependency discovery,
watchers, HMR and WebSocket services. Only fixed in-memory documents/CSS are served
on 127.0.0.1:3103. Exact Host/Origin checks, GET/HEAD-only handling and a restrictive
CSP prevent file/proxy routes, scripts, connections, media and form submission.
Review caught Vite's otherwise-default dependency optimizer; it is explicitly
disabled, and a fresh compile with the tightened settings passed. This is a
development helper, not an OS/network sandbox or a production endpoint.

Browser results:

- All **11 cases** checked at **1440×1000** and **390×844**: empty, uploading,
  waiting, checking, due, attention, mixed, and four unavailable reasons.
- Attention/due/mixed start open; other cases start collapsed. Click, Enter and
  Space work, with a visible keyboard focus ring. Tab reaches the scrollable list;
  arrow keys move it and End reaches its last row on desktop and mobile.
- Mixed fixture displays **20 of 23**, explicitly warns about the bounded preview,
  and shows all five counts/stages and all observation labels. List height is
  bounded to 448px (desktop content 3319px; mobile 6305px).
- A 220-character unbroken name wraps within its column. HTML-like text is
  rendered literally, with no injected image/script elements. UTC labels and
  the distinction between eligibility and a scheduled run remain visible.
- All cases fit 390px with no horizontal overflow. Mixed also fits **320×740**.
  Mobile counts use two columns; desktop uses five.
- Four error states explain why counts are unknown, never substituting a fake
  zero/empty result. A labelled **QA-only** adjacent input remains usable and
  survives disclosure toggling. This input is not the real Media editor; actual
  Media selection/filter integration was covered by the preceding live empty-state
  smoke, not by failure injection against owner data.
- Browser console reported no warnings/errors. The viewport was reset, only the
  fixture tab closed, and only this task's port-3103 server stopped. The owner's
  open dashboard and existing local stack were left untouched.

No production component fix was needed in this batch. Added **45 tests** for
fixture/schema semantics and the local server/compiler boundary; **156 targeted
tests**, TypeScript and targeted ESLint pass. Type checking caught an optional
header value in the test helper; its map now correctly permits `undefined`.
No full production build or live-provider run
is claimed for this test-tooling-only batch. No migration, provider configuration,
media mutation, automatic worker activation or Git push occurred.

The remaining work is still account approval, ownership/version-safe orphan
resolution and upload quiescence, authenticated/quota-limited worker invocation,
operational handling/alerts and a disposable image/video pilot. Read-only visibility
does not activate or complete those gates. No provider call, hosted SQL, media
mutation, automatic worker activation or Git push occurred in this checkpoint.

## Read-only orphan candidate inspection (7A.2f.3c.2b)

`lib/admin/imagekit-orphan-discovery.ts` and
`lib/admin/imagekit-orphan-inspection.ts` add a dormant server-only inspection
boundary. They are not imported by an application route, action, UI or scheduler,
and are deliberately **not connected to the existing 30-second observation
worker**. No database table/RPC or stored lifecycle status changes in this batch.
The sole 0047 SQL edit clarifies a comment; do not reapply the migration for it.

The future trusted caller must obtain the terminal, issued, unbound reservation
and cleanup lease from the database, admit the specific account/invoker and
enforce quotas. A browser-selected file ID/URL or a `quiescent: true` assertion
cannot be supplied to the inspector. Credentials are format/endpoint validated;
that is not proof that the keys belong together or to the approved account.

Inspection is bounded to one target and proceeds as follows:

1. Validate the exact 0047 lease/account/namespace, including the settling delay,
   terminal state and null source/provider bindings. Require more than 65 seconds
   remaining for the 60-second total budget and five-second lease margin.
2. Derive the unique intent folder and issue a single fixed-origin GET list with
   `path`, `type=all`, `limit=2`, `skip=0`. Metadata is capped at 64 KiB and 15
   seconds; redirects, unexpected encoding/ranges, malformed UTF-8 and ambiguous
   responses fail closed. Provider errors, including 404, never mean absence.
3. Empty returns `not-observed`, not resolved/physically absent. More than one
   item, a folder, another file/path/name, private/unpublished content or mismatched
   MIME/size returns attention. One exact file produces only a projected candidate
   file ID, version ID, optional version token and update timestamp.
4. Require enough fresh lease time for the bounded 45-second verifier. Compare
   the first current details to the discovered version ID/token/timestamp before
   requesting version details or original bytes. Then run existing version-pinned
   MIME, byte-size, signature and SHA-256 checks and the final current-detail read.
5. Validate the exact verifier result schema and compare every immutable identity
   and content field to the lease/candidate. Recheck time and lease before returning
   server-only `candidate-observed` evidence. Do not store/replay it as permission
   to publish, bind or delete an object. No queue state is changed.

All three layers use absolute timer **and monotonic elapsed-time** checks; the
inspector additionally rejects a backward wall clock and expired/too-short lease.
External abort is propagated. Fetch/body/cancellation stalls cannot hold the
result open indefinitely, and a late response cannot initiate another request.
The verifier's one-argument API and successful evidence shape remain compatible
with the dormant finalizer. Its optional `expectedCurrent` contract is strictly
validated and snapshotted before network I/O. Private credentials go only to the
fixed API origin, never the original-byte CDN request. Failures contain only
closed reason enums; successful evidence remains internal server data.

### Why this is not automatic cleanup

The [official generated ImageKit file API](https://github.com/imagekit-developer/imagekit-nodejs/blob/main/src/resources/files/files.ts)
documents file deletion as permanent removal of the file and its versions, with
separate CDN cache behavior. The reviewed delete contract does not establish an
atomic expected-version condition. The [asset-versioning documentation](https://imagekit.io/docs/dam/asset-versioning)
describes deleting non-current versions; this is not a demonstrated safe way to
delete the current orphan. Consequently these adapters do not call DELETE.

Still unresolved: provider guarantees for accepted in-flight uploads after JWT
expiry, list visibility/completeness during upload completion, and a resolution
strategy that cannot destroy a newer/replaced object. The existing one-hour wait
only makes a record eligible for observation; it does **not** prove quiescence.
Neither an empty listing nor matching current bytes resolves these questions.
Account approval and authenticated/quota-limited invocation are also still gates.

Verification: **153 discovery + 91 inspection + 115 verifier tests** pass,
including five-GET integration with mocked HTTP, list-to-detail drift, exact
projection/namespace checks, stream limits, clock/lease/deadline failures, caller
abort and ignored-signal late responses. Full regression passes **4,269 tests /
163 files** with `node node_modules/vitest/vitest.mjs run --maxWorkers=2`.
The initial unrestricted parallel run hit the existing five-second Classic
dependency-walk test timeout under load (4,263 other tests passed); the complete
bounded-worker rerun passes without changing or weakening that test. TypeScript,
full ESLint and tracked diff checks pass. Independent final review found no
remaining actionable issue in this read-only scope. No fresh production build,
database concurrency run or provider/browser acceptance is claimed for this batch.

All verification here uses fictional fixtures/mocked HTTP; no real ImageKit keys,
provider request, hosted SQL, media mutation, worker activation or Git push.
No UI behavior changed, so this batch does not claim new browser acceptance.
Leave `MEDIA_UPLOAD_PROVIDER=supabase` and `IMAGEKIT_PILOT_UPLOAD_ENABLED=false`.

## Provider references

Implementation uses the documented [file details](https://imagekit.io/docs/api-reference/digital-asset-management-dam/managing-assets/get-file-details)
and [version details](https://imagekit.io/docs/api-reference/digital-asset-management-dam/managing-assets/get-file-version-details)
contracts. Original-byte delivery uses `orig-true`, as described in
[core delivery features](https://imagekit.io/docs/core-delivery-features).
The real pilot must confirm these fields and behavior for the configured account;
missing required evidence stays an error, not a fallback to client assertions.
