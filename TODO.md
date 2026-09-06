# Artist Portfolio V2 Roadmap

Updated: 2026-09-04

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

Status: implementation and manual database rollout complete; CLI migration
history reconciliation pending

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
- The `0025` schema and navigation data were verified on the connected project.
  The remote CLI migration history is still empty, so `db push` remains unsafe
  until a backup and explicit history-reconciliation step are complete.

Acceptance:

- Applying the migration preserves the currently visible public menu.
- Before V2 activation, a missing migration falls back safely to the legacy
  navbar; after activation, storage faults fail closed instead of revealing
  previously hidden legacy links.
- No arbitrary or admin-entered URL can reach the public navbar.
- Navigation order can represent every curated destination exactly once.
- No content or old profile preference is deleted.

## Batch 2 - Mixed public portfolio and review navigation

Status: implementation and manual database rollout complete; CLI migration
history reconciliation pending

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
- Migration `0026_mixed_public_portfolio.sql` and its nullable inquiry-intent
  schema were verified on the connected project through the manual SQL rollout.
- The migration does not backfill or rewrite historical inquiry rows.
- Browser visual QA was not run because it was not requested for this batch.

Acceptance:

- Gallery, Music, Resume/Credits, and Showreel work during the same deployment.
- Every curated destination can be selected without duplicate identical links.
- Turning off a link never removes its underlying content.
- Actor remains the visible baseline while musician content stays reviewable.

## Batch 3 - Admin V2 shell and navigation manager

Status: implementation and manual database rollout complete; CLI migration
history reconciliation pending

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
- Migration `0027_admin_v2_navigation_manager.sql` and its service-only
  snapshot/save boundaries were verified on the connected project.
- The V1 navbar form is now an explicit V2 handoff, while its server action
  independently refuses legacy writes after version 1 activation.
- Browser visual/a11y QA remains in Batch 10 and was not run in this batch.

Acceptance:

- A beginner can find navbar management from V2 in one click.
- Desktop and mobile previews match the saved order and visibility.
- The V1 admin remains usable and cannot silently overwrite V2 navigation.
- Saving stays inside V2 and produces a clear success/error state.

## Batch 4 - Music 1:1 visual-editor pilot

Status: implementation and manual database rollout complete; CLI migration
history reconciliation pending

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
- Migration `0028_music_page_editor.sql`, its presentation fields, snapshot,
  and four atomic saves were verified on the connected project.
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
- Consume the admin unsaved-change history sentinel after save/discard so the
  first Back action does not appear to do nothing.

Acceptance:

- The 1:1 editor pattern is explicitly accepted or revised before reuse.

## Batch 6 - Remaining page editors

Status: Batch 6A, Batch 6B, and Batch 6C deployed; Batch 6D implementation and database rollout complete, production delivery verification pending

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
  - [x] Apply `0031_gallery_page_editor.sql` through a controlled/manual
        rollout. All four Gallery V2 RPCs are live. The connected project still
        has empty CLI migration history, so `db push` must not be used.
  - [x] Repeat authenticated browser QA against the live 0031 RPCs without
        changing public content. An Introduction save used one trailing space;
        server validation normalized it back to the exact original value, the
        editor remained writable after reload, and the public `/gallery`
        snapshot was identical before and after the write. The classic Gallery
        Studio also correctly switched to its locked V2 handoff state.
