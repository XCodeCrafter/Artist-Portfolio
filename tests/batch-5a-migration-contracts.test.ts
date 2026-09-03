import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/0029_batch_5a_music_and_nav_links.sql",
    import.meta.url
  ),
  "utf8"
);

function migrationFunction(name: string) {
  const start = migration.indexOf(
    `create or replace function public.${name}`
  );
  const next = migration.indexOf(
    "create or replace function public.",
    start + 1
  );
  expect(start).toBeGreaterThanOrEqual(0);
  return migration.slice(start, next < 0 ? undefined : next);
}

describe("Batch 5A migration contract", () => {
  it("repairs only a missing Music hero and preserves existing content", () => {
    const bootstrap = migration.slice(
      migration.indexOf("insert into public.page_heroes"),
      migration.indexOf("create or replace function public.")
    );

    expect(bootstrap).toContain("'music'");
    expect(bootstrap).toContain("'/images/music-hero.jpg'");
    expect(bootstrap).toContain("on conflict (page_slug) do nothing");
    expect(bootstrap).not.toMatch(/on conflict[\s\S]*do update/i);
  });

  it("allows Music platform growth while refusing implicit deletion", () => {
    const sql = migrationFunction("save_music_platforms_v2");

    expect(sql).toContain("v_platform_count > 32");
    expect(sql).toContain("'iconKey'");
    expect(sql).toContain("icon_key = excluded.icon_key");
    expect(sql).toContain("insert into public.music_platform_links");
    expect(sql).toContain("on conflict (id) do update");
    expect(sql).toContain(
      "submitted.item ->> 'id' = current_platform.id"
    );
    expect(sql).toContain("~ '^#[A-Za-z][A-Za-z0-9_-]*$'");
    expect(sql).toContain("<> '//'");
    expect(sql).toContain("using errcode = '40001'");
    expect(sql).not.toMatch(/delete\s+from\s+public[.]music_platform_links/i);
  });

  it("allows SoundCloud growth while refusing implicit deletion", () => {
    const sql = migrationFunction("save_music_soundcloud_v2");

    expect(sql).toContain("v_track_count > 48");
    expect(sql).toContain("insert into public.soundcloud_tracks");
    expect(sql).toContain("on conflict (id) do update");
    expect(sql).toContain("on[.]soundcloud[.]com");
    expect(sql).toContain("submitted.item ->> 'id' = current_track.id");
    expect(sql).toContain("using errcode = '40001'");
    expect(sql).not.toMatch(/delete\s+from\s+public[.]soundcloud_tracks/i);
  });

  it("reads every navbar social row and returns the stable V2 shape", () => {
    const sql = migrationFunction("get_navbar_social_links_v2_snapshot");

    for (const field of [
      "'id'",
      "'label'",
      "'platform'",
      "'href'",
      "'iconKey'",
      "'isPublished'",
      "'updatedAt'",
    ]) {
      expect(sql).toContain(field);
    }
    expect(sql).toContain("from public.social_links as social");
    expect(sql).not.toContain("social.is_published = true");
  });

  it("supports empty or growing social-link payloads without hard deletion", () => {
    const sql = migrationFunction("save_navbar_social_links_v2");

    expect(sql).toContain("v_item_count > 16");
    expect(sql).not.toMatch(/v_item_count\s*</);
    expect(sql).toContain("lock table public.social_links");
    expect(sql).toContain("insert into public.social_links");
    expect(sql).toContain("on conflict (id) do update");
    expect(sql).toContain("submitted.item ->> 'id' = current_social.id");
    expect(sql).toContain("'expectedVersions', v_versions");
    expect(sql).not.toMatch(/delete\s+from\s+public[.]social_links/i);
  });

  it("keeps all Batch 5A RPCs service-only", () => {
    for (const [name, signature] of [
      ["save_music_platforms_v2", "text, jsonb, jsonb"],
      ["save_music_soundcloud_v2", "text, timestamptz, jsonb, jsonb"],
      ["get_navbar_social_links_v2_snapshot", "text"],
      ["save_navbar_social_links_v2", "text, jsonb, jsonb"],
    ]) {
      const escapedSignature = signature.replaceAll(" ", "\\s*");
      expect(migration).toMatch(
        new RegExp(
          `revoke all on function public[.]${name}[(]${escapedSignature}[)]\\s*from public, anon, authenticated, service_role;`,
          "i"
        )
      );
      expect(migration).toMatch(
        new RegExp(
          `grant execute on function public[.]${name}[(]${escapedSignature}[)]\\s*to service_role;`,
          "i"
        )
      );
    }
  });
});
