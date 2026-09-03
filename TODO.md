# Artist Portfolio V2 Roadmap

Updated: 2026-09-03

## Product direction

The portfolio is no longer either a Musician site or an Actor site. The Actor
presentation is the visual baseline, while all existing acting and music content
stays available for review. Navigation, page availability, profession, and
content publication must be separate concerns.

### Non-negotiable rules

- Do not delete existing public content during the review phase.
- Remove `Musician / Actor` as a user-facing feature switch.
- Keep legacy profile data temporarily for rollback and historical inquiries.
- Let Gallery, Music, Resume/Credits, and Showreel coexist.
- Hiding a navbar link must not delete or unpublish its content.
- Keep at least one navbar destination visible; validate this in both V2 and the
  database instead of letting an empty menu fail mysteriously.
- Keep the current V1 admin available while V2 is built beside it.
- Keep the desktop admin sidebar collapsible and remember the user's choice.
- V2 page previews must reuse the real public presentation components.
- Use Music as the first complete 1:1 visual-editor pilot.
- Defer the larger HOME cleanup until the page-editor pattern is proven.

## Navigation inventory

The navbar uses a curated registry of safe destinations. URLs remain owned by
the application; the database stores only stable keys, visibility, and order.

### Initial destinations

- `home` -> `/`
- `home.about` -> `/#home-about`
- `home.cnc` -> `/#cnc-code` when a published CNC program exists
- `home.stories` -> `/#home-stories`
- `bio` -> `/bio`
- `bio.resume` -> `/bio#resume` when the resume block is available
- `gallery` -> `/gallery`
- `music` -> `/music`
- `music.platforms` -> `/music#music-platforms`
- `music.spotify` -> `/music#spotify-releases`
- `music.soundcloud` -> `/music#soundcloud-mixes`
- `works` -> `/video`, with `SHOWREEL` as the initial label
- `contact` -> `/booking`, with `CONTACT` as the initial label

`VIDEO / SHOWREEL` and `BOOKING / CONTACT` are label variants of one route,
not duplicate destinations. Privacy and Terms remain footer links.

## Batch 0 - Baseline and roadmap

Status: complete

- [x] Audit the public routes, profile gates, admin information architecture,
      content loaders, actions, and database schema.
- [x] Confirm that both acting and music data are already loaded without needing
      duplicate content tables.
- [x] Confirm the pre-change Git worktree is clean.
- [x] Run the existing automated-test baseline (26 tests passing).
- [x] Record the agreed product direction and bounded batches in this file.

Acceptance:

- No source files or content records were removed by the planning/reverse step.
- The roadmap preserves V1 and explicitly defers HOME cleanup.

## Batch 1 - Navigation domain foundation

Status: implementation complete; database rollout intentionally pending

- [x] Add a typed, code-owned navigation destination registry.
- [x] Validate unique destination keys and unique normalized href/hash targets.
- [x] Add additive migration `0025_site_navigation_items.sql`.
- [x] Store one row per curated destination with visibility and ordered position.
- [x] Add database constraints, timestamps, RLS, and admin-only mutation policy.
- [x] Serialize navigation mutations and deny ordinary catalog-row deletion.
- [x] Backfill visibility from the currently active legacy profile so applying
      the migration does not unexpectedly change the live navbar.
- [x] Add a compatibility reader that falls back to the current profile/hidden
      arrays while the migration is unavailable.
- [x] Keep `navigation_config_version = 0` as the rollout boundary; only the
      later mixed-review rollout or an atomic V2 save may activate version 1.
- [x] Preserve unavailable/legacy destination records for review instead of
      silently deleting unknown content.
- [x] Extend readiness checks for the additive navigation schema.
- [x] Add unit tests for registry normalization, deduplication, ordering,
      compatibility fallback, and a mixed Gallery + Music configuration.
- [x] Keep the public UI unchanged in this foundation batch.

Verification:

- 41 automated tests, TypeScript, targeted ESLint, and the production build pass.
- The SQL migration is prepared but has not been applied to a remote database.
- Before rollout, run a local Supabase reset/RLS integration pass or the
  equivalent staging migration check; the Supabase CLI is not installed here.

Acceptance:

- Applying the migration preserves the currently visible public menu.
- Before V2 activation, a missing migration falls back safely to the legacy
  navbar; after activation, storage faults fail closed instead of revealing
  previously hidden legacy links.
- No arbitrary or admin-entered URL can reach the public navbar.
- Navigation order can represent every curated destination exactly once.
- No content or old profile preference is deleted.

## Batch 2 - Mixed public portfolio and review navigation

Status: implementation complete; database rollout intentionally pending

- [x] Stop using `portfolio_type` as the public route/content feature gate.
- [x] Use the Actor presentation and wording as the temporary visual baseline.
- [x] Remove the Actor redirect from `/music`.
- [x] Remove the Musician redirect from `/gallery`.
- [x] Allow Bio and Resume/Credits to render together.
- [x] Preserve music platform, Spotify, SoundCloud, Gallery, Resume, Credits,
      Showreel, and music-video records.
- [x] Add stable Music anchors for Platforms, Spotify Releases, and SoundCloud
      Mixes, including fixed-navbar scroll offsets.
- [x] Render TopNav from ordered visible destination records on desktop/mobile.
- [x] Keep every selected page destination reachable on desktop and mobile;
      the later Batch 5A review removed in-page section anchors from the header
      and reserved the hamburger for smaller screens.
- [x] Fix active-state behavior for routes with hash destinations.
- [x] Keep route publication/sitemap behavior separate from navbar visibility.
- [x] Update public metadata, structured data, footer copy, and contact wording
      so they no longer claim the artist has only one discipline.
- [x] Replace profile-derived inquiry intent with Music / Acting / General.
- [x] Add regression tests for mixed routes, navigation, discovery, and inquiry
      classification.

Verification:

- 54 automated tests, TypeScript, full ESLint, and the production build pass.
- Migration `0026_mixed_public_portfolio.sql` prepares the atomic review-navbar
  activation and nullable inquiry intent, but has not been applied remotely.
- The migration does not backfill or rewrite historical inquiry rows.
- Browser visual QA was not run because it was not requested for this batch.

Acceptance:

- Gallery, Music, Resume/Credits, and Showreel work during the same deployment.
- Every curated destination can be selected without duplicate identical links.
- Turning off a link never removes its underlying content.
- Actor remains the visible baseline while musician content stays reviewable.

## Batch 3 - Admin V2 shell and navigation manager

Status: implementation complete; database rollout intentionally pending

- [x] Add `/admin/v2` beside the existing `/admin` routes.
- [x] Build a dedicated V2 shell without rewriting the V1 shell.
- [x] Keep the desktop sidebar explicitly collapsible.
- [x] Persist sidebar state locally; use icons/tooltips when collapsed.
- [x] Use a mobile drawer rather than desktop hover behavior.
- [x] Add `Classic V1` and `Try V2` links between versions.
- [x] Retire Actor/Musician as a user-facing switch while retaining its stored
      legacy value for rollback compatibility.
- [x] Keep both acting and music content workspaces available in the classic
      editor during the V2 transition.
- [x] Add `/admin/v2/navigation` as the first functional V2 workspace.
- [x] List every current and legacy destination, including disabled ones.
- [x] Support show/hide, accessible move up/down, drag order, and preview.
- [x] Add `Show all for review` and `Restore recommended` presets.
- [x] Save the whole ordered navbar atomically with conflict detection.
- [x] Include unresolved/future destination rows in the locked reorder so an
      older app version never deletes or collides with them.
- [x] Acquire the same collection advisory lock before reading expected
      versions inside the atomic save RPC.
- [x] Keep destructive content deletion out of this workspace.

Verification:

- 82 automated tests, TypeScript, full ESLint, and the production build pass.
- Migration `0027_admin_v2_navigation_manager.sql` prepares a service-only
  consistent snapshot and atomic whole-navbar save, but has not been applied
  remotely.
- The V1 navbar form is now an explicit V2 handoff, while its server action
  independently refuses legacy writes after version 1 activation.
- Browser visual/a11y QA remains in Batch 10 and was not run in this batch.

Acceptance:

- A beginner can find navbar management from V2 in one click.
- Desktop and mobile previews match the saved order and visibility.
- The V1 admin remains usable and cannot silently overwrite V2 navigation.
- Saving stays inside V2 and produces a clear success/error state.

