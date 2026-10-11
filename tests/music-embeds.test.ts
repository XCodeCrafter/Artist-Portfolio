import { describe, expect, it } from "vitest";
import { parseMusicTrackUrl } from "@/lib/music-embeds";

describe("Mixed music URL boundary", () => {
  it.each(["track", "album", "playlist"])("normalizes Spotify %s shares and embeds to the same player", kind => {
    const parsed = parseMusicTrackUrl(` https://open.spotify.com/intl-cs/${kind}/Ab123?si=share `);
    expect(parsed).toEqual({ provider: "spotify", sourceUrl: `https://open.spotify.com/embed/${kind}/Ab123`, embedUrl: `https://open.spotify.com/embed/${kind}/Ab123`, openUrl: `https://open.spotify.com/${kind}/Ab123` });
    expect(parseMusicTrackUrl(parsed!.sourceUrl)).toEqual(parsed);
  });

  it("keeps saved Spotify player options while the open link targets the exact music item", () => {
    expect(parseMusicTrackUrl("https://open.spotify.com/embed/playlist/Ab123?theme=0#saved")).toEqual({
      provider: "spotify", sourceUrl: "https://open.spotify.com/embed/playlist/Ab123?theme=0#saved",
      embedUrl: "https://open.spotify.com/embed/playlist/Ab123?theme=0#saved", openUrl: "https://open.spotify.com/playlist/Ab123",
    });
  });

  it.each([
    "https://api.soundcloud.com/tracks/123",
    "https://on.soundcloud.com/Ab123",
    "https://soundcloud.com/artist/track?secret_token=s-example",
    "https://www.soundcloud.com/artist/sets/record",
    "https://SOUNDCLOUD.COM:443/artist/track",
  ])("preserves the legacy SoundCloud source and builds one known player origin: %s", source => {
    const parsed = parseMusicTrackUrl(` ${source} `)!;
    expect(parsed.provider).toBe("soundcloud");
    expect(parsed.sourceUrl).toBe(source);
    expect(parsed.openUrl).toBe(source);
    const embed = new URL(parsed.embedUrl);
    expect(embed.origin).toBe("https://w.soundcloud.com");
    expect(embed.pathname).toBe("/player/");
    expect(embed.searchParams.get("url")).toBe(source);
    expect(embed.searchParams.get("auto_play")).toBe("false");
    expect(embed.searchParams.get("visual")).toBe("true");
  });

  it.each([
    "", " ", "javascript:alert(1)", "http://soundcloud.com/artist/track", "//soundcloud.com/artist/track",
    "https://soundcloud.com.evil.test/artist/track", "https://evil.test/?url=https://soundcloud.com/artist/track",
    "https://user:password@soundcloud.com/artist/track", "https://soundcloud.com:444/artist/track",
    "https://soundcloud.com\\evil", "https://soundcloud.com/artist/track\n", "https://soundcloud.com/artist/bad track",
    "https:soundcloud.com/artist/track", "https:////soundcloud.com/artist/track", "https://%73oundcloud.com/artist/track", "https://soundcloud.com:0443/artist/track",
    "https://w.soundcloud.com/player/?url=https://evil.test/song", "https://open.spotify.com.evil.test/track/Ab123",
    "https://open.spotify.com:444/track/Ab123", "https://user@open.spotify.com/track/Ab123",
    "https://open.spoti\nfy.com/track/Ab123", "https://open.spotify.com/track/Ab123/extra",
    "https://open.spotify.com/artist/Ab123", "https://open.spotify.com/show/Ab123", "https://open.spotify.com/episode/Ab123",
    "https://open.spotify.com/search/Ab123", "https://spotify.link/Ab123",
    '<iframe src="https://open.spotify.com/embed/track/Ab123"></iframe>',
  ])("rejects unsafe, unknown or non-music input: %s", value => {
    expect(parseMusicTrackUrl(value)).toBeNull();
  });

  it("bounds stored input and the normalized Spotify URL", () => {
    expect(parseMusicTrackUrl(`https://soundcloud.com/artist/${"a".repeat(2048)}`)).toBeNull();
    expect(parseMusicTrackUrl(`https://open.spotify.com/track/${"a".repeat(2048)}`)).toBeNull();
  });
});