- [x] Works/Showreel (Batch 6C).
  - [x] Map the public page to three plain-language edit areas: Hero,
        Introduction, and Videos.
  - [x] Share one `ShowreelPageView` between `/video` and the authenticated
        1440x900 / 390x844 preview.
  - [x] Keep filters, autoplay, visitor playback, modals, embeds, and footer
        links inert while section and individual video cards remain selectable
        in preview mode.
  - [x] Edit every saved `videos` row in one catalog, including hidden rows and
        all seven video types; never filter legacy `music_video` content by the
        former Actor/Musician profile mode.
  - [x] Add, reorder, hide, and restore videos without hard-deleting a saved
        row; only a new unsaved draft can be discarded.
  - [x] Preserve the legacy featured marker and unused presentation metadata
        while exposing only fields the current public page actually renders.
  - [x] Prepare `0032_showreel_page_editor.sql` with a service-only consistent
        snapshot, three optimistic save boundaries, exact collection-version
        checks, atomic featured handling, canonical ordering, and no deletes.
  - [x] Restrict published assets to local/Media Library sources or exact
        allowlisted embed providers, lock referenced assets against concurrent
        trashing, and keep hidden historical sources recoverable until restore.
  - [x] Lock all classic Showreel/video writes into the V2 handoff once 0032 is
        active so old forms cannot bypass conflict checks or hard-delete rows.
  - [x] Verify the pre-rollout read-only state with 305 automated tests,
        TypeScript, full ESLint, a production build, and authenticated browser
        QA at 1440x900 and 390x844. Static video-Hero preview, item-level
        preview-to-inspector focus, the overview/sidebar entry, and public
        `/video` all passed without changing content.
  - [x] Apply `0032_showreel_page_editor.sql` manually and verify all four RPCs.
        An authenticated Introduction save passed through the real server
        action, trimmed a temporary trailing space back to the original copy,
        reloaded as writable, and left public `/video` plus all seven catalog
        items unchanged. The classic Showreel Studio also switched to its locked
        V2 handoff state. Do not use `supabase db push` while remote migration
        history remains empty.
- [x] Contact and inquiry context (Batch 6D rollout).
  - [x] Share one `ContactPageView` between `/booking` and the authenticated
        1440x900 / 390x844 preview.
  - [x] Map the public page to two plain-language edit areas: Hero and
        Contact & form.
  - [x] Keep the real form, links, fields, and video playback inert inside the
        editor preview so editing cannot submit an inquiry.
  - [x] Save Hero and Contact details independently with strict validation,
        optimistic conflict detection, audit logging, and public revalidation.
  - [x] Repair only a missing `booking` Hero without overwriting existing
        content or touching historical inquiries.
  - [x] Hand classic Contact writes to V2 once migration 0033 is active so the
        two editors cannot silently overwrite one another.
  - [x] Show configuration-only status for Inbox storage, Resend
        notifications, and delivery monitoring without exposing secrets or
        claiming that a real email was delivered.
  - [x] Fix the mobile in-page form jump, add accessible field labels and live
        submission feedback, and preserve the existing public composition.
  - [x] Treat a successfully stored inquiry as accepted when only its email
        notification fails, preventing misleading retries and duplicate Inbox
        rows.
  - [x] Cover Contact validation, preview messaging, framing, server actions,
        migration contracts, origin/rate-limit protections, Inbox-only mode,
        Resend success/failure, and dual-channel failure with automated tests.
  - [x] Apply `0033_contact_page_editor.sql` manually, verify all three RPCs,
        and repeat authenticated desktop/mobile editor QA without publishing
        content. Do not use `supabase db push` while remote migration history
        remains empty.
  - [x] With explicit owner approval, submit one clearly marked real QA
        inquiry and verify its Inbox row. The notification correctly recorded
        `failed` while production Resend settings were absent.
  - [ ] After production email is configured in Batch 7B, submit a second
        marked inquiry, verify Gmail receipt plus webhook delivery state, then
        archive both QA records.
- [x] Reuse the accepted shared-preview/inspector pattern for Bio.

Batch 6D rollout verification:

- 357 automated tests, TypeScript, full ESLint, and the production build pass.
- All three Contact RPCs are live and service-role-only. Invalid save probes
  returned the expected validation errors without changing either source row or
  timestamp.
- Authenticated browser QA passed for the desktop/mobile preview, section
  switching, local dirty/discard flow, public Contact layout and Hero jump, and
  the locked classic-to-V2 handoff. No QA content was published.
- The controlled public form test persisted exactly one `Codex QA` inquiry.
  Email status became `failed`, as expected while the Resend sender, recipient,
  API key, and delivery-webhook secret are absent. The owner did not authorize
  deleting or archiving that evidence row, so it remains recoverable.

