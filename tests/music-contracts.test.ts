import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const publicMusicPage = readFileSync(
  new URL("../app/music/page.tsx", import.meta.url),
  "utf8"
);
const sharedMusicView = readFileSync(
  new URL("../components/music/MusicPageView.tsx", import.meta.url),
  "utf8"
);
const musicEditor = readFileSync(
  new URL("../components/admin/v2/MusicEditor.tsx", import.meta.url),
  "utf8"
);
const musicPreviewFrame = readFileSync(
  new URL("../components/admin/v2/MusicPreviewFrame.tsx", import.meta.url),
  "utf8"
);
const musicPreviewRuntime = readFileSync(
  new URL("../components/admin/v2/MusicPreviewRuntime.tsx", import.meta.url),
  "utf8"
);
const mediaAssetPicker = readFileSync(
  new URL("../components/admin/MediaAssetPicker.tsx", import.meta.url),
  "utf8"
);
const musicPlatforms = readFileSync(
  new URL("../components/MusicPlatforms_ext.tsx", import.meta.url),
  "utf8"
);
const soundcloudCarousel = readFileSync(
  new URL("../components/SoundcloudCarousel.tsx", import.meta.url),
  "utf8"
);
const publicContentLoader = readFileSync(
  new URL("../lib/content/index.ts", import.meta.url),
  "utf8"
);
const readiness = readFileSync(
  new URL("../lib/admin/readiness.ts", import.meta.url),
  "utf8"
);
const migration = readFileSync(
  new URL(
    "../supabase/migrations/0028_music_page_editor.sql",
    import.meta.url
  ),
  "utf8"
);

function migrationFunction(name: string) {
  const start = migration.indexOf(
    `create or replace function public.${name}`
  );
  const next = migration.indexOf("create or replace function public.", start + 1);
  expect(start).toBeGreaterThanOrEqual(0);
  return migration.slice(start, next < 0 ? undefined : next);
}

describe("Music visual editor presentation contract", () => {
  it("renders the public page through the shared MusicPageView", () => {
    expect(publicMusicPage).toContain(
      'import MusicPageView from "@/components/music/MusicPageView"'
    );
    expect(publicMusicPage).toContain(
      "<MusicPageView data={selectMusicPageViewData(content)} />"
    );
    expect(sharedMusicView).toContain('<AdaptiveHero {...data.hero} />');
    expect(sharedMusicView).toContain("data.spotify.heading");
    expect(sharedMusicView).toContain("data.soundcloud.heading");
  });

  it("makes every visible editable section selectable in preview mode", () => {
    for (const section of ["hero", "platforms", "spotify", "soundcloud"]) {
      expect(sharedMusicView).toContain(`section="${section}"`);
    }
    expect(sharedMusicView).toContain("data-music-preview-section");
    expect(sharedMusicView).toContain("onSelectSection");
    expect(sharedMusicView).toContain("MUSIC_PREVIEW_SELECTION_MESSAGE");
  });

  it("keeps links, embeds, and carousel controls inert inside edit preview", () => {
    expect(sharedMusicView).toContain('mode?: "public" | "preview"');
    expect(sharedMusicView).toContain('className="pointer-events-none" inert');
    expect(sharedMusicView).toContain("interactionMode={mode}");
    expect(musicPlatforms).toContain(
      'if (interactionMode === "preview")'
    );
    expect(soundcloudCarousel).toContain(
      'if (interactionMode === "preview" || !canNavigate) return;'
    );
  });

  it("does not resurrect hidden Music rows with demo fallback collections", () => {
    for (const mapper of [
      "mapSocialLinks",
      "mapMusicPlatforms",
      "mapSoundcloudTracks",
    ]) {
      const start = publicContentLoader.indexOf(`function ${mapper}`);
      const next = publicContentLoader.indexOf("\nfunction ", start + 1);
      const source = publicContentLoader.slice(
        start,
        next < 0 ? undefined : next
      );
      expect(start).toBeGreaterThanOrEqual(0);
      expect(source).toContain("if (!rows.length) return [];");
      expect(source).not.toContain("allowFallback");
    }
  });

  it("keeps parent and iframe selection synchronized during saves", () => {
    expect(musicPreviewRuntime).not.toContain("setSelectedSection(section);");
    expect(musicPreviewRuntime).toContain(
      "window.parent.postMessage("
    );
    expect(musicPreviewFrame).toContain("messageRef.current = message;");
    expect(musicPreviewFrame).toContain(
      "onSelectSectionRef.current(event.data.section);"
    );
  });

  it("includes the Music V2 snapshot in production readiness", () => {
    expect(readiness).toContain(
      'supabase.rpc("get_music_page_v2_snapshot", { p_site_id: "main" })'
    );
    expect(readiness).toContain(
      '"Apply all current Supabase migrations through 0034."'
    );
  });

  it("uses controlled media values across desktop and mobile inspectors", () => {
    expect(mediaAssetPicker).toContain('value?: string;');
    expect(mediaAssetPicker).toContain(
      "const value = controlledValue ?? uncontrolledValue;"
    );
    expect(musicEditor).toContain("value={hero.backgroundSrc}");
    expect(musicEditor).toContain("value={hero.posterSrc}");
    expect(musicEditor).toContain("value={item.imageSrc}");
  });

  it("keeps the Batch 5A editor usable on narrow screens and empty lists", () => {
    expect(musicEditor).toContain("onAddPlatform");
    expect(musicEditor).toContain("onAddSoundcloud");
    expect(musicEditor).toContain("onRemoveNewPlatform");
    expect(musicEditor).toContain("onRemoveNewSoundcloud");
    expect(musicEditor).toContain('title="Discard unsaved platform"');
    expect(musicEditor).toContain('title="Discard unsaved mix"');
    expect(musicEditor).toContain(
      'window.matchMedia("(min-width: 1280px)").matches'
    );
    expect(musicEditor).toContain("layout example only");
    expect(musicEditor).not.toContain('label="Embed URL"');
    expect(musicPreviewRuntime).toContain("scrollIntoView");
    expect(musicPreviewFrame).toContain("focusRequestId");
  });
});

