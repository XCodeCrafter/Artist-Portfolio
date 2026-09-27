# ImageKit observation admission and manual operations — 7A.2f.3c.2c–2d

The observation-only backend boundary from 7A.2f.3c.2c now has an **explicit
manual action in Media V2** (7A.2f.3c.2d). No page load, scheduler or cron starts
it. Real credentials and owner approval are still deferred, and no feature flag
was enabled. No real ImageKit request, hosted SQL, credential change, account
approval or provider activation occurred in either batch. Existing Supabase
uploads and public portfolio media are unchanged; 2d needs no new migration.

Follow-up **7A.2f.3c.2e** shares the deadline helper with the still-dormant upload
coordinator, preserving observation's 30-second ceiling and approval contract.
The next step now needs owner-supplied server credentials and account verification;
see the [pre-activation handoff](imagekit-lifecycle.md#owner-handoff-stop-before-real-account-setup).
Do not use observation approval to authorize uploading or enable flags implicitly.

## Why this boundary exists

The original 0047 cleanup claim is global: it may expire or lease another
account's row before TypeScript can reject the response. The worker now uses only
the new 0052 **account-scoped claim and finish RPCs**. There is no global fallback,
nor a race-prone preflight assumption that only one account exists.

Applying 0052 creates an empty private approval registry; it approves nothing.
The matching check file verifies the boundary. Existing owner-confirmed
0047–0052 do not need replaying. Do not bulk-push unreconciled migration history.
If that registry already exists, a read-only preflight rejects schema/privacy
drift (including unexpected policies, column grants and weakened constraints)
before attempting any repair. A valid rerun preserves approval and content rows.

Hosted rollout is owner-confirmed on **2026-09-24**: the supplied screenshots show
`assert_imagekit_observation_registry_v1` returning normally and all nine matching
0052 checks `true`. The assertion returns `void`, so its empty result cell is
expected, not a missing success value. The agent did not execute hosted SQL.
This confirms the migration checks, not actual account approval, provider
activation, a live upload or end-to-end acceptance.

## Conditions for one invocation

`createImageKitObservationEntry()` accepts no browser-selected account, keys,
file IDs, worker ID or `approved` flag. The zero-argument server action
`requestImageKitObservation()` invokes it exactly once and still needs all of
the following, irrespective of any earlier UI status:

1. A fresh authenticated AAL2 session and live active administrator profile.
   Missing session-boundary RPC (0038) fails closed even in development; only
   the existing cached page helpers retain their historical compatibility.
2. An exact, allowed Origin; missing Origin does not fall back to Referer.
3. The separate `IMAGEKIT_OBSERVATION_ENABLED=true` gate and canonical server
   credentials. The example remains `false`; the upload pilot is independent.
4. A security secret and an explicit, unexpired owner approval for that exact
   account, canonical endpoint and HMAC of **both** public and private keys.
5. Shared, fail-closed database quotas: 3 attempts/minute per administrator,
   6/minute and 300/day per account. Idle checks also consume quota. Account
   buckets do not depend on approval revision, worker ID or the key pair.
6. Parent lifecycle readiness, an account-scoped database lease, and repeated
   fresh authorization checks before claim, provider observation and finish.

Errors are deliberately generic. No credentials, fingerprint, provider body,
internal file path or lease identity is returned by the entry result.

## Approval is explicit and revocable, not key-pair discovery

The service-only approval RPC requires an active **owner**, rotates a random
revision on every approval and limits its lifetime to 24 hours. Revocation uses
the exact revision to avoid accidentally revoking a newer approval. Both are
audited without keys, credential fingerprints or provider payloads. Direct table
access is revoked, including for the service role; helper functions are private.

The application does **not** call either approval mutation. A future owner setup
flow must first review the actual account and verify the configured key pair with
provider-supported evidence. A correct key format, matching HMAC, successful
private-key GET or empty folder listing does **not** prove that public/private keys
belong to the endpoint. Approval records are operator attestations, not such proof.

Changing either key, account/endpoint or the security secret invalidates the old
credential binding. Disabling the approver's owner profile, revocation, expiry or
reapproval blocks the next authorization check. Claim/finish lock the approval
and active profiles, and recheck time after acquiring their content locks.
Revocation cannot retract a GET that already started; an uncertain provider
outcome stays pending/manual-attention, never resolved or deleted.

## Time and mutation limits

One run has a 30-second timer plus wall-clock and monotonic checks. Every async
operation starts through a lazy budget checkpoint. The provider GET receives the
abort signal and retains its own 15-second/64 KiB bounds. A late authentication,
quota or RPC response cannot cause later operations to start after timeout.
An already-sent SQL operation may still commit; the worker never retries an
ambiguous claim or finish.

One claim considers at most one row **from the approved account**, preserving
existing intent/asset/lease locks, reference guards and audit semantics. The new
finish wrapper also checks that the leased intent belongs to that account.
Observation records only `pending` or `attention`. Empty provider metadata is
“not observed now”, not proof of physical absence, quiescence or successful cleanup.

## Manual operations panel (7A.2f.3c.2d)

Media V2 groups setup status, two buttons and the existing upload-check snapshot:

- **Refresh status** reads setup and the bounded database overview. It does not
  run the observer, contact ImageKit, approve an account or reload the Media page.
  Fresh AAL2/profile and exact Origin checks protect the action. Its separate
  actor quota allows 30 requests/minute, fails closed, and never consumes the
  observation quota. Initial server rendering consumes neither quota.
- **Check one upload** calls the admitted observer once, without browser-selected
  targets. Setup status is advisory, not proof of key-pair/account ownership or
  permission to skip any admission check. Missing setup/approval disables the
  button; server authorization still guards direct or stale action requests.
- Outcomes distinguish no lease selected, not found at this observation,
  inconclusive, manual review, blocked/not-ready, and unconfirmed. Neither an
  empty claim nor an absent observation means storage is empty or a file deleted.
  A blocked or timed-out run may already have changed the database check state.
- Every attempt requires an explicit successful status refresh before another
  check. A failed refresh keeps the prior snapshot and result visible but leaves
  checks locked. Strict shared display contracts reject unknown fields, malformed
  results and inconsistent overview counts rather than inventing a safe state.
- The client locks double clicks, waits at most 15 seconds for refresh and 45
  seconds for a check, and ignores late results. Ending client waiting does not
  cancel the server operation. There is no polling, automatic retry or page/cache
  revalidation; editor drafts and manual disclosure choices stay in place.

The server setup/overview read has a shared 10-second abort budget; the overview
retains its own 5-second deadline. Fresh authentication precedes reading config
or service data. Only safe status codes, timestamps and the existing bounded
overview reach the client, not account IDs, endpoints, keys, hashes, approval
revisions, leases or provider payloads. The optional callback seam is for isolated
component fixtures; the actual Media page always uses the server actions.

Setup messages distinguish missing connection details, checks switched off,
security setup, unavailable database, missing migration, unready database guards,
missing approval and unconfirmed status. The migration message asks to verify
through 0052, not replay owner-confirmed migrations. Secrets are never entered
through this panel. External alerts and a real-account approval UI remain pending.

## Still pending

- Owner supplies ImageKit configuration and explicitly verifies/approves account
  setup. Keep keys out of chat, source control and client payloads.
- Real-account acceptance of the manual caller and external operational alerts;
  no background job is installed here.
- Provider quiescence and version-safe resolution: no deletion API is enabled.
- Progress/retry/cancel integration and the disposable image + video pilot.
- Three optimization presets and a controlled media cutover remain later batches.

Independent photo-framing save/reload acceptance (14B), Gmail/Resend (7B), remaining
Classic-to-V2 acceptance (13G) and owner approval to retire Classic (13H) remain
open. These increments do not complete any of those checkpoints.

## Verification (2026-09-23)

- Full regression: **4,811 tests / 172 files** with two workers.
- Full ESLint, standalone TypeScript and production Next.js build pass. Build
  retains the existing Edge Runtime deprecation/static-generation warnings.
- Isolated PGlite SQL coverage passes: empty registry, owner-only grants,
  binding/revision/expiry/revocation, cross-account no-mutation, one-candidate
  scope, fenced finish, private ACL/RLS, preserving reruns and preflight drift
  rejection. Existing predecessor functions remain unchanged.
- Separate real PostgreSQL runner passes **8 multi-session scenarios**: both
  revoke/claim orders, both reapproval/finish orders, inactive approver while
  waiting on its profile, expiry during an intent-lock wait, duplicate claims,
  and untouched foreign-account records. All **9 deployment checks** pass.
- Independent code review caught two auth issues, both fixed and tested: the
  legacy missing-session-RPC fallback must not admit this worker, and late auth
  responses must not initiate further auth requests after the shared deadline.

Reproduce the race suite with `node scripts/test-imagekit-observation-concurrency.mjs`.
It uses the existing ownership-checked runtime and a cached Docker PostgreSQL
image, creates a new network-less/tmpfs container without host ports/mounts,
and removes only its own container afterward. For the single-connection suite,
run `node scripts/test-imagekit-observation-admission.mjs <local-PGlite-dist/index.js>`.
Neither runner reads project credentials, calls ImageKit or connects to an
existing/hosted database. The 2c backend-only batch had no UI acceptance surface;
the separate 2d browser evidence below does not establish live account acceptance.

## Verification of manual operations (2026-09-24)

- Full regression: **5,065 tests / 177 files**, with two workers. Full ESLint,
  TypeScript and production build pass; only the existing Edge Runtime warnings
  remain. The initial build exposed a test fixture's widened role type, corrected
  to `AdminUser` before the passing build.
- Backend tests cover fresh auth before configuration/service reads, exact
  Origin, independent refresh quotas, readiness/approval expiry and changed
  bindings, deadline/abort behavior, and exactly one observer invocation with
  strict result projection. Page rendering never claims work or calls ImageKit.
- Independent review found malformed refresh replies could poison the display.
  Shared pure contracts now validate the full snapshot before adoption. Tests
  cover preserved prior state, unlocked refresh controls after failure, late
  responses, double clicks, Strict Mode and recovery without losing editor drafts.
- Browser QA used the actual React components and CSS at loopback port 3105,
  with synthetic callbacks only: all ten setup states, all seven outcomes,
  double click => exactly one check, failed refresh retaining the previous
  result, successful refresh unlocking the next check, and preserved draft and
  manually collapsed overview. Desktop and 390px responsive checks passed,
  including keyboard disclosure control, no horizontal overflow, touch targets
  at least 44px high and no captured console warnings/errors.
- `node scripts/imagekit-operations-browser.mjs` reproduces the isolated UI.
  Select controls then press **Apply scenario**; this resets only the panel.
  The synthetic refresh-failure checkbox also needs Apply scenario. Controls do
  not configure the application. No `.env` loading, credentials, auth/DB/provider
  clients, save endpoint or remote connections exist in this fixture. Its strict
  module allowlist admits only the two new pure contracts, never the server reader.
  Adding those contracts initially tripped the guard as intended; the allowlist
  and synthetic snapshot timestamps were corrected before the final passing suite.

This verifies the UI and mocked server boundaries, not a signed-in real-account
observation, approval flow or provider lifecycle. No live provider request,
hosted SQL, approval, flag change, media mutation or Git push was performed.
