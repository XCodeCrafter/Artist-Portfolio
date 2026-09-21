# Artist Portfolio V2 Roadmap

Updated: 2026-09-21

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
issuance, the lifecycle migration, and atomic finalization pending

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
- [ ] **7A.2f — lifecycle migration and authenticated lifecycle:** add canonical
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
  same-account preflight, the lifecycle migration, authenticated issuance, server-side
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

Status: in progress; Inbox V2 implemented, Gmail delivery rollout pending

- [x] Move the existing inquiry workspace intact from Analytics to
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

### Batch 7B.1 - Inbox V2 workspace

Status: implemented and verified

- [x] Add `/admin/v2/inbox` to the overview, sidebar, and Contact editor without
      removing the Classic Inbox under `/admin/analytics#inquiries`.
- [x] Extract one shared inquiry view so Classic and V2 keep the same messages,
      workflow statuses, private notes, mail reply, archive option, delivery
      badges, pagination, pending buttons, delete confirmation, and
      unsaved-change protection.
- [x] Keep search and status filtering honest: they apply only to the currently
      loaded page, while New, Read, Replied, Archived, and Total remain exact
      database counts.
- [x] Use two server-owned action wrappers and a fixed `classic | v2` route map;
      never accept a return URL from the browser.
- [x] Keep AAL2 authentication, exact-origin verification, strict UUID/status/
      notes validation, service-role isolation, and audit logging ahead of
      every mutation.
- [x] Verify an updated or deleted row actually existed, distinguish audit-log
      warnings from failed mutations, and revalidate both Inbox surfaces and
      both overview pages.
- [x] Preserve validated page/range context after a mutation, canonicalize
      malformed and empty out-of-range pagination on both V1 and V2, and never
      accept a browser-supplied return URL.
- [x] Keep filtered-out forms mounted, exempt `mailto:` from draft-discard
      navigation, cap notes at 4,000 characters, and recover the submitted
      draft from tab-scoped session storage after a failed server action.
- [x] Stop serializing unused source IP, raw user-agent, and Resend provider ID
      fields into the admin client payload; select only fields rendered by the
      Inbox.
- [x] Fall back to the privacy-safe original inquiry columns when optional
      intent/delivery migrations are not present; unrelated or fallback query
      failures still fail closed instead of fabricating zeroes.
- [x] Explain that email configuration presence is not proof of delivery and
      that a failed notification does not mean the stored message was lost.
- [x] Verify expanded and collapsed desktop layouts, the 390 px mobile drawer,
      responsive message cards, sticky loaded-page filters, empty-filter state,
      the overview/Contact entry points, and unchanged Classic behavior in an
      authenticated browser without mutating the QA inquiry.
- [x] Pass 476 automated tests, TypeScript, ESLint, and the production build.

No migration, provider credentials, or owner action were required for this UI
and security slice. Gmail/Resend activation remains the next part of Batch 7B
that requires the owner-selected address, verified sending domain, deployment
secrets, and a marked production delivery test.

Acceptance:

- Messages are a first-class workspace rather than an Analytics sub-tab.
- A successfully stored message is never duplicated merely because email
  delivery is delayed or unavailable.
- The owner receives a readable Gmail notification and can reply directly to
  the visitor without exposing service credentials.

## Batch 8 - Dashboard, Analytics, and Settings V2

Status: Dashboard V2 scope implemented and verified; longer-term hardening
follow-ups remain tracked below

- [x] Build a task-first `/admin/v2` overview.
- [x] Prioritize actionable issues, quick actions, pages, and new messages.
- [x] Add a `What do you want to change?` destination finder.
- [x] Keep traffic summaries secondary to editing tasks.
- [x] Move healthy technical checks out of the main dashboard.
- [x] Place Brand, Access, Security, and technical health under Settings.

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

### Batch 8C - Admin boundary hardening

Status: code-only protections implemented and verified; production controls
requiring migration or owner settings remain planned

- [x] Replace the recovery flow's unverified server-session read with verified
      Supabase claims, require matching admin `sub` and UUID `session_id`, and
      keep the stored challenge bound to a one-way session digest.
- [x] Verify the active admin's AAL2 state from signed claims with a matching
      subject instead of reading MFA state from an untrusted session user.
      Memoize the auth boundary per request so the preview layout and its data
      loader keep defense in depth without duplicate network round-trips.
- [x] Invalidate older recovery challenges for the same administrator before a
      replacement link is issued; fail closed if that invalidation cannot be
      confirmed.
- [x] Add an authenticated layout around every `/admin/v2-preview/*` route so a
      future loader refactor cannot accidentally expose unpublished drafts.
- [x] Require development loopback actions to match the request Host and port
      exactly instead of trusting every localhost origin.
- [x] Make the shared audit writer exception-safe so a network failure after a
      successful mutation cannot turn into a misleading 500 and invite a
      duplicate retry.
- [x] Keep media insert diagnostics in server logs and return only a generic
      upload failure to the browser.
- [x] Review production dependencies. The current audit reports one upstream
      PostCSS source-map advisory through two dependency paths; the installed
      release has no available fix and the application does not process
      visitor-supplied CSS during runtime. Recheck it on dependency updates.
- [x] Pass 57 test files / 496 tests, TypeScript, ESLint, and the production
      build.
- [ ] Make replacement recovery challenge issuance transactionally
      single-active per administrator so two concurrent callback requests
      cannot race between invalidation and insert. This needs a service-only
      RPC or a new uniqueness constraint.
