# Classic / V2 final audit — Batch 13G

Date: 2026-09-21. Scope: active Classic workflows, V2/public editability,
authorization, migration contracts, desktop/mobile interaction and release gates.

## Decision

No additional important **active Classic feature missing from V2** was found.
Three code defects were repaired and verified. This is not approval to delete
Classic: the isolated database and draft-only browser checks below do not prove
a complete live save/upload/restore round trip. Keep 13H behind that acceptance
gate and explicit owner approval. No new migration is required by these repairs.

## Repairs

| Finding | Repair | Regression evidence |
| --- | --- | --- |
| Classic Trash restore updated by ID without a version token, allowing a stale form to override a newer Trash decision. | `app/admin/media/actions.ts` now authenticates, checks origin and hands legacy restore forms to V2 for fresh-state review without writing. Classic copy says “Review Trash in V2”. | Six cases in `tests/media-actions-security.test.ts`: denied auth/origin, old/missing/malformed IDs, fixed destination, no service write and accurate UI copy. |
| Appearance could treat a partial or wrong-section canonical response as a successful save. | The shared save-recovery guard requires the submitted section and valid canonical content/version. Unconfirmed outcomes preserve drafts/CAS and block retries until explicit reload. | Sixteen behavioral cases in `tests/site-appearance-save-recovery.test.tsx`, including missing fields/event, malformed response, wrong section, exceptions, sibling drafts and guarded retry. |
| Security's first 1,000 Auth users could falsely mark a later administrator “Missing”. | A capped/paginated directory cannot prove absence: unresolved profiles now report unknown. Found users and owner controls remain usable; no unbounded directory crawl was added. | Eight cases in `tests/security-checks.test.ts` cover complete, partial, paginated, found and failed reads. |

Independent peer review found no additional actionable problems in these fixes.

## Feature parity and public editability

All six public pages use the same PageView components as the V2 previews.

| Area | V2 coverage retained |
| --- | --- |
| Navbar | Owner name, six real pages, visibility/order, detected platform shortcuts, archive/restore. |
| Home | Five section types, visibility/order, copy/media/CTA, Hero framing, four story slots; full CNC program editor under Home. |
| Bio | Hero, biography, rotating portraits, paragraph timing, resume, credits and collection archives. |
| Music | Hero, platform destinations/images/icons, Spotify profile/player, SoundCloud, headings, order/visibility and archives. |
| Gallery | Hero, introduction, frames, captions/alt/category, ordering/visibility and archive; Home Stories remain separate. |
| Showreel | Hero, introduction, video source/type/poster/copy, ordering/visibility and archive. Visitor playback/scroll implementation is unchanged. |
| Contact / Inbox | Hero, optional shared introduction/location, received-message metric, filtering and versioned triage. Actual email delivery remains separate. |
| Media | Upload, metadata/alt, availability, search/filter, usage, atomic replacement + recoverable Trash, restore and page-placement links. |
| Appearance | Three font roles, both footer lights, identity/description/tagline and contextual real-footer copy/link editing. |
| Security / Insights | Active Classic workspaces preserved; Inbox is intentionally separate. Auth, owner permissions, sessions, audit and reporting limitations remain explicit. |

Intentionally not restored: actor/musician switch, Navbar subsection/More links,
raw IDs/internal library order, dormant Home Updates, old Gallery-owned story
selection, unused Showreel featured controls and unrestricted media/iframe URLs.

This is not an arbitrary website builder: legal pages, form/system labels,
per-page SEO templates, page-route/navigation labels, layouts, new section types
and variable-count Home Stories remain code-owned. These are not lost Classic
capabilities.

## Executed verification

- Full regression: **2,569 tests / 141 files**; TypeScript, ESLint and production
  build passed. Only existing Edge Runtime deprecation/static-generation
  warnings remain. `npm audit --omit=dev --audit-level=moderate` reports zero
  known vulnerabilities at audit time; this is not a security guarantee.
- All eight existing isolated PostgreSQL/PGlite suites for **0039–0046** passed:
  footer copy, media/reference replacement, Trash/restore, Navbar/Music/Bio/
  Gallery/Showreel archives, optional Contact copy and Hero framing. Coverage
  includes stale versions/ABA, atomic rollback, permission boundaries, media
  integrity and content-preserving reruns. No remote SQL was run. These tests
  do not establish real multi-connection contention or deployed schema state.
  The final 0046 suite also runs all 50 predecessor checks (0039–0045) in a
  read-only transaction, then eight Hero checks; all pass on the latest schema
  without modifying content or version timestamps.
- Unauthenticated, cookie-free HTTP reads of `/admin/v2`, Media, Security and
  Home preview led to the login redirect, with no checked protected-content
  markers and with noindex/noarchive headers. Next's streamed response can be
  HTTP 200 with a login meta/RSC redirect; status alone was not treated as access.

### Authenticated browser QA, localhost:3001

Portfolio remained on 3001; the unrelated project on 3000 was untouched.

- Sidebar collapse/expand and mobile navigation; Navbar name/order independent
  drafts and discard. Original name/order restored without saving.
