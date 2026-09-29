# Optional Home section transitions

Owner scope confirmed 2026-09-29: dark joins only. No new mobile/desktop layout,
reordering, compact cards, truncated About text, resized sections or photo swaps.
Earlier compact previews lived outside the repository. The worktree was clean
before this implementation; nothing was restored from GitHub.

## Owner control

**Admin → Settings → Appearance → Home transitions → Dark section transitions.**

- Default **OFF**. Toggling updates a local sample preview; **Save Home transitions**
  publishes the boolean. Discard restores the previously saved value.
- Public Home and the Home editor preview read the same saved flag. Reload an
  already-open Home preview after saving from Appearance.
- The new field is independent of fonts, profile, footer, Home layout and media.
- Missing migration 0057 makes only this subsection unavailable. Existing
  appearance controls continue to work. Invalid saved data fails read-only.
- Authentication/MFA, same-origin checks, optimistic version checks and save
  recovery are inherited from the existing Appearance editor. A lost or
  unconfirmed response requires reloading; never blindly retry an uncertain save.

## Rendering boundary

`styles/home-transitions.css` applies only under an explicit Home ON marker.
It masks the edges of designated decorative backgrounds and makes joining
borders transparent while retaining their widths. The stylesheet does not alter
height, width, margin, padding, order, opacity, filters or motion.

Text, buttons, portrait/card framing and About's glass parallax stay outside the
masks. The Interlude mask belongs to a fixed, bounded background wrapper; the
existing video overscan moves inside it. Legacy Gallery rendering is unchanged.
Browsers without CSS mask support retain the existing presentation. No extra
scroll listener, runtime animation, image dependency or external service is added.

## Migration / rollout

1. Review the local preview; deploy only with the owner's approval.
2. Apply `supabase/migrations/0057_home_section_transitions.sql` once in the target
   database, then run `supabase/checks/0057_home_section_transitions.sql`.
   All four checks must return `true`. The additive boolean defaults to false;
   rerunning preserves existing values, versions, RLS and triggers.
3. Reload Appearance, optionally enable and save. Verify the saved value after a
   reload and check public Home. OFF immediately restores the original edge style.

On 2026-09-29 the owner confirmed migration **0057** with all four matching checks
true by screenshot and authorized the GitHub push. The agent did not run hosted
SQL; do not replay the migration. Deployment and an authenticated hosted
save/reload still need verification. ImageKit credentials are not needed.

## Local verification

- `npm run check`: 204 test files / 5,620 tests, TypeScript, ESLint and production
  build pass.
- `scripts/test-home-section-transitions-migration.mjs`: isolated PostgreSQL/PGlite
  checks default/type/NOT NULL, role access, version advancement, stale CAS,
  ON/OFF, safe reruns and unchanged unrelated settings/layout/guards.
- Actual-component isolated fixture: `node scripts/home-editorial-browser.mjs`
  at `http://127.0.0.1:3107/`. Open **Isolated preview · QA controls** and toggle
  **Dark section transitions**. It uses the project's components and optimized
  CSS with synthetic content/local images; no database or external writes. Its
  pre-existing demonstration order is not the owner's saved Home order.
- Browser checks at 320/390/1280px: ON and OFF have identical section rectangles,
  no horizontal overflow; Interlude border becomes transparent and the video
  mask remains inside panel borders. About and foreground text remain unmasked.
- Admin component tests cover ON/OFF, canonical save/discard, missing migration,
  conflicts and uncertain-response recovery. Hosted persistence is not claimed.