- [ ] Make Security Center session revocation immediate by validating the JWT
      `session_id` against a service-only database boundary, then reduce the
      Supabase JWT lifetime to an agreed fallback window. This needs a reviewed
      migration plus a production Auth setting change.
- [ ] Retire broad authenticated direct-table and Storage mutation policies
      after every remaining V1 writer has a service-only replacement. Until
      then an AAL2 admin token can bypass application validation and audit by
      calling Supabase REST directly.
- [ ] Prevent Classic Bio and Music writes from bypassing V2 optimistic
      locking once their V2 snapshot functions are active; provide a visible
      handoff before disabling those legacy forms.
- [ ] Add server-verified Turnstile and a bounded global limiter before Contact
      email delivery is activated; this requires owner-controlled site keys.

### Batch 8D - Task-first Dashboard V2 completion

Status: implemented and verified

- [x] Replace the equal-weight wall of editor cards with a task-first Overview:
      concrete next actions, quick actions, a compact portfolio page directory,
      and secondary Reports and Settings workspaces.
- [x] Add a functional destination finder backed by a static application-owned
      route registry. Familiar English and Czech terms such as `photos`,
      `fotky`, `CV`, `Spotify`, `messages`, `logo`, and `heslo` resolve to the
      relevant editor without accepting a request-controlled URL.
- [x] Add an admin-authenticated Inbox pulse that performs one exact head/count
      query for new messages and never loads names, email addresses, or message
      bodies onto the Overview.
- [x] Prioritize new messages ahead of editor problems, produce the issue count
      from the same deterministic issue list, include Music readiness, and keep
      optional Contact notification setup distinct from a broken Inbox.
- [x] Show editor readiness separately from navbar visibility so a hidden page
      is never misreported as unavailable or deleted.
- [x] Add `/admin/v2/settings` as the site-wide settings home. Group Brand and
      appearance, Admin access, Protection and audit, and Advanced technical
      health while reusing the existing Classic and Security workspaces.
- [x] Group the desktop sidebar and mobile drawer into Start, Portfolio, Work,
      and Settings. Keep `/admin/v2/security` highlighted under Settings and
      preserve the collapsible desktop layout.
- [x] Verify the authenticated Overview and Settings hub in a live browser at
      desktop and 390 px mobile widths, including destination search, Enter
      navigation, drawer, collapsed sidebar, Security hash routing, and a clean
      browser console.
- [x] Pass 58 test files / 504 tests, TypeScript, ESLint, and the production
      build.

No migration, secret, or owner action is required for this UI batch. HOME and
Brand continue to open their clearly labelled Classic editors until their V2
mirrors are designed.

Acceptance:

- A nontechnical owner can reach common edits without knowing internal terms.
- Technical detail stays available without dominating the primary workflow.

## Batch 9 - HOME cleanup and 1:1 editor

Status: HOME V2 implementation verified on 2026-09-20; manual migration 0037
and a live save/refresh test remain pending.

Implemented: HOME V2 preview/inspector with independent visibility and order
for Hero, About, CNC / Code in motion, video feature, and Stories; editable copy
and Media Library selection. Hiding a section keeps its content. The shared
Footer remains in global settings and CNC program files keep their existing
manager. Preserve current content and ordering during the migration.

Resume afterwards: ImageKit Batch 7A.2f (authenticated upload lifecycle), then
7A.2g pilot, optimizer, and controlled media cutover. Gmail notifications in
Batch 7B remain pending; neither provider configuration nor delivery has been
activated by this HOME work. Migration 0037 is now allocated to HOME; the
previously planned ImageKit migration remains unnumbered until implementation.
Migration 0038 is now allocated to the admin hardening follow-up below.

- [x] Inventory the current five rendered HOME sections: Hero, About, CNC,
      Interlude, and Stories. Footer remains global; unused legacy update/teaser
      fields remain intact and do not appear as misleading editor controls.
- [ ] Remove duplicate or obsolete HOME concepts only after content review.
- [x] Build the HOME editor from the accepted V2 visual-editor pattern with
      shared public/preview components, desktop/mobile preview, a contextual
      inspector, and section-scoped save/discard.
- [x] Add visibility switches and keyboard-accessible order buttons. Hiding
      content never erases it; hidden media remain reference-protected.
- [x] Add editable Hero media/copy, About photo/copy, CNC presentation, feature
      video/poster/copy, and all four Stories images/texts.
- [x] Add optimistic page versions, service-only validated save RPCs, audit,
      strict preview messaging, and a Classic HOME write handoff.
- [x] Keep the public layout working with legacy data until migration 0037.
- [x] Verify 592 unit/integration tests (69 files), TypeScript, ESLint and
      production build. Execute migration 0037 and its read-only checks on an
      isolated in-memory PostgreSQL engine (PGlite), including repeat rollout,
      conflict rejection, role permissions, input validation and media references.
- [x] Verify authenticated desktop preview selection, responsive 390 px mobile
      inspector, Escape/focus return, missing-migration notice and clean browser
      error/warning console. No production content was saved during browser QA.
- [ ] Apply `0037_home_page_editor.sql` manually, then run
      `supabase/checks/0037_home_page_editor.sql` (all checks should be true).
      Do not use `supabase db push` while CLI migration history is unreconciled.
