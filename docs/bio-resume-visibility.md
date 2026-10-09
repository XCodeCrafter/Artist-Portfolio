# Bio Resume & Credits visibility

The Bio editor has a separate visibility section for the whole lower Resume & Credits block. Turning it off preserves the stored resume, all credit rows and their publication flags. Biography and its images remain visible. Turning it on restores the existing content.

The setting is `site_settings.bio_resume_credits_enabled`. It is deliberately separate from the existing Bio snapshot/save RPCs. The admin loads a strict boolean plus `site_settings.updated_at`; only a successful, valid read enables the new control. If the column is absent or its read fails, the preview keeps the compatible visible default and the visibility control is unavailable. Existing Bio sections can still be edited. Refresh and check migration status before attempting to change visibility.

Visibility saves authenticate the admin, verify request origin, validate a strict boolean and use `site_settings.updated_at` as a compare-and-swap guard. A concurrent appearance/navigation/settings update can therefore cause a conflict: reload the saved data before retrying. The action only updates this one flag, requires a confirmed returned value and new timestamp, then invalidates public layout/navigation and the affected admin views.

## Database rollout

Migration `supabase/migrations/0059_bio_resume_visibility.sql` and its matching read-only check are prepared for manual rollout. Preparing these files does not apply them to any hosted database.

On the first addition of the column, existing `portfolio_type = 'musician'` rows start with the block hidden, and actor rows remain visible. Later inserted rows default to visible. The musician initialization advances the existing settings version through its current timestamp trigger; no resume or credits are modified. The migration leaves grants and RLS policies unchanged. Reapplying it preserves saved owner choices and timestamps.

After applying the migration, run `supabase/checks/0059_bio_resume_visibility.sql`; all four rows must report `passed = true`. A pre-existing malformed column is not silently repaired or overwritten: the checks expose that mismatch.

## Local verification

Backend regression coverage is in `tests/bio-visibility-actions.test.ts`, alongside the existing `tests/bio-actions.test.ts`. It covers separately loaded settings, unavailable/invalid data without disabling the old editor, authentication/origin checks, exact one-field writes, stale-save conflicts and uncertain responses.

The disposable migration harness accepts an already available PGlite runtime:

```sh
node scripts/test-bio-resume-visibility-migration.mjs /path/to/@electric-sql/pglite/dist/index.js
```

It creates fresh in-memory databases for musician and actor scenarios, checks content preservation, RLS and grants, stale-save protection, both toggle values, reruns, new-row defaults and the SQL verification checks. It does not read credentials or connect to a hosted database.
