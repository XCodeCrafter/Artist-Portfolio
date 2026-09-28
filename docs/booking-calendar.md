# Live & Contact — public-events calendar

The Events editor lives at `/admin/v2/pages/events`, linked from the V2 sidebar,
dashboard finder, overview and Live & Contact page editor. It edits the same
calendar component shown above the existing inquiry form at `/booking#events`.
Live & Contact is the renamed Contact destination, not a second public page.
The `/booking` address, `/api/booking`, database keys and analytics identifiers
remain unchanged, so saved links and historical statistics continue to work.
When the calendar is enabled, **Live dates** and **Get in touch** shortcuts below
the Hero link to `#events` and `#form`. When hidden, no dead calendar link remains.

## Rollout and owner workflow

1. Calendar migration `0053_booking_calendar.sql` is owner-confirmed on
   2026-09-27: all eight checks were `true`. Do not replay it on that project.
   Rename migration `0054_live_contact_page_copy.sql` is also owner-confirmed
   on 2026-09-28 by screenshot of all five matching checks `true`.
   Do not replay 0053 or 0054 on that project. The latter only
   replaces known stock Contact/Booking(s) hero titles. Custom/blank titles,
   subtitles, buttons, images, framing and all calendar content stay untouched.
   It is a data-only update: no new table, privilege or activation flag.
   New deployments must first install the existing migrations in order.
2. Deploy the code rename, then reload Admin V2 and open **Events**. No sample
   announcements are created. Applying SQL alone does not deploy application labels.
3. **Add event**, fill the title, local date/time, IANA timezone (for example
   `Europe/Prague`), city, venue and event type. Description and an HTTPS ticket
   link are optional. Dates/times describe the venue, not the visitor's browser.
4. Save as an unpublished draft, or switch on **Publish this event**. The global
   **Show calendar on Live & Contact** setting must also be on for public visibility.
5. Save the calendar. Select any event in the preview to edit it. Sold-out and
   cancelled events remain visible when published, but do not offer ticket links.

Edit the Hero and contact details in **V2 → Live & Contact**; edit public events
in **V2 → Events**. The two editors link to each other and use the same public
page. Hero text remains owner-editable; the code does not override custom copy.

The calendar lists public announcements, not bookable time slots. Empty dates
are never labelled as available. Multiple events on one day are supported.
The public view adapts to a list on narrow screens, with an explicit Calendar /
List switch. The decorative event poster uses text; this batch adds no image
upload or media-reference dependencies.

## Safety and storage

- Additive private `booking_calendar` singleton, RLS enabled, no direct access
  for anonymous/authenticated/service-role API clients. Service-only snapshot and
  atomic save RPCs; the public RPC exposes only enabled, published fields.
- One versioned full-calendar save (maximum 250 events). The saved timestamp is
  compared under a row lock and strictly advances. A stale editor cannot
  overwrite a newer save. Conflicts and ambiguous responses retain the local
  draft and require an explicit reload.
- Shared and database validation bound dates, times, text, count, unique IDs,
  statuses, HTTPS links and serialized payload size. Plain text is rendered as
  text, not HTML. Draft publication is independent of cancelled/sold-out state.
- Admin actions authenticate and verify request origin before database writes,
  log only counts/visibility and invalidate affected page caches.
- Missing migration or unconfirmed reads disable editing. The public section
  is omitted on unavailable storage; the original inquiry form remains intact.
- Removal requires confirmation in the editor and is committed only on Save.
  Prefer unpublishing to retain a record. There is no event archive in this batch.
- Nothing here activates ImageKit, changes private inquiries, sends email,
  executes hosted migrations or deploys the site.

## Local verification

- `npm test` / `npm run typecheck` / `npm run lint` / `npm run build`.
- `node scripts/test-booking-calendar-migration.mjs <local-PGlite-dist/index.js>`:
  disposable SQL deployment, privacy, role permissions, validation, version
  conflict, deterministic ordering, disable/re-enable and rerun checks.
- `node scripts/booking-calendar-browser.mjs`: actual public/editor components
  on `127.0.0.1:3106`, with synthetic in-memory CAS actions only. No `.env` loading,
  auth bypass route, database, provider or network save endpoint. Reloading the
  browser resets the synthetic saved state; the fixture toolbar can remount the
  editor from its current in-memory save. This is UI verification, not evidence
  of a hosted save/reload.

Verified on 2026-09-27: final complete test run (`npm test -- --maxWorkers=2`)
passed all 5,305 tests across 187 files; typecheck, lint and production build
passed. The disposable SQL harness passed all eight migration checks, permission /
privacy checks, CAS conflicts and 29 invalid-draft cases. Browser QA used real
components at desktop and 390 px mobile sizes, covering draft creation, editing,
publication, removal, selected-event preservation after save, conflict recovery,
missing-migration gating, list/calendar switching and sold-out/cancelled states.
The mobile save bar was checked after compacting its layout. No hosted database
or real public event was changed. Hosted save/reload must be verified after the
owner applies migration 0053. That migration is now owner-confirmed; the hosted
save/reload check is still pending.

The Live & Contact rename was verified on 2026-09-28: 5,318 tests across 189
files, typecheck, lint and build passed; actual-component browser checks at
390 px and 1440 px verified the title, calendar/form layout and section links.
`node scripts/test-live-contact-copy-migration.mjs <local-PGlite-dist/index.js>`
verifies stock-title changes, preservation of custom/blank copy and other data,
stale-save rejection and rerun safety. All five 0054 checks passed locally.
The build logged a photo-framing read failure; follow-up read-only requests to
both public photo-framing and calendar RPCs returned HTTP 200. No hosted writes
were made and this does not replace the pending hosted editor save/reload check.

ImageKit remains parked at the checkpoint recorded in `TODO.md`: real server
keys/endpoint and owner account verification are needed before its next step.