- [ ] After migration, test a reversible HOME hide/reorder/edit/save/refresh in
      the authenticated browser and confirm the public page reflects it.

Acceptance:

- HOME has an agreed section order and a single clear editing workflow.
- No legacy HOME content is deleted without explicit approval.

## Batch 9B - Admin hardening, owner name and Appearance V2

Status: implemented 2026-09-20; local validation recorded in
`docs/admin-audit-2026-09-20.md`. No remote SQL, publication, provider setup,
account revocation, or GitHub push was performed by this batch.

- [x] Add owner/artist name editor directly to Navbar with scoped save,
      canonical response, stale-write rejection and shared unsaved-change guard.
- [x] Add dedicated Appearance V2 page, sidebar entry, Settings and search links:
      Display/Body/UI font choices plus actual white-soul/red-light footer preview.
- [x] Require admin + MFA + Origin verification and strict allowlists on writes.
- [x] Update vulnerable runtime/tooling dependencies; npm audit reports zero.
- [x] Prepare migration 0038 for live-session checks in server auth and RLS,
      atomic single recovery-challenge issuance and a visible pre-migration warning.
- [x] Protect logout origin/audit and rate-limit MFA enrollment.
- [x] Close Classic write bypasses into active Bio/Music/Gallery/social V2 editors.
- [x] Add version checks for Classic settings, Inbox updates/deletes and media metadata.
- [x] Keep legacy draft values and timestamps coherent across server refreshes;
      preserve rejected drafts from React action resets; explicit confirmed reload
      is the only way legacy forms adopt a changed version.
- [x] Bind upload finalization to signed expiring per-admin proof; never delete
      existing storage objects after a failed/replayed finalize request.
- [x] Check all main V2 pages and retained V1 dashboard/content/media/analytics/security
      in the authenticated browser without publishing test content.
- [x] Verify desktop/mobile Navbar and Appearance, explicit discard, sidebar,
      navigation Escape/focus, 777 tests in 78 files, TypeScript, ESLint,
      production build, zero npm audit findings and isolated PostgreSQL 0037/0038 checks.
- [ ] Apply 0037 (HOME) if still pending, then 0038 (admin hardening); run both
      matching files in `supabase/checks/`. Do not use `db push` while remote CLI
      history is unreconciled. Browser confirmed both are pending in this environment.
- [ ] After deployment, verify actual save/refresh/public reflection for owner name,
      Appearance and HOME with owner-approved content; verify revocation using a
      disposable second admin session, not the owner's only active session.
- [ ] Complete browser-native discard-dialog confirmation test; in-app browser
      control became unresponsive in that test tab after opening the native prompt.
- [ ] Continue ImageKit 7A.2f, then its pilot/optimizer/cutover; leave the provider
      on Supabase and pilot disabled until validated. Allocate next free migration number.
- [ ] Resume Gmail notification delivery (7B); configure client-owned Resend sender,
      Gmail recipient, webhook, retention scheduler and deep-health monitor secrets.
- [ ] Finish production Auth settings review and eventual retirement of broad
      active-admin legacy direct writes after V1 cutover (Batch 10).
- [ ] Add bounded ownership-proven orphan-upload cleanup; failed finalizations now
      safely retain files instead of guessing which object can be deleted.

## Batch 10 - QA, migration, and cutover

Status: Batch 10A runtime and hydration cleanup implemented and verified;
production cutover remains planned

- [ ] Validate keyboard, touch, responsive layout, contrast, and reduced motion.
- [ ] Test migration/backfill and rollback against representative data.
- [x] Run unit, integration, typecheck, lint, and production build checks.
- [ ] Verify sitemap, metadata, structured data, analytics, contact, and admin auth.
- [x] Hide truly empty public Music sections without leaving dead anchors.
- [x] Avoid duplicate eager Spotify iframe loads across desktop/mobile layouts.
- [x] Remove the Home/Bio JSON-LD CSP nonce hydration warning.
- [x] Keep scroll-reveal bookkeeping out of server-rendered attributes so
      streamed Admin V2 previews cannot be mutated before hydration.
- [x] Replace the authenticated server-session user warning with verified
      claims and subject matching at the relevant Supabase boundaries (Batch
      8C).
- [ ] Confirm the verified ImageKit cutover removes the intermittent Supabase
      image-optimizer timeout path and keep every remote-image failure graceful.
- [x] Consume the unsaved-change history sentinel after save/discard so the
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

Batch 10A verification (2026-09-07):

- Public Music renders one responsive Spotify iframe, retains the stable
  `#music` target, and omits the currently empty Platforms and SoundCloud
  sections while the Admin V2 preview keeps every editor section selectable.
- Home, Bio, public Music, and the streamed Music preview load without console
  hydration errors. The JSON-LD payloads remain parseable and CSP nonces remain
  attached server-side.
- A local Music draft was discarded without saving; the first Back action left
  the editor immediately, confirming that the guard entry was consumed.
- History cleanup is single-flight: classic form submits wait for compaction,
  preserve their submitter, and cannot double-submit or discard a newer edit.
- `npm run check` passes 63 test files / 527 tests, TypeScript, ESLint, and the
  production build.
- No migration, secret, content publication, or owner action is required.

Acceptance:

- V2 becomes default only after all critical checks and owner review pass.
- Rollback does not require restoring deleted content or database records.

## Batch 11 — Public editability audit & Classic → V2 completion (2026-09-20)

