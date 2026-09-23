# Photo positioning — Batch 14B

## Using the editor

Open the photo's own section in Admin V2, expand **Photo position & zoom** beside
its media picker, then drag the preview or use its position sliders/arrow keys.
Zoom ranges from 100% to 300%. **Fit whole media** at 100% shows the complete
photo with black unused space; **Fill Photo** fills the frame and crops edges.
Desktop and mobile have separate settings. Reset either device or both.

Changes are local drafts until the section's existing **Save** button is used.
The main page preview uses the real public renderer. A Gallery preview-shape
selector models its changing mosaic slots; it does not change the actual layout.

The same file can have different crops in different places:

- HOME: About image, each of four Stories, Interlude video poster.
- BIO: each rotating portrait.
- Gallery: each frame (the opened lightbox keeps the full original).
- Music: each platform card cover.
- Showreel: each thumbnail/poster, without transforming video playback.

All six Hero editors retain their existing image/video framing. Externally
embedded Spotify/YouTube artwork belongs to its provider and is not an editable
photo placement. Media Library originals are never rewritten by positioning.

## Rollout

Hosted 0047–0051 are owner-confirmed. The owner supplied a screenshot showing all
**nine** checks in `supabase/checks/0051_photo_framing.sql` true. Do not reapply
0051 on that project. For another deployment still missing it, apply the forward
`supabase/migrations/0051_photo_framing.sql`, then require all nine checks true.
Refresh open V2 editors afterwards. Do not replay old migrations or use a bulk
`db push` against the unreconciled manual migration history.

Before 0051, new controls show setup-required and remain disabled; ordinary
section editing still works. A missing exact new editor RPC permits the previous
reader. Other read errors fail closed. Failed writes never retry with an older
RPC that could discard a crop.

The SQL migration also repairs a pre-existing valid-Showreel-save failure:
`pg_catalog.greatest(...)` was used as a function, but GREATEST is SQL syntax.
Only the exact original/already-repaired function body is accepted. If rollout
reports `photo_framing_requires_known_showreel_save_contract`, stop and inspect
that database definition; do not bypass the guard or reapply 0032.

No hosted SQL was run by the agent. After rollout, perform one save/reload/public
render and archive/restore acceptance test on disposable content, not a real
owner placement. That end-to-end hosted acceptance is still pending.

## Persistence and safety

`photo_framings` is a private sidecar keyed by placement and exact source hash.
It stores framing metadata, not image bytes or a media-ownership reference.
Changing the source through another editor makes an old crop inapplicable.
Archival retains metadata so restoring the same source/ID restores its crop.
Disabled/archived/source-mismatched photos do not appear in the public projection.

Service-only snapshot/save wrappers reuse the existing section validation,
collection locks, content versions, media guards and archive guards. Content and
crop updates commit together or roll back together. Legacy IDs and catalog sizes
remain supported. Post-archive responses adopt crops only when reloaded section
versions exactly match the successful mutation; an uncertain read asks for a
reload, never repeats the write.

The public reader exposes only current published sources and valid crops. The
application compares each returned source with its content snapshot again, so
two reads straddling a save cannot apply an old source's crop to a new image.

## Repeatable local verification

- Unit/UI/action/rendering contracts: `npm test`.
- TypeScript: `npm run typecheck`; lint: `npm run lint`; build: `npm run build`.
- Isolated PostgreSQL/WASM: `node scripts/test-photo-framing-migration.mjs
  <path-to-installed-@electric-sql/pglite/dist/index.js>`.
- Interactive synthetic browser fixture: `node scripts/photo-framing-browser.mjs`,
  then open `http://127.0.0.1:3104/`. Actual controls, Next/Image and project CSS;
  two independent placements share one bundled portrait. No database, credentials,
  environment files, external provider, uploads or save endpoint. Only explicit
  allowlisted resources are served on loopback. Reload resets the fixture.

The isolated SQL suite covers all seven section types, source replacement,
placement independence, four archive families, stale versions, rollback, media
guards, private permissions/RLS, legacy IDs/catalogs, idempotency and predecessor
checks. Lock ordering was reviewed; multi-session concurrency was not executed.

Browser checks covered the pre-migration gated controls and the isolated real
component fixture, including pointer drag, keyboard, zoom, resets, independent
devices/placements and the public responsive crop at 390px versus desktop.
No owner content was saved, no upload/provider was activated, and no deployment
was pushed. ImageKit account admission remains the next planned work item in TODO.

Final automated result: **4,612 tests across 169 files pass**, as do TypeScript,
full ESLint and the production build. Only existing Edge Runtime build warnings
remain. Client-only constants are imported from the pure types module, not the
server content barrel; AST regression tests protect that boundary.
