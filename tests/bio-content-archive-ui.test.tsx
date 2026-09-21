import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import BioEditor from "@/components/admin/v2/BioEditor";
import { createFallbackBioEditorSnapshot, INITIAL_BIO_SAVE_STATE, type BioEditorSnapshot } from "@/lib/admin/bio-editor";
import type { ArchiveData, ArchiveItem } from "@/lib/admin/content-archive-editor";
import { BIO_ARCHIVE_LIMITS, bioArchiveSection, type BioArchiveCollection } from "@/lib/admin/bio-content-archive-editor";

// Deterministic event-handler coverage; browser QA checks the real layout separately.
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
vi.mock("@/app/admin/v2/pages/bio/archive-actions", () => ({ mutateBioContentArchive: mocks.mutate, loadBioContentArchivePage: mocks.loadPage }));
vi.mock("@/app/admin/v2/pages/bio/actions", () => ({ saveBioSectionV2: mocks.save }));
vi.mock("@/components/admin/useUnsavedChangesGuard", () => ({ default: () => ({ clearDirty: mocks.clearDirty, markDirty: mocks.markDirty, confirmDiscard: mocks.confirmDiscard, hasUnsavedChanges: false }) }));
vi.mock("@/components/admin/v2/BioPreviewFrame", () => ({ default: () => null }));
vi.mock("@/components/admin/MediaAssetPicker", () => ({ default: () => null }));

const version = "2026-09-21T10:00:00.000001Z";
const restoredVersion = "2026-09-21T10:01:00.000002Z";
const portrait = { id: "portrait-one", src: "/images/portrait.webp", alt: "Main portrait", isPublished: true };
const paragraph = { id: "paragraph-one", body: "My biography", revealDelay: 140, isPublished: true };
const credit = { id: "credit-one", creditType: "film" as const, title: "First film", role: "Lead", production: "Studio", director: "Director", year: "2026", href: "", isPublished: true };
const archived: Record<BioArchiveCollection, ArchiveItem> = {
  portraits: { id: portrait.id, label: portrait.alt, platform: "portrait", archivedAt: version, updatedAt: version },
  paragraphs: { id: paragraph.id, label: paragraph.body, platform: "paragraph", archivedAt: version, updatedAt: version },
  credits: { id: credit.id, label: credit.title, platform: "film", archivedAt: version, updatedAt: version },
};
const empty: ArchiveData = { available: true, page: { items: [], total: 0, offset: 0 } };
const emptyArchives = { portraits: empty, paragraphs: empty, credits: empty };
let snapshot: BioEditorSnapshot;
let overrides: Partial<Parameters<typeof BioEditor>[0]>;
type Element = ReactElement<Record<string, unknown>>;
const expand = new Set(["Field", "MoveButtons", "VisibilityToggle", "InspectorFields", "InspectorHeader", "HeroInspector", "BiographyInspector", "ResumeInspector", "CreditsInspector", "CollectionHeader", "BioContentArchivePanel"]);
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
function render() {
  mocks.cursor = 0;
  return BioEditor({ snapshot, assets: [], disabled: false, migrationRequired: false, archiveData: emptyArchives, ...overrides });
}
function button(label: string) {
  const node = nodes(render()).find(node => node.type === "button" && (node.props["aria-label"] === label || text(node.props.children as ReactNode).trim() === label));
  if (!node) throw new Error(`Missing button: ${label}`);
  return node;
}
function click(node: Element) { return (node.props.onClick as () => void | Promise<void>)(); }
function select(section: "Hero" | "Biography" | "Resume" | "Credits") { click(button(section)); }
function field(label: string, value: string) {
  const node = nodes(render()).find(node => node.type === "label" && text(node.props.children as ReactNode).startsWith(label))!;
  const input = nodes(node.props.children as ReactNode).find(child => child.type === "input" || child.type === "textarea")!;
  (input.props.onChange as (event: unknown) => void)({ target: { value } });
}
function payload(name = "payload") { return JSON.parse(nodes(render()).find(node => node.type === "input" && node.props.name === name)!.props.value as string); }
function success(collection: BioArchiveCollection = "portraits") {
  const section = bioArchiveSection(collection);
  return { ok: true, message: "Item archived.", collection, section,
    canonicalSection: collection === "credits" ? { items: [] } : { ...snapshot.draft.biography, [collection === "portraits" ? "galleryImages" : "paragraphs"]: [] },
    versions: collection === "credits" ? { items: {} } : { ...snapshot.versions.biography, [collection === "portraits" ? "galleryItems" : "paragraphItems"]: {} },
    archive: { items: [archived[collection]], total: 1, offset: 0 },
  };
}
async function archivePortrait() { select("Biography"); click(button("Archive Main portrait")); await click(button("Confirm archive")); }
function archiveFixture(collection: BioArchiveCollection) {
  overrides.archiveData = { ...emptyArchives, [collection]: { available: true, page: { items: [archived[collection]], total: 1, offset: 0 } } };
}