Audit: `docs/public-editability-audit-2026-09-20.md`. This batch does not replace
the pending ImageKit Batch 7A.2f, Gmail notifications Batch 7B, or production
acceptance / migration-history reconciliation.

### 11A — Audit and missing workflows

- [x] Audit all public routes and active Classic workflows before implementation.
- [x] Identify Media library, CNC program management, and tagline/site description
      as actual Classic-only gaps; distinguish new product scope from parity.
- [x] Record fixed legal copy, page SEO, system labels, and layout limitations.

### 11B — Media library V2

- [x] Native library route, sidebar/finder entry, file selection and contextual
      inspector; upload, search, type/Trash filters, descriptions and usage.
- [x] Connect page media pickers and Showreel upload to V2 Media.
- [x] Versioned metadata writes; atomic replace-used-file-and-trash; restore.
- [x] Add service-only migration 0040 usage registry, reference replacement and
      stale-writer guards (including hidden/Classic references).
- [x] Verify migrations 0039–0040 in isolated PostgreSQL and test lifecycle errors,
      stale references, both CAS checks, rollback and provider-variant protection.
- [x] Owner reports applying 0039 and 0040 in Supabase (2026-09-20).
      Appearance and Media usage load successfully in authenticated V2.
- [ ] Confirm all rows in the matching 0039 and 0040 read-only check scripts
      have `passed = true`; successful UI reads do not verify every grant,
      constraint, or trigger. Never blind `supabase db push`.
- [ ] Owner acceptance: upload disposable fixture, replace a used fixture,
      verify public result, move to Trash and restore. No live files used as tests.
- [ ] Separate follow-up: provider-aware permanent cleanup / freed storage bytes.
      Recoverable Trash intentionally retains original objects and billed size.

### 11C — HOME code programs and shared identity/footer

- [x] Bring CNC source CRUD, order, visibility and public code preview into V2
      HOME with contextual inspector, draft guard and existing versioned RPC.
- [x] Move brand tagline/site description into Appearance; preserve user-written
      music-only or acting-only copy without heuristic replacement.
- [x] Add editable footer content with the actual shared footer preview; prepare
      migration 0039 without changing current default design.
- [x] Final full regression: **882 tests / 86 files**, TypeScript, ESLint and
      production build passed after all review fixes. Both isolated PostgreSQL
      migration scripts passed; only the pre-existing Edge Runtime deprecation
      warning remains in the build output.
- [x] Public browser smoke on all eight routes; mobile HOME/Gallery/Contact and
      Showreel. Repair the discovered Showreel min-content overflow without
      changing video behavior. Authenticated V2 remains gated by owner login.
- [ ] Authenticated owner acceptance after migrations: Media, CNC and Appearance
      drafts/inspector/save/conflict/Trash workflows with disposable fixtures.

Classic remains available during the rollback window. No production content,
storage object, provider setting, account, or migration is changed by this batch.

## Batch 12 — Audit repairs & visitor privacy (2026-09-21)

Implementation notes: `docs/privacy-and-audit-repairs-2026-09-21.md` and
`docs/analytics-consent-hardening-2026-09-20.md`. No new migration in this batch.

### 12A — Confirmed audit defects

- [x] Preserve V2 drafts/CAS on rejected or malformed saves; ambiguous results
      and conflicts require explicit saved-version reload before retry.
- [x] Replace application-owned native confirm prompts with an accessible
      in-app discard dialog; retain the browser's real beforeunload protection.
- [x] Fix Media inspector reachability and dirty state after restoring values.
- [x] Include Appearance/footer + Media readiness on Overview, and expose
      owner identity/footer destinations clearly in Settings.
- [x] Correct HOME enabled/visible language, Gallery help and Music validation.
- [x] Correct analytics attribution, tab visits, explicit interactions and
      partial-report warnings. Exclude legacy measurements without deleting them.
- [x] Stop presenting bespoke Web Vitals and unverified comparison percentages
      as reliable measurements. Exclude development / Vercel preview ingestion.

### 12B — Functional consent, not a decorative banner

- [x] Default-denied analytics and external-player categories; equal accept/reject,
      granular choices, 180-day preference cookie and withdrawal/reopen controls.
- [x] Music-themed Read more dialog, keyboard controls, mobile layout and a
      factual privacy notice including providers, storage and contact handling.
- [x] Block Spotify/SoundCloud/YouTube/Vimeo iframe requests before consent;
      unmount after withdrawal. Preserve hosted Showreel preview/playback behavior.
- [x] Gate analytics in both client and API before identifiers/database processing;
      keep essential Contact/Inbox delivery independent from analytics consent.
- [x] Test cookie failures/expiry, per-purpose choices, cross-tab synchronization,
      withdrawal, actual collector callbacks and server no-consent behavior.
- [x] Browser QA: default no iframes, reject + reload, external-only permission,
      withdrawal, desktop/mobile Read more and Escape/focus restoration.
- [x] Non-publishing V2 browser QA: Media dirty reversal, reachable lower controls,
      Keep editing / Discard navigation, Settings and honest Insights states.
- [x] Final `npm run check`: 997 tests / 97 files, TypeScript, ESLint and production
      build passed; `git diff --check` passed.

### 12C — Production completion / owner follow-up (not claimed complete)

- [ ] Implement DB-side analytics aggregates, verified coverage/cutover, long-term
      retention and the proposed main visits/views graph before promising 1Y
      reporting or accurate comparisons. No invented unique-person/time metrics.
