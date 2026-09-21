import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import GalleryEditor from "@/components/admin/v2/GalleryEditor";
import ShowreelEditor from "@/components/admin/v2/ShowreelEditor";
import { createFallbackGalleryEditorSnapshot, INITIAL_GALLERY_SAVE_STATE, type GalleryEditorSnapshot } from "@/lib/admin/gallery-editor";
import { createFallbackShowreelEditorSnapshot, INITIAL_SHOWREEL_SAVE_STATE, type ShowreelEditorSnapshot, type ShowreelWorkEditorItem } from "@/lib/admin/showreel-editor";
import type { VisualArchiveData } from "@/lib/admin/visual-content-archive-editor";

// Deterministic event-handler coverage; live browser QA verifies actual layout.
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
    useId: () => "field-id", useMemo: (read: () => unknown) => read(), useCallback: (callback: unknown) => callback, useEffect: () => {},
    useActionState: (action: unknown, initial: unknown) => { mocks.saveAction = action; return [mocks.saveState || initial, action, mocks.pending]; },
  };
});
vi.mock("@/app/admin/v2/content-archive-actions", () => ({ mutateVisualContentArchive: mocks.mutate, loadVisualContentArchivePage: mocks.loadPage }));
vi.mock("@/app/admin/v2/pages/gallery/actions", () => ({ saveGallerySectionV2: mocks.save }));
vi.mock("@/app/admin/v2/pages/showreel/actions", () => ({ saveShowreelSectionV2: mocks.save }));
vi.mock("@/components/admin/useUnsavedChangesGuard", () => ({ default: () => ({ clearDirty: mocks.clearDirty, markDirty: mocks.markDirty, confirmDiscard: mocks.confirmDiscard, hasUnsavedChanges: false }) }));
vi.mock("@/components/admin/v2/GalleryPreviewFrame", () => ({ default: () => null }));
vi.mock("@/components/admin/v2/ShowreelPreviewFrame", () => ({ default: () => null }));
vi.mock("@/components/admin/MediaAssetPicker", () => ({ default: () => null }));

const version = "2026-09-21T10:00:00.000001Z";
const restoredVersion = "2026-09-21T10:01:00.000002Z";
const frame = { id: "gallery-one", title: "First frame", src: "/images/portrait.webp", alt: "Portrait", caption: "Caption", category: "Portrait", isMosaic: true, isPublished: true };
const work: ShowreelWorkEditorItem = { id: "video-one", title: "First video", description: "Film", embedUrl: "https://www.youtube.com/embed/abcdefghijk", platform: "youtube", thumbnailSrc: "/images/portrait.webp", videoType: "music_video", isFeatured: false, isPublished: true };
type Item = typeof frame | typeof work;
type Element = ReactElement<Record<string, unknown>>;
const expand = new Set(["Field", "InspectorFields", "InspectorHeader", "HeroInspector", "IntroductionInspector", "FramesInspector", "WorksInspector", "FrameCard", "WorkCard", "VisualContentArchivePanel"]);
function expandComponent(component: { name: string }, props: Record<string, unknown>) {
  // Large-capacity fixtures still reach the real editor, payload and archive
  // panel. Expanding 120 identical field sets adds no handler coverage here.
  return expand.has(component.name) && (!(component.name === "FrameCard" || component.name === "WorkCard") || Number(props.index) < 2);
}
function nodes(tree: ReactNode): Element[] {
  return Children.toArray(tree).flatMap(node => {
    if (!isValidElement<Record<string, unknown>>(node)) return [];
    const component = node.type;
    const children = typeof component === "function" && expandComponent(component, node.props)
      ? (component as (props: Record<string, unknown>) => ReactNode)(node.props) : node.props.children as ReactNode;
    return [node, ...nodes(children)];
  });
}
function text(tree: ReactNode): string {
  return Children.toArray(tree).map(node => {
    if (!isValidElement<Record<string, unknown>>(node)) return String(node);
    const component = node.type;
    return text(typeof component === "function" && expandComponent(component, node.props)
      ? (component as (props: Record<string, unknown>) => ReactNode)(node.props) : node.props.children as ReactNode);
  }).join("");
}
function click(node: Element) { return (node.props.onClick as () => void | Promise<void>)(); }

