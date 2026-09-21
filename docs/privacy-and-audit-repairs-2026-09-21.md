# Privacy controls and audit repairs — 2026-09-21

Local implementation following explicit owner approval to fix the audit. This
does not apply remote SQL, publish content, delete media, change accounts or
configure providers. The earlier audit remains a record of the pre-fix state.

## Consent contract

- First render and hydration deny both optional categories. A versioned,
  host-only, SameSite=Lax preference cookie stores two booleans and a timestamp,
  not a visitor ID. HTTPS adds Secure. Validity is 180 days; malformed, duplicate,
  future, expired or inaccessible cookies fail closed.
- Equally styled accept/reject buttons are available on the first layer and
  detailed layer. Checkbox choices are staged until Save. Closing/Escape does
  not imply consent. Persistent Privacy choices and the footer reopen settings.
- The Read more panel uses code-native vinyl artwork, portfolio fonts, warm
  black/cream/vermilion styling and native modal focus/inert behavior. No external
  image or CMP script is required. Reduced motion is respected.
- BroadcastChannel, focus/pageshow and bounded expiry checks synchronize tabs.
  The collector additionally checks the actual cookie before every event.
  Storage failure keeps optional processing off and displays a warning.
- Analytics is opt-in at both collection and API boundaries. Refusals cause no
  event parsing, session generation, rate-limit DB write or analytics security
  audit. Essential booking processing is separate. See the analytics handoff
  document for reporting semantics and remaining limits.
- External-player consent controls Spotify, SoundCloud and Showreel's external
  YouTube/Vimeo iframes, including hover embeds. Hosted/native videos retain their
  previous preview/playback interaction and do not require optional consent.
  Withdrawing external consent unmounts players. Another domain's existing
  cookies cannot be erased by our JavaScript; the UI explains this limitation.
- Basic hosting/media delivery and Google Fonts still involve network requests.
  The notice explicitly discloses this instead of promising no third parties.

## V2 corrections

- Shared save recovery preserves draft and CAS on exceptions, unrecognized
  results and invalid canonical snapshots. Conflict/ambiguous outcomes lock
  retries until explicit reload. Required-field failures remain editable.
- HOME cannot claim a successful save if its canonical parse failed.
- In-app discard confirmation replaces window.confirm for app-controlled
  navigation; beforeunload remains native. Cancellation retains draft, confirmation
  runs the caller only after safe history compaction. Navbar forms discard only
  their own changes.
- Media metadata compares current values with the selected baseline; typing the
  original value restores clean state. Its desktop inspector has a viewport-
  limited independent scroll; mobile keeps document flow.
- Overview checks Appearance/footer and Media and avoids an absolute everything-
  ready promise. Settings clearly routes profile/footer and owner-name editing.

## Observed browser checks

Against localhost:3001, authenticated admin and public pages; no live saves,
uploads, Contact submissions or media mutations were performed.

- Music initially contained zero iframe elements.
- Reject optional persisted across reload; still zero iframe elements.
- Enabling only External players mounted Spotify and SoundCloud; reopening the
  dialog showed analytics OFF and external players ON.
- Reject optional then removed both iframe elements immediately.
- Read more visually checked at desktop and actual 390 x 844 viewport. Footer
  actions remain fixed within the modal while long text scrolls. Viewport reset.
- Escape closes the privacy modal and restores focus to Privacy settings.
- Full privacy notice link opens the expected public document.
- Media Profile file: local label edit enabled Save; restoring Profile disabled
  Save. The selected used-file inspector scrolls, and the removal control was
  keyboard-reachable at y=915–959 within a 1000px-high viewport. No removal clicked.
- Attempted navigation with a local Media draft showed the in-app dialog. Keep
  editing retained the exact draft; a later Discard changes navigated to Settings
  without publishing the draft.
- Settings displays explicit profile/footer and owner-name destinations.
- Insights displays stored-data-readable/no-corrected-events honestly, with an
  explanation that legacy rows are excluded, not deleted. Old data was not used
  to invent corrected historic measurements.

## Before calling this legally/operationally production-ready

Final local verification: `npm run check` passed **997 tests in 97 files**,
TypeScript, repository-wide ESLint and the production build. `git diff --check`
also passed. Build retains the pre-existing Next.js Edge Runtime deprecation
warning; this batch did not change that runtime. Cookie/collector fault tests
use controlled mocks and are not a claim of deployed end-to-end ingestion.

This is a technical implementation, not a jurisdiction-specific legal opinion.
The owner must verify controller identity/contact details, actual provider
agreements/regions/transfers, retention operation and data-rights procedures.
Google Fonts remains remotely hosted; local font serving is a possible future
privacy hardening step. Withdrawal stops new collection but does not itself erase
past server events or third-party cookies; retention and deletion handling remain
owner obligations. The full-year analytics/aggregation roadmap is not completed
by this repair. Real production ingestion and destructive lifecycle acceptance
need controlled disposable fixtures and monitored delivery.

Design references (not a compliance certification):

- [EDPB Cookie Banner Taskforce report](https://www.edpb.europa.eu/system/files/2023-01/edpb_20230118_report_cookie_banner_taskforce_en.pdf)
- [ICO: managing consent in practice](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/how-do-we-manage-consent-in-practice/)
