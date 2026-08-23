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
BOOKING_TO_EMAIL=...
BOOKING_FROM_EMAIL=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SECRET_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_MEDIA_BUCKET=portfolio-media
AUTH_SECURITY_SECRET=at-least-32-random-characters
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

Batch 7 adds portfolio profile modes.
`site_settings.portfolio_type` can be `musician` or `actor`. The admin content editor exposes this setting, navigation adapts per profile type, actor mode hides the music module from public navigation, and `/music` redirects to `/video` for actor profiles.

Run `supabase/migrations/0005_portfolio_modes.sql` to add the profile mode column.

Batch 8 adds the module registry.
Public navigation, sitemap routes, admin dashboard links, and content editor sections now derive from active modules for each profile type. Actor profiles use `HOME / BIO / GALLERY / SHOWREEL / CONTACT`, while musician profiles keep `HOME / BIO / MUSIC / VIDEO / BOOKING`.

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

Batch 12 adds the simple contact workflow.
The `/booking` page stays a minimal name/email/message form, but actor mode now presents it as "Let's Work Together" instead of a detailed casting form. Submissions are tagged with `portfolio_type` and `inquiry_type`, so the admin inbox and email subject can distinguish musician booking inquiries from actor collaboration messages.

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

## Search and AI discovery

- `/robots.txt` allows public search/discovery crawlers, blocks `/api`, and
  separates search-oriented AI crawlers from selected training-only crawlers.
- `/sitemap.xml` lists only active public routes and their relevant images.
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

1. Apply all Supabase migrations through `0021_navbar_visibility.sql`.
2. In Supabase Auth, disable public signup and anonymous sign-ins, keep TOTP
   enrollment/verification enabled, set the password minimum to at least 12,
   enable leaked-password protection when available, and configure Cloudflare
   Turnstile CAPTCHA for sign-in and recovery.
3. Create Auth users only from the dashboard or trusted server tooling, then
   create matching active owner/admin profile rows.
4. Configure the HTTPS site URL, Supabase keys, `AUTH_SECURITY_SECRET`, and
   Resend. Admin auth fails closed in production without migration 0018 or the
   secret.
5. For security-sensitive deployments, enable a session time-box, inactivity
   timeout, and single-session mode in Supabase Auth settings.
6. Sign in once per admin and complete TOTP enrollment.
7. Confirm all checks pass in `/admin`, then test recovery, MFA, upload, and
   contact delivery.
8. Monitor `GET /api/health` as a lightweight process liveness check. Use the
   authenticated `/admin` readiness panel for database, storage, email, and
   rate-limit integration checks.
9. Schedule the service-role-only `cleanup_security_retention(...)` RPC and
   choose a private staging bucket if unpublished media must remain secret.
10. Run `npm run check` and `npm run audit:prod` before a release.

## Scripts

```bash
npm run dev
npm run typecheck
npm run lint
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
- Analytics events use payload limits, origin/referer checks, bot filters, metadata sanitizing, and mandatory production database rate limiting.
- Admin write actions verify same-origin requests before changing content, media, inquiries, or admin profiles.
- Supabase session cookies are `HttpOnly`, `Secure` in production, `SameSite=Lax`, high priority, and admin authorization requires an `aal2` MFA session.
- Raw client IP addresses are not persisted by the application; rate-limit and audit identifiers use HMAC-SHA-256 with `AUTH_SECURITY_SECRET`.
- Browser write requests use an explicit origin allowlist. On self-hosted
  deployments, set `TRUSTED_PROXY=true` only when a trusted reverse proxy
  overwrites forwarding headers and direct access to the app is blocked.
- Security headers and CSP are configured in `next.config.ts`; admin/API routes are marked `no-store` and `noindex`.