Acceptance:

- Each public page has one predictable edit location.
- Gallery and Works content is no longer discoverable only through Media Library.

## Batch 7A - Provider-neutral media delivery and Media Optimizer V2

Status: Batch 7A.2e isolated ImageKit V2 authority core complete; authenticated
issuance, migration 0037, and atomic finalization pending

### Batch 7A.1 - Immediate traffic and persistence foundation

- [x] Replace the duplicate mobile/desktop Hero video elements with one
      responsive player while preserving focal positions, scale, autoplay,
      muted looping, poster fallback, and the existing visual composition.
- [x] Add provider-neutral physical-object, derivative, and optimization-job
      records without changing or deleting current `media_assets` rows.
- [x] Centralize trusted Media Library URL validation so the existing Supabase
      origin and a configured external-provider origin can coexist during
      rollback.
- [x] Record the provider-neutral persistence model plus the initial dormant R2
      and processing configuration contracts without exposing credentials.

Batch 7A.1 verification:

- 42 test files / 379 tests, TypeScript, full ESLint, and the production build
  pass.
- The migration is additive and grants no direct access to its operational
  tables. Existing `media_assets` rows and stored objects remain untouched.
- The owner applied migration `0034_media_optimization_foundation.sql` in the
  connected Supabase project on 2026-09-04. A service-role schema probe then
  reached `get_media_pipeline_v1_snapshot` and returned the expected `23503`
  sentinel result. Remote CLI migration history still needs later
  reconciliation before any `db push` workflow is safe.

### Batch 7A.2 - Provider foundation and ImageKit pilot

- [ ] Keep Supabase Postgres, Auth, Inbox, and searchable media metadata; move
      verified binary image/video delivery to the selected provider without
      changing the public content model.
- [ ] Add short-lived, admin-authorized direct ImageKit uploads and server-side
      finalization checks for provider identity, path, actual size, media type,
      and ownership.
- [x] Implement database guards that freeze ready object identity, require every
      derived lineage to reference a source variant, verify succeeded jobs point
      to a matching ready output, and close concurrent ready/retire races with a
      database-level foreign key (`0035_media_pipeline_integrity_guards.sql`).
- [x] Apply migration `0035` manually. The existing pipeline snapshot RPC still
      reaches the expected safe sentinel; migration `0036` adds a fail-closed
      catalog preflight that verifies the exact guards and active FK triggers
      before it creates any upload reservation surface.
- [x] Add a dormant `MEDIA_UPLOAD_PROVIDER` selector that defaults to Supabase,
      rejects malformed R2 or ImageKit settings without fallback, and exposes
      only safe readiness booleans—not credentials.
- [x] Prepare `0036_media_upload_intents.sql` with a private, expiring,
      provider-neutral reservation table and service-only idempotent preparation
      RPC. It creates no signed URL, finalizer, provider write, or current-media
      DML.
- [x] Apply and verify migration `0036` before adding a signing endpoint or
      enabling any external-provider uploads. The corrected migration completed
      successfully in the connected Supabase project on 2026-09-06.
- [ ] Keep Media Library upload progress, reference locks, usage badges, audit
      logs, recoverable trash, and contextual picking inside page editors.
- [ ] Use immutable, versioned object keys and keep provider credentials only
      in server/worker secrets.

Small, reviewable rollout steps:

- [x] **7A.2c — decision and dormant configuration:** select ImageKit Forever
      Free as the no-card pilot; document its environment contract and upgrade
      path; add fail-closed credential/endpoint validation, exact account media
      allowlists, queryless Next Image delivery, and a server-only pilot flag
      for conditional CSP upload access. Retain R2 only as a dormant,
      client-owned future alternative. `MEDIA_UPLOAD_PROVIDER` stays
      `supabase`, so no live upload changed.
- [x] **7A.2d — migration 0036 rollout:** apply the corrected
      `0036_media_upload_intents.sql` manually, verify its fail-closed catalog
      preflight and service-only RPC, and do not use `db push` while remote
      migration history remains unreconciled.