- [ ] Add internal-traffic controls, monitored ingestion health and a
      standards-based performance collector in a separate analytics batch.
- [ ] Owner/legal review before launch: real controller contact/identity,
      actual provider contracts/regions/transfers, rights and retention schedule;
      verify scheduled cleanup and procedures for deletion requests.
- [ ] Production acceptance on disposable fixtures: saves/conflicts/uploads/
      replace/Trash/restore, consented event ingestion and Contact delivery.
- [ ] Still return to ImageKit **7A.2f**, Gmail/Resend **7B**, migration verification
      checks **0039/0040**, and safe CLI migration-history reconciliation.

## Batch 13 — Classic parity and safe retirement (2026-09-21)

Owner approved sequential implementation after the read-only Classic/V2 audit.
Work on one sub-batch per turn; retain Classic and all existing content until the
final audit and explicit retirement approval. Do not replay migrations or publish
test content. Existing ImageKit, email, analytics and production follow-ups above
remain open; they were not completed Classic features lost during migration.

### 13A — Spotify player parity

Status: complete. No database migration required.

- [x] Preserve the selected player on heading-only saves, profile edits and in
      the 1:1 preview; never silently replace a saved playlist with artist releases.
- [x] Keep the artist profile separate; accept ordinary playlist, album, track
      or artist links for the player with clear errors and an explicit reset to
      artist releases. Preserve intentional empty players and valid embed options.
- [x] Validate and normalize trusted Spotify URLs on server and preview boundaries;
      preserve consent gating and link the iOS fallback to the chosen content.
- [x] Add save, preview, URL-safety and editor regressions; run automated checks
      and non-publishing browser QA if the authenticated local session is available.

Verification: full automated suite, TypeScript, ESLint and production build pass;
only the existing Edge Runtime deprecation warning remains. Regression tests
cover independent fields, normal/embedded URLs, query preservation, blank
players, unsafe hosts, preview sanitation, RPC/CAS and the actual iOS fallback.
Authenticated browser QA on port 3001 confirms field independence, validation,
the explicit artist shortcut and valid blank players; draft values were restored
without saving or changing production content. External player consent stays
unchanged. A provider playback/live database write is not claimed by this QA.

### 13B — Unified production readiness

Status: complete. No database migration required.

- [x] Bring useful Classic checks into V2 Security: production HTTPS URL, schema,
      storage availability, auth secret and public signup status.
- [x] Show actionable critical warnings on Overview; distinguish an unavailable
      check from a verified failure. Update outdated migration wording/checks.
- [x] Keep advanced diagnostics out of the everyday editing path; test parity.

Implementation: shared pass/fail/unknown checks now feed Security and Overview.
Required editor interfaces include footer content (0039) and Media usage (0040).
Diagnostics use bounded read-only requests; removed the old Contact write probes
and rate-limit consumption. Overview skips duplicate editor snapshot reads,
shows only critical deployment issues and avoids duplicate Contact warnings.
Advanced keeps optional setup separate and explains each check's limited scope;
configured credentials never imply tested writes, delivery or scheduled jobs.

Verification: 1,072 tests, TypeScript, ESLint and production build passed. The
existing Edge Runtime deprecation warning remains. Authenticated browser QA on
localhost:3001 verified Overview warnings, the direct Advanced link and expanded
passing checks, including database interfaces and Media storage; no browser
warnings/errors were observed. Regression tests cover unavailable dependencies,
malformed responses, missing schema, safe error messages and unknown-state UI.
No content, access settings, migrations or external configuration were changed.

Owner follow-up before production: connected Supabase Auth reports public signup
enabled. Disable public registration after confirming the intended admin-invite
flow. This local environment also lacks the production HTTPS URL and Contact
email setup; the checks do not establish the separate Vercel deployment's state.

### 13C — Media organization and recognition

Status: complete. No database migration required.

- [x] Add compact filters for missing alt, oversized, recent and availability;
      sorting by newest, largest and name without misleading publication wording.
- [x] Add recognizable video poster thumbnails without preloading every video.
- [x] Add copy-URL convenience and richer placement labels/editor links.
- [x] Assess a safe "Use on page" shortcut that opens a draft, never auto-publishes.
- [x] Test selection, filters, dirty-state protection and mobile ergonomics.

Implementation: composable type/search/condition/availability filters with newest,
largest and natural-name sorting. Size hints use recorded sizes above 2 MB for
photos and 20 MB for videos, not upload limits or automatic optimization. Recent
uses the refreshed server snapshot time. Filtering keeps the selected draft and
its original CAS version, including when its card disappears from the results.
Unknown usage never becomes a claim that a file is unused.

Video grid tiles use only safe, already-saved poster images from HOME, page heroes,
Showreel and Gallery, read with bounded optional queries. Missing/unusable posters
show a labelled fallback; generation and background video downloads are not added.
Only the selected inspector mounts a player, with preload="none". Copy URL reports
clipboard failure honestly. Placement descriptions distinguish hidden/Classic
references and link only to known V2 editors without claiming precise locations
when the usage registry cannot provide them.

Shortcut assessment: automatic draft injection is deferred, not silently wired
to an ineffective query parameter. It needs a compatible destination field and
per-editor draft/CAS integration across six editors. The safe guided alternative
opens an editor in a new tab, preserving the Media draft; the owner chooses the
section and file, then explicitly saves there. No automatic placement/publication.

