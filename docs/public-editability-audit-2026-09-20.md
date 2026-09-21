# Public portfolio → Admin V2 audit (2026-09-20)

Scope: all public routes, global header/footer, active Classic workflows, media
references and storage. Audit preceded implementation. No live data was modified.

| Surface | Existing V2 coverage | Confirmed gap before this batch |
| --- | --- | --- |
| Navbar | Owner name, page visibility/order, platform shortcuts | Fixed page names; hiding navigation does not unpublish a route |
| HOME | Five sections, visibility/order, text, images, videos, links | CNC program CRUD still Classic; four fixed story-image slots |
| Bio | Hero, biography, portraits, resume, credits | Some system headings fixed; collection layout is code-owned |
| Gallery | Hero, introduction, frames, captions, order/visibility | Upload/storage only Classic; saved cards hide rather than delete |
| Music | Hero, platform cards, Spotify, SoundCloud tracks | Fixed section order; saved items hide rather than delete |
| Showreel | Hero, introduction, videos, posters, order/visibility | Upload/storage only Classic; interactive playback intentionally preserved |
| Contact | Hero, collaboration copy, location, working inbox | Form labels fixed; delivery credentials/environment are not content controls |
| Footer / identity | Name, links, location, blurb, fonts, light effect | Tagline/site description Classic-only; footer headline/CTA copy hardcoded |
| Privacy / Terms | None | Legal text code-owned in both versions |
| SEO / design system | Shared name, font roles, footer effect | Page SEO templates, language, favicon, layouts and animations code-owned |

## Confirmed Classic-only workflows

1. Media uploads, library metadata, usage, trash and restore.
2. CNC programs: full source, controller, filename, preview lines, order, publish/delete.
3. Brand tagline and site description.

Security, access, sessions, audit, health, Insights and Inbox already have V2
counterparts. Dormant Home Updates and old musician/actor profile state are not
missing active workflows and should not be reintroduced.

## Functional defect

The public-copy/SEO heuristics replaced custom music-only or acting-only text
with generic mixed-career defaults. Saved non-empty owner copy must be respected.

## Implementation boundaries

- Add a native V2 Media workspace, not the old Gallery/Showreel studios inside V2.
- Used media: choose a compatible replacement, atomically replace references and
  move the old library item to recoverable Trash. Show affected sections first.
- Trash is **not physical storage deletion** and does not free billed bytes.
  Permanent provider cleanup requires a separate lifecycle/retention workflow.
- Database writes use approved-admin/MFA/origin checks, strict inputs, version
  checks, and service-only RPCs. Stale drafts must not undo reference replacements.
- Move CNC management into the HOME V2 workflow with the actual public preview.
- Extend Appearance with identity and actual-footer contextual editing.
- Keep Classic available for the rollback window. Do not apply migrations or
  publish/delete real content as part of automated verification.

## Explicit future scope (not “100% editable”)

Custom navigation labels/routes, legal copy editor, per-page SEO, editable form
system labels, variable HOME story collections and arbitrary section composition
are new product features, not Classic parity regressions. Provider cutover and
optimization remain ImageKit Batch 7A.2f; Gmail notifications remain Batch 7B.

## Implemented in this batch

- `/admin/v2/media`: native library with bounded signed batch uploads, filters,
  click-to-select file inspector, name/alt/note/availability, usage and recoverable
  Trash. Used files can be replaced everywhere and removed in one transaction.
  Availability is not privacy and does not remove existing public placements.
- Upload finalization is idempotent only for an exact verified existing asset.
  Ambiguous transfers/finalizations retain the original ticket; retries do not
  allocate and transfer a second object automatically.
- `/admin/v2/pages/home/programs`: actual public code renderer plus source,
  filename, dialect, preview lines, visibility, order and draft removal.
- Appearance now has Fonts & light, Profile & introduction, and Footer content.
  Footer regions are clickable in the real shared renderer. All non-empty custom
  identity/contact/SEO descriptions are respected instead of rewritten heuristically.
- An existing mobile Showreel overflow was found during browser QA: the featured
  288px minimum height and 16:7 aspect imposed 658px min-content width. Explicit
  grid tracks and mobile aspect sizing fix this without changing playback,
  preload, desktop aspect ratio or scroll interactions.

## Database / deployment

1. Verify previously required migrations, especially 0034–0037 (media pipeline
   and HOME); the separately pending security work is 0038.
2. Apply `0039_footer_content_editor.sql`; run its matching read-only check.
3. Apply `0040_media_library_v2.sql`; run its matching read-only check.
4. Check all results are `true`; refresh V2 before owner acceptance.

Do not blindly `db push` against unreconciled remote migration history. Neither
new migration uploads, replaces or deletes any existing media. Before 0039 only
new footer publishing is blocked; before 0040 usage/removal/restore fail closed.
CNC V2 reuses migration 0024 and needs no new schema.

Variant-linked files are deliberately protected until provider-aware retirement
can account for every alternate URL. This batch is not physical deletion, and it
does not offer “leave broken references” or used-file removal without replacement.
Internal storage IDs/numeric library order are not promoted into the simple UI;
actual Gallery/Showreel/page item order remains editable in the page inspectors.

## Verification

- Final full regression: **882 tests / 86 files**, TypeScript, ESLint and
  production build passed. Existing Edge Runtime deprecation warning remains.
- Isolated PostgreSQL (PGlite): 0039 defaults, validation, rerun preservation and
  read-only checks; 0040 all 15 reference areas, both asset versions, atomic
  rollback, stale writes, restore, queued pipeline and ready variants, rerun and
  service-only permissions passed. Real concurrent DB connections were not tested.
- Browser: all eight public routes loaded with no captured console errors.
  Desktop widths fit; HOME/Gallery/Contact and the repaired Showreel fit 390px.
  Mobile menu open/close and actual footer rendering checked.
- Authenticated V2 browser flow stopped at `/admin/login` on port 3001; no auth
  bypass or real upload/save/deletion was performed. Owner login + applied
  migrations are still needed for the final disposable-fixture acceptance test.
- Portfolio dev server uses 3001. Port 3000 and the other project were untouched.
