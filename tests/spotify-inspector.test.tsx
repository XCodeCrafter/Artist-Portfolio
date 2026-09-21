import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SpotifyInspector } from "@/components/admin/v2/MusicEditor";
import {
  createFallbackMusicEditorSnapshot,
  type MusicSpotifyDraft,
} from "@/lib/admin/music-editor";

vi.mock("@/app/admin/v2/pages/music/actions", () => ({
  saveMusicSectionV2: vi.fn(),
}));

const ARTIST_URL = "https://open.spotify.com/artist/ArtistA";
const ARTIST_PLAYER = "https://open.spotify.com/embed/artist/ArtistA";
const CUSTOM_PLAYER = "https://open.spotify.com/embed/playlist/MyPlaylist?theme=0";

type Element = ReactElement<Record<string, unknown>>;

function nodes(tree: ReactNode): Element[] {
  return Children.toArray(tree).flatMap((node) =>
    isValidElement<Record<string, unknown>>(node)
      ? [node, ...nodes(node.props.children as ReactNode)]
      : []
  );
}

function text(tree: ReactNode): string {
  return Children.toArray(tree).map((node) =>
    isValidElement<Record<string, unknown>>(node)
      ? text(node.props.children as ReactNode)
      : String(node)
  ).join("");
}

// Invoke the real inspector's stateless handlers and rerender with the resulting
// parent draft. This covers edit behavior, not browser layout or focus.
function inspector(
  spotify: Partial<MusicSpotifyDraft> = {},
  errors: Record<string, string[]> = {}
) {
  let draft = {
    ...createFallbackMusicEditorSnapshot().draft,
    spotify: {
      releasesHeading: "LATEST RELEASES",
      artistUrl: ARTIST_URL,
      embedUrl: CUSTOM_PLAYER,
      ...spotify,
    },
  };
  const onSpotifyChange = vi.fn((patch: Partial<MusicSpotifyDraft>) => {
    draft = { ...draft, spotify: { ...draft.spotify, ...patch } };
  });
  const render = () => SpotifyInspector({ draft, errors, onSpotifyChange });
  const field = (label: string) => {
    const wrapper = nodes(render()).find((node) => node.props.label === label);
    const input = wrapper && nodes(wrapper.props.children as ReactNode)
      .find((node) => node.type === "input");
    if (!input) throw new Error(`Missing Spotify field: ${label}`);
    return input;
  };
  const button = () => {
    const found = nodes(render()).find((node) =>
      node.type === "button" && text(node.props.children as ReactNode) === "Use artist releases"
    );
    if (!found) throw new Error("Missing artist player shortcut");
    return found;
  };
  return {
    getDraft: () => draft.spotify,
    onSpotifyChange,
    render,
    field,
    button,
    change(label: string, value: string) {
      const input = field(label);
      (input.props.onChange as (event: { target: { value: string } }) => void)({ target: { value } });
    },
    useArtist() {
      const shortcut = button();
      if (shortcut.props.disabled) throw new Error("Artist shortcut is disabled");
      (shortcut.props.onClick as () => void)();
    },
  };
}

describe("Spotify inspector independent player selection", () => {
  it.each([CUSTOM_PLAYER, ""])(
    "preserves the selected player %j through incomplete and valid artist edits",
    (embedUrl) => {
      const editor = inspector({ embedUrl });
      for (const artistUrl of ["", "https://open.spotify.com/art", "https://open.spotify.com/artist/ArtistB"]) {
        editor.change("Spotify artist URL", artistUrl);
        expect(editor.getDraft()).toMatchObject({ artistUrl, embedUrl });
        expect(editor.onSpotifyChange).toHaveBeenLastCalledWith({ artistUrl });
        expect(editor.field("Spotify player link").props.value).toBe(embedUrl);
      }
    }
  );

  it("does not create a player when an initially empty profile is filled in", () => {
    const editor = inspector({ artistUrl: "", embedUrl: "" });
    editor.change("Spotify artist URL", ARTIST_URL);
    expect(editor.getDraft()).toMatchObject({ artistUrl: ARTIST_URL, embedUrl: "" });
    expect(editor.button().props.disabled).toBe(false);
  });

  it.each([CUSTOM_PLAYER, ""])("keeps player %j when only the heading changes", (embedUrl) => {
    const editor = inspector({ embedUrl });
    editor.change("Section heading", "SELECTED RELEASES");
    expect(editor.onSpotifyChange).toHaveBeenLastCalledWith({ releasesHeading: "SELECTED RELEASES" });
    expect(editor.getDraft()).toEqual({
      releasesHeading: "SELECTED RELEASES",
      artistUrl: ARTIST_URL,
      embedUrl,
    });
  });

  it("retains ordinary player input while typing without changing the artist profile", () => {
    const editor = inspector();
    for (const embedUrl of ["https://open.spotify.com/pl", "https://open.spotify.com/playlist/LatestMix?si=shareToken", ""]) {
      editor.change("Spotify player link", embedUrl);
      expect(editor.onSpotifyChange).toHaveBeenLastCalledWith({ embedUrl });
      expect(editor.getDraft()).toMatchObject({ artistUrl: ARTIST_URL, embedUrl });
      expect(editor.field("Spotify player link").props.value).toBe(embedUrl);
    }
  });

  it.each([CUSTOM_PLAYER, ""])("replaces player %j only after the explicit artist shortcut", (embedUrl) => {
    const editor = inspector({ embedUrl });
    expect(editor.button().props.type).toBe("button");
    expect(editor.button().props.disabled).toBe(false);
    editor.useArtist();
    expect(editor.onSpotifyChange).toHaveBeenCalledExactlyOnceWith({ embedUrl: ARTIST_PLAYER });
    expect(editor.getDraft()).toMatchObject({ artistUrl: ARTIST_URL, embedUrl: ARTIST_PLAYER });
    expect(editor.button().props.disabled).toBe(true);
  });

  it.each([
    "",
    "https://open.spotify.com/art",
    "https://example.com/artist/ArtistA",
    "https://open.spotify.com/playlist/NotAnArtist",
    "https://open.spotify.com/embed/artist/ArtistA",
  ])("disables the artist shortcut for an invalid profile: %s", (artistUrl) => {
    const editor = inspector({ artistUrl });
    expect(editor.button().props.disabled).toBe(true);
    expect(editor.getDraft().embedUrl).toBe(CUSTOM_PLAYER);
    expect(editor.onSpotifyChange).not.toHaveBeenCalled();
  });

  it("places a player validation message beside the player field, not the artist field", () => {
    const editor = inspector({}, { embedUrl: ["Choose a valid Spotify player link."] });
    const markup = renderToStaticMarkup(editor.render());
    const labels = markup.match(/<label\b[^>]*>[\s\S]*?<\/label>/g) || [];
    const artistLabel = labels.find((label) => label.includes("Spotify artist URL"));
    const playerLabel = labels.find((label) => label.includes("Spotify player link"));
    expect(artistLabel).toBeDefined();
    expect(playerLabel).toBeDefined();
    expect(playerLabel).toContain('role="alert"');
    expect(playerLabel).toContain("Choose a valid Spotify player link.");
    expect(artistLabel).not.toContain('role="alert"');
    expect(artistLabel).not.toContain("Choose a valid Spotify player link.");
  });
});
