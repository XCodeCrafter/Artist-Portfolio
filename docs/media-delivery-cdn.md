# Media delivery through the ImageKit CDN

Status: implemented behind `MEDIA_DELIVERY_CDN=imagekit` (off by default).

## Why

Visitors and local development downloaded photos and videos straight from
Supabase Storage, which used most of the Free plan's 5 GB cached egress
(4.09 GB by 3 Nov 2026, mostly on development/testing days). Delivery now goes
through ImageKit (20 GB/month on its free plan) while Supabase stays the only
storage. This is **not** the ImageKit upload migration (7A); nothing is moved.

## How it works

- ImageKit account has a **Web Folder** origin with base URL
  `https://<project-ref>.supabase.co` (domain only, no path). It is the first
  origin, so the default URL endpoint serves it automatically.
- `lib/media-delivery.ts` rewrites public Supabase media URLs
  (`/storage/v1/object/public/...` with an image or video extension and no query)
  to `NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT + same path + ?tr=orig-true`.
- `tr=orig-true` serves the original bytes. Without it ImageKit re-encodes video
  (WebM, quality 50, consuming video processing units) and recompresses images
  that `next/image` then compresses again. Verified on 3 Nov 2026: an 1,129,173 B
  MP4 came back byte-identical with range support; without the flag it became a
  606 KB WebM after ~8 s of processing.
- Only render data of public pages is mapped (`withMediaDelivery(...)` in
  `app/page.tsx`, `bio`, `gallery`, `music`, `video`, `press`, `booking` and the
  footer in `app/layout.tsx`). Stored values, admin editors, metadata, JSON-LD,
  the OG image route and site-sharing validation keep canonical Supabase URLs,
  because they validate sources with `isConfiguredMediaLibrarySource`.
- `next.config.ts` adds one `next/image` remote pattern for
  `/<id>/storage/v1/object/public/**` with exactly `?tr=orig-true`, only when
  delivery is enabled. The CSP already allows the ImageKit origin for `img-src`
  and `media-src` whenever `NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT` is set.

## Turning it on / off

Production env (both needed at build time, then redeploy):

- `NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/<id>`
- `MEDIA_DELIVERY_CDN=imagekit`

To roll back, clear `MEDIA_DELIVERY_CDN` and redeploy; every URL falls back to
Supabase. No data changes either way.

## Known limits

- The admin still loads originals from Supabase (previews, media library).
- If ImageKit's free bandwidth runs out, its delivery stops until the next
  calendar month: switch `MEDIA_DELIVERY_CDN` off and redeploy.
- Replacing a file under the same path needs an ImageKit cache purge
  (uploads normally get new UUID file names, so this rarely matters).
