import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MusicEditor from "@/components/admin/v2/MusicEditor";
import { createFallbackMusicEditorSnapshot, INITIAL_MUSIC_SAVE_STATE, type MusicEditorSnapshot, type MusicSaveState } from "@/lib/admin/music-editor";

const mocks = vi.hoisted(() => ({
  values: [] as unknown[], cursor: 0, pending: false, saveState: undefined as unknown,
  action: undefined as unknown, save: vi.fn(), mutate: vi.fn(),
  markDirty: vi.fn(), clearDirty: vi.fn(), confirmDiscard: vi.fn(),
}));
vi.mock("react", async original => {
  const react = await original<typeof import("react")>();
  function state(initial: unknown) {
    const index = mocks.cursor++;
    if (!(index in mocks.values)) mocks.values[index] = typeof initial === "function" ? initial() : initial;
    return [mocks.values[index], (next: unknown) => { mocks.values[index] = typeof next === "function" ? next(mocks.values[index]) : next; }];
  }
  return { ...react, useState: state, useRef: (initial: unknown) => state({ current: initial })[0],
    useMemo: (read: () => unknown) => read(), useCallback: (callback: unknown) => callback, useEffect: () => {},
    useActionState: (action: unknown, initial: unknown) => { mocks.action = action; return [mocks.saveState || initial, action, mocks.pending]; },
  };
});
vi.mock("@/app/admin/v2/pages/music/actions", () => ({ saveMusicSectionV2: mocks.save }));
vi.mock("@/app/admin/v2/pages/music/archive-actions", () => ({ mutateMusicContentArchive: mocks.mutate, loadMusicContentArchivePage: vi.fn() }));
vi.mock("@/components/admin/useUnsavedChangesGuard", () => ({ default: () => ({ markDirty: mocks.markDirty, clearDirty: mocks.clearDirty, confirmDiscard: mocks.confirmDiscard, hasUnsavedChanges: false }) }));
vi.mock("@/components/admin/v2/MusicPreviewFrame", () => ({ default: () => null }));
vi.mock("@/components/admin/MediaAssetPicker", () => ({ default: () => null }));

type Element = ReactElement<Record<string, unknown>>;
type Props = Parameters<typeof MusicEditor>[0];
const expand = new Set(["Field", "MoveButtons", "VisibilityToggle", "InspectorFields", "InspectorHeader", "HeroInspector", "SpotifyInspector", "PlatformsInspector", "SoundcloudInspector", "MusicContentArchivePanel"]);
const version = "2026-10-11T10:00:00.000001Z";
const nextVersion = "2026-10-11T10:00:01.000002Z";
const soundcloudUrl = "https://soundcloud.com/example/evening-set";
const spotifyUrl = "https://open.spotify.com/track/TrackOne";
const spotifyCanonical = "https://open.spotify.com/embed/track/TrackOne";
const soundcloud = { id: "evening", title: "Evening set", embedUrl: soundcloudUrl, isPublished: true };
const spotify = { id: "release", title: "New release", embedUrl: "https://open.spotify.com/embed/album/AlbumOne", isPublished: true };
const emptyArchive = { available: true, page: { items: [], total: 0, offset: 0 } };
let snapshot: MusicEditorSnapshot;
let overrides: Partial<Props>;

