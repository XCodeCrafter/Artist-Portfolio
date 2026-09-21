# Admin V2 workflow and Insights audit — 2026-09-20

Follow-up: the owner subsequently authorized repairs. Implemented changes and
their verification are recorded in `privacy-and-audit-repairs-2026-09-21.md` and
`analytics-consent-hardening-2026-09-20.md`. Findings below describe the audit
snapshot, not an assertion that all listed defects remain in the current code.

## Scope, evidence, and status

This is an audit and implementation proposal, not a declaration that every V2
workflow or production integration has passed end-to-end testing. It covers
the existing analytics collector, server ingestion, aggregation, dashboard,
retention, and selected V2 editing workflows. Existing uncommitted work is
preserved. This document does not implement product changes, apply migrations,
publish content, or change provider configuration.

Evidence labels used below:

- **Source-verified:** a behavior or missing control directly visible in the
  checked-out implementation. File locations describe this audit snapshot.
- **Inferred consequence:** the expected result of that implementation under
  the stated conditions; not a claim that the condition was reproduced against
  the production deployment.
- **Test-observed:** a result of the explicitly listed local test command.
- **Browser-observed:** reserved for exact findings from the separate,
  authenticated, non-publishing browser pass below.

Prior editability work and its migration requirements are documented separately
in `docs/public-editability-audit-2026-09-20.md`. Earlier security work is in
`docs/admin-audit-2026-09-20.md`. Neither document is superseded by this audit.

## Executive assessment

V2 has a useful visual-editing foundation and Insights already has real event
collection. However, the current reporting is not ready to promise complete
long-range visitor statistics: reads are capped, source attribution uses the
wrong referrer, and scheduled retention is incompatible with a full year of
history. Several interaction and performance metrics also need correction.

The recommended direction is to retain Supabase and the current V2 visual
language, harden uncertain-save recovery, and improve the analytics data
contract before adding more impressive-looking charts. A new analytics
provider, persistent person tracking, and a newsletter are not prerequisites.

## Current metric definitions and capabilities

| Metric or control | What the current implementation actually measures | Important limitation |
| --- | --- | --- |
| Reporting windows | 7, 30, 90, or 180 UTC calendar days, including today; immediately preceding equal-day-count window for comparison | No 365-day option; 180 days is not calendar six months; today is partial |
| Page views | Accepted client `page_view` events on eight fixed public paths | Not server requests, unique people, or all visitors; blocked/failed client collection is absent |
| Anonymous visits | Distinct `sessionId` values among all loaded events in the selected period | Sliding 30-minute, tab-scoped sessionStorage IDs; not persistent unique visitors |
| Sources | Referrer-domain categories counted for page-view events | Currently derived from the telemetry request, not the original landing source; not session-start attribution |
| Popular pages | Page-view event counts grouped by route label; top six | Full page views, not unique viewers; affected by the raw-event read cap |
| External clicks | Accepted `outbound_click` events; destination stored as HTTPS origin | Rankings group by visible label, not stable destination identity |
| On-site actions | CTA clicks, gallery opens, video opens, native video plays, and contact starts | Heuristic capture has gaps and conflates some distinct actions |
| Accepted contact forms | Server-emitted `booking_submit` after at least inbox storage or email succeeds | Not necessarily email delivered; not linked to a visitor session or a conversion funnel |
| Devices and browsers | Coarse user-agent-derived groups, counted per page view | Not exact hardware/browser identification or distinct visitors |
| Performance | p75 over submitted LCP, INP, and CLS values | Current client implementation does not consistently follow metric definitions |
| Recent activity | Newest 20 events in the loaded selected-period sample | Not an uncapped total or a subscribed live stream |

Sources: `lib/admin/analytics-shared.ts:1`,
`lib/admin/analytics.ts:233`, `components/AnalyticsTracker.tsx:23`,
`app/api/booking/route.ts:291`, and
`components/admin/AnalyticsDashboard.tsx:437`.

