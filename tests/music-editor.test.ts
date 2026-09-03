import { describe, expect, it } from "vitest";
import {
  deriveSpotifyEmbedUrl,
  getMusicSectionPayload,
  parseMusicHeroDraft,
  parseMusicPlatformsDraft,
  parseMusicEditorSnapshot,
  parseMusicPreviewUpdateMessage,
  parseMusicSectionSubmission,
  parseMusicSoundcloudDraft,
  parseMusicSpotifyDraft,
} from "@/lib/admin/music-editor";
import { FALLBACK_CONTENT } from "@/lib/content/fallback";
import { selectMusicPageViewData } from "@/lib/content/music";

const UPDATED_AT = "2026-09-02T10:00:00.000Z";
const PRESENTATION_UPDATED_AT = "2026-09-02T10:01:00.000Z";

const heroDraft = {
  title: "MUSIC",
  subtitle: "Listen to the latest releases and mixes.",
  ctaLabel: "Explore releases",
  ctaHref: "#spotify-releases",
  backgroundSrc: "/images/music-hero.webp",
  posterSrc: "/images/music-hero-poster.webp",
  mediaType: "image" as const,
};

const spotifyDraft = {
  releasesHeading: "LATEST RELEASES",
  artistUrl: "https://open.spotify.com/artist/1234567890",
  embedUrl: "https://open.spotify.com/embed/artist/1234567890",
};

const platformsDraft = {
  items: [
    {
      id: "spotify",
      title: "Spotify",
      label: "Listen on Spotify",
      href: "https://open.spotify.com/artist/1234567890",
      imageSrc: "/images/platforms/spotify.webp",
      iconKey: "spotify",
      isPublished: true,
    },
    {
      id: "apple-music",
      title: "Apple Music",
      label: "Listen on Apple Music",
      href: "https://music.apple.com/us/artist/example/1234567890",
      imageSrc: "/images/platforms/apple-music.webp",
      iconKey: "apple-music",
      isPublished: false,
    },
  ],
};

const soundcloudDraft = {
  mixesHeading: "LATEST MIXES",
  items: [
    {
      id: "late-night-mix",
      title: "Late Night Mix",
      embedUrl:
        "https://api.soundcloud.com/tracks/soundcloud:tracks:1234567890",
      isPublished: true,
    },
  ],
};