function nodes(tree: ReactNode): Element[] {
  return Children.toArray(tree).flatMap(node => {
    if (!isValidElement<Record<string, unknown>>(node)) return [];
    const component = node.type;
    const children = typeof component === "function" && expand.has(component.name)
      ? (component as (props: Record<string, unknown>) => ReactNode)(node.props) : node.props.children as ReactNode;
    return [node, ...nodes(children)];
  });
}
function text(tree: ReactNode): string {
  return Children.toArray(tree).map(node => {
    if (!isValidElement<Record<string, unknown>>(node)) return String(node);
    const component = node.type;
    return text(typeof component === "function" && expand.has(component.name)
      ? (component as (props: Record<string, unknown>) => ReactNode)(node.props) : node.props.children as ReactNode);
  }).join("");
}
function render() { mocks.cursor = 0; return MusicEditor({ snapshot, assets: [], disabled: false, migrationRequired: false, archiveData: { platforms: emptyArchive, soundcloud: emptyArchive }, ...overrides }); }
function find(test: (node: Element) => boolean) { const found = nodes(render()).find(test); if (!found) throw new Error("Control not found"); return found; }
function button(name: string) { return find(node => node.type === "button" && (node.props["aria-label"] === name || text(node.props.children as ReactNode).trim() === name)); }
function click(node: Element) { return (node.props.onClick as () => void | Promise<void>)(); }
function selectTracks() { click(button("Tracks & mixes")); }
function control(label: string, index = 0) {
  const wrapper = nodes(render()).filter(node => typeof node.type === "function" && node.type.name === "Field" && node.props.label === label)[index];
  const found = wrapper && nodes(wrapper.props.children as ReactNode).find(node => ["input", "select", "textarea"].includes(String(node.type)));
  if (!found) throw new Error(`Missing field: ${label}`); return found;
}
function change(node: Element, value: string) { (node.props.onChange as (event: unknown) => void)({ target: { value } }); }
function provider(title: string) { return find(node => node.type === "select" && node.props["aria-label"] === `Platform for ${title}`); }
function payload(name = "payload") { return JSON.parse(find(node => node.type === "input" && node.props.name === name).props.value as string); }
function form() { const fields = new FormData(); fields.set("section", "soundcloud"); fields.set("payload", JSON.stringify(payload())); fields.set("versions", JSON.stringify(payload("versions"))); return fields; }
async function save() { const fields = form(); const result = await (mocks.action as (previous: MusicSaveState, fields: FormData) => Promise<MusicSaveState>)(INITIAL_MUSIC_SAVE_STATE, fields); mocks.saveState = result; return result; }

beforeEach(() => {
  vi.clearAllMocks(); mocks.values = []; mocks.cursor = 0; mocks.pending = false; mocks.saveState = undefined; overrides = {};
  snapshot = createFallbackMusicEditorSnapshot();
  snapshot.draft.soundcloud = { mixesHeading: "TRACKS & MIXES", items: [soundcloud, spotify] };
  snapshot.versions.soundcloud = { presentationUpdatedAt: version, items: { evening: version, release: version } };
  vi.stubGlobal("window", { matchMedia: () => ({ matches: true }), location: { reload: vi.fn() } });
});
afterEach(() => vi.unstubAllGlobals());