- Gallery: Hero/Introduction drafts survive switching; discarding each section
  preserves the other. Frames archive loads. Mobile inspector/archive opens and
  closes. Showreel's mobile Videos inspector, existing card fields and archive
  load without changing clips or playback settings. Desktop selection scrolls
  the preview to Videos, and clicking an individual preview card opens its fields.
- Bio: paragraph Advanced timing available, 5001 ms produces an inline error
  and blocks Save; draft discarded. Credits archive loads; mobile Biography
  inspector works.
- Music: clicking Platforms in the real iframe opens its inspector. A new local
  draft accepts an edited title/URL; missing required image blocks Save. Draft
  removed. Mobile iframe click opens SoundCloud's editor/archive.
- Home: hiding Code in motion and moving Stories updates the local draft;
  discard returns saved layout. Native program editor loads full source and
  metadata. Mobile Hero opens framing controls.
- Contact: optional copy fields load on desktop/mobile; delivery status honestly
  reports incomplete email configuration. No inquiry was submitted.
- Appearance: footer-light draft, Keep editing and confirmed Discard work;
  clicking the real footer opens its contextual editor. Fonts/light and footer
  fields remain available after the recovery fix.
- Media: mobile library, empty Trash filter, selection, usage and metadata
  inspector load. Existing Home media usage is explained without claiming that
  every stored reference is publicly visible. No file was changed or uploaded.
- Inbox weekly metric, message controls, Insights Data health, Settings and
  Security tabs load at mobile size. No message/access/session action was used.
- At 390px, all six page-editor routes plus Navbar, Appearance, Media, Inbox,
  Insights, Settings and Security had no document-level horizontal overflow.
  This is not a claim that every nested control has exhaustive accessibility QA.

No browser console errors were captured. Temporary viewport overrides were reset
and the agent-created audit tab was closed.

All draft changes were discarded. No owner content, real message, access policy,
storage file, provider setting or remote migration was changed. No commit/push
or deployment was performed.

## Open gates — do not silently mark these passed

1. **Disposable write acceptance:** upload a tiny owned test image; edit/save/
   reload it; place it in a hidden test item; use a second session to verify stale
   save rejection; replace the test-used asset, Trash/restore, and archive/restore
   the test item. Use an explicitly isolated test deployment/database or an
   owner-approved disposable fixture workflow. Do not permanently purge files
   or replace an owner-used source as a test.
2. **Hero persistence:** six Hero placements are real singletons. A complete
   save/reload/public reflection check needs isolated test content/database, not
   temporarily overwriting the owner's current Hero. Draft/renderer and isolated
   RPC tests are already covered but are not the same evidence.
3. **Auth acceptance:** fresh password + authenticator, recovery and any second
   account/session-revocation test require an approved test account or owner
   participation. The existing owner was not logged out or reconfigured.
4. **Schema evidence:** owner reports 0039/0040 applied; their live read-only
   check results remain to be explicitly recorded. Screenshots confirm checks
   0041–0046. Local passing checks do not replace live evidence. Run only the
   matching read-only checks; do not rerun old migrations over newer functions.
5. **Classic retirement:** after acceptance, request owner approval, implement
   the client-side fragment bridge in 13H and test real legacy bookmarks before
   removing routes. The mapping is still preparation, not active redirects.

## Separate production backlog / morning reminders

- Live readiness reports **public Supabase signup enabled**. Owner should
  disable it in Auth settings. This is not an admin bypass: an active approved
  profile, verified session and AAL2 are still required.
- Verify canonical HTTPS site URL on the actual deployment. Local readiness's
  localhost URL warning does not establish that Vercel is misconfigured.
- Finish client-owned email setup (Gmail as notification recipient via the
  planned Resend workflow), verify delivery and webhook monitoring: Batch 7B.
  Inbox storage and email delivery are distinct.
- Continue ImageKit Batch 7A.2f / optimization. Recoverable Trash retains bytes;
  provider-linked assets stay protected until provider-aware cleanup exists.
- Insights caps event reads at 5,000 and honestly reports partial coverage,
  30-minute consented tab sessions rather than unique people, unavailable trends
  and paused Web Vitals. DB aggregation, verified retention/coverage and a
  standards-based vitals collector are separate work, not completed by parity.
- Review privacy/controller identity and legal copy with the owner before launch.

Next: finish the explicit acceptance gates above, then owner decision on 13H.
No new migration was produced by Batch 13G.

## Release follow-up

The owner subsequently requested that the completed changes be published to
`codex/admin-studio-redesign`. Hero 14A, 13F and all three 13G code fixes are the
release scope. Full regression (2,569 tests / 141 files), lint and production
build were rerun successfully; the final 0046 SQL suite again passed all lifecycle
tests, 50 predecessor checks and eight Hero checks. Independent release review
found no code blocker, unexpected deletions, temporary runtime fixtures or
common credential patterns in changed/new files. The open acceptance/provider
gates remain explicit; publishing this checkpoint is not Classic retirement or
authorization to modify production accounts, data or migration history.