- [x] **7A.2e — ImageKit V2 authority core:** add an isolated short-lived JWT
      adapter that binds the canonical path/name, exact size, allowlisted MIME,
      overwrite=false, public-delivery policy, and expiry for one future v2
      database intent. ImageKit marks Upload V2 as beta, so the adapter remains
      unreferenced by live server actions and UI while Supabase stays active.
- [ ] **7A.2f — migration 0037 and authenticated lifecycle:** add canonical
      MIME-specific extensions and service-only prepare/resolve/cancel/fail
      RPCs; issue the V2 authority only after AAL2 admin, exact-origin,
      same-account, intent, and rate-limit checks. Resolve ImageKit
      `fileId`/`filePath`/`versionId` server-side, verify ownership, path, actual
      MIME/size, and streamed SHA-256, then atomically publish insert-only ready
      source records and consume the intent. Expired, failed, cancelled, or
      abandoned uploads must enter bounded, audited reconciliation and orphan
      cleanup. Because every V2 JWT is one-shot even after an upload error, a
      retry must first resolve the old intent and allocate a new intent/object
      key; the same authority must never be reissued. A failed finalization
      creates no public reference or silent provider orphan.
- [ ] **7A.2g — live pilot:** upload one disposable image and one disposable
      video through Admin V2, verify progress, provider metadata, delivery,
      deletion/cache behavior, and quota reporting, then remove the pilot
      records without touching existing portfolio media.
- [ ] **7A.3 — optimizer:** introduce the three owner-facing presets and
      verified source/preview/poster/playback variants in small media-type
      batches.
- [ ] **7A.4 — controlled cutover:** copy and verify existing assets in stages,
      switch only accepted references, measure Supabase egress, and retain the
      originals through the agreed rollback window.

Batch 7A.2c verification:

- 45 test files / 420 tests, TypeScript, full ESLint, and the production build
  pass.
- ImageKit credentials and the exact account endpoint fail closed without
  leaking secrets into readiness output.
- Next Image and the public media validator accept only the configured account's
  queryless `/media/` namespace. The browser upload origin stays blocked until
  ImageKit is explicitly selected or the bounded pilot flag is enabled.
- `MEDIA_UPLOAD_PROVIDER=supabase` remains active. No object, database row, or
  public media reference moved in this batch.

Batch 7A.2d-2e verification:

- 46 test files / 427 tests, TypeScript, full ESLint, and the production build
  pass.
- Migration `0036` completed successfully in the connected Supabase project on
  2026-09-06. Remote CLI migration history remains unreconciled, so `db push`
  is still prohibited.
- The isolated V2 signer accepts only the canonical MIME-specific object key
  for one intent, enforces the pilot size limit, expires within five minutes,
  and never outlives the database intent.
- The JWT binds the exact multipart fields and server-side ImageKit checks for
  size and MIME. It exposes neither the private key nor an unsigned upload
  option. A retry is contract-tested with a new intent/object key rather than
  reusing ImageKit's one-shot JWT. ImageKit still marks V2 as beta; production
  wiring remains pending.
- The existing Admin Media Library still calls only Supabase
  `uploadToSignedUrl`. `IMAGEKIT_PILOT_UPLOAD_ENABLED` stays false until
  same-account preflight, migration `0037`, authenticated issuance, server-side
  byte verification, atomic finalization, and orphan cleanup are complete.

### Batch 7A.3 - Media Optimizer workspace

- [ ] Add `/admin/v2/media` as a visual Gallery-style library with Images,
      Videos, Oversized, Optimized, and Needs attention filters, search,
      sorting, multi-select, usage details, and a responsive inspector.
- [ ] Add owner-friendly High quality, Balanced (recommended), and Smallest
      file presets for images and videos.
- [ ] Show estimated and actual before/after sizes, preview, progress, failure,
      retry, and `No saving` states without promising a fixed compression ratio.
- [ ] Always create a verified optimized copy first. Activation must be an
      explicit, optimistic, audited action with `Restore original`; never
      overwrite or auto-delete the source.
