import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SpotifyEmbed from "../components/SpotifyEmbed";
import {
  getMusicPublicSectionVisibility,
  preparePublicMusicPageViewData,
  resolveMusicHeroCtaHref,
  type MusicPageViewData,
} from "../lib/content/music";

function createMusicData(
  overrides: Partial<
    Pick<MusicPageViewData, "platforms" | "soundcloud" | "spotify">
  > = {}
): MusicPageViewData {
  return {
    hero: {
      title: "Music",
      subtitle: "Artist",
      ctaLabel: "Listen",
      ctaHref: "#spotify-releases",
      backgroundSrc: "/hero.jpg",
      posterSrc: "/poster.jpg",
      mediaType: "image",
    },
    platforms: [],
    spotify: {
      heading: "Latest releases",
      artistUrl: "",
      embedUrl: "",
    },
    soundcloud: {
      heading: "Latest mixes",
      tracks: [],
    },
    footer: {
      artistName: "Artist",
      contactBlurb: "Contact",
      footerEffect: "soul",
      location: "Prague",
      socialLinks: [],
      tagline: "Actor and musician",
    },
    ...overrides,
  };
}

describe("public Music runtime", () => {
  it("treats whitespace-only and empty destinations as absent", () => {
    const visibility = getMusicPublicSectionVisibility(
      createMusicData({
        platforms: [
          {
            id: "empty-platform",
            title: "Empty",
            label: "",
            href: "   ",
            iconKey: "spotify",
            imageSrc: "",
          },
        ],
        spotify: {
          heading: "Latest releases",
          artistUrl: " ",
          embedUrl: "\n",
        },
        soundcloud: {
          heading: "Latest mixes",
          tracks: [{ id: "empty-track", embedUrl: "\t" }],
        },
      })
    );

    expect(visibility).toEqual({
      platforms: false,
      spotify: false,
      soundcloud: false,
    });
  });

  it("shows each section as soon as it has a usable public destination", () => {
    const visibility = getMusicPublicSectionVisibility(
      createMusicData({
        platforms: [
          {
            id: "spotify",
            title: "Spotify",
            label: "Listen",
            href: "https://open.spotify.com/artist/example",
            iconKey: "spotify",
            imageSrc: "",
          },
        ],
        spotify: {
          heading: "Latest releases",
          artistUrl: "https://open.spotify.com/artist/example",
          embedUrl: "",
        },
        soundcloud: {
          heading: "Latest mixes",
          tracks: [
            {
              id: "mix",
              embedUrl: "https://soundcloud.com/example/mix",
            },
          ],
        },
      })
    );

    expect(visibility).toEqual({
      platforms: true,
      spotify: true,
      soundcloud: true,
    });
  });

  it("retargets only known hidden Music anchors", () => {
    const noneVisible = getMusicPublicSectionVisibility(createMusicData());
    const soundcloudOnly = getMusicPublicSectionVisibility(
      createMusicData({
        soundcloud: {
          heading: "Latest mixes",
          tracks: [
            {
              id: "mix",
              embedUrl: "https://soundcloud.com/example/mix",
            },
          ],
        },
      })
    );

    expect(resolveMusicHeroCtaHref("#spotify-releases", noneVisible)).toBe(
      "#music"
    );
    expect(
      resolveMusicHeroCtaHref("/music#spotify-releases", soundcloudOnly)
    ).toBe("#soundcloud-mixes");
    expect(resolveMusicHeroCtaHref("/booking", noneVisible)).toBe("/booking");
  });

  it("removes blank public rows while retaining valid siblings", () => {
    const prepared = preparePublicMusicPageViewData(
      createMusicData({
        platforms: [
          {
            id: "blank-platform",
            title: "Blank",
            label: "",
            href: " ",
            iconKey: "spotify",
            imageSrc: "",
          },
          {
            id: "spotify",
            title: "Spotify",
            label: "Listen",
            href: " https://open.spotify.com/artist/example ",
            iconKey: "spotify",
            imageSrc: "",
          },
        ],
        spotify: {
          heading: "Latest releases",
          artistUrl: " https://open.spotify.com/artist/example ",
          embedUrl: " ",
        },
        soundcloud: {
          heading: "Latest mixes",
          tracks: [
            { id: "blank-track", embedUrl: " " },
            {
              id: "mix",
              embedUrl: "https://soundcloud.com/example/mix",
            },
          ],
        },
      })
    );

    expect(prepared.platforms.map((platform) => platform.id)).toEqual([
      "spotify",
    ]);
    expect(prepared.platforms[0]?.href).toBe(
      "https://open.spotify.com/artist/example"
    );
    expect(prepared.spotify.embedUrl).toBe("");
    expect(prepared.spotify.artistUrl).toBe(
      "https://open.spotify.com/artist/example"
    );
    expect(prepared.soundcloud.tracks.map((track) => track.id)).toEqual([
      "mix",
    ]);
    expect(prepared.soundcloud.tracks[0]?.embedUrl).toBe(
      "https://soundcloud.com/example/mix"
    );
  });

  it("server-renders one responsive eager Spotify iframe", () => {
    const markup = renderToStaticMarkup(
      createElement(SpotifyEmbed, {
        embedUrl: "https://open.spotify.com/embed/artist/example",
        openUrl: "https://open.spotify.com/artist/example",
        heightMobile: 352,
        heightDesktop: 520,
      })
    );

    expect(markup.match(/<iframe/g)).toHaveLength(1);
    expect(markup).toContain("loading=\"eager\"");
    expect(markup).toContain("--spotify-mobile-height:352px");
    expect(markup).toContain("--spotify-desktop-height:520px");
  });

  it("keeps the no-URL Spotify fallback free of iframe requests", () => {
    const markup = renderToStaticMarkup(
      createElement(SpotifyEmbed, { embedUrl: " ", openUrl: " " })
    );

    expect(markup).not.toContain("<iframe");
    expect(markup).toContain("Releases will appear here");
  });
});