Verification: 1,183 tests, TypeScript, ESLint and production build passed; only
the existing Edge Runtime warning remains. Authenticated browser QA on port 3001
verified sorting, combined filters, draft preservation/restoration without saving,
and no video elements in the grid. Desktop (1440 px) and mobile (390 px) layouts
were checked; mobile selection focuses the inspector with no horizontal overflow.
No browser warnings/errors were observed. Current live-library videos have no
usable saved posters; populated-poster and unsafe/error paths are covered by
regression fixtures. No media, portfolio content, permissions or provider settings
were changed. No migration or upload/removal operation was run during browser QA.

### 13D — Retiring old content safely

Status: owner confirmed 0041 through 0044 rollout with all checks true. All
archive collections are implemented and locally verified. Authenticated browser
QA for Gallery/Showreel and disposable-fixture lifecycle verification remain
pending; the archive audit gate is not complete until those checks pass.

- [x] Design recoverable archive/removal for saved BIO items, credits, platforms,
      SoundCloud, navbar shortcuts, Gallery and Showreel content cards.
- [x] Separate content-card removal from file Trash; hidden/archived rows must not
      permanently consume active collection capacity. Preserve references/CAS.
- [x] Prepare any forward-only migration and tests; wait for owner rollout where
      required. No deletion of existing public content as a test.

#### 13D.1 — Shared private archive foundation + Navbar pilot

- [x] Prepare migration 0041 with a private archive, exact active-collection CAS,
      archive-row CAS, hidden restore, capacity enforcement and Media references.
- [x] Add explicit archive confirmation and paginated restore to Navbar shortcuts;
      missing migration blocks only archive, not the existing shortcut editor.
- [x] Verify isolated SQL, application boundaries, draft protection and build.
- [x] Owner applies `supabase/migrations/0041_content_archive_navbar.sql`, then
      runs `supabase/checks/0041_content_archive_navbar.sql` (all seven checks
      returned true, confirmed by owner screenshot). Reload Navbar V2 before use.

Implementation: saved shortcut cards now have explicit Archive confirmation;
this immediately removes the icon from navbar/footer and frees its active slot.
Restoration preserves its original data/order but always returns it hidden.
The archive is private, paginated by 20, and never deletes a storage file.
Archived file references remain visible in Media usage and participate in exact
replacement, which also invalidates the archived row's restore version. Stale
clients cannot recreate archived IDs. Unconfirmed outcomes keep the draft and
require a guarded reload, without silently discarding another Navbar editor's
unsaved work. Normal saving remains independent of read-only archive paging.

Verification: isolated PostgreSQL/PGlite exercises forward deployment/rerun,
whole-collection CAS, hidden restore/ABA, stale Classic upserts, last-item empty
state, the 16-slot limit, permissions, paging, media replacement and rollback in
both directions. Application and UI regression tests cover origin/auth gates,
malformed snapshots, unknown outcomes, sibling drafts and pagination races.
Full verification passed: 1,298 tests, TypeScript, ESLint and production build;
only the existing Edge Runtime deprecation/static-generation warnings remain.
Authenticated browser QA on port 3001 verified the pre-migration warning,
disabled Archive, ordinary draft editing and discard, with no save or content
mutation; no browser warnings/errors were observed. Follow-up after owner rollout
confirmed the archive loads and Archive becomes enabled. Actual archive/restore
was not exercised against the owner's live content. No remote SQL or media
operation was executed by the agent.

Resume: owner confirmed 0041 through 0045 + checks. 13E is implemented below;
deferred browser QA remains pending. Keep 13G as the final
audit gate. Apply only
the new forward migration; do not rerun older migrations over the newer registry.

#### 13D.2 — Music collections

- [x] Extend the private archive through forward migration 0042 for platforms
      and SoundCloud; release active capacity (32/48), restore hidden, retain
      original data/order and protect archived media references.
- [x] Integrate with the 1:1 Music inspector and preserve sibling drafts plus
      Spotify/SoundCloud's shared presentation version. Keep incomplete legacy
      records archivable without weakening ordinary save validation.
- [x] Verify isolated SQL, server/parser/UI boundaries and production build.
- [x] Owner applies `supabase/migrations/0042_content_archive_music.sql`, then
      `supabase/checks/0042_content_archive_music.sql` (all nine checks true,
      confirmed by screenshot). Reload Music V2; do not rerun older migrations.

Implementation: Archive is part of each saved Platform / SoundCloud card in the
existing inspector. Explicit confirmation immediately removes that item from
public Music; restoration returns the original data/order as hidden. Unsaved
cards still use local Discard. Archives page by 20 and show active capacity.
Missing 0042 disables only lifecycle controls, not existing Music editing.

Whole-collection and archive-row CAS, source-ID recreation guards and monotonic
restore versions follow the Navbar pilot. SoundCloud also locks and checks its
shared Music presentation version without changing its heading or timestamp.
Canonical results update only the affected section, keeping other drafts. Legacy
readable cards without images/icons remain recoverable; normal saving remains
strict. Unconfirmed outcomes block writes and expose guarded reload on desktop
and inside the mobile modal. Normal saving still works during read-only paging.
Media usage retains archived file references and now offers both Navbar and
Music destinations without falsely guessing which collection owns a reference.
Server success confirmation was strengthened in both Music and Navbar to reject
results that silently lose or inject unrelated active IDs.