- [ ] Use a bounded set of ImageKit named transformations for pilot image,
      poster, and short-preview variants; restrict unnamed transformations so
      arbitrary URLs cannot consume the monthly processing quota. Use a
      durable asynchronous processor when longer video work is unsuitable for
      ImageKit limits, never long-running FFmpeg inside a normal Vercel request.
- [ ] Display ImageKit bandwidth, storage, and video-processing limits in plain
      language before enabling a preset; Lite increases bandwidth/storage but
      retains the Free plan's 500 monthly video-processing units.
- [ ] Add an explicit archive/purge workflow before the recoverable video
      catalog reaches the 120-item new-content cap.

### Batch 7A.4 - Showreel variants and controlled cutover

- [ ] Preserve the current Showreel visitor experience exactly: every card
      stays visible and browsable while scrolling, with the same desktop hover,
      mobile in-view autoplay, focus, click, modal/full-player, and audio
      behavior.
- [ ] Give Showreel cards lightweight moving preview derivatives while loading
      the selected full-quality playback derivative in the modal; posters and
      nearby metadata may warm ahead so fast scrolling does not leave blanks.
- [ ] Optimize the two current 48-50 MB Hero videos first. Remove audio only
      from decorative Hero loops; never strip Showreel playback audio.
- [ ] Inventory and copy existing Supabase objects to the verified ImageKit
      pilot account, verify provider identity, checksum evidence, content type,
      dimensions/duration, and size, then switch only accepted references in
      controlled stages.
- [ ] Retain Supabase originals for an agreed 14-30 day rollback window. Purge
      them only in a later batch with explicit owner approval.
- [ ] Add Playwright delivery/network-budget coverage for desktop and mobile,
      include real Safari/iOS verification where available, and confirm
      Supabase cached egress falls after cutover.

Acceptance:

- The public Showreel looks and behaves the same while transferring materially
  less data; every card remains available during normal scrolling.
- A nontechnical owner can optimize, compare, activate, and restore media
  without understanding storage providers.
- No migration, optimization, activation, or failed job deletes original media.
- ImageKit uploads and every page-editor picker work through one validated,
  provider-neutral media contract, and a provider outage fails gracefully
  rather than corrupting content.

Prerequisites:

- Create the ImageKit Forever Free account under client ownership and configure
  only its public key, restricted server-only private key, and URL endpoint for
  the pilot. No developer-owned payment method is part of the test setup.
- Keep `MEDIA_UPLOAD_PROVIDER=supabase` through migration 0036, configuration,
  finalizer, and live-pilot verification. Credentials are configuration, not a
  cutover switch and not proof that delivery works.
- Keep Cloudflare R2 dormant. Reconsider it only as a separately reviewed,
  client-owned production alternative if measured usage or economics outgrow
  ImageKit; it is no longer a prerequisite for Batch 7A.
- Select and document the asynchronous runtime for video jobs. Cloudflare
  services, a durable FFmpeg worker, or another managed video service remain
  options only when ImageKit's bounded transformations do not fit the workload.

Batch 7A.2 integrity-guard verification:

- Full check passes: 43 test files / 387 tests, TypeScript, full ESLint, and the
  production build.
- Source-contract coverage verifies immutable identifiers and recipes,
  same-asset source lineage, type-compatible ready objects, successful-job
  outputs, private trigger functions, and the concurrency-safe ready-object
  foreign key.
- The migration performs no media-row DML and does not move, replace, publish,
  or delete any current Supabase object.
- The owner applied `0035_media_pipeline_integrity_guards.sql` manually on
  2026-09-04. Exact catalog enforcement is deliberately rechecked by the
  fail-closed `0036` preflight because the private trigger functions are not
  exposed through the public API.

Batch 7A.2b dormant upload-foundation verification:

- Full check passes: 45 test files / 402 tests, TypeScript, full ESLint, and the
  production build.
- Every external provider remains disabled, the current Supabase uploader
  remains active, and no object or public media reference has moved.