## Batch 4 - Music 1:1 visual-editor pilot

Status: implementation complete; database rollout intentionally pending

- [x] Add `/admin/v2/pages/music`.
- [x] Extract a shared `MusicPageView` used by `/music` and admin preview.
- [x] Render exact desktop and mobile preview widths.
- [x] Add a collapsible right-side inspector independent of the app sidebar.
- [x] Make preview sections selectable without enabling public navigation or
      external-link side effects inside edit mode.
- [x] Add focused inspectors for Hero, Spotify, Platforms, and SoundCloud.
- [x] Make `Latest Releases` and `Latest Mixes` artist-editable.
- [x] Hide IDs, icon keys, raw sort numbers, and other technical fields under
      Advanced or derive them automatically.
- [x] Save only the active section and retain the unsaved-changes guard.
- [x] Show inline validation, save progress, and last-saved feedback.
- [x] Revalidate the real `/music` page after successful writes.
- [x] Keep `/admin/content#music-links` working in V1.

Verification:

- 123 automated tests, TypeScript, full ESLint, and the production build pass.
- Migration `0028_music_page_editor.sql` prepares public presentation headings,
  a service-only snapshot, and four atomic section saves; it has not been
  applied remotely.
- Preview framing was verified at runtime: only the authenticated Music preview
  permits same-origin framing; normal routes remain frame-denied.
- Legacy V1-valid rows remain loadable for repair, while saves reject unsafe or
  broken media/embed values without deleting content.
- Browser visual/a11y QA remains in Batch 10 and was not run in this batch.

Acceptance:

- Music is reachable from V2 in at most two clicks.
- Preview uses the same presentation components as the public page.
- Clicking each visible Music section opens the correct inspector.
- Saving remains in V2 and updates both preview and public output.
- The basic editor exposes no implementation-only fields.

## Batch 5 - Pilot review gate

Status: Batch 5A implemented and browser-reviewed

- [x] Review the Music editor with the site owner.
- [x] Record usability problems before generalizing the pattern.
- [x] Choose Bio plus Resume/Credits as the next editor. Gallery stays queued
      because it shares assets and presentation with HOME and Media Library;
      handling those boundaries together avoids teaching three screens to edit
      the same thing differently.
- [ ] Decide which musician-era sections stay, change, or remain hidden.
- [x] Keep rejected content intact until an explicit cleanup batch is agreed.

Authenticated live-browser findings (2026-09-03):

- [x] Keep the public header focused on the six selectable portfolio pages;
      in-page anchors such as About, CNC, Stories, Resume, Platforms, Spotify,
      and SoundCloud stay in their pages instead of becoming navbar links.
- [x] Confirm sidebar collapse, desktop/mobile navbar previews, local visibility
      changes, section selection from the Music preview, and the mobile admin
      drawer work without saving public changes.
- [x] Apply the Music snapshot prerequisite repair to the connected project.
      The owner ran `0029`; a read-only follow-up confirmed the Music hero,
      Music snapshot, and all Batch 5A Music/navbar RPCs are live.
- [x] Prepare and test the forward-only `0029` repair.
- [ ] Reconcile Supabase migration history only after a full backup and explicit
      owner approval. A read-only audit confirmed that the connected schema,
      25 function bodies, storage bucket, and policies match local migrations
      `0001`–`0029`, but the remote history is empty; `db push` would still try
      to replay the entire chain and must not be used yet.
- [x] Make the disabled Music preview unmistakably non-live when it shows
      fallback platforms and mixes that are absent from the public page.
- [x] Default embedded previews to mobile on narrow admin screens, or remember
      the last selected device.
- [x] Make the Hero/Platforms/Spotify/SoundCloud chips also bring the selected
      preview section into view.
- [x] Put section feedback and Save inside the mobile inspector; the full-screen
      drawer currently covers the global Save bar.
- [x] Add guided Add/restore controls for empty Platforms and SoundCloud lists,
      plus a clear whole-section visibility decision for empty public sections.
- [x] Accept one Spotify artist URL and derive the embed URL instead of asking a
      nontechnical owner to maintain both fields.
