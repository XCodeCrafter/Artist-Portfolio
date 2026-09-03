import { describe, expect, it } from "vitest";
import {
  moveNavbarSocialLink,
  parseNavbarSocialLinksSnapshot,
  parseNavbarSocialLinksSubmission,
  updateNavbarSocialLinkUrl,
  type NavbarSocialLinkItem,
} from "@/lib/admin/navbar-social-links-editor";

const UPDATED_AT = "2026-09-03T10:00:00.000Z";

const spotify: NavbarSocialLinkItem = {
  id: "spotify",
  label: "Spotify",
  platform: "spotify",
  href: "https://open.spotify.com/artist/1234567890",
  iconKey: "spotify",
  isPublished: true,
};

describe("Admin V2 navbar platform shortcuts", () => {
  it("derives Apple Music identity from the pasted profile URL", () => {
    expect(
      updateNavbarSocialLinkUrl(
        spotify,
        "https://music.apple.com/cz/artist/example/1234567890"
      )
    ).toMatchObject({
      label: "Apple Music",
      platform: "apple-music",
      iconKey: "apple-music",
    });
  });

  it("allows additive rows while requiring every saved row to remain restorable", () => {
    const added = {
      id: "youtube",
      label: "YouTube",
      platform: "youtube",
      href: "https://youtube.com/@example",
      iconKey: "youtube",
      isPublished: true,
    };

    expect(
      parseNavbarSocialLinksSubmission([spotify, added], {
        spotify: UPDATED_AT,
      })
    ).toMatchObject({ success: true });
    expect(
      parseNavbarSocialLinksSubmission([added], { spotify: UPDATED_AT })
    ).toMatchObject({
      success: false,
      fieldErrors: { form: expect.any(Array) },
    });
  });

  it("rejects unsafe and incomplete external destinations", () => {
    expect(
      parseNavbarSocialLinksSubmission(
        [{ ...spotify, href: "javascript:alert(1)" }],
        { spotify: UPDATED_AT }
      ).success
    ).toBe(false);
    expect(
      parseNavbarSocialLinksSubmission(
        [{ ...spotify, href: "https://user:secret@example.com" }],
        { spotify: UPDATED_AT }
      ).success
    ).toBe(false);
  });

  it("maps complete service snapshots and preserves hidden links", () => {
    expect(
      parseNavbarSocialLinksSnapshot({
        items: [
          {
            ...spotify,
            isPublished: false,
            updatedAt: UPDATED_AT,
          },
        ],
      })
    ).toEqual({
      items: [{ ...spotify, isPublished: false }],
      expectedVersions: { spotify: UPDATED_AT },
    });
  });

  it("reorders without mutating the source collection", () => {
    const youtube = {
      ...spotify,
      id: "youtube",
      label: "YouTube",
      platform: "youtube" as const,
      iconKey: "youtube" as const,
      href: "https://youtube.com/@example",
    };
    const source = [spotify, youtube];
    const moved = moveNavbarSocialLink(source, 1, 0);
    expect(moved.map((item) => item.id)).toEqual(["youtube", "spotify"]);
    expect(source.map((item) => item.id)).toEqual(["spotify", "youtube"]);
  });
});
