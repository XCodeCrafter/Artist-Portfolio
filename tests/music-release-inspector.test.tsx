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

const PLAYLIST = "https://soundcloud.com/artist/sets/release";
const SPOTIFY = "https://open.spotify.com/playlist/Ab123";

type Element = ReactElement<Record<string, unknown>>;

function nodes(tree: ReactNode): Element[] {
  return Children.toArray(tree).flatMap(node =>
    isValidElement<Record<string, unknown>>(node)
      ? [node, ...nodes(node.props.children as ReactNode)]
      : []
  );
}

function inspector(initial: Partial<MusicSpotifyDraft> = {}, errors: Record<string, string[]> = {}) {
  let draft = {
    ...createFallbackMusicEditorSnapshot().draft,
    spotify: {
      releasesHeading: "SELECTED RELEASES",
      artistUrl: "https://open.spotify.com/artist/ArtistA",
      embedUrl: SPOTIFY,
      ...initial,
    },
  };
  const onSpotifyChange = vi.fn((patch: Partial<MusicSpotifyDraft>) => {
    draft = { ...draft, spotify: { ...draft.spotify, ...patch } };
  });
  const render = () => SpotifyInspector({ draft, errors, onSpotifyChange });
  const control = (label: string) => {
    const wrapper = nodes(render()).find(node => node.props.label === label);
    const input = wrapper && nodes(wrapper.props.children as ReactNode)
      .find(node => node.type === "input" || node.type === "select");
    if (!input) throw new Error(`Missing release control: ${label}`);
    return input;
  };
  return {
    render,
    control,
    onSpotifyChange,
    getDraft: () => draft.spotify,
    change(label: string, value: string) {
      (control(label).props.onChange as (event: { target: { value: string } }) => void)({
        target: { value },
      });
    },
  };
}

describe("Main Music releases provider selection", () => {
  it("defaults existing drafts to Spotify and displays only Spotify controls", () => {
    const editor = inspector();
    expect(editor.control("Release player").props.value).toBe("spotify");
    expect(editor.control("Spotify player link").props.value).toBe(SPOTIFY);
    expect(() => editor.control("SoundCloud playlist URL")).toThrow("Missing release control");
    expect(renderToStaticMarkup(editor.render())).toContain("SoundCloud playlist</option>");
  });

  it("keeps both saved URLs when switching providers repeatedly", () => {
    const editor = inspector({ provider: "spotify", soundcloudPlaylistUrl: PLAYLIST });
    editor.change("Release player", "soundcloud");
    expect(editor.onSpotifyChange).toHaveBeenLastCalledWith({ provider: "soundcloud" });
    expect(editor.control("SoundCloud playlist URL").props.value).toBe(PLAYLIST);
    expect(() => editor.control("Spotify player link")).toThrow("Missing release control");
    expect(() => editor.control("Spotify artist URL")).toThrow("Missing release control");
    const updated = "https://soundcloud.com/artist/sets/another?si=shared";
    editor.change("SoundCloud playlist URL", updated);
    editor.change("Release player", "spotify");
    expect(editor.control("Spotify player link").props.value).toBe(SPOTIFY);
    expect(editor.getDraft()).toMatchObject({
      provider: "spotify",
      embedUrl: SPOTIFY,
      soundcloudPlaylistUrl: updated,
    });
    editor.change("Release player", "soundcloud");
    expect(editor.control("SoundCloud playlist URL").props.value).toBe(updated);
  });

  it("retains incomplete and blank playlist edits without touching Spotify or the heading", () => {
    const editor = inspector({ provider: "soundcloud", soundcloudPlaylistUrl: PLAYLIST });
    for (const value of ["https://soundcloud.com/artist/set", ""]) {
      editor.change("SoundCloud playlist URL", value);
      expect(editor.onSpotifyChange).toHaveBeenLastCalledWith({ soundcloudPlaylistUrl: value });
      expect(editor.getDraft()).toMatchObject({
        releasesHeading: "SELECTED RELEASES",
        embedUrl: SPOTIFY,
        soundcloudPlaylistUrl: value,
      });
    }
    editor.change("Section heading", "ALBUMS");
    expect(editor.getDraft()).toMatchObject({
      releasesHeading: "ALBUMS",
      provider: "soundcloud",
      soundcloudPlaylistUrl: "",
    });
  });

  it("shows playlist errors on their field and explains playback limits", () => {
    const editor = inspector(
      { provider: "soundcloud" },
      { soundcloudPlaylistUrl: ["Choose a public SoundCloud playlist."] }
    );
    const html = renderToStaticMarkup(editor.render());
    const labels = html.match(/<label\b[^>]*>[\s\S]*?<\/label>/g) || [];
    const playlistField = labels.find(label => label.includes("SoundCloud playlist URL"));
    expect(playlistField).toContain('role="alert"');
    expect(playlistField).toContain("Choose a public SoundCloud playlist.");
    expect(html).toContain("not guaranteed");
    expect(html).toContain("never starts automatically");
    expect(html).not.toContain("<iframe");
  });

  it.each([
    ["spotify", "soundcloudPlaylistUrl", "stored SoundCloud link needs attention", "Select SoundCloud"],
    ["soundcloud", "embedUrl", "stored Spotify links need attention", "Select Spotify"],
    ["soundcloud", "artistUrl", "stored Spotify links need attention", "Select Spotify"],
  ] as const)("explains validation errors in the inactive provider (%s/%s)", (provider, field, message, action) => {
    const html = renderToStaticMarkup(inspector(
      { provider, soundcloudPlaylistUrl: PLAYLIST },
      { [field]: ["Fix this link."] }
    ).render());
    expect(html).toContain('role="alert"');
    expect(html).toContain(message);
    expect(html).toContain(action);
  });
});
