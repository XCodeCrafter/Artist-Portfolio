# Home editorial sections

Implemented 2026-09-29. This replaces the public Home `stories` / “Artist freelancer life” block with Latest release, Selected work and Press & reviews. Shared Gallery components, original media and unrelated Home content are not deleted.

## Rollout order (important)

1. Deploy the new application code first. It can read the exact old five-section Home shape and shows the new admin as read-only until migration 0055 is present.
2. Run `supabase/migrations/0055_home_editorial_sections.sql` in the intended Supabase project, then `supabase/checks/0055_home_editorial_sections.sql`. All nine checks should return true.
3. Reload `/admin/v2/pages/home`. Set actual release details / audio and add real attributed press items. Save each edited section, then save **Sections & order** to publish visibility/order changes.
4. Verify a real save/reload on the deployed site. Local component fixtures and SQL tests do not prove hosted credentials, database availability or a particular external audio host.

Do not run migration 0055 before old code has been replaced: the old application's strict parser does not understand the expanded Home draft. Do not use `supabase db push` to replay owner-confirmed migrations. No hosted migration or GitHub push is performed merely by implementing these files.

Owner rollout update (2026-09-29): all nine 0055 checks were confirmed true by
screenshot. Do not reapply it for the subsequent CSS fix. Hosted save/reload
acceptance remains separate from those database checks.

## Admin use

- **Latest release:** heading, copy, background, cover, title/artist, note, primary/secondary links and one selected playback source. The player and outbound listening links are independent.
- **Selected work:** heading/background and four reorderable cards (Music, Photography, Film & acting, Live), with independent destination, photo, copy and monochrome/red treatment.
- **Press & reviews:** one collection, up to 20 reviews/interviews/radio/features. Edit title, publication, excerpt, optional date/source/clipping, order, visibility and featured item. The public teaser uses one featured item and up to three clipping photos; the reader has arrows, keyboard controls, touch navigation and original-image zoom.
- **Interlude:** existing video/poster selectors, poster framing, heading, copy and button labels/destinations remain editable. The admin preview deliberately uses the poster; the public page plays the muted video. Poster framing does not crop the moving video.
- Every new photo uses the existing desktop/mobile positioning controls. Changing a source resets only that placement's crop. The Press reader deliberately ignores decorative collage cropping so the full original remains readable.
- Empty release and press sections are hidden by default. Release needs an actual release title; Press needs at least one visible item. There are no invented endorsements, publications or release announcements in seeded data.

Home configuration is publicly readable, including hidden sections/items. **Hidden is not private.** Never put confidential drafts into these fields. This matches the existing Home visibility contract; it is not the private-draft Events model.

## Home visual integration

The owner-approved follow-up unifies existing and new Home sections through
`styles/home.css`: 1400px wrappers including common gutters (20px mobile /32px
desktop), 56/80/96px section padding, shared neutral dark colors, readable body
text and white serif headings. Hero content/styling is unchanged. About keeps
its exact authored text; its decorative shards, framing border radius and
typography are quieter. The interlude now has a single gutter, and Home's footer
uses a neutral background, restrained effects and matching controls.

Shared components only gain styling hooks. Overrides are scoped to
`.home-sections` (public and admin Home preview) and `.home-page > footer`, so
other public pages and the general Appearance editor retain their styles.
Reduced motion remains respected. No extra migration is required by this pass.

Saved section order and visibility are not overwritten. The full-page isolated
preview demonstrates the suggested Hero → Release → About → Selected work →
Interlude → Press → Footer order, with CNC hidden for that demonstration only.
Apply any desired real ordering through Home's existing Sections & order editor.
The preview uses local fallback content/photos/fonts plus explicitly synthetic
release/press records, not a live Supabase copy. No About text was edited in the
application defaults or database.