The path allowlist is `/`, `/bio`, `/booking`, `/gallery`, `/music`, `/privacy`,
`/terms`, and `/video`. Admin routes are not tracked as page views. An admin
opening a normal public page is not separately excluded.

### Identity and attribution boundaries

The existing session ID should be described as a short-lived visit identifier,
not a person identity. Separate tabs, storage restrictions, reopening a tab,
and inactivity can create additional sessions. No returning-person or
cross-device metric exists. A dashboard headed “Visitors” should explain that
its main count is visits/sessions rather than silently promising unique people.

Acquisition should mean the source at session entry. Internal navigation must
not overwrite it. A missing/referrer-suppressed origin is legitimately “Direct
/ unknown”; it cannot safely be reverse-engineered into a search or social
source. Keep any future campaign fields explicitly allowlisted rather than
storing arbitrary URL queries.

## Analytics findings

### A1 — P1: capped raw-event reads are not complete reports

**Source-verified:** `lib/admin/analytics.ts:382` selects raw events for both
reporting windows, orders newest first, and uses `.limit(5000)`. Aggregation is
then performed in application memory. The only truncation indicator checks
whether the returned array length reaches 5,000.

**Inferred consequence:** once the window exceeds the read limit, older days
and the comparison period are preferentially omitted. Totals, visits,
rankings, and trends all become partial. The V2 warning is helpful when it
appears, but it does not make the report complete.

