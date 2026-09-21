import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import MusicEditor from "@/components/admin/v2/MusicEditor";
import { createFallbackMusicEditorSnapshot, INITIAL_MUSIC_SAVE_STATE, type MusicEditorSnapshot } from "@/lib/admin/music-editor";
import type { ArchiveData, ArchiveItem } from "@/lib/admin/content-archive-editor";

// Deterministic handler tests. DOM layout is exercised separately in the browser.
const mocks = vi.hoisted(() => ({
  values: [] as unknown[], cursor: 0, pending: false, saveState: undefined as unknown,
  saveAction: undefined as unknown, mutate: vi.fn(), loadPage: vi.fn(), save: vi.fn(),
  clearDirty: vi.fn(), markDirty: vi.fn(), confirmDiscard: vi.fn(),
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
    useActionState: (action: unknown, initial: unknown) => { mocks.saveAction = action; return [mocks.saveState || initial, action, mocks.pending]; },
  };
});
vi.mock("@/app/admin/v2/pages/music/archive-actions", () => ({ mutateMusicContentArchive: mocks.mutate, loadMusicContentArchivePage: mocks.loadPage }));
vi.mock("@/app/admin/v2/pages/music/actions", () => ({ saveMusicSectionV2: mocks.save }));
vi.mock("@/components/admin/useUnsavedChangesGuard", () => ({ default: () => ({ clearDirty: mocks.clearDirty, markDirty: mocks.markDirty, confirmDiscard: mocks.confirmDiscard, hasUnsavedChanges: false }) }));
vi.mock("@/components/admin/v2/MusicPreviewFrame", () => ({ default: () => null }));
vi.mock("@/components/admin/MediaAssetPicker", () => ({ default: () => null }));