The owner-requested media follow-up uses the illustrative microphone photo
(`press.webp`) as the new Latest release default background and restores the
original guitarist video (`/media/hero-loop.mp4`, poster `/images/video-hero.jpg`)
in the isolated Interlude preview. The existing live Interlude already uses
that video; migration 0055 preserves its authored settings and does not replace
an existing custom release background on rerun.

## Playback

Direct `.mp3`, `.m4a`, `.ogg` and `.wav` sources may use local paths or safe HTTPS URLs. The browser requests audio only after Play; it offers play/pause, seek and elapsed/duration indicators. The waveform is decorative, not an audio analysis. A URL must serve playable media, not an HTML download/login page. Expiring links, hotlink restrictions, browser codec support and host availability can still prevent playback; errors offer a listening-link fallback.

Spotify track/album/playlist and YouTube video links are converted to known embed origins. No supplied HTML/iframe code is accepted. Provider players open only after a deliberate action and use the existing external-media consent gate. Provider playback may require its own Play button and remains subject to platform/account restrictions. There is no page-entry autoplay or hidden YouTube audio extraction.

The CSP expansion is limited to `media-src https:` for admin-authored audio URLs. Script, image, connection and iframe origin restrictions are unchanged. Audio is never proxied or fetched by the server.

## Data / compatibility

- Seven layout IDs: `hero`, `about`, `cnc`, `feature`, `release`, `work`, `press`.
- Migration replaces the retired stories slot in place and preserves unrelated section order, visibility, text, media and existing crop data. Reruns preserve edits and do not unnecessarily invalidate the page version.
- Retired `draft.stories` is retained solely for recovery, media-reference protection and compatibility with the existing photo snapshot RPC. It is neither rendered nor editable. Old tabs cannot save it or restore a five-section layout.
- `save_home_editorial_section_v2` is service-only, exact-schema validated, media-reference protected and CAS-versioned. A trigger also validates direct writes. Existing hero/about/feature save wrappers remain intact.
- New crops are stored inline with their image in each section, atomically with content. Existing section sidecar crops remain unchanged. Full Media Library replacement/usage guards continue to scan the entire Home JSON.
- The stable navigation key `home.stories` now points to `/#home-work`; persisted navigation configuration does not need another migration.

## Illustrative assets

`public/images/home-editorial/{studio,guitar,press,live}.webp` are AI-generated illustrative photographs from the approved preview, not documentary images of the owner. Existing generated PNGs were copied/encoded to WebP (about 292 KB combined) without cropping or altering the originals. They are checked into the project so deployment never depends on a local Codex asset directory. Replace them through the admin when actual photographs are ready.

## Verification tools

### Production Interlude alignment fix

The optimized production CSS removed a `translate: none` reset while Tailwind's
legacy `-translate-x-1/2` utility remained active. Together with `left: auto`, this
shifted the whole Home panel (including text and controls) half its width left.
The unoptimized browser fixture did not expose the failure.

Home's dedicated feature panel now uses container width directly and never emits
the viewport-breakout positioning utilities. Legacy narrative layout retains its
existing centering. The fixture now compiles optimized CSS, with regression tests
for this pipeline and both public/admin-preview Home markup.

Verification: 5,453 tests / 195 files, typecheck, lint and production build pass.
Optimized browser QA at 390, 768, 1280 and 1850px confirms matching panel/parent
edges, full video coverage, no horizontal overflow, and no inner scroll on focus.
The overlay still aligns with the panel's inner border edges. No migration or
authored media/content change is needed.
The actual `next build` / `next start` output was also checked at 390, 1280 and
1850px: no translation, matching parent edges, aligned shade, and no horizontal
overflow. This is independent of the isolated component fixture.

### Additional hardening after the initial push

- Home saves reject duplicate/missing/non-text contract fields. RPC requests have
  a 10-second abort deadline; uncertain outcomes require reload and never retry
  the write. Server and editor reject a success with an unchanged CAS version,
  preserving full PostgreSQL microsecond strings and unrelated unsaved sections.