- The first manual `0036` attempt rolled back cleanly after a newline-sensitive
  `pg_get_expr` comparison produced a false negative. The check now compares
  against the same server's deparse of an empty transaction-scoped generated
  column, preserving exact semantics without depending on formatting.
- The future signing/finalization path must recheck asset-ID availability,
  verify the uploaded object at the provider, and publish with insert-only
  semantics in one controlled transaction.

## Batch 7B - Inbox V2 and Gmail delivery

Status: agreed; planned after the media egress emergency

- [ ] Move the existing inquiry workspace intact from Analytics to
      `/admin/v2/inbox`, preserving search/filter, statuses, private notes,
      archive, delivery badges, pagination, audit/security behavior, and
      `Reply by email`.
- [ ] Configure Resend with a verified sending domain and deliver Contact
      notifications to the owner-selected Gmail address via
      `BOOKING_TO_EMAIL`; retain the visitor address as `Reply-To`.
- [ ] Configure `RESEND_API_KEY`, `BOOKING_FROM_EMAIL`, `BOOKING_TO_EMAIL`, and
      `RESEND_WEBHOOK_SECRET` in deployment without committing or displaying
      secrets.
- [ ] Subscribe `/api/resend/webhook` to sent, delivered, delayed, bounced,
      complained, failed, and suppressed events and verify Inbox transitions.
- [ ] Submit a marked production inquiry, verify the Supabase row, Gmail
      receipt, and final Resend webhook status, then archive both QA records.
- [ ] Configure Supabase Auth SMTP and recovery templates separately; admin
      password recovery is not the Contact-notification channel.

Acceptance:

- Messages are a first-class workspace rather than an Analytics sub-tab.
- A successfully stored message is never duplicated merely because email
  delivery is delayed or unavailable.
- The owner receives a readable Gmail notification and can reply directly to
  the visitor without exposing service credentials.

## Batch 8 - Dashboard, Analytics, and Settings V2

Status: in progress; Security & access and Insights workspaces implemented

- [x] Build a task-first `/admin/v2` overview.
- [ ] Prioritize actionable issues, quick actions, pages, and new messages.
- [ ] Add a `What do you want to change?` destination finder.
- [x] Keep traffic summaries secondary to editing tasks.
- [ ] Move healthy technical checks out of the main dashboard.
- [ ] Place Brand, Access, Security, and technical health under Settings.

### Batch 8A - Security & access V2

Status: implemented and verified

- [x] Add `/admin/v2/security` to the overview, collapsible desktop sidebar,
      and mobile drawer without removing `/admin/security`.
- [x] Reuse the complete Security Center data and mutation boundaries instead
      of maintaining a second access-control implementation.
- [x] Reorder the workspace for a nontechnical owner: Overview, Admin access,
      Protection activity, Audit log, then Advanced checks.
- [x] Preserve role management, MFA reset, session revocation, audit filters,
      event-cap/load/configuration warnings, hash links, keyboard tabs, pending
      buttons, confirmation prompts, and unsaved-change protection.
- [x] Keep every action on its originating Classic or V2 surface through a
      strict two-value allowlist; never accept an arbitrary return URL.
- [x] Revalidate both Security views and both overview pages after mutations.
- [x] Keep AAL2 authentication, exact-origin checks, owner authorization,
      Auth-email matching, current-owner protection, and the database-backed
      final-owner guard intact.
- [x] Improve status semantics and surface an explicit audit warning when an
      MFA reset succeeds but its audit record cannot be written.
- [x] Verify expanded and collapsed desktop layouts, the 390 px mobile drawer,
      sticky tabs while scrolling, keyboard tab navigation, the V2 overview
      entry point, and the unchanged Classic route in an authenticated browser.
- [x] Pass 442 automated tests, TypeScript, ESLint, and the production build.
- [ ] Replace the advanced Supabase Auth UUID handoff with a separately
      designed invitation-by-email flow; do not weaken account provisioning to
      make the current form look friendlier.

Acceptance:

