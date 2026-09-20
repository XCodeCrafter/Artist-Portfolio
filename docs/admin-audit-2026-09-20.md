# Admin hardening and Appearance V2 — 2026-09-20

## Scope and outcome

Local code audit, targeted fixes, automated regression tests and authenticated
browser smoke tests of V2 and retained Classic administration. This is not a
claim that production configuration or every real-provider workflow has been
certified. No production content, accounts, credentials or provider settings
were changed. No remote migration, upload, email delivery, deletion or GitHub
push was performed.

The previous HOME work is preserved. ImageKit Batch 7A.2f and Gmail delivery
Batch 7B remain pending; Supabase is still the live uploader.

## Added controls

- **Navbar → Name in the navbar:** edits the shared owner name used by the
  public header/footer and metadata. Page-specific titles remain independent.
- **Appearance:** independent Display, Body and UI font selections, local
  typography preview and the actual shared footer with White soul / Red light.
  Preview links are inert; pointer animation respects reduced motion.
- Saved settings are published explicitly, version-checked and audited. Invalid
  or unavailable snapshots are read-only. Unsaved Navbar name changes share the
  existing guard with navigation and shortcuts. Fonts are fixed allowlisted
  catalog entries, not arbitrary CSS or remote URLs. Existing settings columns
  are reused; these controls need no new database migration.

## Findings addressed

| Area | Problem | Change |
| --- | --- | --- |
| Dependencies | Critical/high advisories in the installed Next.js/image stack and tooling | Next.js and matching ESLint config 16.3.5, patched sharp/PostCSS and compatible transitive updates; lockfile refreshed |
| Session revocation | A signed AAL2 access token could outlive revoked refresh/session state | Verify live matching `auth.sessions` at admin gates; migration 0038 extends `is_admin()` so RLS/Storage paths also reject replay |
| Recovery | Separate delete/insert could create competing challenges | Service-only transactional issuance, per-profile lock and unique per-user challenge |
| Logout | Anonymous cross-origin logout could produce audit noise | Verify Origin before auth operations; audit only identified approved admins |
| MFA enrollment | Missing enrollment-specific throttling and ignored cleanup errors | Shared enrollment rate limit; stop if removing obsolete unverified factors fails |
| Account deactivation | A successful deactivation could go unaudited if later revocation failed | Audit and revalidate the successful change independently |
| Classic vs V2 | Legacy Bio/Music/Gallery/social saves could bypass active V2 version boundaries | Schema-aware server handoffs to V2; database failures fail closed |
| Concurrent editing | Settings, Inbox and media mutations could overwrite/delete changed records | Atomic timestamp predicates; deleted media cannot be edited; stale drafts receive conflicts |
| Draft/version coherence | Refreshed server props could attach a newer version to older edited values; React action resets could discard rejected drafts | Freeze values and version together, explicitly load newer legacy snapshots, preserve controlled Inbox drafts with their original version, distinguish intentional discard from framework resets |
| Upload finalization | Client-selected identity/path and failure cleanup could delete a referenced object on replay | Server-random identity, short-lived HMAC proof bound to admin/path/MIME/size; no physical deletion on finalize failure |

The new session protection requires **0038 on the remote database**. Before
rollout, only the exact missing-RPC case preserves previous behavior to avoid
locking out the existing admin. Permission/network failures and malformed
responses deny access. Revocation applies to subsequent requests, not work
already executing. The Security Center exposes an explicit readiness warning.

Security references: [Next.js Windows advisory](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36),
[Next.js AVIF advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4),
[Supabase session lifecycle](https://supabase.com/docs/guides/auth/sessions).

## Verification

- Automated suite: 777 tests across 78 files, including the final
  draft/version-coherence and React action-reset regression cases.
- TypeScript, ESLint and a Next.js 16.3.5 production build passed.
- Full `npm audit` reported zero known vulnerabilities, including dev dependencies.
- `scripts/test-admin-hardening-migration.mjs` executed real SQL in isolated
  in-memory PostgreSQL (PGlite), including rerun preservation, recovery uniqueness,
  rollback, expiry, private grants and stale AAL2 replay rejection through RLS.
  It uses a separately installed local PGlite package; no project credentials or
  remote database are involved.
- Authenticated browser: V2 Overview, Navbar, Home, Bio, Gallery, Showreel,
  Music, Contact, Inbox, Insights, Settings, Appearance and all five Security
  tabs loaded. Classic Overview, Content, Media, Analytics and Security loaded.
- Name draft changed its preview and enabled Save; explicit Discard restored
  the saved name. All three font selections changed the scoped CSS variables;
  footer changed to `soul`; preview links remained inert. Explicit font discard
  restored the saved value. None of these drafts was published.
- Appearance and Navbar checked at a 390×844 viewport with no horizontal page
  overflow. Mobile controls precede the preview; navigation Escape returns
  focus to its trigger. Desktop sidebar collapse/expand works. Viewport reset.
- Browser error/warning log in the working audit tab was empty.
- Anonymous HTTP checks of V2 overview, Appearance and the HOME preview returned
  login redirects in the streamed response and no private editor content.

Legacy versioned forms deliberately require **Load latest saved version** after
their stored version changes. This confirmed reload advances values and version
together; a global `status=saved` query parameter is not treated as evidence
that any particular dirty form was saved.

Browser limitation: testing the native leave-with-unsaved-changes confirmation
made that in-app-browser tab unresponsive to automation; the dialog was not
exposed by its dialog API. That temporary draft tab was closed without saving.
Other route and explicit-discard tests continued in a fresh authenticated tab.
The native confirmation accept/cancel and browser Back flow still need a manual
pass. This report does not claim that test passed.

## Deployment and remaining work

1. Browser readiness confirmed HOME **0037** is still missing here. Apply
   `supabase/migrations/0037_home_page_editor.sql`, then its matching checks file.
2. Apply `supabase/migrations/0038_admin_session_hardening.sql`, then
   `supabase/checks/0038_admin_session_hardening.sql`; every result should be true.
   Review/back up before rollout. 0038 preserves portfolio records, accounts,
   MFA factors and active sessions. It removes only obsolete duplicate recovery
   challenges, preserving the newest usable challenge per user.
3. Remote CLI migration history is unreconciled. **Do not run `supabase db push`**
   against it blindly. Neither migration was remotely applied during this audit.
4. Verify a real save/refresh/public-site update using approved content; verify
   revocation with a disposable second session. No destructive live access tests
   or test emails were performed on the owner's account.
5. Security Center currently reports missing email delivery, delivery webhook,
   retention scheduler and deep-health monitor setup. Production readiness also
   flags canonical URL and public signup settings; review these in the actual
   production environment before launch, not by treating localhost as production.
6. Resume **ImageKit 7A.2f** (next available migration number after 0038), pilot,
   optimizer and controlled cutover. Keep the pilot disabled until complete.
   Failed upload files now remain safely stored; bounded ownership-proven orphan
   cleanup is still required, not replaced by blind failure-path deletion.
7. Resume **Gmail notifications 7B**, using the client-owned sender/Resend setup
   and the chosen Gmail inbox; configure/test delivery and webhook reporting.
8. Active MFA admins retain some legacy direct-table write policies while V1 is
   retained. 0038 makes revocation effective there, but it does not turn every
   legacy write into an audited/versioned RPC. Retire those policies with the
   V1 cutover after verifying all remaining writers. V1 remains available.

Known framework warning: Next.js deprecates the Edge Runtime used by existing
social-image routes. Build succeeds; switching those routes is a separate
compatibility cleanup, not a reason to suppress the warning.