Verification: isolated PostgreSQL/PGlite covers deploy/rerun preservation,
both capacity limits, CAS/ABA, hidden restore, intentionally empty collections,
shared presentation conflicts, stale Classic upserts, archived media replacement,
permission boundaries, paging and atomic rollback in both directions. Navbar
0041 operations and all seven earlier checks still pass; 0042 has nine passing
checks. Full regression: 1,455 tests, TypeScript, ESLint and production build.
Only existing Edge Runtime warnings remain. Browser QA verified both pre-rollout
archive states, ordinary edits and independent Hero/SoundCloud draft discard;
the 390px mobile inspector and scrollable archive fit correctly. No browser
warnings/errors observed. No public content was changed, no storage object was
deleted and no remote migration was run. Live archive/restore after owner rollout
remains a later fixture-based check, not an unreported production experiment.

Next: 13D.3 is implemented below; owner confirmed 0043 rollout and checks.

#### 13D.3 — Bio collections

- [x] Add recoverable portraits, paragraphs and credit cards with their existing
      coupled biography/CAS boundaries intact.
- [x] Preserve legacy readable portraits, all sibling drafts, media references,
      collection capacity (32/50/100), original order and hidden restoration.
- [x] Verify 0043 isolated SQL, boundary/UI tests, build and pre-rollout browser
      state without changing the owner's content.
- [x] Owner applies `supabase/migrations/0043_content_archive_bio.sql`, then
      `supabase/checks/0043_content_archive_bio.sql` (all nine results true,
      confirmed by screenshot). Reload Bio V2; do not rerun older migrations.

Implementation: saved portraits, paragraphs and credits now have explicit
Archive confirmation directly in the 1:1 inspector and their own paginated
archives. Archive removes the public item and frees its active slot; restore
preserves the original row/order but always returns it hidden. No media file is
deleted. New unsaved cards still use local Discard. Missing 0043 disables only
archive controls; existing Bio editing remains available.

Biography always checks its complete save boundary: profile version, portrait
versions and paragraph versions. A lifecycle action never edits profile copy or
its timestamp. Canonical results update the whole confirmed Biography while
preserving Hero/Resume/Credits drafts; Credits remains independent. Legacy safe
HTTPS portraits remain recoverable without weakening normal managed-media save
validation. Unknown outcomes lock further writes and expose guarded reload,
including inside the mobile inspector. Read-only archive paging does not block
ordinary saving. Media's archived-reference destinations now include Bio.

Verification: isolated PostgreSQL/PGlite passed deployment/rerun preservation,
all three capacity limits, original-row hidden restore/order, CAS/ABA, coupled
profile/sibling conflicts, ID-recreation guards, same-ID cross-collection safety,
private paging/roles, archived portrait/credit media replacement, stale ordinary
saves and atomic rollback. All nine 0043 checks and previous 0041/0042 checks
pass in the isolated database. Full regression: 1,675 tests, TypeScript, ESLint
and production build; only the existing Edge Runtime warnings remain. New
regressions also prevent malformed version-map validation from throwing in the
Navbar and Music archive parsers.

Authenticated browser QA on port 3001 verified migration-gated portrait,
paragraph and credit controls; independent Biography/Hero draft preservation
and discard; and the 390px mobile Credits inspector/archive. No browser
warnings/errors were observed. Test drafts were discarded; no content was saved
or archived, no storage file was deleted and no remote SQL was executed. Live
archive/restore on disposable fixtures remains part of the final 13G audit.

Next: 13D.4 is implemented below and owner confirmed 0044. Classic stays in
place until the final parity/production audit gate is complete.

#### 13D.4 — Gallery and Showreel

- [x] Preserve Gallery HOME-story exclusions and Showreel historical capacity.
- [x] Fix intentional-empty Showreel fallback before removing its last saved row;
      no demo content should reappear merely because a collection is archived.
- [x] Recheck archive/media replacement, restore and all collection limits in
      isolated SQL and regression tests. File Trash and provider optimization
      stay separate; live fixture verification remains a 13G gate.
- [x] Owner applies `supabase/migrations/0044_content_archive_gallery_showreel.sql`,
      then `supabase/checks/0044_content_archive_gallery_showreel.sql` (all ten
      results true, confirmed by two owner screenshots). Reload Gallery/Showreel
      V2 before live use.
- [ ] Authenticated desktop/mobile browser QA: retry when the in-app browser
      attaches again; this turn's two background-tab attempts timed out before
      any page UI could be inspected. Include disposable-fixture lifecycle
      writes at the final 13G gate, not experiments on the owner's real content.

Implementation: both 1:1 inspectors now provide explicit Archive confirmation,
20-item archive pages and hidden restore with original row data/order. Gallery
only handles non-HOME-story rows and cannot steal or recreate an archived ID.
Showreel keeps all video types and historical identifiers. A private persisted
high-water mark retains restoration capacity for catalogs already above 120;
normal new-card limits are unchanged. An existing competing featured marker
refuses restoration without modifying the archive, rather than silently losing
historical data. Archived files remain protected in Media usage/replacement;
the placement helper links to Gallery and Showreel as additional destinations.

Canonical responses must exactly match the affected collection membership and
versions. Sibling Hero/Introduction drafts survive; dirty Frames/Videos must be
saved/discarded first. Synchronous save/archive locks cover same-frame races,
unknown outcomes require guarded reload (also inside the mobile modal), and
read-only paging does not consume ordinary Save. Legacy readable records use
read-snapshot validation without weakening normal media validation. The normal
Showreel version parser also preserves own historical `__proto__` IDs safely,
so recovered items remain editable; unversioned new IDs stay strict.

