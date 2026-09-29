# Sharing & SEO

Implemented 2026-09-29. The Home search title and shared-link title/description
now have independent owner-controlled settings. They no longer come from a Home
campaign heading. Person identity in structured data uses the saved owner name.
Other public pages retain their page-specific titles, descriptions and URLs.

## Rollout

1. Deploy the application changes. Before migration 0056, public pages fall back
   to the owner name and existing site description; the new editor is read-only.
2. Apply `supabase/migrations/0056_site_sharing_metadata.sql` manually in the
   intended Supabase project. Then run `supabase/checks/0056_site_sharing_metadata.sql`;
   every check must return `true`.
3. Open **Admin V2 → Settings → Sharing & SEO** (`/admin/v2/settings/sharing`).
   Edit and save the title, description, and optionally a cover and its alt text.
4. Reload that editor and verify the saved values. Check the public page's
   `og:title`, `og:description`, `og:image` and Twitter metadata, then fetch the
   image without an admin session. Finally try a new share in the actual apps.

This feature does not need ImageKit keys. Do not replay earlier confirmed SQL
or use `supabase db push` to reconcile the owner's manually applied history.
No hosted migration, publish, Vercel change or GitHub push is implied by local
implementation/testing.

Owner rollout update (2026-09-29): migration **0056** was applied by the owner;
their screenshot confirms all ten matching checks `true`. Do not replay it.
Hosted editor save/reload and actual messaging-app previews remain separate
acceptance checks after deployment of the application changes.

The new singleton is seeded once. For the exact existing owner `Franky Fugazi`,
the proposed title is **Franky Fugazi | Cigar Box Blues**. A stock/blank site
description receives the new music introduction in the sharing override;
custom site descriptions remain untouched. Existing sharing values survive
migration reruns. Blank sharing fields use the owner name/site description.

## Covers and previews

- The automatic cover is a 1200 × 630 PNG using the existing backstage microphone
  photograph, dark styling, orange accents, and saved title/name. The JPEG asset
  is a re-encoding of the existing project photograph, not a new artist portrait.
- A custom cover is a **finished image**, not a background with an automatic text
  overlay. Choose an active, published JPG, PNG or WebP from Media Library.
  A 1200 × 630 composition with important content away from the edges is a good
  starting point. Apps control their final crop and whether to show a preview.
- The shared DOM component makes the generated cover preview match the actual
  image design. Descriptions appear in the link metadata below the image, not
  baked into the automatic cover. The admin preview is illustrative, not a
  live WhatsApp/Messenger screenshot.
- The generated image URL changes with its rendered title/name. The image
  endpoint has short CDN caching; it only reads a fixed bundled file and never
  fetches a URL supplied in the query or content. Custom covers are referenced
  directly, with no server-side remote fetch or false dimension declaration.
- Existing `/opengraph-image` and `/twitter-image` URLs remain available. They
  are ordinary route handlers so Next's file-convention image metadata cannot
  overwrite a selected custom image.

Already-sent messages and third-party caches can retain old previews. Saving
settings cannot rewrite those messages. When diagnosing stale previews, compare
the current public metadata first; test a newly composed message after the app
has fetched the link. Facebook's [Sharing Debugger](https://developers.facebook.com/tools/debug/)
can inspect Meta's cached page. Do not promise it clears every messaging app.
WhatsApp also lets senders [disable link previews](https://faq.whatsapp.com/445453537819972/).

## Data and safety

`site_sharing_config` is a private singleton. Admin read/write RPCs are
service-only behind approved-admin/MFA/origin checks. A separate anonymous
read-only projection contains only public title, description, image source and
alt text; no versions or internal rows. These fields publish on save and must
never contain secrets or confidential drafts.

Strict bounded schemas, optimistic concurrency, pending/duplicate save guards,
and ambiguous-outcome recovery protect against stale tabs and uncertain network
responses. Failed audit/cache follow-ups do not misreport a confirmed save as
failed. Missing migration/data prevents admin writes.

The new source participates in the central media reference registry. Usage,
trash protection and atomic replacement include the sharing cover. A source
must bind to a currently published, undeleted image; the public reader removes
the cover if it later becomes unpublished. Unrelated Home, Calendar, media
provider settings and existing content are not rewritten.

Technical references: [Next metadata](https://nextjs.org/docs/app/api-reference/functions/generate-metadata),
[generated social images](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image),
and [Open Graph](https://ogp.me/).

## Local verification

Verified locally: 5,572 tests across 202 files; typecheck, lint, production build
and all ten PGlite checks passed. The production image route returned a 1200 × 630
PNG with HTTP 200; both deployment file traces include the bundled photograph.
An HTML-only `facebookexternalhit` request received social metadata in the head.
Browser QA covered 1280/390/320px layouts, edited title/custom cover save and reload,
conflict/lost-response draft preservation, and the missing-migration lock.

Run the sharing Vitest suites, `npm run typecheck`, `npm run lint`, `npm run build`,
and `scripts/test-site-sharing-migration.mjs` with a local PGlite installation.
The isolated browser fixture is `scripts/site-sharing-browser.mjs`; it must not
read credentials, call Supabase, or write hosted settings. Production image and
crawler checks are separate from a real hosted save and actual app cache behavior.
