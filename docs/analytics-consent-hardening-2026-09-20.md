# Analytics consent and data-quality repair

Local implementation, 2026-09-20. No remote migration, publishing, booking
submission, production-event insertion or historical-data deletion was performed.

## Collection boundary

- The client creates no analytics session, listeners or requests until the
  shared privacy provider is ready and analytics has been explicitly allowed.
  It rechecks the versioned, expiring preference cookie immediately before
  collecting each event, not merely on the last React render.
- Withdrawal disconnects listeners and erases the tab-scoped session, including
  its memory fallback. A missing/refused/malformed/expired consent cookie makes
  the analytics API return without body parsing, IP pseudonym generation,
  database rate limiting, event writes or security-audit logging.
- Collection runs in production, not the development server. The server also
  drops Vercel preview/development events. Admin paths and editor previews are
  not trackable. Production admins opening a normal public page are **not**
  separately excluded; explicit internal-traffic controls remain future work.
- Essential contact delivery and Inbox storage still work without analytics
  permission. Only the optional `booking_submit` analytics event is gated.
  Inbox totals and opt-in analytics totals therefore intentionally differ.

## Corrected measurements

- Short-lived identifiers describe tab-scoped, sliding 30-minute **visits**,
  not unique people. Counts include sessions with a recorded page view only.
  Blocked sessionStorage falls back to one in-memory session, not a new UUID
  for every action. Full reloads while storage is blocked still start anew.
- Entry attribution comes from the document landing referrer, reduced to its
  origin on the client and domain/platform on the server. The analytics API's
  own HTTP Referer is no longer mistaken for the acquisition source.
- The eight allowlisted `utm_source` values are google, instagram, tiktok,
  youtube, spotify, facebook, apple-music and soundcloud. Arbitrary campaign
  names, complete URLs, paths, query strings and fragments are not retained.
  Referrer suppression legitimately becomes Direct / unknown.
- Each recorded session contributes once to the traffic-source panel; the
  percentage denominator is sessions rather than page views.
- External clicks use stable normalized platform/domain identity, independent
  of editable labels. Clicking Spotify is not reported as playing a song.
- Explicit modal/video markers replace dialog-text guessing. Privacy/CNC
  dialogs and hover previews do not become video actions. Full native-player
  playback is supported; cross-origin iframe playback is not measured.
- Contact-link opening and the first contact-form interaction are distinct.
  A marked booking CTA is counted once, not again as a generic CTA.
- The inaccurate custom Web Vitals collector is paused and rejected at
  ingestion. A standards-based replacement still needs its own implementation.

## Reporting honesty and remaining work

New events carry `collectionVersion: 2` and `consentVersion: 1`. Older rows are
left in storage but excluded from corrected Insights; their incorrect sources,
video semantics and vitals cannot be reconstructed. The UI explains the reset
in measurement coverage and must not be described as data deletion.

The bounded raw-event read now requests an exact matching count, which detects
truncation even when the configured Supabase API row cap is below the requested
5,000. A missing exact count fails closed as partial. Partial totals display
as lower bounds and rankings are explicitly sample-only. This is a **safety
repair, not complete database aggregation**.

Comparison percentages are hidden until coverage/aggregation are verifiable.
The current day is partial and dates are UTC. Reading old rows no longer says
live collection is flowing; missing events do not prove zero visitors.

Still required for complete long-range Insights: protected database aggregates,
verified coverage/cutover tracking, compact long-term retention, deduplication,
ingestion-health monitoring, internal-traffic controls, a standards-based
performance collector, and the proposed visits/views chart. No 1Y, unique-person
or active-time metric is fabricated in this repair. Existing 180-day retention
does not provide a reliable previous-180-day comparison.

## Verification

55 targeted tests in six files passed:

- `analytics-session.test.ts`: fallback, expiry, malformed/future state and
  attribution minimization.
- `analytics-route.test.ts`: consent-first boundary, deployment isolation,
  source/destination normalization, unsupported input and safe failure status.
- `analytics-summary.test.ts`: session denominator, legacy exclusion, stable
  destinations, action separation and lower API caps.
- `analytics-tracker.test.ts`: actual callback execution with a small mocked
  browser event surface; pre-consent silence, hydration, immediate withdrawal,
  storage erase, preview/privacy-dialog exclusion and explicit action dedup.
- `booking-route.test.ts`: essential delivery without permission and optional
  event recording only with permission, including existing failure scenarios.
- `insights-v2-ui.test.ts`: routing, authorization and accessible UI contracts.

Typecheck and targeted ESLint passed. The event-surface harness is not a full
browser or deployed production-ingestion test. Main-agent browser/full-suite
checks are documented separately.
