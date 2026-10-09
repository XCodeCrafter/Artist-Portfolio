# Press page

Press & Reviews is published at `/press` and edited at `/admin/v2/pages/press`.
Home no longer renders Press, exposes its editor tab, or offers it in section order.
The saved legacy layout entry is retained for compatibility.

The existing collection in `home_page_config.draft.press` remains the single source
of truth. No articles, images, ordering, featured choice, or visibility flags are
copied or reset. Press uses the existing editorial save RPC and shared Home row
version, so concurrent Home/Press saves fail with a conflict instead of overwriting
each other. Reload after a conflict before saving again.

The Press page shows the selected featured item and every visible item in saved
order. Unpublished items are excluded from the public client payload. Each article
opens the existing reader, including source links, clipping zoom, keyboard
navigation, and focus return. An empty collection shows an empty state.

The Press editor manages the introduction, background, featured item, and up to
20 articles together. It supports images, dates, types, source links, quotes,
publication visibility, ordering, local preview, save, and discard.

## Deployment

Apply and verify `0060_press_page_navigation.sql` with the matching application
release. It extends the navigation catalog and save validation, then inserts a
visible Press destination before the saved Contact destination when a rank is
available. Existing navigation choices and versions are preserved. Re-running
the migration preserves the owner's subsequent Press visibility and ordering.
Migration 0055 and the existing navigation migrations are prerequisites.

The preceding BIO visibility change separately requires migration 0059.
These migrations have not been applied to the hosted database during local work.

For local SQL validation, run `scripts/test-press-page-migration.mjs` using the
PGlite module option documented in that script. Application tests cover public
placement, article readers, navigation, preview framing, editor state, and saves.