beforeEach(() => {
  vi.clearAllMocks(); mocks.values = []; mocks.cursor = 0; mocks.pending = false;
  mocks.saveState = undefined; mocks.saveAction = undefined; overrides = {};
  snapshot = createFallbackBioEditorSnapshot();
  snapshot.draft.biography = { topLabel: "Biography", caption: "My story", introText: "Introduction", galleryImages: [portrait], paragraphs: [paragraph] };
  snapshot.draft.credits = { items: [credit] };
  snapshot.versions.biography = { profileUpdatedAt: version, galleryItems: { [portrait.id]: version }, paragraphItems: { [paragraph.id]: version } };
  snapshot.versions.credits = { items: { [credit.id]: version } };
  mocks.mutate.mockResolvedValue(success()); mocks.loadPage.mockResolvedValue(empty);
  mocks.confirmDiscard.mockReturnValue(false);
  vi.stubGlobal("window", { matchMedia: () => ({ matches: true }), location: { reload: vi.fn() } });
});
afterEach(() => vi.unstubAllGlobals());

describe("Bio archive inspector", () => {
  it("keeps regular editing available before migration 0043 and supports older callers", () => {
    overrides.archiveData = undefined; select("Biography");
    expect(text(render())).toContain("Apply migration 0043");
    expect(button("Archive Main portrait").props.disabled).toBe(true);
    field("Top label", "New biography"); expect(button("Save Biography").props.disabled).toBe(false);
    expect(nodes(render()).find(node => node.type === "fieldset")?.props.disabled).toBe(false);
    expect(text(render())).not.toMatch(/Permanently delete|Purge/);
    expect(nodes(render()).filter(node => node.type === "form")).toHaveLength(1);
  });

  it("requires explicit confirmation, explains public removal and cancels without mutation", () => {
    select("Biography"); click(button("Archive Main portrait"));
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(text(render())).toContain("immediately removes the item from the public Bio page");
    expect(text(render())).toContain("No Media files are deleted");
    click(button("Cancel archive")); expect(text(render())).not.toContain("Archive Main portrait?");
  });

  it.each(["Top label", "Intro text", "Alternative text", "Paragraph text"])("blocks both coupled archives when %s is dirty", label => {
    select("Biography"); click(button("Archive Main portrait")); field(label, "Unsaved change");
    expect(button(`Archive ${label === "Alternative text" ? "Unsaved change" : "Main portrait"}`).props.disabled).toBe(true);
    expect(button("Archive Paragraph 1").props.disabled).toBe(true);
    expect(button("Confirm archive").props.disabled).toBe(true);
    click(button("Confirm archive")); expect(mocks.mutate).not.toHaveBeenCalled();
    expect(text(render())).toContain("introduction, portraits, and paragraphs are saved together");
    click(button("Discard changes in Biography")); expect(button("Archive Main portrait").props.disabled).toBe(false);
  });

  it.each(["disabled", "migrationRequired", "loadError", "pending", "conflict"])("blocks mutations during %s", mode => {
    if (mode === "disabled") overrides.disabled = true;
    if (mode === "migrationRequired") overrides.migrationRequired = true;
    if (mode === "loadError") overrides.loadError = "Unavailable";
    select("Biography");
    if (mode === "pending") mocks.pending = true;
    if (mode === "conflict") mocks.saveState = { ...INITIAL_BIO_SAVE_STATE, status: "conflict" };
    expect(button("Archive Main portrait").props.disabled).toBe(true);
    click(button("Archive Main portrait")); expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("keeps discard local for a new unsaved paragraph", () => {
    select("Biography"); click(button("Add Biography paragraphs"));
    expect(button("Discard new paragraph 2").props.type).toBe("button");
    expect(nodes(render()).some(node => node.props["aria-label"] === "Archive Paragraph 2")).toBe(false);
    click(button("Discard new paragraph 2")); expect(payload().paragraphs).toEqual([paragraph]);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("blocks restore while its whole Biography is dirty", () => {
    archiveFixture("portraits"); select("Biography"); field("Intro text", "Changed profile");
    expect(button("Restore Main portrait as hidden").props.disabled).toBe(true);
    click(button("Restore Main portrait as hidden")); expect(mocks.mutate).not.toHaveBeenCalled();
  });
});

describe("Bio archive adoption", () => {
  it("adopts full Biography versions while keeping Hero, Resume and Credits drafts", async () => {
    field("Main title", "My Hero draft"); select("Resume"); field("Headline", "My Resume draft"); select("Credits"); field("Title", "My Credits draft");
    await archivePortrait();
    expect(mocks.mutate).toHaveBeenCalledWith({ collection: "portraits", operation: "archive", itemId: portrait.id, expectedVersions: snapshot.versions.biography });
    expect(payload()).toEqual({ ...snapshot.draft.biography, galleryImages: [] });
    expect(payload("versions")).toEqual({ ...snapshot.versions.biography, galleryItems: {} });
    expect(button("Save Biography").props.disabled).toBe(true);
    select("Hero"); expect(payload().title).toBe("My Hero draft"); expect(button("Save Hero").props.disabled).toBe(false);
    select("Resume"); expect(payload().headline).toBe("My Resume draft");
    select("Credits"); expect(payload().items[0].title).toBe("My Credits draft");
    expect(mocks.clearDirty).not.toHaveBeenCalled();
  });

  it("archives paragraphs while keeping every portrait and the profile", async () => {
    mocks.mutate.mockResolvedValue(success("paragraphs")); select("Biography");
    click(button("Archive Paragraph 1")); await click(button("Confirm archive"));
    expect(mocks.mutate).toHaveBeenCalledWith({ collection: "paragraphs", operation: "archive", itemId: paragraph.id, expectedVersions: snapshot.versions.biography });
    expect(payload()).toEqual({ ...snapshot.draft.biography, paragraphs: [] });
    expect(payload("versions")).toEqual({ ...snapshot.versions.biography, paragraphItems: {} });
  });

  it("archives Credits without disturbing an unsaved Biography", async () => {
    select("Biography"); field("Intro text", "Keep my biography"); select("Credits");
    mocks.mutate.mockResolvedValue(success("credits")); click(button("Archive First film")); await click(button("Confirm archive"));
    expect(mocks.mutate).toHaveBeenCalledWith({ collection: "credits", operation: "archive", itemId: credit.id, expectedVersions: snapshot.versions.credits });
    expect(payload()).toEqual({ items: [] }); select("Biography"); expect(payload().introText).toBe("Keep my biography");
    expect(button("Save Biography").props.disabled).toBe(false);
  });

  it.each(["portraits", "paragraphs", "credits"] as const)("does not accept unrelated missing active %s", async collection => {
    if (collection === "portraits") {
      snapshot.draft.biography.galleryImages.push({ ...portrait, id: "portrait-two" });
      snapshot.versions.biography.galleryItems["portrait-two"] = version;
    } else if (collection === "paragraphs") {
      snapshot.draft.biography.paragraphs.push({ ...paragraph, id: "paragraph-two" });
      snapshot.versions.biography.paragraphItems["paragraph-two"] = version;
    } else {
      snapshot.draft.credits.items.push({ ...credit, id: "credit-two" });
      snapshot.versions.credits.items["credit-two"] = version;
    }
    mocks.mutate.mockResolvedValue(success(collection)); select(collection === "credits" ? "Credits" : "Biography");
    click(button(`Archive ${collection === "portraits" ? "Main portrait" : collection === "paragraphs" ? "Paragraph 1" : "First film"}`));
    await click(button("Confirm archive"));
    expect(text(render())).toContain("outcome could not be confirmed");
  });

  it("does not drop the coupled collection from an otherwise valid archive response", async () => {
    mocks.mutate.mockResolvedValue({ ...success(), canonicalSection: { ...snapshot.draft.biography, galleryImages: [], paragraphs: [] }, versions: { ...snapshot.versions.biography, galleryItems: {}, paragraphItems: {} } });
    await archivePortrait(); expect(payload().paragraphs).toEqual([paragraph]); expect(text(render())).toContain("outcome could not be confirmed");
  });

  it("restores a legacy HTTPS portrait as hidden without weakening ordinary save rules", async () => {
    snapshot.draft.biography.galleryImages = []; snapshot.versions.biography.galleryItems = {};
    archiveFixture("portraits");
    const restored = { ...portrait, src: "https://legacy.example/portrait.jpg", isPublished: false };
    mocks.mutate.mockResolvedValue({ ok: true, message: "Restored as hidden.", collection: "portraits", section: "biography", canonicalSection: { ...snapshot.draft.biography, galleryImages: [restored] }, versions: { ...snapshot.versions.biography, galleryItems: { [portrait.id]: restoredVersion } }, archive: empty.page });
    select("Biography"); await click(button("Restore Main portrait as hidden"));
    expect(mocks.mutate).toHaveBeenCalledWith({ collection: "portraits", operation: "restore", itemId: portrait.id, expectedVersions: snapshot.versions.biography, expectedArchiveUpdatedAt: version });
    expect(payload().galleryImages).toEqual([restored]);
    expect(payload("versions").galleryItems).toEqual({ [portrait.id]: restoredVersion });
    expect(button("Archive Main portrait").props.disabled).toBe(false);
    expect(button("Save Biography").props.disabled).toBe(true);
  });

  it.each(["portraits", "paragraphs", "credits"] as const)("enforces %s capacity while still allowing archive", async collection => {
    const limit = BIO_ARCHIVE_LIMITS[collection];
    const entries = Array.from({ length: limit }, (_, i) => ({ ...(collection === "portraits" ? portrait : collection === "paragraphs" ? paragraph : credit), id: `item-${i}` }));
    if (collection === "portraits") {
      snapshot.draft.biography.galleryImages = entries as typeof portrait[];
      snapshot.versions.biography.galleryItems = Object.fromEntries(entries.map(item => [item.id, version]));
    } else if (collection === "paragraphs") {
      snapshot.draft.biography.paragraphs = entries as typeof paragraph[];
      snapshot.versions.biography.paragraphItems = Object.fromEntries(entries.map(item => [item.id, version]));
    } else {
      snapshot.draft.credits.items = entries as typeof credit[];
      snapshot.versions.credits.items = Object.fromEntries(entries.map(item => [item.id, version]));
    }
    archiveFixture(collection); select(collection === "credits" ? "Credits" : "Biography");
    expect(button(`Restore ${archived[collection].label} as hidden`).props.disabled).toBe(true);
    await click(button(`Restore ${archived[collection].label} as hidden`)); expect(mocks.mutate).not.toHaveBeenCalled();
    expect(button(`Archive ${collection === "portraits" ? "Main portrait" : collection === "paragraphs" ? "Paragraph 1" : "First film"}`).props.disabled).toBe(false);
    expect(text(render())).toContain(`All ${limit} active slots are used`);
  });

  it("serializes mutations and blocks ordinary save immediately", async () => {
    let finish!: (result: unknown) => void;
    mocks.mutate.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    select("Biography"); click(button("Archive Main portrait"));
    const confirm = button("Confirm archive"); const first = click(confirm); await click(confirm);
    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    expect(nodes(render()).find(node => node.type === "fieldset")?.props.disabled).toBe(true);
    await (mocks.saveAction as (state: unknown, form: FormData) => Promise<unknown>)(INITIAL_BIO_SAVE_STATE, new FormData());
    expect(mocks.save).not.toHaveBeenCalled(); finish(success()); await first;
    expect(nodes(render()).find(node => node.type === "fieldset")?.props.disabled).toBe(false);
  });

  it.each(["transport", "wrong-collection", "wrong-section", "bad-cas", "wrong-page", "still-active"])("keeps drafts and locks writes after %s", async mode => {
    field("Main title", "Keep draft during recovery");
    if (mode === "transport") mocks.mutate.mockRejectedValue(new Error("private diagnostic"));
    if (mode === "wrong-collection") mocks.mutate.mockResolvedValue({ ...success(), collection: "paragraphs" });
    if (mode === "wrong-section") mocks.mutate.mockResolvedValue({ ...success(), section: "credits" });
    if (mode === "bad-cas") mocks.mutate.mockResolvedValue({ ...success(), versions: snapshot.versions.biography });
    if (mode === "wrong-page") mocks.mutate.mockResolvedValue({ ...success(), archive: { items: [], total: 0, offset: 20 } });
    if (mode === "still-active") mocks.mutate.mockResolvedValue({ ...success(), canonicalSection: snapshot.draft.biography, versions: snapshot.versions.biography });
    await archivePortrait();
    expect(payload().galleryImages).toEqual([portrait]); expect(text(render())).toContain("outcome could not be confirmed");
    expect(text(render())).not.toContain("private diagnostic");
    click(button("Reload saved Bio page")); expect(mocks.confirmDiscard).toHaveBeenCalledOnce();
    expect(window.location.reload).not.toHaveBeenCalled();
    select("Hero"); expect(payload().title).toBe("Keep draft during recovery"); expect(button("Save Hero").props.disabled).toBe(true);
  });

  it.each(["published", "also-archived"])("rejects invalid restoration: %s", async mode => {
    snapshot.draft.credits.items = []; snapshot.versions.credits.items = {}; archiveFixture("credits");
    mocks.mutate.mockResolvedValue({ ok: true, message: "Restored", collection: "credits", section: "credits", canonicalSection: { items: [{ ...credit, isPublished: mode === "published" }] }, versions: { items: { [credit.id]: restoredVersion } }, archive: mode === "also-archived" ? overrides.archiveData!.credits.page : empty.page });
    select("Credits"); await click(button("Restore First film as hidden"));
    expect(payload().items).toEqual([]); expect(text(render())).toContain("outcome could not be confirmed");
  });

  it("locks on conflicts, but not a confirmed no-write error", async () => {
    mocks.mutate.mockResolvedValue({ ok: false, message: "Nothing changed." }); await archivePortrait();
    expect(button("Archive Main portrait").props.disabled).toBe(false);
    mocks.mutate.mockResolvedValue({ ok: false, message: "Changed elsewhere.", reloadRequired: true });
    click(button("Archive Main portrait")); await click(button("Confirm archive")); expect(button("Archive Main portrait").props.disabled).toBe(true);
  });

  it("keeps guarded recovery reachable in the mobile modal", async () => {
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }), location: { reload: vi.fn() } });
    mocks.mutate.mockRejectedValue(new Error("network")); await archivePortrait();
    const dialog = nodes(render()).find(node => node.type === "dialog")!;
    const reload = nodes(dialog.props.children as ReactNode).find(node => node.type === "button" && text(node.props.children as ReactNode).trim() === "Reload saved Bio page");
    expect(reload).toBeDefined(); await click(reload!); expect(mocks.confirmDiscard).toHaveBeenCalledOnce(); expect(window.location.reload).not.toHaveBeenCalled();
  });

  it("blocks archive while an ordinary save has started before React pending catches up", async () => {
    select("Biography"); click(button("Archive Main portrait"));
    let finish!: (result: unknown) => void; mocks.save.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const form = new FormData(); form.set("section", "biography");
    const saving = (mocks.saveAction as (state: unknown, form: FormData) => Promise<unknown>)(INITIAL_BIO_SAVE_STATE, form);
    await click(button("Confirm archive")); expect(mocks.mutate).not.toHaveBeenCalled();
    finish({ status: "saved", eventId: "save-first", message: "Saved", section: "biography", canonicalSection: snapshot.draft.biography, versions: { ...snapshot.versions.biography, profileUpdatedAt: restoredVersion } });
    await saving; expect(button("Archive Main portrait").props.disabled).toBe(false); expect(payload("versions").profileUpdatedAt).toBe(restoredVersion);
  });
});

