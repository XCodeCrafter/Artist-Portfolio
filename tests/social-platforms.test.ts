import { describe, expect, it } from "vitest";
import {
  detectSocialPlatform,
  detectSocialPlatformFromUrl,
  getSocialPlatformOptions,
} from "@/lib/content/social-platforms";

describe("social platform detection", () => {
  it.each([
    ["https://open.spotify.com/artist/example", "spotify"],
    ["https://music.apple.com/us/artist/example/123", "apple-music"],
    ["https://soundcloud.com/example", "soundcloud"],
    ["https://www.youtube.com/@example", "youtube"],
    ["https://youtu.be/example", "youtube"],
    ["https://artist.bandcamp.com", "bandcamp"],
    ["https://www.beatport.com/artist/example/123", "beatport"],
    ["https://m.facebook.com/example", "facebook"],
    ["https://x.com/example", "twitter"],
  ])("detects %s from its hostname", (href, expected) => {
    expect(detectSocialPlatformFromUrl(href)).toBe(expected);
  });

  it.each([
    "https://spotify.example.com/profile",
    "https://evilspotify.com/profile",
    "https://example.com/spotify",
    "https://example.com/?next=https://open.spotify.com",
    "https://spotify.com@evil.example/profile",
    "javascript:spotify",
    "not a URL containing spotify",
  ])("does not trust a lookalike or non-URL value: %s", (href) => {
    expect(detectSocialPlatformFromUrl(href)).toBe("website");
  });

  it("lets a real destination URL replace a stale stored icon hint", () => {
    expect(
      detectSocialPlatform(
        "spotify",
        "https://music.apple.com/us/artist/example/123",
        "Listen"
      )
    ).toBe("apple-music");
  });

  it("ignores platform words hidden inside an unrelated URL", () => {
    expect(detectSocialPlatform("https://example.com/?service=spotify")).toBe(
      "website"
    );
    expect(detectSocialPlatform("javascript:spotify")).toBe("website");
    expect(detectSocialPlatform("//spotify.com/profile")).toBe("website");
  });

  it("uses the globe for an unknown URL instead of a stale stored hint", () => {
    expect(
      detectSocialPlatform("spotify", "https://artist.example/profile")
    ).toBe("website");
  });

  it.each([
    ["apple", "apple-music"],
    ["Apple Music", "apple-music"],
    ["sound_cloud", "soundcloud"],
    ["X / Twitter", "twitter"],
    ["Beatport", "beatport"],
  ])("keeps the legacy hint %s compatible", (hint, expected) => {
    expect(detectSocialPlatform(hint)).toBe(expected);
  });

  it("offers every registered platform once in either portfolio ordering", () => {
    const actorKeys = getSocialPlatformOptions("actor").map(({ key }) => key);
    const musicianKeys = getSocialPlatformOptions("musician").map(
      ({ key }) => key
    );

    expect(new Set(actorKeys).size).toBe(actorKeys.length);
    expect(new Set(musicianKeys).size).toBe(musicianKeys.length);
    expect(new Set(actorKeys)).toEqual(new Set(musicianKeys));
    expect(musicianKeys.slice(0, 4)).toEqual([
      "spotify",
      "soundcloud",
      "apple-music",
      "youtube",
    ]);
  });
});