- A confirmed database write keeps its canonical state even if subsequent audit
  or cache work fails. Audit confirmation waits at most two seconds, every cache
  path is attempted independently, and visible/screen-reader messages accurately
  distinguish saved data from an unconfirmed cache refresh.
- Explicit HTTPS spellings match SQL validation. Encoded YouTube video parameters
  are normalized once to the validated first ID without allowing a later duplicate
  to override an invalid first value.
- Direct audio has a 15-second loading watchdog, one active start attempt, stale
  promise fencing, and resource release on error/unmount. Retrying is explicit;
  no media request is started before visitor interaction.
- Press selection follows stable item IDs. Interior clicks and drags do not act
  as backdrop dismissal; modified arrow keys, scan controls and cancelled or
  multi-touch gestures are not interpreted as article navigation.

Verification: **5,449 tests / 195 files**, typecheck, lint, production build and
isolated PGlite checks passed. Actual-component browser QA confirmed native audio,
Press arrow navigation, interior/backdrop clicks, focus return and scroll unlock.
No new migration, hosted write or ImageKit activation was needed for this
hardening follow-up. Hosted rollout and real save verification remain separate.

### Initial pre-push audit

Final pre-push audit: **5,392 tests in 194 files passed**, plus typecheck,
ESLint, production build and isolated PGlite checks. All seven Home inspectors
were compared against their saved/public contracts. The actual isolated UI
confirmed editing/saving/reloading Release text and background, Selected work
text and a Press quotation, and confirmed read-only behavior without 0055.
Automatic Press selection's label now describes its preference for a visible
quotation. A pre-existing ImageKit 1ms boundary test now fixes both clocks;
no ImageKit runtime behavior or provider activation changed.

Final local verification after visual integration: **5,388 tests in 194 files passed**, plus typecheck,
ESLint and the production build. The build retains the existing Next.js Edge
Runtime deprecation warning. Isolated PGlite migration tests passed. Browser QA
used actual public/admin components at desktop widths and 390/320 px: local
audio playback, Press reader navigation/close/focus return, admin save/reload,
conflict draft preservation, image loading and the missing-migration read-only
state were checked. The full-page follow-up checked the navigation-to-footer
composition, common heading alignment at 1280/390px and no horizontal/text
overflow at 320px, including the Press reader. Hosted save/reload and real third-party playback are still
pending; synthetic fixture content is not deployed or seeded into Supabase.

The subsequent media-only adjustment passed 117 targeted Home/fixture tests
and the isolated migration suite. Browser checks confirmed the microphone image
loaded and the original 17-second muted Interlude video played, paused and
resumed without console errors.

Interlude's Home-only panel uses `overflow: clip`, not a scrollable hidden
overflow region. The oversized parallax layer otherwise lets control focus
scroll the panel internally and expose an unshaded strip. Desktop/mobile browser
QA after Play/Pause confirmed `scrollTop = 0` and both shade edges aligned with
the panel's inner border; 45 targeted rendering/integration tests passed.

- `npm test -- --maxWorkers=2`
- `npm run typecheck`, `npm run lint`, `npm run build`
- `node scripts/test-home-editorial-migration.mjs <path-to-installed-PGlite-dist/index.js>` — isolated PostgreSQL, no production credentials. Covers role ACLs, source guards, crop validation, CAS, safe reruns, old writer rejection and actual Media Library replace-and-trash.
- `node scripts/home-editorial-browser.mjs` — loopback-only actual-component QA at `http://127.0.0.1:3107/`. Full Home with navigation/footer, editorial-only view, real Home editor/preview iframe, in-memory canonical saves, conflict mode and eight seconds of silent local WAV. Expand the bottom-right QA controls to switch modes. Explicitly synthetic press/release data never reaches production.

ImageKit remains parked at its documented owner-key/account-verification checkpoint. This feature does not enable providers, apply approvals or require new ImageKit keys.