describe("Bio archive paging", () => {
  function firstPage() {
    overrides.archiveData = { ...emptyArchives, portraits: { available: true, page: { items: Array.from({ length: 20 }, (_, i) => ({ ...archived.portraits, id: `archived-${i}`, label: `Archived ${i}` })), total: 21, offset: 0 } } };
  }
  it("reads on demand and preserves a coupled Biography draft", async () => {
    firstPage(); select("Biography"); expect(mocks.loadPage).not.toHaveBeenCalled(); field("Intro text", "Keep edit");
    mocks.loadPage.mockResolvedValue({ available: true, page: { items: [{ ...archived.portraits, id: "last", label: "Last archived" }], total: 21, offset: 20 } });
    await click(button("Next archived Portraits")); expect(mocks.loadPage).toHaveBeenCalledWith("portraits", 20);
    expect(payload().introText).toBe("Keep edit"); expect(text(render())).toContain("Last archived"); expect(button("Next archived Portraits").props.disabled).toBe(true);
  });

  it.each(["transport", "wrong-offset"])("keeps current page and allows editing after %s", async mode => {
    firstPage(); select("Biography");
    if (mode === "transport") mocks.loadPage.mockRejectedValue(new Error("private")); else mocks.loadPage.mockResolvedValue(overrides.archiveData!.portraits);
    await click(button("Next archived Portraits")); expect(text(render())).toContain("current page has been kept"); expect(text(render())).toContain("Archived 0");
    field("Intro text", "Still editable"); expect(button("Save Biography").props.disabled).toBe(false);
  });

  it("does not swallow an ordinary save during read-only pagination", async () => {
    firstPage(); select("Biography"); let finish!: (result: unknown) => void;
    mocks.loadPage.mockReturnValue(new Promise(resolve => { finish = resolve; })); const reading = click(button("Next archived Portraits"));
    field("Intro text", "Saved during read"); expect(button("Save Biography").props.disabled).toBe(false);
    mocks.save.mockResolvedValue({ status: "saved", eventId: "save-during-read", message: "Saved", section: "biography", canonicalSection: { ...snapshot.draft.biography, introText: "Saved during read" }, versions: { ...snapshot.versions.biography, profileUpdatedAt: restoredVersion } });
    const form = new FormData(); form.set("section", "biography");
    await (mocks.saveAction as (state: unknown, form: FormData) => Promise<unknown>)(INITIAL_BIO_SAVE_STATE, form); expect(mocks.save).toHaveBeenCalledOnce();
    finish({ available: true, page: { items: [{ ...archived.portraits, id: "last" }], total: 21, offset: 20 } }); await reading;
    expect(payload().introText).toBe("Saved during read"); expect(payload("versions").profileUpdatedAt).toBe(restoredVersion);
  });
});