const version = "2026-09-21T10:00:00.000001Z";
const restoredVersion = "2026-09-21T10:01:00.000002Z";
const platform = { id: "spotify", title: "Spotify", label: "Listen", href: "https://open.spotify.com/artist/example", imageSrc: "/images/spotify.webp", iconKey: "spotify", isPublished: true };
const track = { id: "late-night", title: "Late night", embedUrl: "https://api.soundcloud.com/tracks/1234567890", isPublished: true };
const archivedPlatform: ArchiveItem = { id: platform.id, label: platform.title, platform: "spotify", archivedAt: version, updatedAt: version };
const archivedTrack: ArchiveItem = { ...archivedPlatform, id: track.id, label: track.title, platform: "soundcloud" };
const empty: ArchiveData = { available: true, page: { items: [], total: 0, offset: 0 } };
let snapshot: MusicEditorSnapshot;
let overrides: Partial<Parameters<typeof MusicEditor>[0]>;
type Element = ReactElement<Record<string, unknown>>;
const expand = new Set(["Field", "MoveButtons", "VisibilityToggle", "InspectorFields", "InspectorHeader", "HeroInspector", "SpotifyInspector", "PlatformsInspector", "SoundcloudInspector", "MusicContentArchivePanel"]);
function nodes(tree: ReactNode): Element[] {
  return Children.toArray(tree).flatMap(node => {
    if (!isValidElement<Record<string, unknown>>(node)) return [];
    const component = node.type;
    const children = typeof component === "function" && expand.has(component.name)
      ? (component as (props: Record<string, unknown>) => ReactNode)(node.props)
      : node.props.children as ReactNode;
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
function render() {
  mocks.cursor = 0;
  return MusicEditor({ snapshot, assets: [], disabled: false, migrationRequired: false, archiveData: { platforms: empty, soundcloud: empty }, ...overrides });
}
function button(label: string) {
  const node = nodes(render()).find(node => node.type === "button" && (node.props["aria-label"] === label || text(node.props.children as ReactNode).trim() === label));
  if (!node) throw new Error(`Missing button: ${label}`);
  return node;
}
function click(node: Element) { return (node.props.onClick as () => void | Promise<void>)(); }
function select(section: "Hero" | "Platforms" | "Spotify" | "SoundCloud") { click(button(section)); }
function field(label: string, value: string) {
  const node = nodes(render()).find(node => node.type === "label" && text(node.props.children as ReactNode).startsWith(label))!;
  const input = nodes(node.props.children as ReactNode).find(child => child.type === "input")!;
  (input.props.onChange as (event: unknown) => void)({ target: { value } });
}
function payload(name = "payload") { return JSON.parse(nodes(render()).find(node => node.type === "input" && node.props.name === name)!.props.value as string); }
function success(section: "platforms" | "soundcloud" = "platforms") {
  return { ok: true, message: "Item archived.", section,
    canonicalSection: section === "platforms" ? { items: [] } : { mixesHeading: snapshot.draft.soundcloud.mixesHeading, items: [] },
    versions: section === "platforms" ? { items: {} } : { presentationUpdatedAt: version, items: {} },
    archive: { items: [section === "platforms" ? archivedPlatform : archivedTrack], total: 1, offset: 0 },
  };
}
async function archivePlatform() { select("Platforms"); click(button("Archive Spotify")); await click(button("Confirm archive")); }

beforeEach(() => {
  vi.clearAllMocks(); mocks.values = []; mocks.cursor = 0; mocks.pending = false;
  mocks.saveState = undefined; mocks.saveAction = undefined; overrides = {};
  snapshot = createFallbackMusicEditorSnapshot();
  snapshot.draft.platforms = { items: [platform] };
  snapshot.draft.soundcloud = { mixesHeading: "LATEST MIXES", items: [track] };
  snapshot.versions.platforms = { items: { spotify: version } };
  snapshot.versions.soundcloud = { presentationUpdatedAt: version, items: { "late-night": version } };
  snapshot.versions.spotify = { settingsUpdatedAt: version, presentationUpdatedAt: version };
  mocks.mutate.mockResolvedValue(success()); mocks.loadPage.mockResolvedValue(empty);
  mocks.confirmDiscard.mockReturnValue(false);
  vi.stubGlobal("window", { matchMedia: () => ({ matches: true }), location: { reload: vi.fn() } });
});
afterEach(() => vi.unstubAllGlobals());

describe("Music archive inspector", () => {
  it("keeps normal Music editing available when only migration 0042 is missing", () => {
    overrides.archiveData = { platforms: { ...empty, available: false, message: "Apply migration 0042." }, soundcloud: empty };
    select("Platforms");
    expect(text(render())).toContain("Apply migration 0042");
    expect(button("Archive Spotify").props.disabled).toBe(true);
    field("Title", "My Spotify");
    expect(button("Save Platforms").props.disabled).toBe(false);
    expect(nodes(render()).find(node => node.type === "fieldset")?.props.disabled).toBe(false);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("supports older callers and offers no permanent deletion", () => {
    overrides.archiveData = undefined; select("Platforms");
    expect(text(render())).toContain("Regular Music editing still works");
    expect(text(render())).not.toMatch(/Permanently delete|Purge/);
    expect(nodes(render()).filter(node => node.type === "form")).toHaveLength(1);
  });

  it("requires explicit confirmation and explains the immediate effect and preserved media", () => {
    select("Platforms"); click(button("Archive Spotify"));
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(text(render())).toContain("immediately removes the item from the public Music page");
    expect(text(render())).toContain("No Media files are deleted");
    click(button("Cancel archive"));
    expect(text(render())).not.toContain("Archive Spotify?");
  });

  it("blocks archive and restore while the collection or SoundCloud heading is dirty", () => {
    select("SoundCloud"); click(button("Archive Late night")); field("Section heading", "Unpublished heading");
    expect(button("Archive Late night").props.disabled).toBe(true);
    expect(button("Confirm archive").props.disabled).toBe(true);
    click(button("Confirm archive")); expect(mocks.mutate).not.toHaveBeenCalled();
    expect(text(render())).toContain("Save or discard SoundCloud changes");
    expect(payload().mixesHeading).toBe("Unpublished heading");
    click(button("Discard changes in SoundCloud"));
    expect(button("Archive Late night").props.disabled).toBe(false);
  });

  it.each(["disabled", "migrationRequired", "loadError", "pending", "conflict"])("blocks archive during %s", mode => {
    if (mode === "disabled") overrides.disabled = true;
    if (mode === "migrationRequired") overrides.migrationRequired = true;
    if (mode === "loadError") overrides.loadError = "Unavailable";
    select("Platforms");
    if (mode === "pending") mocks.pending = true;
    if (mode === "conflict") mocks.saveState = { ...INITIAL_MUSIC_SAVE_STATE, status: "conflict" };
    expect(button("Archive Spotify").props.disabled).toBe(true);
    click(button("Archive Spotify")); expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("keeps discard local for a new unsaved item", () => {
    select("Platforms"); click(button("Add"));
    expect(button("Discard new platform 2").props.type).toBe("button");
    expect(nodes(render()).some(node => node.props["aria-label"] === "Archive Untitled platform")).toBe(false);
    click(button("Discard new platform 2"));
    expect(payload().items).toEqual([platform]);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
});

describe("Music archive canonical adoption", () => {
  it("adopts only the archived section and preserves another section's dirty draft", async () => {
    field("Main title", "Keep my Hero draft");
    await archivePlatform();
    expect(mocks.mutate).toHaveBeenCalledWith({ section: "platforms", operation: "archive", itemId: "spotify", expectedVersions: { items: { spotify: version } } });
    expect(payload()).toEqual({ items: [] });
    expect(payload("versions")).toEqual({ items: {} });
    expect(text(render())).toContain("0/32 active slots · 1 archived");
    expect(button("Save Platforms").props.disabled).toBe(true);
    select("Hero"); expect(payload().title).toBe("Keep my Hero draft");
    expect(button("Save Hero").props.disabled).toBe(false);
    expect(mocks.clearDirty).not.toHaveBeenCalled();
  });

  it("archives SoundCloud without overwriting a Spotify draft or its settings version", async () => {
    select("Spotify"); field("Section heading", "My Spotify heading"); select("SoundCloud");
    mocks.mutate.mockResolvedValue(success("soundcloud"));
    click(button("Archive Late night")); await click(button("Confirm archive"));
    expect(mocks.mutate).toHaveBeenCalledWith({ section: "soundcloud", operation: "archive", itemId: "late-night", expectedVersions: { presentationUpdatedAt: version, items: { "late-night": version } } });
    expect(payload().items).toEqual([]);
    select("Spotify"); expect(payload().releasesHeading).toBe("My Spotify heading");
    expect(payload("versions")).toEqual({ settingsUpdatedAt: version, presentationUpdatedAt: version });
    expect(button("Save Spotify").props.disabled).toBe(false);
  });

  it("restores a legacy incomplete platform as hidden without making it a dirty draft", async () => {
    snapshot.draft.platforms.items = []; snapshot.versions.platforms.items = {};
    overrides.archiveData = { platforms: { available: true, page: { items: [archivedPlatform], total: 1, offset: 0 } }, soundcloud: empty };
    const restored = { ...platform, imageSrc: "", isPublished: false };
    mocks.mutate.mockResolvedValue({ ok: true, message: "Restored as hidden.", section: "platforms", canonicalSection: { items: [restored] }, versions: { items: { spotify: restoredVersion } }, archive: empty.page });
    select("Platforms"); await click(button("Restore Spotify as hidden"));
    expect(mocks.mutate).toHaveBeenCalledWith({ section: "platforms", operation: "restore", itemId: "spotify", expectedVersions: { items: {} }, expectedArchiveUpdatedAt: version });
    expect(payload().items).toEqual([restored]);
    expect(payload("versions")).toEqual({ items: { spotify: restoredVersion } });
    expect(text(render())).toContain("1/32 active slots · 0 archived");
    expect(button("Archive Spotify").props.disabled).toBe(false);
    expect(button("Save Platforms").props.disabled).toBe(true);
  });

  it.each(["platforms", "soundcloud"] as const)("respects %s capacity but still allows archiving", async section => {
    const limit = section === "platforms" ? 32 : 48;
    const entries = Array.from({ length: limit }, (_, i) => section === "platforms" ? { ...platform, id: `item-${i}`, title: `Item ${i}` } : { ...track, id: `item-${i}`, title: `Item ${i}` });
    if (section === "platforms") snapshot.draft.platforms.items = entries as typeof platform[];
    else snapshot.draft.soundcloud.items = entries as typeof track[];
    snapshot.versions[section].items = Object.fromEntries(entries.map(item => [item.id, version]));
    overrides.archiveData = { platforms: empty, soundcloud: empty, [section]: { available: true, page: { items: [archivedPlatform], total: 1, offset: 0 } } };
    select(section === "platforms" ? "Platforms" : "SoundCloud");
    expect(button("Restore Spotify as hidden").props.disabled).toBe(true);
    await click(button("Restore Spotify as hidden")); expect(mocks.mutate).not.toHaveBeenCalled();
    expect(button("Archive Item 0").props.disabled).toBe(false);
    expect(button("Add").props.disabled).toBe(true);
  });

  it("locks ordinary saves and duplicate operations while a mutation is pending", async () => {
    let finish!: (result: unknown) => void;
    mocks.mutate.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    select("Platforms"); click(button("Archive Spotify"));
    const confirm = button("Confirm archive"); const first = click(confirm); await click(confirm);
    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    expect(nodes(render()).find(node => node.type === "fieldset")?.props.disabled).toBe(true);
    expect(button("Save Platforms").props.disabled).toBe(true);
    await (mocks.saveAction as (state: unknown, form: FormData) => Promise<unknown>)(INITIAL_MUSIC_SAVE_STATE, new FormData());
    expect(mocks.save).not.toHaveBeenCalled();
    finish(success()); await first;
    expect(nodes(render()).find(node => node.type === "fieldset")?.props.disabled).toBe(false);
  });

  it.each(["transport", "wrong-section", "bad-cas", "wrong-page", "still-active"])("preserves drafts and locks all writes after %s", async mode => {
    field("Main title", "Keep draft during recovery");
    if (mode === "transport") mocks.mutate.mockRejectedValue(new Error("private diagnostic"));
    if (mode === "wrong-section") mocks.mutate.mockResolvedValue({ ...success(), section: "soundcloud" });
    if (mode === "bad-cas") mocks.mutate.mockResolvedValue({ ...success(), versions: { items: { spotify: version } } });
    if (mode === "wrong-page") mocks.mutate.mockResolvedValue({ ...success(), archive: { items: [], total: 0, offset: 20 } });
    if (mode === "still-active") mocks.mutate.mockResolvedValue({ ...success(), canonicalSection: { items: [platform] }, versions: { items: { spotify: version } } });
    await archivePlatform();
    expect(payload().items).toEqual([platform]);
    expect(text(render())).toContain("outcome could not be confirmed");
    expect(text(render())).not.toContain("private diagnostic");
    click(button("Reload saved Music page")); expect(mocks.confirmDiscard).toHaveBeenCalledOnce();
    expect(window.location.reload).not.toHaveBeenCalled();
    select("Hero"); expect(payload().title).toBe("Keep draft during recovery");
    expect(button("Save Hero").props.disabled).toBe(true);
    await (mocks.saveAction as (state: unknown, form: FormData) => Promise<unknown>)(INITIAL_MUSIC_SAVE_STATE, new FormData());
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it.each(["published", "also-archived"])("rejects an invalid restored result: %s", async mode => {
    snapshot.draft.platforms.items = []; snapshot.versions.platforms.items = {};
    overrides.archiveData = { platforms: { available: true, page: { items: [archivedPlatform], total: 1, offset: 0 } }, soundcloud: empty };
    mocks.mutate.mockResolvedValue({ ok: true, message: "Restored", section: "platforms", canonicalSection: { items: [{ ...platform, isPublished: mode === "published" }] }, versions: { items: { spotify: restoredVersion } }, archive: mode === "also-archived" ? overrides.archiveData.platforms.page : empty.page });
    select("Platforms"); await click(button("Restore Spotify as hidden"));
    expect(payload().items).toEqual([]); expect(text(render())).toContain("outcome could not be confirmed");
  });

  it("locks writes after conflict, but not after a confirmed no-write error", async () => {
    mocks.mutate.mockResolvedValue({ ok: false, message: "Unavailable; nothing changed." });
    await archivePlatform(); expect(button("Archive Spotify").props.disabled).toBe(false);
    mocks.mutate.mockResolvedValue({ ok: false, message: "Changed in another session.", reloadRequired: true });
    click(button("Archive Spotify")); await click(button("Confirm archive"));
    expect(button("Archive Spotify").props.disabled).toBe(true);
    expect(text(render())).toContain("Changed in another session");
  });

  it("keeps guarded recovery reachable inside the mobile modal", async () => {
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }), location: { reload: vi.fn() } });
    mocks.mutate.mockRejectedValue(new Error("network"));
    await archivePlatform();
    const dialog = nodes(render()).find(node => node.type === "dialog")!;
    const reload = nodes(dialog.props.children as ReactNode).find(node => node.type === "button" && text(node.props.children as ReactNode).trim() === "Reload saved Music page");
    expect(reload).toBeDefined();
    await click(reload!); expect(mocks.confirmDiscard).toHaveBeenCalledOnce();
    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it("blocks archive before React's pending state catches up with an ordinary save", async () => {
    select("Platforms"); click(button("Archive Spotify"));
    let finish!: (result: unknown) => void;
    mocks.save.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const form = new FormData(); form.set("section", "platforms");
    const saving = (mocks.saveAction as (state: unknown, form: FormData) => Promise<unknown>)(INITIAL_MUSIC_SAVE_STATE, form);
    await click(button("Confirm archive")); expect(mocks.mutate).not.toHaveBeenCalled();
    finish({ status: "saved", eventId: "save-first", message: "Saved", section: "platforms", canonicalSection: { items: [platform] }, versions: { items: { spotify: restoredVersion } } });
    await saving;
    expect(button("Archive Spotify").props.disabled).toBe(false);
    expect(payload("versions")).toEqual({ items: { spotify: restoredVersion } });
  });
});

describe("Music archive paging", () => {
  function firstPage() {
    overrides.archiveData = { soundcloud: empty, platforms: { available: true, page: { items: Array.from({ length: 20 }, (_, i) => ({ ...archivedPlatform, id: `archived-${i}`, label: `Archived ${i}` })), total: 21, offset: 0 } } };
  }
  it("reads only on request and preserves an unsaved active draft", async () => {
    firstPage(); select("Platforms"); render(); expect(mocks.loadPage).not.toHaveBeenCalled();
    field("Title", "Keep edit");
    mocks.loadPage.mockResolvedValue({ available: true, page: { items: [{ ...archivedPlatform, id: "last", label: "Last archived" }], total: 21, offset: 20 } });
    await click(button("Next archived Platforms"));
    expect(mocks.loadPage).toHaveBeenCalledWith("platforms", 20);
    expect(payload().items[0].title).toBe("Keep edit");
    expect(text(render())).toContain("Last archived");
    expect(button("Next archived Platforms").props.disabled).toBe(true);
  });

  it.each(["transport", "wrong-offset"])("keeps current archive page after %s without locking normal edits", async mode => {
    firstPage(); select("Platforms");
    if (mode === "transport") mocks.loadPage.mockRejectedValue(new Error("private"));
    else mocks.loadPage.mockResolvedValue(overrides.archiveData!.platforms);
    await click(button("Next archived Platforms"));
    expect(text(render())).toContain("current page has been kept");
    expect(text(render())).toContain("Archived 0");
    field("Title", "Still editable"); expect(button("Save Platforms").props.disabled).toBe(false);
  });

  it("allows an ordinary save while read-only pagination is pending", async () => {
    firstPage(); select("Platforms");
    let finish!: (result: unknown) => void;
    mocks.loadPage.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const reading = click(button("Next archived Platforms"));
    field("Title", "Saved during read"); expect(button("Save Platforms").props.disabled).toBe(false);
    mocks.save.mockResolvedValue({ status: "saved", eventId: "save-during-read", message: "Saved", section: "platforms", canonicalSection: { items: [{ ...platform, title: "Saved during read" }] }, versions: { items: { spotify: restoredVersion } } });
    const form = new FormData(); form.set("section", "platforms");
    await (mocks.saveAction as (state: unknown, form: FormData) => Promise<unknown>)(INITIAL_MUSIC_SAVE_STATE, form);
    expect(mocks.save).toHaveBeenCalledOnce();
    finish({ available: true, page: { items: [{ ...archivedPlatform, id: "last" }], total: 21, offset: 20 } }); await reading;
    expect(payload().items[0].title).toBe("Saved during read");
    expect(payload("versions")).toEqual({ items: { spotify: restoredVersion } });
    expect(button("Save Platforms").props.disabled).toBe(true);
  });
});