- Classic and V2 expose the same protected capabilities and neither route can
  redirect an action to an attacker-controlled destination.
- Desktop, collapsed-sidebar, mobile drawer, sticky tabs, and keyboard paths
  remain usable without overlapping navigation.
- This presentation-only V2 move needs no migration, secret, or owner action.

### Batch 8B - Insights V2

Status: implemented and verified

- [x] Add `/admin/v2/insights` to the overview and V2 sidebar without removing
      `/admin/analytics`.
- [x] Keep V2 Insights analytics-only. Do not load or render inquiry records;
      the complete Inbox remains in Classic until Batch 7B gives it a dedicated
      `/admin/v2/inbox` workspace.
- [x] Reuse the existing analytics presentation and aggregation instead of
      maintaining a second reporting implementation.
- [x] Reorder and rename the V2 workspaces for a nontechnical owner: Overview,
      Popular pages, Visitors, Interactions, Recent activity, and Data health.
- [x] Preserve the 7, 30, 90, and 180 day windows, equal-period trends, complete
      daily chart, accessible data table, top rankings, anonymous sessions,
      accepted contact activity, privacy wording, latest events, and p75 Web
      Vitals.
- [x] Keep range links on their originating Classic or V2 route through a fixed
      two-value path map.
- [x] Surface the 5,000-event cap beside the report and explain that the prior
      180-day comparison can be incomplete under the current 180-day retention
      policy.
- [x] Keep explicit AAL2 admin authentication ahead of the service-role
      analytics load, while requiring no migration, secret, or owner action.
- [x] Verify expanded and collapsed desktop layouts, the 390 px mobile drawer,
      mobile overflow, sticky tabs, Arrow/Home/End keyboard navigation, hash
      state, report ranges, the overview entry point, and unchanged Classic
      Analytics/Inbox behavior in an authenticated browser.
- [x] Pass 450 automated tests, TypeScript, ESLint, and the production build.
- [ ] Replace the capped raw-event read with server-side aggregation before
      traffic grows enough to make high-volume ranges routinely partial, and
      decide whether to extend retention or disable the incomplete 180-day
      comparison baseline.

Acceptance:

- The owner can understand the portfolio performance without finding messages
  and analytics mixed into the same workspace.
- Missing data remains unavailable rather than fabricated as zero, partial
  reports are clearly labelled, and no raw URLs or visitor fingerprints are
  exposed.
- Classic Analytics and its complete Inbox remain available throughout the V2
  migration.

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
- [ ] Hide truly empty public Music sections without leaving dead anchors.
- [ ] Avoid duplicate eager Spotify iframe loads across desktop/mobile layouts.
- [ ] Remove the Home/Bio JSON-LD CSP nonce hydration warning.
- [ ] Replace the authenticated server-session user warning with a verified
      user lookup at the relevant Supabase boundary.
- [ ] Confirm the verified ImageKit cutover removes the intermittent Supabase
      image-optimizer timeout path and keep every remote-image failure graceful.
- [ ] Consume the unsaved-change history sentinel after save/discard so the
      first Back action always navigates as expected.
- [ ] Take a full database backup and reconcile the empty remote Supabase CLI
      migration history before allowing any `db push` workflow.
- [ ] Configure the canonical production URL and Google Search Console, then
      submit and verify `/sitemap.xml`.
- [ ] Verify production Auth policy: disabled public signup/anonymous login,
      password and recovery settings, TOTP, CAPTCHA, session limits, and SMTP.
- [ ] Configure and test deep health checks, scheduled retention maintenance,
      security secrets, and production dependency monitoring.
- [ ] Retire broad authenticated direct-table write policies after the V1
      editors are removed, so the audited V2 service RPCs become the only
      supported content-write boundary.
- [ ] Keep V1 available through an agreed rollback window.
- [ ] Make V2 the default only after owner acceptance.
- [ ] Deprecate legacy profile fields in a later migration; retain historical
      inquiry classification where needed.

Acceptance:

- V2 becomes default only after all critical checks and owner review pass.
- Rollback does not require restoring deleted content or database records.
