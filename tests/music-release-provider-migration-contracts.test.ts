import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../supabase/migrations/0063_music_release_provider.sql", import.meta.url), "utf8");
const checks = readFileSync(new URL("../supabase/checks/0063_music_release_provider.sql", import.meta.url), "utf8");
const runtime = readFileSync(new URL("../scripts/test-music-release-provider-migration.mjs", import.meta.url), "utf8");
const predecessor = readFileSync(new URL("../supabase/migrations/0028_music_page_editor.sql", import.meta.url), "utf8");
const body = (sql: string, functionName: string) => {
  const normalized = sql.replace(/\r\n/g, "\n");
  return normalized.slice(normalized.indexOf(`create or replace function public.${functionName}(`)).match(/as \$\$([\s\S]*?)\$\$;/)?.[1] ?? "";
};
const hash = (value: string) => createHash("md5").update(value).digest("hex");

describe("Music release provider SQL contract", () => {
  it("defaults to Spotify without changing legacy content or rewriting its save endpoint", () => {
    expect(migration).toContain("add column if not exists release_provider text not null default 'spotify'");
    expect(migration).toContain("add column if not exists soundcloud_playlist_url text not null default ''");
    expect(migration).not.toContain("create or replace function public.save_music_spotify_v2");
    expect(migration).not.toMatch(/\b(?:delete|truncate|drop table)\b/i);
    expect(migration).toContain(hash(body(predecessor, "save_music_spotify_v2")));
  });

  it("keeps the existing snapshot atomic and protects known function bodies on reruns", () => {
    const oldSnapshot = body(predecessor, "get_music_page_v2_snapshot");
    const newSnapshot = oldSnapshot.replace(
      "      'releasesHeading', presentation.releases_heading,",
      "      'releasesHeading', presentation.releases_heading,\n      'provider', presentation.release_provider,\n      'soundcloudPlaylistUrl', presentation.soundcloud_playlist_url,",
    );
    expect(migration).toContain(hash(oldSnapshot));
    expect(migration).toContain(hash(newSnapshot));
    expect(checks).toContain(hash(newSnapshot));
    const saveHash = hash(body(migration, "save_music_releases_v2"));
    expect(migration).toContain(saveHash);
    expect(checks).toContain(saveHash);
    expect(migration).toContain("music_releases_existing_save_contract_changed");
    expect(migration).toContain("music_releases_requires_known_snapshot");
  });

  it("accepts exactly the five release fields and validates dormant playlist URLs too", () => {
    expect(migration).toContain("array['releasesHeading','artistUrl','embedUrl','provider','soundcloudPlaylistUrl']");
    expect(migration).toContain("from pg_catalog.jsonb_object_keys(p_payload)) <> 5");
    expect(migration).toContain("pg_catalog.jsonb_typeof(field.value) is distinct from 'string'");
    expect(migration).toContain("^https://soundcloud[.]com/[A-Za-z0-9_-]+/sets/[A-Za-z0-9_-]+/?$");
    expect(migration).toContain("release_provider <> 'soundcloud' or soundcloud_playlist_url <> ''");
    expect(migration).toContain("'section', v_section");
    expect(migration).toContain("/embed/(artist|playlist|album|track|show|episode)/[A-Za-z0-9]+/?");
    expect(migration).toContain("field.value ~ '[[:space:][:cntrl:]\\\\]'");
  });

  it("rejects nullable, wrong-type or changed-default columns instead of adopting them", () => {
    expect(migration).toContain("music_releases_columns_contract_changed");
    expect(migration).toContain("column_info.atttypid = 'text'::regtype");
    expect(migration).toContain("column_info.attnotnull and not column_info.attisdropped");
    expect(migration).toContain("pg_catalog.pg_get_expr(column_default.adbin, column_default.adrelid)");
    expect(checks).toContain("music_releases_columns_contract_verified");
    expect(runtime).toContain('"drop not null", "drop default", "set default \'unapproved\'", "type varchar(2048)"');
  });

  it("shares legacy lock ordering and checks both row versions", () => {
    expect(migration).toContain("'music_page_v2:spotify:main'");
    const settingsLock = migration.indexOf("from public.site_settings settings where settings.id = p_site_id for update");
    const presentationLock = migration.indexOf("from public.music_presentation presentation where presentation.id = p_site_id for update");
    expect(settingsLock).toBeGreaterThan(0);
    expect(presentationLock).toBeGreaterThan(settingsLock);
    expect(migration).toContain("v_current_settings_version is distinct from p_expected_settings_updated_at");
    expect(migration).toContain("v_current_presentation_version is distinct from p_expected_presentation_updated_at");
    expect(migration).toContain("raise exception 'music_spotify_changed' using errcode = '40001'");
  });

  it("retains service-only writes, RLS and verified update triggers", () => {
    expect(migration).toContain("from public, anon, authenticated, service_role");
    expect(migration).toContain("grant execute on function public.save_music_releases_v2(text,timestamptz,timestamptz,jsonb) to service_role");
    expect(migration).toContain("tgfoid = pg_catalog.to_regprocedure('public.set_updated_at()')");
    expect(migration).toContain("and relrowsecurity");
    expect(migration).not.toMatch(/disable row level security|disable trigger|grant .* to anon/);
    expect(migration.trimEnd()).toMatch(/commit;$/);
  });

  it("ships real isolated SQL coverage and read-only rollout checks", () => {
    expect(checks.match(/select 'music_releases_/g)).toHaveLength(10);
    expect(checks).not.toMatch(/^\s*(?:insert|update|delete|alter|create|drop|grant|revoke|truncate)\b/im);
    for (const marker of [
      "new PGlite()", "40001", "42501", "23514", "23502", "55000", "22023",
      "get_photo_editor_with_framing_v2", "legacyPayload", "invalidUrls", "beforeRerun", "begin read only",
    ]) expect(runtime).toContain(marker);
    expect(runtime).not.toContain("process.env");
  });
});