- [x] Clear navbar dirty state when a visibility change is reverted to the saved
      value; the current draft still reports unsaved changes.
- [x] Remove the stale local Turbopack cache so the next development start
      rebuilds its route graph; the fresh production build serves all V2 routes.
- [x] Move technical wording such as `pilot`, `renderable`, `rows`, and raw
      viewport dimensions out of the beginner-facing overview where possible.

Batch 5A owner-requested additions:

- [x] Remove `More` and every in-page section link from the public header while
      preserving all section content and deep-link data.
- [x] Use the reference-inspired desktop composition: selected page links on
      the left, artist name truly centered, and chosen platform icons on the
      right; keep the hamburger for smaller screens only.
- [x] Limit the V2 navbar chooser, counts, ordering, and preview to main pages;
      retain legacy section rows for safe optimistic locking and normalize them
      hidden on the next real navbar save without deleting anything.
- [x] Add editable platform URLs plus safe Add, reorder, hide/restore, and
      unsaved-draft removal for Music Platforms and SoundCloud.
- [x] Add a separate navbar shortcut manager for music and social profiles.
- [x] Detect Spotify, Apple Music, SoundCloud, YouTube, Beatport, Bandcamp, and
      other supported icons from the real URL hostname instead of manual keys.
- [x] Show chosen shortcut icons in the public navbar and full menu, with no
      placeholder links when the owner has not configured any.
- [x] Fix local production-preview origin validation so Admin V2 saves work on
      the exact configured localhost origin without weakening deployed CSRF
      checks.
- [x] Verify the implementation with 179 automated tests, TypeScript, full
      ESLint, a production build, and authenticated desktop/mobile browser QA.
- [x] Confirm `0029` on the connected Supabase project and repeat authenticated
      editor QA without publishing test content.

Later QA findings already queued for Batch 10:

- Hide empty public Music sections without creating dead navbar anchors.
- Avoid loading duplicate eager Spotify iframes for desktop and mobile.
- Remove the JSON-LD CSP nonce hydration warning on Home and Bio.
- Replace the authenticated server-session user warning with a verified user
  lookup at the relevant Supabase boundary.
- Investigate intermittent Next image-optimizer timeouts against Supabase
  Storage and keep remote-image failures graceful instead of noisy.

Acceptance:

- The 1:1 editor pattern is explicitly accepted or revised before reuse.

## Batch 6 - Remaining page editors

Status: Batch 6A deployed; Batch 6B implemented and verified locally, rollout pending

- [x] Bio plus Resume/Credits (Batch 6A).
  - [x] Share the exact public Bio presentation with a safe live V2 preview.
  - [x] Map the page to four plain-language edit areas: Hero, Biography,
        Resume, and Credits.
  - [x] Save each area independently with strict validation and optimistic
        conflict detection.
  - [x] Keep Biography profile copy, portraits, and paragraphs atomic so a
        partial failure cannot publish half a biography.
  - [x] Support adding, reordering, hiding, and restoring portraits,
        paragraphs, and credits; never hard-delete an existing item.
  - [x] Keep credit ordering meaningful inside the same public credit group.
  - [x] Handle text-only and portrait-only Biography drafts without leaving a
        fake image placeholder or an empty half-page column.
  - [x] Keep preview footer links inert and make an empty Hero CTA disappear
        instead of leaving a blank focus target.
  - [x] Provide desktop/mobile preview controls, preview-to-inspector section
        selection, a collapsible desktop inspector, and a mobile editor drawer.
  - [x] Verify with 217 automated tests, TypeScript, full ESLint, production
        build, and authenticated desktop/mobile browser QA. A live Hero save
        used trailing whitespace that server validation normalized back to the
        exact original value; the public `/bio` snapshot was identical before
        and after the write.
  - [x] Treat a successful empty Bio collection query as intentional content,
        so hiding every portrait, paragraph, or credit cannot resurrect demo
        fallback rows on the public page.
  - [x] Apply `0030_bio_page_editor.sql` through a controlled/manual rollout.
        All five Bio V2 RPCs and the full snapshot are live. The CLI migration
        history remains empty because SQL Editor does not record migration
        versions, so do not use `db push` until history is reconciled after a
        backup and explicit approval.