describe("Tracks & mixes provider editor", () => {
  it("infers both saved platforms without changing the independent main Spotify player", () => {
    selectTracks();
    expect(provider("Evening set").props.value).toBe("soundcloud");
    expect(provider("New release").props.value).toBe("spotify");
    expect(payload().items).toEqual([soundcloud, spotify]);
    expect(button("Save Tracks & mixes").props.disabled).toBe(true);
    click(button("Spotify")); expect(payload()).toEqual(snapshot.draft.spotify);
    expect(nodes(render()).filter(node => node.type === "form")).toHaveLength(1);
  });
  it("retains each platform URL across switches and reordering by stable item ID", () => {
    selectTracks(); change(provider("Evening set"), "spotify");
    expect(payload().items[0].embedUrl).toBe(""); expect(button("Save Tracks & mixes").props.disabled).toBe(true);
    change(control("Spotify track, album or playlist URL"), spotifyUrl);
    click(button("Move Evening set down"));
    change(provider("Evening set"), "soundcloud");
    expect(payload().items[1]).toEqual(soundcloud);
    change(provider("Evening set"), "spotify");
    expect(payload().items[1].embedUrl).toBe(spotifyUrl);
    expect(payload().items[0]).toEqual(spotify);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("keeps a chosen provider while typing invalid or empty input and detects valid pasted URLs", () => {
    selectTracks(); change(provider("Evening set"), "spotify");
    change(control("Spotify track, album or playlist URL"), "https://open.spotify.com/tr");
    expect(provider("Evening set").props.value).toBe("spotify"); expect(button("Save Tracks & mixes").props.disabled).toBe(true);
    change(provider("Evening set"), "soundcloud"); expect(payload().items[0].embedUrl).toBe(soundcloudUrl);
    change(provider("Evening set"), "spotify"); expect(payload().items[0].embedUrl).toBe("https://open.spotify.com/tr");
    change(control("Spotify track, album or playlist URL"), "https://soundcloud.com/example/another");
    expect(provider("Evening set").props.value).toBe("soundcloud");
    expect(control("SoundCloud track URL").props.value).toBe("https://soundcloud.com/example/another");
  });
  it("lets a new empty item choose Spotify without adding persisted provider fields", () => {
    selectTracks(); click(button("Add"));
    change(provider("track 3"), "spotify");
    expect(provider("track 3").props.value).toBe("spotify");
    expect(Object.keys(payload().items[2]).sort()).toEqual(["embedUrl", "id", "isPublished", "title"]);
    expect(button("Save Tracks & mixes").props.disabled).toBe(true);
    change(control("Spotify track, album or playlist URL", 1), spotifyUrl);
    expect(button("Save Tracks & mixes").props.disabled).toBe(false);
    click(button("Discard new track 3")); expect(payload().items).toEqual([soundcloud, spotify]);
  });
  it("discards provider drafts while preserving another section's changes", () => {
    change(control("Main title (optional)"), "Keep this Hero title");
    selectTracks(); change(provider("Evening set"), "spotify"); change(control("Spotify track, album or playlist URL"), spotifyUrl);
    click(button("Discard changes in Tracks & mixes"));
    expect(payload().items).toEqual([soundcloud, spotify]); expect(provider("Evening set").props.value).toBe("soundcloud");
    change(provider("Evening set"), "spotify"); expect(payload().items[0].embedUrl).toBe("");
    click(button("Hero")); expect(payload().title).toBe("Keep this Hero title"); expect(button("Save Hero").props.disabled).toBe(false);
  });
  it("adopts canonical saved URLs and clears alternate draft links after save and reload", async () => {
    selectTracks(); change(provider("Evening set"), "spotify"); change(control("Spotify track, album or playlist URL"), spotifyUrl);
    const canonical = { ...payload(), items: [{ ...soundcloud, embedUrl: spotifyCanonical }, spotify] };
    mocks.save.mockResolvedValue({ status: "saved", eventId: "save", message: "Saved", section: "soundcloud", canonicalSection: canonical, versions: { presentationUpdatedAt: nextVersion, items: { evening: nextVersion, release: nextVersion } } });
    await save(); expect(payload()).toEqual(canonical); expect(provider("Evening set").props.value).toBe("spotify");
    expect(button("Save Tracks & mixes").props.disabled).toBe(true);
    change(provider("Evening set"), "soundcloud"); expect(payload().items[0].embedUrl).toBe("");
    change(provider("Evening set"), "spotify"); expect(payload().items[0].embedUrl).toBe(spotifyCanonical);
    snapshot = { ...snapshot, draft: { ...snapshot.draft, soundcloud: canonical } }; mocks.values = []; mocks.saveState = undefined;
    selectTracks(); expect(provider("Evening set").props.value).toBe("spotify"); expect(payload()).toEqual(canonical);
  });
  it("clears stale alternate links after archive and derives restored Spotify platform", async () => {
    selectTracks(); change(provider("Evening set"), "spotify"); change(control("Spotify track, album or playlist URL"), spotifyUrl);
    change(provider("Evening set"), "soundcloud");
    const archived = { id: soundcloud.id, label: soundcloud.title, platform: "soundcloud", archivedAt: version, updatedAt: version };
    mocks.mutate.mockResolvedValueOnce({ ok: true, message: "Archived", section: "soundcloud", canonicalSection: { mixesHeading: "TRACKS & MIXES", items: [spotify] }, versions: { presentationUpdatedAt: nextVersion, items: { release: nextVersion } }, archive: { items: [archived], total: 1, offset: 0 } });
    click(button("Archive Evening set")); await click(button("Confirm archive"));
    const restored = { ...soundcloud, embedUrl: spotifyCanonical, isPublished: false };
    mocks.mutate.mockResolvedValueOnce({ ok: true, message: "Restored", section: "soundcloud", canonicalSection: { mixesHeading: "TRACKS & MIXES", items: [spotify, restored] }, versions: { presentationUpdatedAt: nextVersion, items: { release: nextVersion, evening: nextVersion } }, archive: emptyArchive.page });
    await click(button("Restore Evening set as hidden"));
    expect(provider("Evening set").props.value).toBe("spotify"); expect(payload().items[1]).toEqual(restored);
    change(provider("Evening set"), "soundcloud"); expect(payload().items[1].embedUrl).toBe("");
  });
  it("retains the chosen link after a conflict and blocks subsequent provider changes", async () => {
    selectTracks(); change(provider("Evening set"), "spotify"); change(control("Spotify track, album or playlist URL"), spotifyUrl);
    mocks.save.mockResolvedValue({ status: "conflict", eventId: "conflict", message: "Reload required", section: "soundcloud" });
    await save(); expect(payload().items[0].embedUrl).toBe(spotifyUrl);
    change(provider("Evening set"), "soundcloud"); expect(payload().items[0].embedUrl).toBe(spotifyUrl);
    expect(button("Save Tracks & mixes").props.disabled).toBe(true);
  });
});