describe.each(["gallery", "showreel"] as const)("%s archive UI", collection => {
  const gallery = collection === "gallery";
  const label = gallery ? "Gallery" : "Showreel";
  const section = gallery ? "frames" : "works";
  const sectionLabel = gallery ? "Frames" : "Videos";
  const initialSave = gallery ? INITIAL_GALLERY_SAVE_STATE : INITIAL_SHOWREEL_SAVE_STATE;
  const item = gallery ? frame : work;
  const archived = { id: item.id, label: item.title, platform: gallery ? "image" : "music_video", archivedAt: version, updatedAt: version };
  const empty: VisualArchiveData = { available: true, page: { items: [], total: 0, offset: 0, activeLimit: 120 } };
  let snapshot: GalleryEditorSnapshot | ShowreelEditorSnapshot;
  let overrides: { archiveData?: VisualArchiveData; disabled?: boolean; migrationRequired?: boolean; loadError?: string };

  function setItems(items: Item[]) {
    if (gallery) {
      (snapshot as GalleryEditorSnapshot).draft.frames = { items: items as typeof frame[] };
      (snapshot as GalleryEditorSnapshot).versions.frames = { items: Object.fromEntries(items.map(item => [item.id, version])) };
    } else {
      (snapshot as ShowreelEditorSnapshot).draft.works = { items: items as typeof work[] };
      (snapshot as ShowreelEditorSnapshot).versions.works = { items: Object.fromEntries(items.map(item => [item.id, version])) };
    }
  }
  function render() {
    mocks.cursor = 0;
    const props = { assets: [], disabled: false, migrationRequired: false, archiveData: empty, ...overrides };
    return gallery ? GalleryEditor({ ...props, snapshot: snapshot as GalleryEditorSnapshot }) : ShowreelEditor({ ...props, snapshot: snapshot as ShowreelEditorSnapshot });
  }
  function button(label: string) {
    const node = nodes(render()).find(node => node.type === "button" && (node.props["aria-label"] === label || text(node.props.children as ReactNode).trim() === label));
    if (!node) throw new Error(`Missing button: ${label}`);
    return node;
  }
  function select(label = sectionLabel) { click(button(label)); }
  function field(label: string, value: string) {
    const node = nodes(render()).find(node => node.type === "label" && text(node.props.children as ReactNode).startsWith(label))!;
    const input = nodes(node.props.children as ReactNode).find(child => child.type === "input" || child.type === "textarea")!;
    (input.props.onChange as (event: unknown) => void)({ target: { value } });
  }
  function payload(name = "payload") { return JSON.parse(nodes(render()).find(node => node.type === "input" && node.props.name === name)!.props.value as string); }
  function success(items: Item[] = [], activeLimit = 120) {
    return { ok: true, message: "Item archived.", collection, section, canonicalSection: { items },
      versions: { items: Object.fromEntries(items.map(item => [item.id, restoredVersion])) },
      archive: { items: [archived], total: 1, offset: 0, activeLimit },
    };
  }
  async function archiveItem() { select(); click(button(`Archive ${item.title}`)); await click(button("Confirm archive")); }
  function archiveFixture(activeLimit = 120) {
    overrides.archiveData = { available: true, page: { items: [archived], total: 1, offset: 0, activeLimit } };
  }
  function firstPage() {
    overrides.archiveData = { available: true, page: { items: Array.from({ length: 20 }, (_, i) => ({ ...archived, id: `archived-${i}`, label: `Archived ${i}` })), total: 21, offset: 0, activeLimit: 120 } };
  }
  beforeEach(() => {
    vi.clearAllMocks(); mocks.values = []; mocks.cursor = 0; mocks.pending = false;
    mocks.saveState = undefined; mocks.saveAction = undefined; overrides = {};
    snapshot = gallery ? createFallbackGalleryEditorSnapshot() : createFallbackShowreelEditorSnapshot();
    setItems([item]); mocks.mutate.mockResolvedValue(success()); mocks.loadPage.mockResolvedValue(empty);
    mocks.confirmDiscard.mockReturnValue(false);
    vi.stubGlobal("window", { matchMedia: () => ({ matches: true }), location: { reload: vi.fn() } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("keeps regular editing available before 0044 and does not offer destructive deletion", () => {
    overrides.archiveData = undefined; select(); expect(text(render())).toContain("migration 0044");
    expect(button(`Archive ${item.title}`).props.disabled).toBe(true);
    field("Title", "New title"); expect(button(`Save ${sectionLabel}`).props.disabled).toBe(false);
    expect(nodes(render()).find(node => node.type === "fieldset")?.props.disabled).toBe(false);
    expect(text(render())).not.toMatch(/Permanently delete|Purge/);
    expect(nodes(render()).filter(node => node.type === "form")).toHaveLength(1);
  });
  it("requires explicit confirmation and cancellation does not mutate", () => {
    select(); click(button(`Archive ${item.title}`)); expect(mocks.mutate).not.toHaveBeenCalled();
    expect(text(render())).toContain("immediately removes the item from the public portfolio");
    expect(text(render())).toContain("No Media files are deleted"); click(button("Cancel archive"));
    expect(text(render())).not.toContain(`Archive ${item.title}?`);
  });
  it("blocks archive and restore while the collection is dirty", () => {
    archiveFixture(); select(); click(button(`Archive ${item.title}`)); field("Title", "Unsaved title");
    expect(button("Archive Unsaved title").props.disabled).toBe(true);
    expect(button("Confirm archive").props.disabled).toBe(true);
    expect(button(`Restore ${item.title} as hidden`).props.disabled).toBe(true);
    click(button("Confirm archive")); click(button(`Restore ${item.title} as hidden`)); expect(mocks.mutate).not.toHaveBeenCalled();
    click(button(`Discard changes in ${sectionLabel}`)); expect(button(`Archive ${item.title}`).props.disabled).toBe(false);
  });
  it.each(["disabled", "migrationRequired", "loadError", "pending", "conflict"])("blocks archive during %s", mode => {
    if (mode === "disabled") overrides.disabled = true;
    if (mode === "migrationRequired") overrides.migrationRequired = true;
    if (mode === "loadError") overrides.loadError = "Unavailable";
    select();
    if (mode === "pending") mocks.pending = true;
    if (mode === "conflict") mocks.saveState = { ...initialSave, status: "conflict" };
    expect(button(`Archive ${item.title}`).props.disabled).toBe(true); click(button(`Archive ${item.title}`)); expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("retains Hero and Introduction drafts while adopting exact collection versions", async () => {
    field("Main title", "Keep my hero"); select("Introduction"); field("Small label", "Keep introduction"); await archiveItem();
    expect(mocks.mutate).toHaveBeenCalledWith({ collection, operation: "archive", itemId: item.id, expectedVersions: { items: { [item.id]: version } } });
    expect(payload()).toEqual({ items: [] }); expect(payload("versions")).toEqual({ items: {} });
    expect(button(`Save ${sectionLabel}`).props.disabled).toBe(true);
    select("Hero"); expect(payload().title).toBe("Keep my hero"); expect(button("Save Hero").props.disabled).toBe(false);
    select("Introduction"); expect(Object.values(payload())).toContain("Keep introduction"); expect(mocks.clearDirty).not.toHaveBeenCalled();
  });
  it("only discards an unsaved new card locally", () => {
    select(); click(button(gallery ? "Add frame" : "Add video"));
    click(button(gallery ? "Discard new frame 2" : "Discard new video 2"));
    expect(payload().items).toEqual([item]); expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("restores a legacy HTTPS source hidden with exact versions and original ordering", async () => {
    const retained = { ...item, id: "second", title: "Retained" }; setItems([retained]); archiveFixture();
    const restored = gallery ? { ...frame, src: "https://legacy.example/portrait.jpg", isPublished: false } : { ...work, thumbnailSrc: "https://legacy.example/poster.jpg", isPublished: false };
    mocks.mutate.mockResolvedValue({ ...success([restored, retained]), message: "Restored hidden.", archive: empty.page });
    select(); await click(button(`Restore ${item.title} as hidden`));
    expect(payload().items).toEqual([restored, retained]);
    expect(mocks.mutate).toHaveBeenCalledWith({ collection, operation: "restore", itemId: item.id, expectedVersions: { items: { second: version } }, expectedArchiveUpdatedAt: version });
    expect(button(`Archive ${item.title}`).props.disabled).toBe(false);
    expect(button(`Save ${sectionLabel}`).props.disabled).toBe(true);
  });
  it("enforces capacity while still allowing archive", async () => {
    setItems(Array.from({ length: 120 }, (_, i) => ({ ...item, id: `item-${i}` }))); archiveFixture(); select();
    expect(text(render())).toContain("120/120 active slots"); expect(button(`Restore ${item.title} as hidden`).props.disabled).toBe(true);
    await click(button(`Restore ${item.title} as hidden`)); expect(mocks.mutate).not.toHaveBeenCalled();
    expect(button(`Archive ${item.title}`).props.disabled).toBe(false);
  });
  it.each(["transport", "null", "wrong-collection", "wrong-section", "missing-versions", "wrong-membership", "wrong-offset", "changed-limit"])("locks writes and retains content after %s", async mode => {
    const result = success();
    if (mode === "transport") mocks.mutate.mockRejectedValue(new Error("network"));
    else if (mode === "null") mocks.mutate.mockResolvedValue(null);
    else if (mode === "wrong-collection") mocks.mutate.mockResolvedValue({ ...result, collection: gallery ? "showreel" : "gallery" });
    else if (mode === "wrong-section") mocks.mutate.mockResolvedValue({ ...result, section: "hero" });
    else if (mode === "missing-versions") mocks.mutate.mockResolvedValue({ ...result, versions: undefined });
    else if (mode === "wrong-membership") mocks.mutate.mockResolvedValue(success([{ ...item, id: "unexpected" }]));
    else if (mode === "wrong-offset") mocks.mutate.mockResolvedValue({ ...result, archive: { ...empty.page, offset: 20 } });
    else mocks.mutate.mockResolvedValue({ ...result, archive: { ...result.archive, activeLimit: 119 } });
    await archiveItem(); expect(payload().items).toEqual([item]); expect(text(render())).toContain("outcome could not be confirmed");
    expect(button(`Archive ${item.title}`).props.disabled).toBe(true);
    expect(button(`Save ${sectionLabel}`).props.disabled).toBe(true);
  });
  it("rejects a response that drops an unrelated member", async () => {
    setItems([item, { ...item, id: "second" }]); await archiveItem();
    expect(payload().items).toHaveLength(2); expect(text(render())).toContain("outcome could not be confirmed");
  });
  it.each(["published", "also-archived"])("rejects unsafe restoration: %s", async mode => {
    setItems([]); archiveFixture(); mocks.mutate.mockResolvedValue({ ...success([{ ...item, isPublished: mode === "published" }]), archive: mode === "also-archived" ? overrides.archiveData!.page : empty.page });
    select(); await click(button(`Restore ${item.title} as hidden`)); expect(payload().items).toEqual([]); expect(text(render())).toContain("outcome could not be confirmed");
  });
  it("only locks on uncertain outcomes, not confirmed no-write rejection", async () => {
    mocks.mutate.mockResolvedValue({ ok: false, message: "Featured selection already in use." }); await archiveItem();
    expect(button(`Archive ${item.title}`).props.disabled).toBe(false);
    mocks.mutate.mockResolvedValue({ ok: false, message: "Changed elsewhere", reloadRequired: true });
    await archiveItem(); expect(button(`Archive ${item.title}`).props.disabled).toBe(true);
  });
  it("provides guarded recovery inside the mobile modal", async () => {
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }), location: { reload: vi.fn() } }); mocks.mutate.mockRejectedValue(new Error("network")); await archiveItem();
    const dialog = nodes(render()).find(node => node.type === "dialog")!;
    const reload = nodes(dialog.props.children as ReactNode).find(node => node.type === "button" && text(node.props.children as ReactNode).trim() === `Reload saved ${label} page`);
    expect(reload).toBeDefined(); await click(reload!); expect(mocks.confirmDiscard).toHaveBeenCalledOnce(); expect(window.location.reload).not.toHaveBeenCalled();
  });
  it("blocks same-frame duplicate archive and ordinary Save during mutation", async () => {
    select(); click(button(`Archive ${item.title}`)); let finish!: (value: unknown) => void;
    mocks.mutate.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const confirmation = button("Confirm archive"); const saving = click(confirmation); await click(confirmation);
    const form = new FormData(); form.set("section", section);
    await (mocks.saveAction as (state: unknown, form: FormData) => Promise<unknown>)(initialSave, form);
    expect(mocks.mutate).toHaveBeenCalledOnce(); expect(mocks.save).not.toHaveBeenCalled(); finish(success()); await saving;
  });
  it("blocks archive when ordinary Save starts before React pending", async () => {
    select(); click(button(`Archive ${item.title}`)); let finish!: (value: unknown) => void;
    mocks.save.mockReturnValue(new Promise(resolve => { finish = resolve; })); const form = new FormData(); form.set("section", section);
    const saving = (mocks.saveAction as (state: unknown, form: FormData) => Promise<unknown>)(initialSave, form);
    await click(button("Confirm archive")); expect(mocks.mutate).not.toHaveBeenCalled();
    finish({ status: "saved", eventId: "save-first", message: "Saved", section, canonicalSection: { items: [item] }, versions: { items: { [item.id]: restoredVersion } } }); await saving;
    expect(payload("versions").items[item.id]).toBe(restoredVersion);
  });
  it("keeps the archive lock after an uncertain Save before React updates state", async () => {
    select(); click(button(`Archive ${item.title}`)); const confirmation = button("Confirm archive");
    mocks.save.mockRejectedValue(new Error("network")); const form = new FormData(); form.set("section", section);
    await (mocks.saveAction as (state: unknown, form: FormData) => Promise<unknown>)(initialSave, form);
    await click(confirmation); expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("loads pages on demand without discarding a local draft", async () => {
    firstPage(); select(); field("Title", "Keep draft"); expect(mocks.loadPage).not.toHaveBeenCalled();
    mocks.loadPage.mockResolvedValue({ available: true, page: { ...empty.page, items: [{ ...archived, id: "last", label: "Last archived" }], total: 21, offset: 20 } });
    await click(button(`Next archived ${sectionLabel}`)); expect(mocks.loadPage).toHaveBeenCalledWith(collection, 20);
    expect(payload().items[0].title).toBe("Keep draft"); expect(text(render())).toContain("Last archived");
  });
  it.each(["transport", "wrong-offset"])("retains the current page and allows edits after paging %s", async mode => {
    firstPage(); select(); if (mode === "transport") mocks.loadPage.mockRejectedValue(new Error("network")); else mocks.loadPage.mockResolvedValue(overrides.archiveData);
    await click(button(`Next archived ${sectionLabel}`)); expect(text(render())).toContain("current page has been kept"); expect(text(render())).toContain("Archived 0");
    field("Title", "Still editable"); expect(button(`Save ${sectionLabel}`).props.disabled).toBe(false);
  });
  it("does not swallow ordinary Save during read-only pagination", async () => {
    firstPage(); select(); let finish!: (result: unknown) => void;
    mocks.loadPage.mockReturnValue(new Promise(resolve => { finish = resolve; })); const reading = click(button(`Next archived ${sectionLabel}`));
    field("Title", "Saved during read"); expect(button(`Save ${sectionLabel}`).props.disabled).toBe(false);
    mocks.save.mockResolvedValue({ status: "saved", eventId: "save-during-read", message: "Saved", section, canonicalSection: { items: [{ ...item, title: "Saved during read" }] }, versions: { items: { [item.id]: restoredVersion } } });
    const form = new FormData(); form.set("section", section);
    await (mocks.saveAction as (state: unknown, form: FormData) => Promise<unknown>)(initialSave, form); expect(mocks.save).toHaveBeenCalledOnce();
    finish({ available: true, page: { ...empty.page, items: [{ ...archived, id: "last" }], total: 21, offset: 20 } }); await reading;
    expect(payload().items[0].title).toBe("Saved during read"); expect(payload("versions").items[item.id]).toBe(restoredVersion);
  });

  if (!gallery) {
    it("accepts a verified historical capacity increase", async () => {
      mocks.mutate.mockResolvedValue(success([], 121)); await archiveItem();
      expect(payload().items).toEqual([]); expect(text(render())).toContain("0/121 active slots");
      expect(text(render())).not.toContain("outcome could not be confirmed");
    });
    it("rejects a shrinking historical capacity", async () => {
      archiveFixture(121); mocks.mutate.mockResolvedValue(success([], 120)); await archiveItem();
      expect(payload().items).toHaveLength(1); expect(text(render())).toContain("outcome could not be confirmed");
    });
    it("preserves historical collections above 120 and their remaining restore slot", async () => {
      const items = Array.from({ length: 121 }, (_, i) => ({ ...work, id: `legacy-${i}` })); setItems(items); archiveFixture(122);
      const restored = { ...work, isPublished: false }; mocks.mutate.mockResolvedValue({ ...success([restored, ...items], 122), archive: { ...empty.page, activeLimit: 122 } });
      select(); expect(text(render())).toContain("121/122 active slots"); expect(button(`Restore ${item.title} as hidden`).props.disabled).toBe(false);
      await click(button(`Restore ${item.title} as hidden`)); expect(payload().items).toHaveLength(122); expect(text(render())).not.toContain("outcome could not be confirmed");
    });
    it.each(["legacy video / music", "__proto__", "constructor", "v".repeat(512)])("archives legacy identity %s without dropping its CAS key", async id => {
      setItems([{ ...work, id }]); mocks.mutate.mockResolvedValue({ ...success(), archive: { ...empty.page, items: [{ ...archived, id }], total: 1 } });
      await archiveItem(); expect(mocks.mutate.mock.calls[0][0].itemId).toBe(id); expect(Object.hasOwn(mocks.mutate.mock.calls[0][0].expectedVersions.items, id)).toBe(true);
      expect(payload().items).toEqual([]); expect(text(render())).not.toContain("outcome could not be confirmed");
    });
    it("keeps a different music video while archiving a scene", async () => {
      const musicVideo = { ...work, id: "music-video" }; setItems([{ ...work, videoType: "scene" }, musicVideo]); mocks.mutate.mockResolvedValue(success([musicVideo]));
      await archiveItem(); expect(payload().items).toEqual([musicVideo]);
    });
  }
});
