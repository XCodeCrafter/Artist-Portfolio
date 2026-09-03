# Artist Portfolio

Production-oriented artist portfolio built with Next.js App Router. It supports
actor and musician profiles, editable content, media placement, inquiries,
analytics, security events, and an authenticated admin console.

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Supabase for content, authentication, and atomic rate limiting
- Resend for booking email delivery

## Setup

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.local.example .env.local
```

Required production environment variables:

```bash
SITE_URL=https://your-domain.com
NEXT_PUBLIC_SITE_URL=https://your-domain.com
RESEND_API_KEY=...
RESEND_WEBHOOK_SECRET=random-resend-signing-secret
BOOKING_TO_EMAIL=...
BOOKING_FROM_EMAIL=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SECRET_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_MEDIA_BUCKET=portfolio-media
AUTH_SECURITY_SECRET=at-least-32-random-characters
CRON_SECRET=at-least-16-random-characters
HEALTHCHECK_SECRET=random-monitor-bearer-token
NEXT_PUBLIC_TURNSTILE_SITE_KEY=optional-public-site-key
GOOGLE_SITE_VERIFICATION=optional-search-console-token
SECURITY_CONTACT_EMAIL=public-security-contact@example.com
TRUSTED_PROXY=false
ALLOW_FALLBACK_CONTENT=false
```

`NEXT_PUBLIC_SUPABASE_ANON_KEY` is supported for legacy projects. New Supabase projects can use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

`SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY` are required for production admin access, admin content editing, and audit logs. They must never be exposed to the browser.

Production content fails closed when Supabase is unavailable so a stale demo
identity cannot be indexed. `ALLOW_FALLBACK_CONTENT=true` is only for local
loopback development; the application ignores it for public site URLs.

## Content Model

The editable portfolio content is modeled in `supabase/migrations/0001_initial_schema.sql`.
Fallback seed content lives in `lib/content/fallback.ts`, so the site still builds without Supabase credentials.

## Admin Access

The authenticated admin follows the same page order as the public portfolio:

- `/admin` mirrors every portfolio page with one-click previews, editors, and
  a visible/hidden navbar status.
- `/admin/content` opens the page-first Site Editor for Home, Bio, Music,
  Booking/Contact, primary navigation, global brand settings, and the shared
  footer.
- `/admin/media` provides the actor Gallery/Showreel studios or the musician
  Video Studio, plus upload and library tools.
- `/admin/analytics` shows a complete 30-calendar-day traffic series, period
  comparisons, page rankings, conversion context, and the inquiry inbox.
- `/admin/security` separates configuration health from successfully blocked
  activity, authentication failures, operational alerts, access, and audit
  details.

All editors keep server-side validation, same-origin checks, audit logging, and
immediate live saves. There is no draft/publish layer yet, so every successful
save updates the public portfolio.

Batch 2 adds Supabase Auth based admin login at `/admin/login`.

1. Create a Supabase Auth user in the Supabase dashboard.
2. Insert the user into `public.admin_profiles` using the helper snippet at the end of `supabase/seed.sql`.
3. On first sign-in, enroll a TOTP authenticator and verify its six-digit code.

Admin passwords are created on Supabase Auth users. Do not store admin passwords or password hashes in `.env.local`.

Production authorization uses one source of truth: an active
`public.admin_profiles` row whose email matches the verified Supabase Auth JWT.
Every admin session must be elevated to `aal2` with TOTP MFA. `ADMIN_EMAILS` is
retained only as a development fallback when no server key is configured.

### Password recovery

The login screen includes a complete Supabase password recovery flow:

1. An approved admin requests a link at `/admin/forgot-password`.
2. Supabase returns the user through `/admin/auth/callback`.
3. The callback accepts only a Supabase `recovery` exchange and creates a
   ten-minute, one-time challenge bound to that exact session.
4. The admin chooses a new password at `/admin/reset-password`; the challenge
   is consumed and every session is signed out.

For production, set `SITE_URL` to the canonical HTTPS origin and add the
following entries to **Supabase → Authentication → URL Configuration → Redirect URLs**:

```text
https://your-domain.example/admin/auth/callback
http://localhost:3000/admin/auth/callback
```

Supabase sends the recovery email, so its SMTP sender and recovery email
template must also be configured for the production project.

The editable admin content area at `/admin/content` manages site settings,
typography roles, hero blocks, page copy, social links, credits, audio, and video.

The media manager at `/admin/media` uploads images and videos directly to a
short-lived signed Supabase Storage URL, then verifies and records the asset in
`public.media_assets`. This avoids Server Action request-size limits while
keeping authorization and metadata writes on the server.

Run `supabase/migrations/0002_media_manager.sql` after the initial schema to create/update the storage bucket, metadata columns, and storage policies.

Batch 5 adds analytics and a booking inbox at `/admin/analytics`.
The site records page views, outbound link clicks, and successful booking submissions through `/api/analytics`. Booking form submissions are also stored in `public.booking_inquiries` for admin follow-up.

Run `supabase/migrations/0003_analytics_inquiries.sql` to add indexes for analytics and inquiry queries.

Batch 6 adds the security center at `/admin/security`.
It shows configuration health checks, the development fallback, active admin
profiles, and recent audit logs. Owner admins can add, update, deactivate, and
delete admin profiles for existing Supabase Auth users.

Run `supabase/migrations/0004_security_center.sql` to add audit/admin indexes and an owner management policy.

Batch 7 originally added portfolio profile modes. `site_settings.portfolio_type`
remains `musician` or `actor` for V1 admin and rollback compatibility, but it no
longer publishes or removes public routes after migration 0026.

Run `supabase/migrations/0005_portfolio_modes.sql` to add the profile mode column.

Batch 8 adds the legacy module registry. V1 admin views still use its profile
grouping; the mixed public navbar and discovery endpoints use the curated
navigation catalog instead.

Run `supabase/migrations/0006_module_registry.sql` to add the default gallery hero row.

Batch 9 adds the actor gallery foundation.
The public `/gallery` page now reads from `public.gallery_images`, and actor mode exposes a dedicated Photo Gallery editor inside `/admin/content` with title, category, image URL, alt text, caption, publish state, and sort order.

Run `supabase/migrations/0007_gallery_foundation.sql` to create `public.gallery_images`, RLS policies, and starter gallery rows.

Batch 10 adds the actor showreel foundation.
Videos now support a description, video type (`showreel`, `scene`, `self_tape`, `interview`, `music_video`, `behind_scenes`, or `other`), and a single featured video. Actor mode uses this to present a primary showreel above scenes and clips, while musician mode keeps the same video library flow.

Run `supabase/migrations/0008_actor_showreel.sql` to add the new video metadata columns and featured-video index.

Batch 11 adds actor credits and resume content.
Actor mode now shows a resume block on `/bio` with headline, summary, physical/casting details, languages, skills, representation, downloadable resume URL, and grouped credits. Admins can manage the resume profile and individual credits from `/admin/content`.

Run `supabase/migrations/0009_actor_resume.sql` to add `public.actor_resume`, `public.actor_credits`, RLS policies, indexes, and starter rows.

Batch 12 adds the simple contact workflow. The later mixed form keeps the same
route and delivery pipeline, while visitors explicitly choose Music, Acting, or
General intent. Legacy profile/type fields remain as compatibility metadata.

Run `supabase/migrations/0010_simple_contact_workflow.sql` to add the inquiry metadata columns and index.

Batch 13 adds security event counters.
The contact and analytics APIs record a bounded set of blocked spam/security
events into `public.audit_logs` using `security_*` actions. Admin write actions
also verify same-origin requests before mutating content or access. The main
admin dashboard shows 24-hour threat events and 7-day honeypot traps, while
`/admin/security` shows counters for logged invalid payloads, bad origins,
too-fast submissions, suspicious clients, analytics blocks, and admin-origin
blocks. Rate-limited attempts are intentionally not logged per request; the
readiness panel verifies that the shared limiter is operational.

Run `supabase/migrations/0011_security_event_counters.sql` to add the audit-log index used by the security counters.

Batch 14 adds independently editable display, body, and interface typography.
Run `supabase/migrations/0012_typography_settings.sql`.

Batch 15 adds explicit media placement for the gallery mosaic and the four-frame
Artist freelancer life scroll story. Run
`supabase/migrations/0013_gallery_media_placements.sql`.

Apply every migration in order before deployment. The admin dashboard performs
live readiness checks for the expected schema, media bucket, owner profile,
public URL, email delivery, and rate limiting.

Batch 16 adds Gallery Studio presentation copy and Interlude media settings.
Story chapter text remains attached to each selected gallery image so the image
and its motivational copy are edited together. Run
`supabase/migrations/0014_gallery_studio.sql`.

Batch 17 hardens admin authentication. It requires `aal2` in RLS, aligns the
database and application authorization source, and stores short-lived one-time
password recovery challenges. Run
`supabase/migrations/0015_admin_auth_hardening.sql`.

Migration `0018_database_rate_limits.sql` adds shared atomic rate limits for
admin login, password recovery, MFA, contact submissions, and analytics. The
counter table has RLS with no public policies, and its RPC is executable only by
the server-side Supabase service role. Client IPs are stored only as keyed HMAC
identifiers; Upstash or another Redis database is not required.

Migration `0019_security_retention_and_media_privacy.sql` removes uploader
identity and original-filename metadata, revokes public access to the retention
function, and adds `cleanup_security_retention(...)` for a trusted scheduler.
Schedule that service-role RPC outside the database migration. The current
storage bucket is public: `is_published=false` controls presentation, not file
confidentiality, so do not upload private drafts to it.

Migration `0020_rate_limit_security_signals.sql` extends the atomic rate-limit
RPC with a one-shot denial marker. The app writes one audit signal for the first
blocked request in each fixed window, so the Security Center receives live
rate-limit data without writing an audit row for every attacker retry.

Migration `0021_navbar_visibility.sql` adds independent Actor and Musician
navbar preferences. The Site Editor can show or hide each profile-supported
page in both desktop and mobile navigation. This setting affects only the menu:
hidden pages remain editable, publicly reachable by direct URL, and available
to the sitemap and discovery endpoints.

Migration `0022_repair_footer_effect.sql` repairs installations where the
footer interaction column was missing after a partial rollout.

Migration `0023_admin_operations_hardening.sql` adds recoverable Media Trash,
transactional media reference checks, a database-level trash invariant, a
transactional last-owner invariant, and replay-safe Resend delivery state for
booking inquiries. Apply it before enabling Trash, delivery webhooks, or the
latest readiness checks.

Migration `0024_cnc_programs.sql` adds the admin-managed CNC program showcase.
The Site editor stores and orders up to three long-form source programs, while
RLS exposes only published rows. The migration seeds the original short HOME
demo so it can be replaced directly in the editor.

Migration `0025_site_navigation_items.sql` adds the curated, ordered navigation
catalog used by Admin V2. It backfills all safe destinations without storing
admin-entered URLs and keeps `navigation_config_version = 0`, so the current
Actor/Musician navbar remains authoritative during the foundation rollout. A
future atomic V2 save activates version 1; the legacy settings remain available
as a rollback path. Pre-0025 installations remain on version 0 and safely fall
back to the legacy navbar until the additive migration is available.

Migration `0026_mixed_public_portfolio.sql` atomically activates the page-first
review navbar with every curated destination visible, makes Music, Gallery,
Resume/Credits, and Showreel coexist publicly, and adds nullable visitor-selected
inquiry intent without rewriting historical messages. Navbar visibility does
not publish or unpublish routes. The migration updates only exact untouched
starter copy; custom artist text is preserved.

Migration `0027_admin_v2_navigation_manager.sql` adds the service-only Admin V2
navbar snapshot and atomic whole-collection save. Every write takes the same
advisory lock before checking row versions, retains unknown destinations from a
newer app build, preserves their visibility, derives order from one submitted
array, locks their existing positions against older clients, and never deletes
rows. Browser-side authenticated table writes are
revoked so the conflict check cannot be bypassed accidentally.

Migration `0028_music_page_editor.sql` adds the presentation headings and
service-only snapshot/save functions for the Admin V2 Music page editor. Hero,
Spotify, Platforms, and SoundCloud save independently with optimistic conflict
checks. Collection saves preserve existing row IDs and icon keys, derive order
from the submitted list, and never insert or delete content during the review
phase.

Migration `0029_batch_5a_music_and_nav_links.sql` repairs the Music snapshot
prerequisite, allows new Music Platform and SoundCloud items, and adds the
service-only navbar shortcut snapshot/save workflow. The connected project has
the schema, but its CLI migration history predates tracking; do not run
`supabase db push` until the parity/backup and migration-history repair recorded
in `TODO.md` are complete.

Migration `0030_bio_page_editor.sql` adds the service-only Bio snapshot and four
atomic save boundaries: Hero, Biography, Resume, and Credits. Biography saves
its profile copy, portraits, and paragraphs in one transaction. Collection
items can be added, reordered, hidden, or restored, but existing rows are never
deleted. The migration seeds and republishes nothing. It was applied manually
to the currently linked project and all five Bio V2 RPCs are live. SQL Editor
does not record CLI migration versions, so the remote history is still empty:
do not use `supabase db push` to replay `0001`–`0031` until that history is
reconciled after a backup.

Migration `0031_gallery_page_editor.sql` adds the service-only Gallery snapshot
and three atomic save boundaries: Hero, Introduction, and Frames. A one-time,
transactional ownership split clones historical dual-use mosaic/story rows for
Gallery while preserving their original HOME story rows and visible ordering.
Frames can then be added, reordered, hidden, or restored without hard deletes
or accidental HOME edits. It was applied manually to the currently linked
project and all four Gallery V2 RPCs are live. An authenticated no-content-change
Introduction save confirmed the write path, canonical normalization, reload,
and public-page stability. The remote CLI migration history is still empty, so
do not use `supabase db push`.

Migration `0032_showreel_page_editor.sql` prepares the service-only Showreel
snapshot and three atomic save boundaries: Hero, Introduction, and Works. The
Works transaction includes every `videos` row, including hidden and legacy
`music_video` items, derives visitor order from the submitted catalog, and
rejects omission instead of deleting data. It also preserves unused legacy
presentation metadata, keeps the single featured marker atomic, and locks
Media Library rows while publishing so a concurrent trash action cannot leave
broken content. Published media accepts only local/Media Library assets or an
exact allowlisted embed provider; hidden legacy sources remain recoverable.
It was applied manually to the currently linked project and all four Showreel
V2 RPCs are live. An authenticated Introduction save with trailing whitespace
confirmed the complete server-action path, canonical normalization, reload,
and public `/video` stability while all seven saved videos remained present.
The remote CLI migration history is still empty, so do not use
`supabase db push`.

Migration `0033_contact_page_editor.sql` provides the service-only Contact
snapshot and two atomic save boundaries: Hero and Contact details. It repairs
only a missing `booking` hero with the existing fallback copy, never overwrites
an existing hero, and does not alter inquiry history. Contact saves use exact
payload validation, optimistic version checks, and the same Media Library lock
as the other visual editors. It was applied manually to the connected project;
all three RPCs are live, preserve the existing Contact rows, and reject anon
access. The remote CLI migration history remains empty, so `db push` is still
not safe.

The new dashboard shell lives at `/admin/v2`; its navigation workspace is
`/admin/v2/navigation`. The 1:1 page editors live at `/admin/v2/pages/music`,
`/admin/v2/pages/bio`, `/admin/v2/pages/gallery`,
`/admin/v2/pages/showreel`, and `/admin/v2/pages/contact`; each shares
presentation components with its public
page, provides 1440 px and 390 px preview viewports, and saves one visible
section at a time. Bio maps directly to Hero, Biography, Resume, and Credits;
Gallery maps to Hero, Introduction, and recoverable Frames; Showreel maps to
Hero, Introduction, and a recoverable all-types Video catalog; Contact maps to
Hero plus Contact & form context and shows configuration-only delivery health.
The classic `/admin` remains
available and links to V2. V1 no longer exposes the Actor/Musician switch or its
profile-only navbar form; it keeps both content groups available and directs
navigation changes to V2. The navbar editor exposes only the six main portfolio
pages; in-page anchors remain in their content, while music/social shortcut
icons are managed separately.

## Search and AI discovery

- `/robots.txt` allows public search/discovery crawlers, blocks `/api`, and
  separates search-oriented AI crawlers from selected training-only crawlers.
- `/sitemap.xml` lists every canonical public route and its relevant images,
  independently of navbar visibility.
- `/llms.txt` provides an experimental, human-readable portfolio map. It is not
  a Google ranking signal.
- `/.well-known/security.txt` publishes the configured security contact.
- Canonical URLs, page-specific Open Graph/Twitter metadata, a web manifest,
  and `WebSite`, `Person`, and `ProfilePage` structured data are generated from
  the published content.

Set one canonical HTTPS `SITE_URL`/`NEXT_PUBLIC_SITE_URL`, add the exact
verification token from Google Search Console as `GOOGLE_SITE_VERIFICATION`,
deploy, and submit `/sitemap.xml` in Search Console. Keep the site name, person
name, visible headings, biography, social profiles, and metadata factually
consistent in the admin content.

## Production Readiness

1. All Supabase migrations through `0033_contact_page_editor.sql` are applied
   manually on the currently linked project. Take a full backup and reconcile
   the pre-existing empty CLI history before using `db push`.
2. In Supabase Auth, disable public signup and anonymous sign-ins, keep TOTP
   enrollment/verification enabled, set the password minimum to at least 12,
   enable leaked-password protection when available, and configure Cloudflare
   Turnstile CAPTCHA for sign-in and recovery.
3. Create Auth users only from the dashboard or trusted server tooling, then
   create matching active owner/admin profile rows.
4. Configure the HTTPS site URL, Supabase keys, `AUTH_SECURITY_SECRET`, and
   Resend. Add a Resend webhook for `/api/resend/webhook`, subscribe to sent,
   delivered, delayed, bounced, complained, failed, and suppressed e-mail
   events, then save its signing secret as `RESEND_WEBHOOK_SECRET`.
5. For security-sensitive deployments, enable a session time-box, inactivity
   timeout, and single-session mode in Supabase Auth settings.
6. Sign in once per admin and complete TOTP enrollment.
7. Confirm all checks pass in `/admin`, then test recovery, MFA, upload, and
   contact delivery.
8. Monitor `GET /api/health`. Anonymous requests receive a cheap cached
   liveness response. Set `HEALTHCHECK_SECRET` and send it as
   `Authorization: Bearer ...` to receive the rate-safe deep database/storage
   check; the deep response returns HTTP 503 when a dependency is degraded.
9. Generate a random `CRON_SECRET` (16+ characters) in Vercel. `vercel.json`
   schedules `/api/cron/maintenance` daily; the secured endpoint invokes the
   service-role-only retention RPC.
10. Run `npm run check` and `npm run audit:prod` before a release. `check`
    includes the automated test suite.

## Scripts

```bash
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
npm run check
npm run audit:prod
npm run start
npm run db:init
npm run db:link -- --project-ref YOUR_PROJECT_REF
npm run db:status
npm run db:push:dry
npm run db:push
```

## Security Notes

- Do not commit `.env.local` or production secrets.
- Booking submissions are validated with Zod, protected by dual honeypots, checked for same-origin browser submissions, rate-limited atomically in Supabase, logged once per blocked rate-limit window, and sent through Resend when accepted.
- Analytics events use payload limits, origin/referer checks, bot filters,
  coarse device/browser/referrer metadata, and mandatory production database
  rate limiting. Raw user-agent strings are not retained in analytics events.
- Admin write actions verify same-origin requests before changing content, media, inquiries, or admin profiles.
- Supabase session cookies are `HttpOnly`, `Secure` in production, `SameSite=Lax`, high priority, and admin authorization requires an `aal2` MFA session.
- Raw client IP addresses are not persisted by the application; rate-limit and audit identifiers use HMAC-SHA-256 with `AUTH_SECURITY_SECRET`.
- Browser write requests use an explicit origin allowlist. On self-hosted
  deployments, set `TRUSTED_PROXY=true` only when a trusted reverse proxy
  overwrites forwarding headers and direct access to the app is blocked.
- Security headers and CSP are configured in `next.config.ts`; admin/API routes are marked `no-store` and `noindex`.