- [x] Gallery (Batch 6B implementation).
  - [x] Map the public page to three plain-language edit areas: Hero,
        Introduction, and Frames.
  - [x] Share one `GalleryPageView` between `/gallery` and the authenticated
        desktop/mobile preview.
  - [x] Keep the footer, lightbox, filters, and visitor links inert while
        selecting sections in preview mode.
  - [x] Save only the active section with strict validation, optimistic
        conflict detection, audit logging, and public-page revalidation.
  - [x] Add, reorder, hide, and restore Gallery frames without hard-deleting a
        previously saved row; only a new unsaved draft can be discarded.
  - [x] Keep a successful empty Gallery query empty instead of resurrecting
        bundled demo frames.
  - [x] Separate historical dual-use Gallery/HOME rows into deterministic
        Gallery-only clones while preserving the original HOME story rows and
        the visible Gallery composition.
  - [x] Keep HOME Interlude/Story copy, story placement, global footer data,
        and physical Media Library assets outside the Gallery inspector.
  - [x] Verify the pre-rollout read-only state with 255 automated tests,
        TypeScript, full ESLint, a production build, and authenticated browser
        QA at 1440x900 and 390x844. The three-section selector, direct preview
        selection, mobile inspector, overview card, and public `/gallery` page
        all passed without browser console errors.
  - [ ] Apply `0031_gallery_page_editor.sql` through a controlled/manual
        rollout; the connected project still has empty CLI migration history,
        so `db push` must not be used.
  - [ ] Repeat authenticated desktop/mobile browser QA against the live 0031
        RPCs without publishing test content.
- [ ] Works/Showreel, preserving legacy music-video items during review.
- [ ] Contact and inquiry context.
- [x] Reuse the accepted shared-preview/inspector pattern for Bio.

Acceptance:

- Each public page has one predictable edit location.
- Gallery and Works content is no longer discoverable only through Media Library.

## Batch 7 - Media and Inbox V2

Status: planned

- [ ] Keep Media Library focused on upload, assets, usage, and recoverable trash.
- [ ] Keep contextual media picking/upload available inside page editors.
- [ ] Move inquiries out of Analytics into `/admin/v2/inbox`.
- [ ] Preserve upload progress, reference checks, delivery state, and audit logs.

Acceptance:

- A user editing a page does not need to understand storage architecture.
- Messages are a first-class workspace, not an analytics sub-tab.

## Batch 8 - Dashboard, Analytics, and Settings V2

Status: planned

- [ ] Build a task-first `/admin/v2` overview.
- [ ] Prioritize actionable issues, quick actions, pages, and new messages.
- [ ] Add a `What do you want to change?` destination finder.
- [ ] Keep traffic summaries secondary to editing tasks.
- [ ] Move healthy technical checks out of the main dashboard.
- [ ] Place Brand, Access, Security, and technical health under Settings.

Acceptance:

- A nontechnical owner can reach common edits without knowing internal terms.
- Technical detail stays available without dominating the primary workflow.

## Batch 9 - HOME cleanup and 1:1 editor

Status: deferred by agreement

- [ ] Inventory Hero, About, CNC, Interlude, Stories, Gallery teaser, Music teaser,
      and Footer responsibilities.
- [ ] Remove duplicate or obsolete HOME concepts only after content review.
- [ ] Build the HOME editor from the accepted V2 visual-editor pattern.
- [ ] Keep the public layout coherent throughout the cleanup.

Acceptance:

- HOME has an agreed section order and a single clear editing workflow.
- No legacy HOME content is deleted without explicit approval.

## Batch 10 - QA, migration, and cutover

Status: planned

- [ ] Validate keyboard, touch, responsive layout, contrast, and reduced motion.
- [ ] Test migration/backfill and rollback against representative data.
- [ ] Run unit, integration, typecheck, lint, and production build checks.
- [ ] Verify sitemap, metadata, structured data, analytics, contact, and admin auth.
- [ ] Keep V1 available through an agreed rollback window.
- [ ] Make V2 the default only after owner acceptance.
- [ ] Deprecate legacy profile fields in a later migration; retain historical
      inquiry classification where needed.

Acceptance:

- V2 becomes default only after all critical checks and owner review pass.
- Rollback does not require restoring deleted content or database records.
