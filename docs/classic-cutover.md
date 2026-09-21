# Classic → V2 cutover

## Batch 13F: prepared, not activated

Successful approved AAL2 login/MFA and already-authenticated auth pages now enter
`ADMIN_ENTRY_PATH` (`/admin/v2`). A rejected logout origin returns to that same
protected entry without logging out or contacting Auth. Password recovery,
callback verification, MFA enrollment, session checks and `requireAdmin` remain
in place. No user-provided `next` / return URL is accepted.
An assurance-level error cannot qualify a password login for V2 even if a stale
payload says AAL2; a missing post-MFA assurance payload also fails closed.

Classic remains available at `/admin`, `/admin/content`, `/admin/media`,
`/admin/analytics` and `/admin/security`. Nothing redirects those routes yet.
There is no physical Classic `/admin/settings` page; it is only a prepared alias.
No Classic write endpoint, component or table is removed by this batch.

`lib/admin/cutover-routes.ts` is a pure, tested bookmark mapping, **not mounted
in routes or middleware**. It accepts exact local Classic paths only. Unknown
query keys and arbitrary fragments are discarded, never reflected as redirects.

| Classic location | Prepared V2 destination |
| --- | --- |
| `/admin` | `/admin/v2` |
| `/admin/content` + `home`, `heroes`, `updates`, `home-hero`, `home-about`, `home-interlude`, `home-freelancer-life` | `/admin/v2/pages/home` |
| `/admin/content#home-cnc` | `/admin/v2/pages/home/programs` |
| Content `bio`, `bio-hero`, `bio-intro`, `bio-gallery`, `bio-paragraphs`, `bio-paragraphs-panel`, `actor-resume`, `actor-credits` | `/admin/v2/pages/bio` |
| Content `music-links`, `music-links-hero`, `music-settings`, `music-platforms`, `tracks` | `/admin/v2/pages/music` |
| Content `booking`, `booking-hero`, `contact-settings` | `/admin/v2/pages/contact` |
| Content `navigation`, `navigation-settings`, `socials`, `socials-links` | `/admin/v2/navigation` |
| Content `settings`, `settings-identity`, `settings-typography`, `settings-footer-effect` | `/admin/v2/settings/appearance` |
| `/admin/media` or `?view=studio` | `/admin/v2/pages/gallery` |
| `/admin/media?view=showreel` | `/admin/v2/pages/showreel` |
| `/admin/media?view=library`, or any media mode with `#upload` | `/admin/v2/media` (`#upload` retained when present) |
| `/admin/analytics` | `/admin/v2/insights` |
| Analytics `overview`, `acquisition`, `content`, `engagement`, `events`, `health` | Insights `overview`, `visitors`, `popular-pages`, `interactions`, `recent-activity`, `data-health` |
| `/admin/analytics#inquiries` | `/admin/v2/inbox#messages` |
| `/admin/security` | `/admin/v2/security` |
| Security `health` / `allowlist`, `admin-profiles`, `threats` | V2 `configuration`, `access`, `activity` |
| Security `overview`, `access`, `activity`, `audit`, `configuration` | Same supported tab in V2 |
| `/admin/settings` (compatibility alias only) | `/admin/v2/settings` |

Insights preserves only the supported `range=7|30|90|180`. Inbox translates a
single `inquiryPage` to bounded `page` (1–10000); the destination still clamps to
actual available pages. Duplicate parameters are dropped. Security and Inbox
retain only their existing fixed action-result status tokens; other workspaces
drop status because V2 does not consume Classic's notices. These notices are UI
feedback, never proof of a successful operation or authorization.
Inbox includes the current `write-conflict` result and retains its older
`not-found` notice for already-issued bookmarks.

### Known limitations to verify before activation

- Fragments are browser-only: an SSR redirect cannot distinguish
  `/admin/analytics#inquiries` from `/admin/analytics`. Batch 13H needs an
  authenticated client bridge for these bookmarks and an accessible manual-link
  fallback if JavaScript is unavailable. Do not add a global blanket redirect.
- Content mappings open the correct V2 workspace. V2 page editors do not yet
  consume Classic inspector fragments; no unsupported section query is invented.
  Dynamic per-record IDs are not translated into selection state.
- Upload's `#upload` points at the existing V2 upload disclosure; it does not
  automatically expand that disclosure. Verify the final bridge's UX in 13H.
- Reset, callback, login, MFA, API/export/action URLs and existing V2 URLs are
  intentionally outside this mapper. Shared write routes may still be needed by
  already-open Classic forms; audit all consumers before removing them.

## Activation gate: 13G, then owner approval, then 13H

The [13G audit report](admin-v2-final-audit-2026-09-21.md) records completed parity,
three code repairs, draft-only browser checks and remaining live acceptance.
Classic restore now hands old forms to V2 without writing; legacy restore forms
have no safe concurrency token. This does not activate general route redirects.

1. Complete the final 13G Classic/V2 parity and live-browser audit (including
   desktop/mobile, save/load, denied access, dirty drafts, old bookmarks and
   failure states). Unit tests do not substitute for this audit.
2. Obtain the owner's explicit approval to retire Classic.
3. Only then activate the authenticated compatibility bridge in 13H, migrate
   surviving internal links, and remove code proven to have no consumers.
   Keep bookmark handling and the shared server authorization boundary.
4. Verify sign-in, MFA, password recovery, logout, Inbox paging, Security result
   notices, supported Insights ranges and direct V2 links against the deployment.

## Rollback

Before activation, `/admin` is still a working Classic entry. If the new default
entry causes a problem, revert `ADMIN_ENTRY_PATH` to `/admin`; this does not alter
content, credentials or database schema. If 13H later causes a problem, roll back
the route/component cutover deployment to this checkpoint, restoring Classic
routes before changing the default entry. Do not roll back data migrations or
delete V2 data as a UI rollback. Shared services and CAS guards stay active.