describe("Admin V2 Music editor parsers", () => {
  it("accepts focused drafts and trims human-facing copy", () => {
    const hero = parseMusicHeroDraft({
      ...heroDraft,
      title: "  MUSIC  ",
      subtitle: "  Listen to the latest releases and mixes.  ",
    });
    const spotify = parseMusicSpotifyDraft({
      ...spotifyDraft,
      releasesHeading: "  LATEST RELEASES  ",
    });
    const platforms = parseMusicPlatformsDraft(platformsDraft);
    const soundcloud = parseMusicSoundcloudDraft({
      ...soundcloudDraft,
      mixesHeading: "  LATEST MIXES  ",
    });

    expect(hero).toMatchObject({
      success: true,
      data: {
        title: "MUSIC",
        subtitle: "Listen to the latest releases and mixes.",
      },
    });
    expect(spotify).toMatchObject({
      success: true,
      data: { releasesHeading: "LATEST RELEASES" },
    });
    expect(platforms).toMatchObject({ success: true, data: platformsDraft });
    expect(soundcloud).toMatchObject({
      success: true,
      data: { mixesHeading: "LATEST MIXES" },
    });
  });

  it("requires useful section headings", () => {
    expect(
      parseMusicSpotifyDraft({ ...spotifyDraft, releasesHeading: "   " })
        .success
    ).toBe(false);
    expect(
      parseMusicSoundcloudDraft({
        ...soundcloudDraft,
        mixesHeading: "x".repeat(221),
      }).success
    ).toBe(false);
  });

  it("accepts only the expected Spotify URL families", () => {
    expect(parseMusicSpotifyDraft(spotifyDraft).success).toBe(true);
    expect(
      parseMusicSpotifyDraft({
        ...spotifyDraft,
        artistUrl: "https://example.com/artist/1234567890",
      }).success
    ).toBe(false);
    expect(
      parseMusicSpotifyDraft({
        ...spotifyDraft,
        embedUrl: "https://open.spotify.com/artist/1234567890",
      }).success
    ).toBe(false);
    expect(
      parseMusicSpotifyDraft({
        ...spotifyDraft,
        embedUrl: "javascript:alert(1)",
      }).success
    ).toBe(false);
  });

  it("derives the Spotify player URL from one normal artist link", () => {
    expect(
      deriveSpotifyEmbedUrl(
        "https://open.spotify.com/artist/1234567890?si=share-token"
      )
    ).toBe("https://open.spotify.com/embed/artist/1234567890");
    expect(
      getMusicSectionPayload(
        {
          hero: heroDraft,
          platforms: platformsDraft,
          spotify: {
            ...spotifyDraft,
            embedUrl: "https://open.spotify.com/embed/playlist/outdated",
          },
          soundcloud: soundcloudDraft,
        },
        "spotify"
      )
    ).toMatchObject({
      artistUrl: spotifyDraft.artistUrl,
      embedUrl: "https://open.spotify.com/embed/artist/1234567890",
    });
    expect(deriveSpotifyEmbedUrl("https://example.com/artist/123")).toBe("");
    expect(deriveSpotifyEmbedUrl("javascript:alert(1)")).toBe("");
  });

  it("accepts SoundCloud track URLs and rejects unrelated or unsafe URLs", () => {
    expect(parseMusicSoundcloudDraft(soundcloudDraft).success).toBe(true);
    expect(
      parseMusicSoundcloudDraft({
        ...soundcloudDraft,
        items: [
          {
            ...soundcloudDraft.items[0],
            embedUrl: "https://on.soundcloud.com/example-share-link",
          },
        ],
      }).success
    ).toBe(true);
    expect(
      parseMusicSoundcloudDraft({
        ...soundcloudDraft,
        items: [
          {
            ...soundcloudDraft.items[0],
            embedUrl: "https://example.com/example/late-night-mix",
          },
        ],
      }).success
    ).toBe(false);
    expect(
      parseMusicSoundcloudDraft({
        ...soundcloudDraft,
        items: [
          {
            ...soundcloudDraft.items[0],
            embedUrl: "data:text/html,hello",
          },
        ],
      }).success
    ).toBe(false);
  });

  it("keeps V1-safe internal platform destinations valid", () => {
    expect(
      parseMusicPlatformsDraft({
        items: [
          {
            ...platformsDraft.items[0],
            href: "/booking",
          },
        ],
      }).success
    ).toBe(true);
    expect(
      parseMusicPlatformsDraft({
        items: [
          {
            ...platformsDraft.items[0],
            href: "#spotify-releases",
          },
        ],
      }).success
    ).toBe(true);
  });

  it("derives a safe platform icon before saving hidden implementation data", () => {
    const payload = getMusicSectionPayload(
      {
        hero: heroDraft,
        spotify: spotifyDraft,
        soundcloud: soundcloudDraft,
        platforms: {
          items: [{ ...platformsDraft.items[0], iconKey: "" }],
        },
      },
      "platforms"
    );

    expect(payload).toMatchObject({
      items: [{ iconKey: "spotify" }],
    });
    expect(parseMusicPlatformsDraft(payload).success).toBe(true);
  });

  it("keeps raw ordering fields out while carrying a derived platform icon", () => {
    expect(
      parseMusicHeroDraft({
        ...heroDraft,
        pageSlug: "music",
        sortOrder: 40,
      }).success
    ).toBe(false);
    expect(
      parseMusicPlatformsDraft({
        items: [
          {
            ...platformsDraft.items[0],
            sortOrder: 10,
          },
        ],
      }).success
    ).toBe(false);
    expect(parseMusicPlatformsDraft(platformsDraft).success).toBe(true);
    expect(
      parseMusicSoundcloudDraft({
        items: [
          {
            ...soundcloudDraft.items[0],
            sortOrder: 10,
          },
        ],
        mixesHeading: soundcloudDraft.mixesHeading,
      }).success
    ).toBe(false);
  });

  it("rejects external media origins the public CSP cannot render", () => {
    expect(
      parseMusicHeroDraft({
        ...heroDraft,
        backgroundSrc: "https://example.com/music-hero.webp",
      }).success
    ).toBe(false);
    expect(
      parseMusicPlatformsDraft({
        items: [
          {
            ...platformsDraft.items[0],
            imageSrc: "https://example.com/platform.webp",
          },
        ],
      }).success
    ).toBe(false);
  });

  it("binds every section to the exact optimistic-lock version shape", () => {
    expect(
      parseMusicSectionSubmission("hero", heroDraft, {
        updatedAt: UPDATED_AT,
      }).success
    ).toBe(true);
    expect(
      parseMusicSectionSubmission("spotify", spotifyDraft, {
        settingsUpdatedAt: UPDATED_AT,
        presentationUpdatedAt: PRESENTATION_UPDATED_AT,
      }).success
    ).toBe(true);
    expect(
      parseMusicSectionSubmission("platforms", platformsDraft, {
        items: {
          spotify: UPDATED_AT,
          "apple-music": PRESENTATION_UPDATED_AT,
        },
      }).success
    ).toBe(true);
    expect(
      parseMusicSectionSubmission("soundcloud", soundcloudDraft, {
        presentationUpdatedAt: PRESENTATION_UPDATED_AT,
        items: { "late-night-mix": UPDATED_AT },
      }).success
    ).toBe(true);

    expect(
      parseMusicSectionSubmission("hero", heroDraft, {
        settingsUpdatedAt: UPDATED_AT,
      }).success
    ).toBe(false);
    expect(
      parseMusicSectionSubmission("spotify", spotifyDraft, {
        settingsUpdatedAt: "not-a-version",
        presentationUpdatedAt: PRESENTATION_UPDATED_AT,
      }).success
    ).toBe(false);
    expect(
      parseMusicSectionSubmission("platforms", platformsDraft, {
        items: { spotify: UPDATED_AT },
        sortOrder: 10,
      }).success
    ).toBe(false);
  });

  it("allows new collection rows but never drops a saved row", () => {
    expect(
      parseMusicSectionSubmission("platforms", platformsDraft, {
        items: { spotify: UPDATED_AT },
      }).success
    ).toBe(true);
    expect(
      parseMusicSectionSubmission(
        "platforms",
        { items: [platformsDraft.items[1]] },
        { items: { spotify: UPDATED_AT } }
      ).success
    ).toBe(false);
    expect(
      parseMusicSectionSubmission("soundcloud", soundcloudDraft, {
        presentationUpdatedAt: PRESENTATION_UPDATED_AT,
        items: {
          "late-night-mix": UPDATED_AT,
          "deleted-in-another-session": UPDATED_AT,
        },
      }).success
    ).toBe(false);
  });

  it("requires returned versions for every newly saved collection row", () => {
    expect(
      parseMusicSectionSubmission(
        "platforms",
        platformsDraft,
        { items: { spotify: UPDATED_AT } },
        { requireExactCollectionVersions: true }
      ).success
    ).toBe(false);
    expect(
      parseMusicSectionSubmission(
        "platforms",
        platformsDraft,
        {
          items: {
            spotify: UPDATED_AT,
            "apple-music": PRESENTATION_UPDATED_AT,
          },
        },
        { requireExactCollectionVersions: true }
      ).success
    ).toBe(true);
  });

  it("turns the service snapshot into editable drafts and per-section versions", () => {
    const rawSnapshot = {
      hero: { ...heroDraft, updatedAt: UPDATED_AT },
      spotify: {
        ...spotifyDraft,
        settingsUpdatedAt: UPDATED_AT,
        presentationUpdatedAt: PRESENTATION_UPDATED_AT,
      },
      platforms: [
        {
          ...platformsDraft.items[0],
          iconKey: "spotify",
          updatedAt: UPDATED_AT,
        },
      ],
      soundcloud: {
        mixesHeading: soundcloudDraft.mixesHeading,
        presentationUpdatedAt: PRESENTATION_UPDATED_AT,
        tracks: [
          { ...soundcloudDraft.items[0], updatedAt: UPDATED_AT },
        ],
      },
      footer: {
        artistName: "Example Artist",
        contactBlurb: "Bookings and collaborations.",
        footerEffect: "soul",
        location: "Prague",
        socialLinks: [
          {
            id: "instagram",
            label: "Instagram",
            platform: "instagram",
            href: "https://instagram.com/example",
            iconKey: "instagram",
          },
        ],
        tagline: "Actor and musician",
      },
    };

    const snapshot = parseMusicEditorSnapshot(rawSnapshot);

    expect(snapshot).toMatchObject({
      draft: {
        hero: heroDraft,
        spotify: spotifyDraft,
        platforms: {
          items: [
            {
              ...platformsDraft.items[0],
              iconKey: "spotify",
            },
          ],
        },
        soundcloud: soundcloudDraft,
      },
      versions: {
        hero: { updatedAt: UPDATED_AT },
        spotify: {
          settingsUpdatedAt: UPDATED_AT,
          presentationUpdatedAt: PRESENTATION_UPDATED_AT,
        },
        platforms: { items: { spotify: UPDATED_AT } },
        soundcloud: {
          presentationUpdatedAt: PRESENTATION_UPDATED_AT,
          items: { "late-night-mix": UPDATED_AT },
        },
      },
    });
    expect(snapshot?.draft.platforms.items[0]).not.toHaveProperty(
      "updatedAt"
    );
    expect(snapshot?.draft.soundcloud.items[0]).not.toHaveProperty(
      "updatedAt"
    );
    expect(
      parseMusicEditorSnapshot({
        ...rawSnapshot,
        hero: { ...heroDraft, updatedAt: "stale-ish" },
      })
    ).toBeNull();
  });

  it("keeps legacy-safe local footer links from invalidating the preview", () => {
    const rawSnapshot = {
      hero: { ...heroDraft, updatedAt: UPDATED_AT },
      spotify: {
        ...spotifyDraft,
        settingsUpdatedAt: UPDATED_AT,
        presentationUpdatedAt: PRESENTATION_UPDATED_AT,
      },
      platforms: [],
      soundcloud: {
        mixesHeading: soundcloudDraft.mixesHeading,
        presentationUpdatedAt: PRESENTATION_UPDATED_AT,
        tracks: [],
      },
      footer: {
        artistName: "Example Artist",
        contactBlurb: "Bookings and collaborations.",
        footerEffect: "soul",
        location: "Prague",
        socialLinks: [
          {
            id: "contact",
            label: "Contact",
            platform: "website",
            href: "/booking",
            iconKey: "link",
          },
        ],
        tagline: "Actor and musician",
      },
    };

    expect(parseMusicEditorSnapshot(rawSnapshot)).not.toBeNull();
  });

  it("loads V1-valid Music rows even when the active V2 save must repair them", () => {
    const rawSnapshot = {
      hero: {
        ...heroDraft,
        backgroundSrc: "https://media.example.com/legacy-hero.mp4",
        mediaType: "video",
        updatedAt: UPDATED_AT,
      },
      spotify: {
        ...spotifyDraft,
        artistUrl: "/music",
        embedUrl: "#spotify-releases",
        settingsUpdatedAt: UPDATED_AT,
        presentationUpdatedAt: PRESENTATION_UPDATED_AT,
      },
      platforms: [
        {
          ...platformsDraft.items[0],
          href: "/booking",
          imageSrc: "",
          iconKey: "",
          updatedAt: UPDATED_AT,
        },
      ],
      soundcloud: {
        mixesHeading: soundcloudDraft.mixesHeading,
        presentationUpdatedAt: PRESENTATION_UPDATED_AT,
        tracks: [
          {
            ...soundcloudDraft.items[0],
            embedUrl: "/legacy-mix",
            updatedAt: UPDATED_AT,
          },
        ],
      },
      footer: {
        artistName: "Example Artist",
        contactBlurb: "Bookings and collaborations.",
        footerEffect: "soul",
        location: "Prague",
        socialLinks: [],
        tagline: "Actor and musician",
      },
    };

    const snapshot = parseMusicEditorSnapshot(rawSnapshot);
    expect(snapshot).not.toBeNull();
    expect(parseMusicPlatformsDraft(snapshot?.draft.platforms).success).toBe(
      false
    );
    expect(parseMusicSpotifyDraft(snapshot?.draft.spotify).success).toBe(false);
    expect(
      parseMusicSoundcloudDraft(snapshot?.draft.soundcloud).success
    ).toBe(false);
    expect(
      parseMusicPreviewUpdateMessage({
        type: "music-preview-update",
        focusRequestId: 0,
        draft: snapshot?.draft,
        footer: snapshot?.footer,
        selectedSection: "hero",
      })
    ).not.toBeNull();
  });

  it("keeps live preview updates flowing through temporary invalid input", () => {
    const parsed = parseMusicPreviewUpdateMessage({
      type: "music-preview-update",
      focusRequestId: 1,
      draft: {
        hero: {
          ...heroDraft,
          title: "",
          ctaHref: "javascript:alert(1)",
          backgroundSrc: "javascript:alert(2)",
        },
        spotify: {
          ...spotifyDraft,
          releasesHeading: "",
          embedUrl: "javascript:alert(3)",
        },
        platforms: {
          items: [
            {
              ...platformsDraft.items[0],
              href: "javascript:alert(4)",
              imageSrc: "https://example.com/not-allowed.webp",
              iconKey: "spotify",
            },
          ],
        },
        soundcloud: {
          mixesHeading: "",
          items: [
            {
              ...soundcloudDraft.items[0],
              embedUrl: "javascript:alert(5)",
            },
          ],
        },
      },
      footer: {
        artistName: "Example Artist",
        contactBlurb: "Bookings and collaborations.",
        footerEffect: "soul",
        location: "Prague",
        socialLinks: [],
        tagline: "Actor and musician",
      },
      selectedSection: "spotify",
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.selectedSection).toBe("spotify");
    expect(parsed?.draft.hero.title).toBe("");
    expect(parsed?.draft.hero.ctaHref).toBe("");
    expect(parsed?.draft.hero.backgroundSrc).toBe("");
    expect(parsed?.draft.spotify.embedUrl).toBe("");
    expect(parsed?.draft.platforms.items[0]).toMatchObject({
      href: "",
      imageSrc: "",
    });
    expect(parsed?.draft.soundcloud.items[0].embedUrl).toBe("");
  });
});

describe("shared Music page presentation", () => {
  it("projects headings and media from the same public content model", () => {
    const view = selectMusicPageViewData(FALLBACK_CONTENT);

    expect(view.hero).toBe(FALLBACK_CONTENT.heroes.music);
    expect(view.platforms).toBe(FALLBACK_CONTENT.musicPlatforms);
    expect(view.spotify).toEqual({
      heading: FALLBACK_CONTENT.musicPresentation.releasesHeading,
      artistUrl: FALLBACK_CONTENT.settings.spotifyArtistUrl,
      embedUrl: FALLBACK_CONTENT.settings.spotifyEmbedUrl,
    });
    expect(view.soundcloud).toEqual({
      heading: FALLBACK_CONTENT.musicPresentation.mixesHeading,
      tracks: FALLBACK_CONTENT.soundcloudTracks,
    });
  });
});