describe("Admin V2 Music migration contract", () => {
  it("stores artist-editable headings in a public singleton", () => {
    expect(migration).toContain(
      "create table if not exists public.music_presentation"
    );
    expect(migration).toContain("releases_heading text not null");
    expect(migration).toContain("mixes_heading text not null");
    expect(migration).toContain("music_presentation_id_check");
    expect(migration).toContain(
      'create policy "Public can read music presentation"'
    );
  });

  it.each([
    ["save_music_hero_v2", "select hero.updated_at"],
    ["save_music_spotify_v2", "select settings.updated_at"],
    ["save_music_platforms_v2", "into v_current_count"],
    ["save_music_soundcloud_v2", "select presentation.updated_at"],
  ])("locks %s before reading the expected database version", (name, read) => {
    const sql = migrationFunction(name);
    const lockIndex = sql.indexOf("pg_advisory_xact_lock");
    const readIndex = sql.indexOf(read);

    expect(lockIndex).toBeGreaterThan(0);
    expect(readIndex).toBeGreaterThan(lockIndex);
  });

  it("uses explicit serializable conflicts for all four sections", () => {
    for (const section of ["hero", "spotify", "platforms", "soundcloud"]) {
      expect(migration).toContain(`music_${section}_changed`);
    }
    expect(migration.match(/using errcode = '40001'/g)?.length).toBeGreaterThanOrEqual(
      4
    );
  });

  it("updates complete ordered collections without replacing row identities", () => {
    const platforms = migrationFunction("save_music_platforms_v2");
    const soundcloud = migrationFunction("save_music_soundcloud_v2");

    for (const sql of [platforms, soundcloud]) {
      expect(sql).toContain("jsonb_object_keys(p_expected_versions)");
      expect(sql).toContain("<> v_current_count");
      expect(sql).toContain("updated_at is distinct from");
      expect(sql).toContain("with ordinality as value(item, ordinality)");
      expect(sql).toContain(
        "sort_order = (submitted.ordinality * 10)::integer"
      );
      expect(sql).not.toMatch(/delete\s+from\s+public\./i);
      expect(sql).not.toMatch(/insert\s+into\s+public\./i);
    }
    expect(platforms).toContain(
      "where not (p_expected_versions ? current_platform.id)"
    );
    expect(soundcloud).toContain(
      "where not (p_expected_versions ? current_track.id)"
    );
    expect(platforms).not.toMatch(/set[\s\S]{0,800}\bicon_key\s*=/i);
  });

  it("keeps V1-safe platform destinations and text lengths compatible", () => {
    const hero = migrationFunction("save_music_hero_v2");
    const platforms = migrationFunction("save_music_platforms_v2");
    const soundcloud = migrationFunction("save_music_soundcloud_v2");

    expect(hero).toContain("'ctaLabel')) > 220");
    expect(platforms).toContain("'title')) not between 1 and 220");
    expect(platforms).toContain("'label')) > 220");
    expect(platforms).toContain("~ '^#[A-Za-z][A-Za-z0-9_-]*$'");
    expect(soundcloud).toContain("'title')) > 220");
    expect(platforms).not.toContain("v_platform_count > 32");
    expect(soundcloud).not.toContain("v_track_count > 48");
  });

  it("allows only the service role to execute Music V2 RPCs", () => {
    for (const name of [
      "get_music_page_v2_snapshot",
      "save_music_hero_v2",
      "save_music_spotify_v2",
      "save_music_platforms_v2",
      "save_music_soundcloud_v2",
    ]) {
      expect(migration).toMatch(
        new RegExp(
          `revoke all on function public\\.${name}\\([^)]*\\)\\s*from public, anon, authenticated, service_role;`,
          "i"
        )
      );
      expect(migration).toMatch(
        new RegExp(
          `grant execute on function public\\.${name}\\([^)]*\\)\\s*to service_role;`,
          "i"
        )
      );
    }
  });
});