Supabase documents a default maximum of 1,000 returned rows. The deployed
project's `max_rows`/API setting has **not** been inspected; local
`supabase/config.toml` does not establish a higher API limit. If the deployed
limit is below 5,000, this query can be truncated without its current warning.
This is a configuration-dependent risk, not a remotely verified 1,000-row
production cap. [Supabase select documentation](https://supabase.com/docs/reference/javascript/v1/select).

**Required outcome:** aggregate complete ranges in the database through a
protected reporting interface. Keep a separately bounded recent-events query.
Do not solve this merely by increasing the API row limit.

### A2 — P1: acquisition reads the analytics request's referrer

**Source-verified:** `app/api/analytics/route.ts:127` uses the HTTP `Referer`
header of `/api/analytics` and classifies a matching site hostname as
“Internal navigation”. `components/AnalyticsTracker.tsx:58` does not send the
landing document's referrer.

**Inferred consequence:** a normal same-origin beacon/fetch request refers to
the portfolio page making that request. An actual Google or Instagram arrival
therefore normally appears internal or unknown instead of retaining its
acquisition source. Browser/network confirmation is pending; the cause is
visible in source. `document.referrer` is the navigation referrer that should
be considered at entry, subject to browser privacy policy. [MDN document.referrer](https://developer.mozilla.org/en-US/docs/Web/API/Document/referrer),
[MDN Referer header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referer).

`lib/admin/analytics.ts:276` also increments source counts for every page view,
while `components/admin/AnalyticsDashboard.tsx:553` calls the panel “Where visits
start”. Even after collection is corrected, define whether a displayed source
share is a share of sessions or page views.

**Required outcome:** sanitized landing-domain attribution captured once per
session, explicit direct/unknown handling, server validation, and aggregation
with a matching denominator. Previously lost attribution cannot be recovered.

### A3 — P1 for 1Y: retained history cannot support the proposed range

**Source-verified:** migration0019 defines a service-only cleanup function.
`app/api/cron/maintenance/route.ts:20` calls it with 180-day analytics retention.
`vercel.json` configures a daily maintenance job. There is no analytics rollup
table in the inspected migrations. `lib/admin/analytics-shared.ts:1` supports
only 7/30/90/180 days.

**Deployment limitation:** the scheduled route and cleanup configuration exist
in the repository; the deployed `CRON_SECRET`, migration state, job execution,
and actual oldest retained event have **not** been verified. Do not describe
the production job as confirmed running.

**Inferred consequence if configured maintenance runs:** raw events older than
180 days are removed. A full current year is impossible, and comparison with
the preceding 180 days is incomplete. The existing 180-day UI warning does not
disable the potentially misleading trend values.

**Required outcome:** retain compact, non-person-level daily aggregates long
enough for the supported comparisons. A current-year versus previous-year
feature needs approximately two years, with an appropriate boundary buffer,
not merely 365 days. Raw retention can remain shorter. Explicitly distinguish
missing history from zero activity; do not invent historical data on rollout.

### A4 — P2: action counts do not consistently represent deliberate actions

**Source-verified:**

- `components/ShowreelWorks.tsx:96` calls `.play()` for active previews. Its
  muted preview video has no `autoPlay` attribute. The tracker at
  `components/AnalyticsTracker.tsx:165` excludes only videos for which both
  `autoplay` and `muted` are true. Thus programmatic preview playback reaches
  the same recording branch as an intentional video play. Native playback is
  recorded only once per mounted video element, not on every loop.
- The Showreel fullscreen player may be a cross-origin iframe
  (`components/ShowreelWorks.tsx:505`); native `play` event capture does not
  observe that player's playback.
- The internal CTA selector is `[data-cta], .cta, [class*='cta']` at tracker
  line145. `components/HomeSectionCta.tsx:20` has none of those markers. No
  actual `data-analytics-event` annotations were found in public components.
- A link to `/booking` and the first focus in a form containing an email input
  both produce `contact_start` (tracker lines143 and160). These are two
  different intent levels and can occur in the same visit.
- Dialog classification uses its visible label/text and assumes a non-gallery
  dialog is a video. It does not resolve `aria-labelledby` for its label.
- `lib/admin/analytics.ts:283` groups outbound clicks by visible label alone.
  Changing copy splits one destination's history; repeated labels merge
  unrelated destinations.

**Required outcome:** explicit event markers/handlers with stable action and
target IDs. Separate preview, open, and intentional playback. Either instrument
supported embedded players or label their playback as unmeasured. Keep these
changes out of the public interaction design: no removal of Showreel previews
or scrolling behavior is required.

### A5 — P2: session fallback and counting can inflate visits

**Source-verified:** `components/AnalyticsTracker.tsx:42` stores a UUID and
last-touch time in sessionStorage. The storage-error fallback returns a new
UUID on every call, rather than keeping an in-memory session. At
`lib/admin/analytics.ts:267`, every event type can contribute a distinct
session, not just a page view or session start. Vitals request an ID when they
flush, including after long inactivity.

**Inferred consequence:** restricted storage can turn several events from one
visit into several visits. A delayed background/vital event can create a new
session with no corresponding viewed page. This has not been fault-injected
in the browser pass.

**Required outcome:** a bounded in-memory fallback, validated session state,
and an explicit session-start/counting definition. Attribute a session spanning
midnight consistently; summing daily distinct active IDs otherwise double
counts it. Persistent identity, fingerprinting, and cross-device tracking are
not required or recommended as implicit additions.

### A6 — P2: current Web Vitals collection is not standards-equivalent

**Source-verified:** `components/AnalyticsTracker.tsx:208` recreates buffered
observers on each pathname, sums all eligible layout shifts, takes the largest
observed interaction duration, and sends each metric only once after its first
flush. Buffered document entries can therefore be replayed into later SPA
route reports; subsequent worsening after a background/foreground cycle is
not sent for a metric already marked as sent.

CLS is the largest qualifying session window, not a sum of every shift over
the document lifetime. INP also has interaction-group/outlier and lifecycle
rules. The observer's default event duration threshold omits fast interactions.
These are source-level differences from the documented algorithms, not a
measured claim that the public portfolio is slow. [CLS definition](https://web.dev/articles/cls),
[INP definition](https://web.dev/articles/inp),
[PerformanceObserver options](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceObserver/observe).

**Required outcome:** use the official `web-vitals` implementation with
document/soft-navigation scope chosen explicitly, stable metric IDs and correct
update aggregation. Until then, keep this panel secondary and avoid presenting
its numbers as certified Core Web Vitals. Unsupported or insufficient samples
should be unavailable, not artificially good.

### A7 — P2: read health and historical coverage are mistaken for collection health

**Source-verified:** `app/api/analytics/route.ts:267` returns success after an
insert error without recording an ingestion-health signal. Missing production
rate-limit infrastructure fails closed in `lib/security/rate-limit.ts`; the
collector intentionally returns an innocuous response to dropped requests.
The dashboard's connected/flowing status depends on successful reading and the
presence of a selected-period event (`app/admin/v2/insights/page.tsx:30`).

**Inferred consequence:** old rows can remain readable while new collection is
broken. Zero-filled days before tracking began or after history was removed
look like real inactivity. The current period includes part of today while the
prior period contains complete days. Development/preview traffic can also mix
with production when deployments share the same backend.

**Required outcome:** distinguish readable, collecting, stale, incomplete, and
unavailable states. Track reporting coverage and collection-version cutovers,
surface safe operational failure signals, and choose explicit production/test
traffic handling. Do not expose raw request bodies or identifying debug data.

## Existing protections and privacy boundaries

The analytics audit found no critical authorization or data-exposure defect in
the inspected scope. That is not a penetration-test certification.

- `app/admin/v2/insights/page.tsx:22` authenticates before service-role reads;
  Classic also authenticates before loading analytics.
- `supabase/migrations/0001_initial_schema.sql:217` defines the event table,
  enables RLS, and limits normal-role reads to admins. Ingestion is server-side;
  no anonymous direct insert policy was found in the inspected schema.
- The public route uses an 8KB body bound, allowlisted event/path values,
  strict metadata schemas, bounded strings, configured-origin validation,
  coarse bot heuristics, and a shared 120-event/minute/IP admission limit.
- `lib/security/request.ts` trusts Vercel's platform IP header only on Vercel,
  or explicitly configured reverse-proxy headers. Otherwise the IP is unknown;
  self-hosted deployments must validate their proxy configuration rather than
  assume per-visitor limiting works.
- Analytics rows contain short-lived session IDs and coarse device/browser
  categories, not raw IPs. Outbound URLs become origins; raw target URLs are
  not rendered as clickable admin telemetry links.
- Security audit events are separate: they can contain HMAC-derived IP keys,
  a sanitized user-agent, origin, and query-free referrer. Avoid the broader
  claim that no pseudonymous identifiers or request metadata exist anywhere.
- `app/privacy/page.tsx:33` currently mentions general analytics only. Update
  the policy to match actual collection/retention when the feature changes.
  This audit does not decide legal consent requirements or certify compliance.
- Origin and user-agent checks do not prove that a public telemetry event was
  generated by a human. Best-effort bot filtering and event deduplication can
  improve quality, but charts must not be treated as security evidence.

## V2 editing/workflow findings

These findings combine the coordinating audit's source review with local
source spot-checks. They are not browser fault-injection results.

### W1 — P2: rejected action recovery is inconsistent

Bio (`components/admin/v2/BioEditor.tsx:1040`), Music (`MusicEditor.tsx:995`),
Gallery (`GalleryEditor.tsx:722`), Showreel (`ShowreelEditor.tsx:908`), Contact
(`ContactEditor.tsx:526`), and all three Navbar save handlers await server
actions without a surrounding rejection handler. Navbar locations are
`NavigationManager.tsx:305`, `NavbarNameEditor.tsx:18`, and
`NavbarSocialLinksManager.tsx:76`, in the same component directory.

**Inferred risk:** a rejected server action can propagate to an error boundary,
unmounting the editor and losing its in-memory draft. No artificial outage or
publishing operation was induced to reproduce this during the audit.

HOME does catch rejection at `components/admin/v2/HomeEditor.tsx:143` and tells
the user to reload before retrying. However, there is no corresponding hard
reload-required lock: Save remains available after an uncertain outcome or
conflict. This is a recovery/clarity gap, not evidence that database version
checks can be bypassed.

**Recommended acceptance:** preserve the draft and its original version,
distinguish confirmed rejection from uncertain completion, and require explicit
reload/reconciliation before a retry when the outcome is unknown. Test this
with mocked rejected actions; do not create outages in a live provider.

### W2 — P2: Overview readiness has a narrower scope than its wording

`lib/admin/v2-overview.ts:117` loads navigation, six page editors, and the Inbox
count, and includes Contact email/delivery setup checks. It does not load the
new Appearance/footer migration0039 or Media migration0040 readiness. Yet
`app/admin/v2/page.tsx:192` can display “Everything is ready”.

**Inferred consequence:** those new workspaces may still require setup while
the overview sounds globally complete. Extend readiness coverage or explicitly
qualify the status. This is not proof that either migration is absent remotely.

### W3 — P3: Appearance discovery copy is stale

`app/admin/v2/settings/page.tsx:77` still describes Fonts & appearance as fonts
and the footer light effect. The workspace now also contains identity and
footer content; `lib/admin/v2-destinations.ts:227` already describes the broader
scope. Align the Settings card so a nontechnical owner can find those controls.

### W4 — P3: HOME reports enabled sections as definitely visible

`components/admin/v2/HomeEditor.tsx:241` counts enabled layout entries and labels
them visible; individual entries likewise say “Visible on Home”. The actual
shared renderer at `components/home/HomePageView.tsx:159` distinguishes enabled
sections from CNC without programs or Stories without images.

**Inferred consequence:** the editor can claim a section is visible when its
required content is absent. Show “Enabled, needs content” separately from
renderable/visible and retain the useful empty-state editing placeholder.

### W5 — enhancement, not parity defect: Resume document uploading

`components/admin/v2/BioEditor.tsx:775` currently accepts a secure public resume
URL and explicitly says PDF uploads are a later step. The Media uploader at
`components/admin/v2/MediaLibraryUpload.tsx:74` accepts images and videos, not
PDFs. Do not present a resume-to-library upload/picker flow as already
integrated or accidentally broken. Supporting documents needs its own bounded
storage/type-validation, preview/link, reference, and deletion design.

### W6 — P2: Media inspector's bottom actions fall below the viewport

**Browser-observed and source-verified:** at 1440 × 1000, selecting a used video
with the full 86-file library produced an inspector 1269.7px high, pinned at
20px. The removal button started at y=1224.7, outside the viewport. The semantic
click could not bring it into view. Searching down to two matching files made
the button reachable and its inline confirmation opened normally.

`components/admin/v2/MediaLibraryEditor.tsx:111` applies `xl:sticky xl:top-5`
without a maximum height or internal scrolling. The long adjacent file grid
keeps the oversized inspector pinned. Constrain its desktop height to the
available viewport and provide vertical scrolling; preserve normal document
scrolling on smaller screens. Verify expanded information, long usage lists,
and removal confirmation at both tall and short desktop heights.

### W7 — P3: dirty-state and discard behavior are inconsistent

Media marks metadata dirty on every edit (`MediaLibraryEditor.tsx:59`), without
comparing the restored values to the selected asset. Restoring the exact
original file name still left Save enabled, uploads disabled, and navigation
guarded in the browser. Its explicit Discard button resets the state, but the
owner is not told why apparently unchanged data still blocks other work.

CNC explicit discard invokes the shared native confirmation; HOME, Appearance,
and the older section editors usually discard directly. The shared guard also
uses native confirmation for navigation, Back, reload, and other submissions
(`components/admin/useUnsavedChangesGuard.ts`). Media removal and CNC removal
already use contextual inline confirmation. Prefer a consistent accessible
in-app confirmation for app-controlled discard/navigation; retain browser
beforeunload protection for actual tab/window unloading.

**Browser limitation, not a universal product failure:** the in-app browser
became unresponsive around CNC discard and later Media dirty navigation. Its
dialog API returned no controllable dialog. The user was asked to close the
affected test panels. This does not establish that ordinary Chrome or Edge
freezes, and the remaining click tests must not be counted as passed.

### W8 — P3: plain-language help and validation need a cleanup

- `components/admin/v2/GalleryEditor.tsx:355` still calls the already available
  HOME editor a future feature. This copy was also visible in the browser.
- Adding a blank Music platform immediately displays raw schema messages such
  as `Too small: expected string to have >=1 characters`. Replace these with
  field-specific instructions such as “Add a title” or “Choose a card image”,
  and consider delaying errors until the field is touched or a save attempted.
- The Bio PDF note is **not** stale: document uploads genuinely remain future
  scope. Do not change it to imply PDF support already exists.

## Recommended scoped batches

These are proposed audit follow-ups, not newly completed work or changes to the
main TODO. Existing ImageKit/provider and email-delivery tasks stay separate.

### Batch A — V2 recovery and truthful readiness

Unify rejected-action handling and uncertain-save recovery across older page
editors and Navbar. Include Appearance/Media in overview readiness or narrow
the claim. Fix Media inspector reachability, align discard/dirty-state behavior,
and correct Settings discovery, validation, stale help, and HOME
enabled-versus-renderable copy.

Acceptance: mocked failure/conflict tests retain drafts and original versions;
unavailable workspaces cannot produce a global ready status; no automatic
publish/retry; authenticated non-publishing browser checks cover navigation,
preview selection, dirty-state discard/cancel, and keyboard/mobile behavior.

### Batch B — analytics collection contract

Define visits, session start, landing source, page views, and intentional actions.
Add a resilient short-lived session fallback, stable event/target identifiers,
landing attribution, explicit action instrumentation, deduplication, and a
production/test traffic boundary. Preserve existing Showreel behavior.

Acceptance: tests cover suppressed referrers, internal navigation, storage
failure, duplicate events, deliberate versus preview playback, unmeasured
iframes, contact link versus form start, and invalid public payloads. Keep
server booking acceptance authoritative. Add no newsletter metric or
persistent identity requirement for a feature that does not exist.

### Batch C — complete aggregation, retention, and time boundaries

Add protected database aggregation and compact daily/session-start rollups;
retain sufficient aggregates for the chosen year comparison while bounding raw
event retention. Keep capped event inspection separate. Choose reporting
timezone, calendar versus rolling windows, and partial-day comparison policy.

Acceptance: correct totals beyond 1,000 and 5,000 events; no dependency on a
higher API row cap; service-only write/maintenance permissions; tests for
midnight, timezone/DST boundaries, multi-day sessions, retention gaps, backfill
limits, and failure-safe maintenance. Database deployment requires a reviewed
migration and verification step, not an unannounced remote write.

### Batch D — owner-friendly Insights UI and data health

Build on the existing V2 shell: visits trend with 7D/30D/90D/6M/1Y controls,
sources, popular pages, deliberate actions, and accepted contact forms.
Clearly define counts, show previous-period comparisons only when meaningful,
and expose incomplete/unknown coverage. Keep technical details secondary.

Acceptance: empty, partial, stale, and unavailable states are distinct; charts
have accessible equivalent data; small-screen ranges are usable; recent events
are not called a live feed unless an actual refresh/subscription mechanism is
implemented. No historical fabrication or claim of unique people.

### Batch E — trustworthy performance diagnostics, optional documents

As a separately scoped performance follow-up, replace the hand-written vitals
collector with the official implementation and test document lifecycle,
background/resume, and metric updates. Hide or qualify unreliable diagnostics
until corrected. Resume/PDF uploading is a separate optional enhancement, not
a dependency of basic Insights or V2 usability.

## Verification performed and limitations

**Test-observed:**

```text
npm test -- tests/insights-v2-ui.test.ts tests/security-request.test.ts tests/booking-route.test.ts
3 test files passed; 25 tests passed.
```

Additional coordinating-agent regression run:

```text
npm test -- tests/insights-v2-ui.test.ts tests/media-library-ui.test.tsx tests/cnc-program-editor-ui.test.tsx tests/site-appearance-ui.test.tsx tests/home-editor.test.ts tests/navigation-editor.test.ts tests/security-request.test.ts tests/booking-route.test.ts
8 test files passed; 81 tests passed.
```

These counts overlap; they are not 106 independent tests. The preceding batch's
882-test full check remains a historical result, not a new full-suite run in
this audit.

The existing Insights tests primarily assert source/routing/UI contracts, not
runtime correctness of collector ingestion, aggregation, or browser event
capture. Passing them does not disprove the findings above. No dedicated
analytics-ingestion, analytics-summary, tracker-session, or retention runtime
test suite was found during this pass.

No production database settings, raw events, provider credentials, deployed
cron execution, remote migrations, or externally delivered email were inspected
or changed for this analytics audit. No analytics fault injection or content
publishing was performed. External documentation supports platform behavior;
it does not establish this deployment's configuration.

## Authenticated browser QA — observed coverage and remaining gates

Environment: local portfolio at `http://localhost:3001`, owner-authenticated
in-app browser; port3000 was not used. Desktop checks used 1440 × 1000 where
noted; HOME began in the narrow inspector/drawer layout. No content save,
upload, replacement, Trash mutation, booking submission, security change,
email send, or migration was executed by the audit.

| Workspace | Observed result | Limits |
| --- | --- | --- |
| Navbar | Owner-name draft, visibility switch, order arrows, mobile preview and URL-based SoundCloud→Spotify detection reacted. Name discarded; links/order/URL restored. | No publish; page-order and shortcuts lack an obvious standalone Discard like the owner-name form. |
| HOME | Preview selection, Hero title live update, hide CNC, move Stories, section-scoped Discard and CNC management link worked. | Full content/media matrix and persisted save/public reflection not tested. |
| CNC | Program name and visibility drafts changed the real code preview. | Native discard blocked the test tab; add/remove/save and keyboard dialog completion remain unverified. |
| Bio | Hero local draft enabled Save; restoring it returned saved state. Biography, Resume and Credits inspectors opened with appropriate controls. | No PDF upload exists; no server save or conflict test. |
| Gallery | Hero, Introduction and Frames loaded; section switching and 390px embedded preview worked. | All 17 frame cards were not individually edited; no publish. |
| Showreel | Clicking Waterfall in the actual preview opened that video's card. A draft title changed the preview and enabled Save; original title restored. Introduction controls loaded. | No upload, actual playback analytics, reorder persistence or publication. |
| Music | Hero, Platforms, Spotify and SoundCloud inspectors worked. Added a local platform, edited its destination URL, then discarded the new card. | New-card validation is technical; no platform was saved. Third-party player playback not tested. |
| Contact | Preview selection opened Contact & form; preview form was inside inert/aria-hidden content. Delivery notices honestly showed missing email and webhook configuration. | No inquiry sent and no email delivery verified. |
| Media | Search reduced 86 files to two; used-video reference showed Showreel usage; inline replacement confirmation required another video and was cancelled; empty Trash state loaded; metadata input reacted. | W6/W7 reproduced. No upload, replace, Trash, restore, provider deletion or storage savings verified. |
| Appearance | All three section selectors, font roles and both light choices rendered. Display-font draft changed; restored to Spectral and saved-state/disabled Save verified. | Subsequent mouse interactions were unreliable after blocked native dialogs. Footer section clicks and light toggle are **not passed** in this run. |
| Insights | Authenticated 30-day overview loaded real totals, reporting links, chart, contact counts and six workspaces. | Tab/range click completion and a new mobile graph test remain pending; totals were not reconciled against uncapped database data. |
| Settings / Security | Settings links loaded; Security overview reported four configuration warnings. Direct `#configuration` navigation selected Advanced and showed email, webhook, retention-secret and deep-health-secret gaps in this local environment. | No access/MFA/session mutations; deployed environment configuration may differ. Other Security tabs not fully clicked in this run. |
| Inbox | Authenticated Inbox and status-filter controls loaded. | Message bodies deliberately excluded from the report; no status, notes, reply, or delete test. |
| Overview | Six editor cards and actionable delivery reminder loaded. Searching “footer” returned the correct Appearance destination. 390px viewport had document width375px, no horizontal page overflow. | Global readiness coverage still has source-level gap W2. |

The owner subsequently confirmed applying0039 and0040 in Supabase (2026-09-20).
Fresh authenticated reads of Appearance/footer and Media usage succeeded after
that confirmation. The owner has **not explicitly confirmed the read-only
check results**, and no SQL check output was received. Do not substitute working
reads for verification of all migration constraints and grants; the matching
check scripts should still return `passed = true` for every row.

Remaining acceptance: release the blocked test-browser dialogs, finish the
unverified interaction matrix and responsive/keyboard checks, then perform
owner-approved fixture-only save/refresh/public-reflection and Media lifecycle
tests. Preserve the separate ImageKit7A.2f and Gmail/Resend7B tasks.

### Follow-up after the owner's migration confirmation

This pass remains non-publishing. It updates the earlier pending observations;
it does not certify every editor's end-to-end persistence.

- **Appearance:** selected White soul and verified its checked state, discarded
  back to the stored Red light, clicked the actual footer invitation and social
  regions, opened Profile & introduction, changed the footer heading in a local
  draft and observed the real preview update. Discard restored saved state.
  No appearance or footer save was submitted.
- **Media:** reloaded usage after0040, selected a used video, confirmed the
  Showreel reference, opened replacement confirmation, verified the final
  mutation button is disabled without a replacement, and cancelled. No file
  replacement or storage operation was executed.
- **Insights:** all six workspace tabs switched successfully. Reporting links
  switched to7,90,180 and back to30 days. Changing the period while Data health
  was selected preserved that workspace; Overview subsequently showed the
  correct range. The180-day retention warning was visible. The30-day source
  panel showed75% Internal navigation and the remaining ranked sources as the
  site's own deployment/localhost domains, consistent with finding A2 (not an
  independent controlled inbound-attribution test).
- **Security:** all five tabs opened, including Admin access, Protection
  activity, Audit Log and Advanced. No account, role, MFA, session or setting
  was changed. Local Advanced continued to report missing email, webhook,
  retention-scheduler secret and deep-health secret configuration.
- **Inbox:** status filter changed to Archived, displayed the expected empty
  result for that filter, and was restored to All. No inquiry status or message
  content was edited.
- **Tool limitations:** the browser connection restarted during range testing;
  it was reconnected and the remaining desktop checks continued. The documented
  viewport override then did not change the page's actual1440×1000 viewport to
 390×844, including after a clean reload. This run therefore makes **no new
  mobile-pass claim**. Native CNC discard and fixture-only persistence/lifecycle
  checks also remain outstanding. Neither tool limitation is by itself proof
  of a public-site defect.

Additional local verification by the migration review:

```text
65 tests / 5 files passed (Appearance data/actions, Media data/actions, Overview).
Isolated PostgreSQL0039 verification and all matching checks passed.
Isolated PostgreSQL0040 verification passed: all15 registry tables, CAS,
atomic replacement/rollback, stale-writer protection, Trash/restore,
pipeline protection, repeat application and service-only grants.
```

The isolated SQL engines did not connect to remote Supabase. Test totals overlap
earlier runs and must not be summed as unique coverage. Product code was not
changed in this follow-up; only this report and migration status in TODO were
updated. Next implementation remains the scoped V2 hardening batch, followed
by analytics collection/aggregation and then the Insights presentation.