The successful-empty public video mapper no longer revives fallback reels after
the last saved item is hidden/archived. Visitor playback/scroll interactions
were not modified. No real content, files or remote migrations were changed.

Verification: all 1,949 tests across 123 files pass, including 72 archive UI
cases, 153 server/parser cases, 14 SQL contracts and 32 normal-save legacy-ID
regressions. TypeScript, ESLint and production build pass; only the existing
Edge Runtime deprecation/static-generation warnings remain. Isolated
PostgreSQL/PGlite verifies deploy/rerun preservation, all six predecessor
lifecycles/checks, exact full-row hidden restore/order/ABA, 123-item historical
catalog recovery and later growth, HOME exclusion/ownership rollback, featured
conflicts, safe legacy IDs, all capacity/CAS/private-role boundaries, archived
Media replacement and atomic rollback. All ten 0044 checks pass locally.
Browser layout/real interaction verification is explicitly deferred above.

Next: 0044 rollout/checks confirmed; 13E small useful Classic controls below. Keep the
deferred browser verification visible, then complete 13F and the final 13G audit
before removing Classic.

### 13E — Small useful Classic controls

- [x] Restore BIO paragraph animation delay under Advanced, preserving defaults.
- [x] Add the real received-inquiries weekly count/trend to Inbox, independently
      of visitor analytics consent; show honest missing-data states.
- [x] Resolve Appearance/Contact validation disagreement for shared optional copy.
- [x] Owner applies only `supabase/migrations/0045_contact_optional_copy.sql`,
      then `supabase/checks/0045_contact_optional_copy.sql` (all six results true,
      confirmed by owner screenshot).
      Reload Contact V2. No earlier migration needs to be reapplied.
- [ ] Authenticated desktop/mobile browser verification. The in-app browser
      again failed to attach before any UI could be inspected this turn; do not
      treat automated component tests as completed live browser QA.

Implementation: each BIO paragraph has a collapsed Advanced animation delay
control (whole milliseconds, 0–5000). Existing defaults and saved values remain
unchanged. Valid edits update the 1:1 preview; invalid/empty drafts block Biography
saving and coupled archive actions without coercing the value to zero. The
preview temporarily retains saved timing while the actual draft remains invalid.

Inbox now shows received messages over the last seven 24-hour periods compared
with the preceding seven. Both head-only exact counts use one fixed UTC snapshot
and half-open intervals; include every retained status, exclude deleted records,
and are independent of the page filter and analytics consent. Null, malformed,
failed or timed-out counts are unavailable, not zero. A weekly-statistics failure
does not disable message triage; the Classic metric also honors this availability.

Contact and Appearance now agree that location and introduction are optional.
Explicitly cleared values hide their rows in public Contact/footer and previews;
the actual contact form and footer buttons remain available. Forward-only 0045
relaxes just the two minimum lengths while preserving strict payloads, maxima,
private service-role access and shared site-settings CAS. It never rewrites
existing content. A private, read-only capability gates empty saves, freshly
checked server-side; missing/unverified 0045 does not block filled details or Hero.
Contact saves invalidate shared footer/Appearance views as well.

Verification: targeted BIO/Contact/Inbox regressions and isolated PostgreSQL
tests pass. The isolated database verifies all six 0045 checks, content-preserving
deploy/rerun, strict empty/max-length inputs, shared Appearance CAS in both
directions, unchanged Hero and permission boundaries. Full regression passed:
2,068 tests across 129 files, TypeScript, ESLint and production build. Only the
existing Edge Runtime deprecation/static-generation warnings remain. Read-only
peer review found no actionable regressions. Live browser QA remains deferred.
No remote SQL, owner-content writes, media changes or commit/push were performed.

0045 rollout/checks confirmed. Next: 13F cutover preparation, followed by the explicitly
announced final 13G parity/production audit. Classic remains until owner approval.

### 13F — Prepare the Classic cutover (retain rollback)

- [ ] Extract retained upload, security and Inbox actions from Classic route
      modules; inventory all V2 imports before removing any old route files.
- [ ] Prepare V2 login/MFA destinations and legacy route/hash redirects, including
      the old Insights inquiries anchor; remove Classic fallback links.
- [ ] Preserve auth/recovery/callback routes, authorization, shared layouts,
      noindex protections and shared tables. Do not delete data with screens.
- [ ] Do not restore obsolete actor/musician, raw IDs, unused featured/story
      controls or unrestricted iframe/media sources merely to match Classic.

### 13G — Final audit gate (announce to owner when 13A–13F are ready)

- [ ] Repeat Classic/V2 feature parity and public editability audit.
- [ ] Run full regression/build and authenticated desktop/mobile browser QA;
      verify saves/conflicts/uploads/replace/Trash/restore on disposable fixtures.
- [ ] Verify migrations/check scripts and list remaining production blockers;
      distinguish cutover readiness from ImageKit/email/analytics completion.
- [ ] Report findings to owner and fix blockers before proposing removal.

### 13H — Retire Classic only after audit and owner approval

- [ ] Make V2 the sole admin interface with working legacy redirects.
- [ ] Remove obsolete Classic UI without deleting shared services or content.
- [ ] Run post-cutover smoke/security checks and document the rollback path.
