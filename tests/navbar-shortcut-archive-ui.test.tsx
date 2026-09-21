import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NavbarSocialLinksManager from "@/components/admin/v2/NavbarSocialLinksManager";
import type { ArchiveData, ArchiveItem } from "@/lib/admin/content-archive-editor";
import { INITIAL_NAVBAR_SOCIAL_LINKS_SAVE_STATE } from "@/lib/admin/navbar-social-links-editor";

// Exercise the actual handlers and canonical-state adoption without a DOM.
// Browser layout and focus are covered separately by the manual browser pass.
const mocks = vi.hoisted(() => ({
  values: [] as unknown[], cursor: 0,
  pending: false, saveState: undefined as unknown,
  saveAction: undefined as unknown,
  mutate: vi.fn(), loadPage: vi.fn(), save: vi.fn(),
  clearDirty: vi.fn(), markDirty: vi.fn(), confirmDiscard: vi.fn(), guard: vi.fn(),
}));
vi.mock("react", async (original) => {
  const react = await original<typeof import("react")>();
  function state(initial: unknown) {
    const index = mocks.cursor++;
    if (!(index in mocks.values)) mocks.values[index] = typeof initial === "function" ? initial() : initial;
    return [mocks.values[index], (next: unknown) => { mocks.values[index] = typeof next === "function" ? next(mocks.values[index]) : next; }];
  }
  return {
    ...react,
    useState: state,
    useRef: (initial: unknown) => state({ current: initial })[0],
    useMemo: (read: () => unknown) => read(),
    useCallback: (callback: unknown) => callback,
    useEffect: (effect: () => void) => effect(),
    useActionState: (action: unknown, initial: unknown) => {
      mocks.saveAction = action;
      return [mocks.saveState || initial, action, mocks.pending];
    },
  };
});
vi.mock("@/app/admin/v2/navigation/archive-actions", () => ({
  mutateNavbarShortcutArchive: mocks.mutate,
  loadNavbarShortcutArchivePage: mocks.loadPage,
}));
vi.mock("@/app/admin/v2/navigation/social-actions", () => ({ saveNavbarSocialLinksV2: mocks.save }));
vi.mock("@/components/admin/v2/NavbarUnsavedChangesProvider", () => ({
  useNavbarUnsavedChanges: (source: string) => {
    mocks.guard(source);
    return { clearDirty: mocks.clearDirty, markDirty: mocks.markDirty, confirmDiscard: mocks.confirmDiscard };
  },
}));

const initialVersion = "2026-09-21T10:00:00.000001Z";
const restoredVersion = "2026-09-21T10:01:00.000002Z";
const spotify = {
  id: "spotify", label: "Spotify", platform: "spotify" as const,
  href: "https://open.spotify.com/artist/example", iconKey: "spotify" as const, isPublished: true,
};
const archivedSpotify: ArchiveItem = {
  id: spotify.id, label: spotify.label, platform: spotify.platform,
  archivedAt: initialVersion, updatedAt: initialVersion,
};
const emptyArchive: ArchiveData = { available: true, page: { items: [], total: 0, offset: 0 } };
type Element = ReactElement<Record<string, unknown>>;
let overrides: Partial<Parameters<typeof NavbarSocialLinksManager>[0]> = {};

function nodes(tree: ReactNode): Element[] {
  return Children.toArray(tree).flatMap(node => isValidElement<Record<string, unknown>>(node)
    ? [node, ...nodes(node.props.children as ReactNode)] : []);
}
function text(tree: ReactNode): string {
  return Children.toArray(tree).map(node => isValidElement<Record<string, unknown>>(node)
    ? text(node.props.children as ReactNode) : String(node)).join("");
}
function render() {
  mocks.cursor = 0;
  return NavbarSocialLinksManager({
    snapshot: { items: [spotify], expectedVersions: { spotify: initialVersion } },
    disabled: false, migrationRequired: false, archiveData: emptyArchive, ...overrides,
  });
}
function button(label: string) {
  const node = nodes(render()).find(node => node.type === "button" &&
    (node.props["aria-label"] === label || text(node.props.children as ReactNode).trim() === label));
  if (!node) throw new Error(`Missing button: ${label}`);
  return node;
}
function click(node: Element) { return (node.props.onClick as () => void | Promise<void>)(); }
function changeLabel(label: string) {
  const fieldLabel = nodes(render()).find(node => node.type === "label" && text(node.props.children as ReactNode).startsWith("Accessible label"))!;
  const input = nodes(fieldLabel.props.children as ReactNode).find(node => node.type === "input")!;
  (input.props.onChange as (event: unknown) => void)({ target: { value: label } });
}
function savedPayload(name: string) {
  return JSON.parse(nodes(render()).find(node => node.type === "input" && node.props.name === name)!.props.value as string);
}
function archiveSuccess() {
  return { ok: true, message: "Shortcut archived.", snapshot: { items: [], expectedVersions: {} }, archive: { items: [archivedSpotify], total: 1, offset: 0 } };
}
async function confirmArchive() {
  click(button("Archive Spotify"));
  await click(button("Confirm archive"));
}

beforeEach(() => {
  vi.clearAllMocks(); mocks.values = []; mocks.cursor = 0; mocks.pending = false;
  mocks.saveState = undefined; mocks.saveAction = undefined; overrides = {};
  mocks.mutate.mockResolvedValue(archiveSuccess());
  mocks.loadPage.mockResolvedValue(emptyArchive);
  mocks.confirmDiscard.mockImplementation(() => false);
});
afterEach(() => vi.unstubAllGlobals());

describe("Navbar shortcut archive presentation and guardrails", () => {
  it("leaves normal editing available when only the archive migration is missing", () => {
    overrides.archiveData = { ...emptyArchive, available: false, message: "Apply migration 0041 to enable the shortcut archive." };
    expect(text(render())).toContain("Apply migration 0041");
    expect(button("Archive Spotify").props.disabled).toBe(true);
    expect(button("Add shortcut").props.disabled).toBe(false);
    expect(nodes(render()).find(node => node.type === "fieldset")?.props.disabled).toBe(false);
    changeLabel("My Spotify");
    expect(button("Save shortcuts").props.disabled).toBe(false);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("supports older callers without an archive prop and exposes no purge control", () => {
    overrides.archiveData = undefined;
    expect(text(render())).toContain("Regular shortcut editing still works");
    expect(button("Add shortcut").props.disabled).toBe(false);
    expect(text(render())).not.toMatch(/Permanently delete|Purge/);
    expect(text(render())).toContain("Restoring brings back a hidden shortcut; it does not publish it.");
    expect(text(render())).not.toContain("at the end");
    expect(nodes(render()).filter(node => node.type === "form")).toHaveLength(1);
  });

  it("requires an explicit confirmation describing the immediate public effect", () => {
    click(button("Archive Spotify"));
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(text(render())).toContain("immediately removes the shortcut from the navbar and shared footer");
    expect(text(render())).toContain("No Media files are deleted");
    expect(button("Confirm archive").props.type).toBe("button");
    click(button("Cancel archive"));
    expect(text(render())).not.toContain("Archive Spotify?");
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("requires saving or discarding shortcut edits, without using a destructive reload", () => {
    click(button("Archive Spotify"));
    changeLabel("Unsaved label");
    expect(button("Archive Unsaved label").props.disabled).toBe(true);
    expect(button("Confirm archive").props.disabled).toBe(true);
    expect(text(render())).toContain("Save or discard shortcut changes");
    click(button("Confirm archive"));
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(savedPayload("items")[0].label).toBe("Unsaved label");
    expect(mocks.confirmDiscard).not.toHaveBeenCalled();
    click(button("Discard shortcut changes"));
    expect(button("Archive Spotify").props.disabled).toBe(false);
  });

  it.each(["disabled", "migrationRequired", "loadError", "pending", "save-conflict"])("blocks archive operations during %s", mode => {
    if (mode === "disabled") overrides.disabled = true;
    if (mode === "migrationRequired") overrides.migrationRequired = true;
    if (mode === "loadError") overrides.loadError = "Saved links unavailable";
    if (mode === "pending") mocks.pending = true;
    if (mode === "save-conflict") mocks.saveState = { ...INITIAL_NAVBAR_SOCIAL_LINKS_SAVE_STATE, status: "conflict", message: "Reload" };
    expect(button("Archive Spotify").props.disabled).toBe(true);
    click(button("Archive Spotify"));
    expect(text(render())).not.toContain("Archive Spotify?");
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("only lets newly added unsaved links be removed without an archive transaction", () => {
    click(button("Add shortcut"));
    expect(button("Remove unsaved link").props.type).toBe("button");
    expect(nodes(render()).some(node => node.props["aria-label"] === "Archive Website")).toBe(false);
    click(button("Remove unsaved link"));
    expect(savedPayload("items")).toEqual([spotify]);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
});

describe("Canonical archive mutations", () => {
  it("adopts the returned active collection and CAS together, freeing the final slot", async () => {
    await confirmArchive();
    expect(mocks.mutate).toHaveBeenCalledWith({ operation: "archive", itemId: "spotify", expectedVersions: { spotify: initialVersion } });
    expect(savedPayload("items")).toEqual([]);
    expect(savedPayload("expectedVersions")).toEqual({});
    expect(button("Save shortcuts").props.disabled).toBe(true);
    expect(text(render())).toContain("0/16 active slots · 1 archived");
    expect(text(render())).toContain("No icon shortcuts selected yet");
    expect(button("Restore Spotify as hidden").props.disabled).toBe(false);
    expect(mocks.guard).toHaveBeenCalledWith("shortcuts");
    expect(mocks.confirmDiscard).not.toHaveBeenCalled();
    expect(mocks.clearDirty).toHaveBeenCalled();
  });

  it("restores hidden, adopts the new version, then saves future edits with that version", async () => {
    overrides.snapshot = { items: [], expectedVersions: {} };
    overrides.archiveData = { available: true, page: { items: [archivedSpotify], total: 1, offset: 0 } };
    mocks.mutate.mockResolvedValue({
      ok: true, message: "Restored as hidden.",
      snapshot: { items: [{ ...spotify, isPublished: false }], expectedVersions: { spotify: restoredVersion } },
      archive: emptyArchive.page,
    });
    await click(button("Restore Spotify as hidden"));
    expect(mocks.mutate).toHaveBeenCalledWith({ operation: "restore", itemId: "spotify", expectedVersions: {}, expectedArchiveUpdatedAt: initialVersion });
    expect(savedPayload("items")).toEqual([{ ...spotify, isPublished: false }]);
    expect(savedPayload("expectedVersions")).toEqual({ spotify: restoredVersion });
    expect(text(render())).toContain("No icon shortcuts selected yet");
    expect(text(render())).toContain("1/16 active slots · 0 archived");
    expect(button("Save shortcuts").props.disabled).toBe(true);
    changeLabel("Restored profile");
    expect(button("Save shortcuts").props.disabled).toBe(false);
    expect(savedPayload("expectedVersions")).toEqual({ spotify: restoredVersion });
  });

  it("blocks restore at 16 slots but still allows archiving an active saved link", async () => {
    const items = Array.from({ length: 16 }, (_, index) => ({ ...spotify, id: `active-${index}`, label: `Active ${index}` }));
    overrides.snapshot = { items, expectedVersions: Object.fromEntries(items.map(item => [item.id, initialVersion])) };
    overrides.archiveData = { available: true, page: { items: [archivedSpotify], total: 1, offset: 0 } };
    expect(button("Restore Spotify as hidden").props.disabled).toBe(true);
    await click(button("Restore Spotify as hidden"));
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(button("Archive Active 0").props.disabled).toBe(false);
    expect(button("Add shortcut").props.disabled).toBe(true);
  });

  it("disables editing while a mutation is pending and rejects a same-frame double click", async () => {
    let finish!: (result: unknown) => void;
    mocks.mutate.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    click(button("Archive Spotify"));
    const confirm = button("Confirm archive");
    const first = click(confirm);
    await click(confirm);
    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    expect(nodes(render()).find(node => node.type === "fieldset")?.props.disabled).toBe(true);
    expect(button("Add shortcut").props.disabled).toBe(true);
    expect(button("Save shortcuts").props.disabled).toBe(true);
    finish(archiveSuccess());
    await first;
    expect(button("Add shortcut").props.disabled).toBe(false);
  });

  it.each(["transport", "missing-snapshot", "invalid-archive", "inconsistent-cas", "false-archive-success"])("locks writes and preserves the old snapshot after %s", async mode => {
    const result = archiveSuccess();
    if (mode === "transport") mocks.mutate.mockRejectedValue(new Error("private transport failure"));
    if (mode === "missing-snapshot") mocks.mutate.mockResolvedValue({ ...result, snapshot: undefined });
    if (mode === "invalid-archive") mocks.mutate.mockResolvedValue({ ...result, archive: { items: [], total: 1, offset: 0 } });
    if (mode === "inconsistent-cas") mocks.mutate.mockResolvedValue({ ...result, snapshot: { items: [], expectedVersions: { spotify: initialVersion } } });
    if (mode === "false-archive-success") mocks.mutate.mockResolvedValue({ ...result, snapshot: { items: [spotify], expectedVersions: { spotify: initialVersion } } });
    await confirmArchive();
    expect(savedPayload("items")).toEqual([spotify]);
    expect(savedPayload("expectedVersions")).toEqual({ spotify: initialVersion });
    expect(button("Archive Spotify").props.disabled).toBe(true);
    expect(button("Add shortcut").props.disabled).toBe(true);
    expect(text(render())).toContain("outcome could not be confirmed");
    expect(text(render())).not.toContain("private transport failure");
    const reload = vi.fn();
    vi.stubGlobal("window", { location: { reload } });
    click(button("Reload saved links"));
    expect(mocks.confirmDiscard).toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    mocks.confirmDiscard.mockImplementation((callback: () => void) => { callback(); return true; });
    click(button("Reload saved links"));
    expect(reload).toHaveBeenCalledOnce();
    await (mocks.saveAction as (previous: unknown, form: FormData) => Promise<unknown>)(INITIAL_NAVBAR_SOCIAL_LINKS_SAVE_STATE, new FormData());
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("rejects a supposedly restored item that is unexpectedly published", async () => {
    overrides.snapshot = { items: [], expectedVersions: {} };
    overrides.archiveData = { available: true, page: { items: [archivedSpotify], total: 1, offset: 0 } };
    mocks.mutate.mockResolvedValue({ ok: true, message: "Restored", snapshot: { items: [spotify], expectedVersions: { spotify: restoredVersion } }, archive: emptyArchive.page });
    await click(button("Restore Spotify as hidden"));
    expect(savedPayload("items")).toEqual([]);
    expect(button("Add shortcut").props.disabled).toBe(true);
  });

  it("locks all writes on an explicit conflict without claiming the item was archived", async () => {
    mocks.mutate.mockResolvedValue({ ok: false, message: "Changed in another session. Reload saved links.", reloadRequired: true });
    await confirmArchive();
    expect(savedPayload("items")).toEqual([spotify]);
    expect(button("Add shortcut").props.disabled).toBe(true);
    expect(text(render())).toContain("Changed in another session");
    expect(text(render())).not.toContain("Shortcut archived.");
  });

  it("keeps normal editing available after a confirmed non-mutating validation failure", async () => {
    mocks.mutate.mockResolvedValue({ ok: false, message: "Archive is unavailable. Nothing was changed." });
    await confirmArchive();
    expect(button("Add shortcut").props.disabled).toBe(false);
    changeLabel("Still editable");
    expect(button("Save shortcuts").props.disabled).toBe(false);
    expect(savedPayload("items")[0].label).toBe("Still editable");
  });
});

describe("Bounded archive browsing", () => {
  function firstPage() {
    overrides.archiveData = { available: true, page: {
      items: Array.from({ length: 20 }, (_, index) => ({ ...archivedSpotify, id: `archived-${index}`, label: `Archived ${index}` })),
      total: 21, offset: 0,
    } };
  }
  it("does no automatic reads and pages by 20 without replacing a shortcut draft", async () => {
    firstPage();
    render(); render();
    expect(mocks.loadPage).not.toHaveBeenCalled();
    expect(button("Previous archived shortcuts").props.disabled).toBe(true);
    changeLabel("Keep my draft");
    mocks.loadPage.mockResolvedValue({ available: true, page: { items: [{ ...archivedSpotify, id: "archived-20", label: "Final archived" }], total: 21, offset: 20 } });
    await click(button("Next archived shortcuts"));
    expect(mocks.loadPage).toHaveBeenCalledWith(20);
    expect(savedPayload("items")[0].label).toBe("Keep my draft");
    expect(savedPayload("expectedVersions")).toEqual({ spotify: initialVersion });
    expect(text(render())).toContain("Final archived");
    expect(button("Next archived shortcuts").props.disabled).toBe(true);
    expect(button("Previous archived shortcuts").props.disabled).toBe(false);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("retains the current page after a failed read without locking regular edits", async () => {
    firstPage();
    mocks.loadPage.mockRejectedValue(new Error("secret"));
    await click(button("Next archived shortcuts"));
    expect(text(render())).toContain("Archived 0");
    expect(text(render())).toContain("current page has been kept");
    expect(text(render())).not.toContain("secret");
    expect(button("Add shortcut").props.disabled).toBe(false);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("rejects a valid response for a different archive page", async () => {
    firstPage();
    mocks.loadPage.mockResolvedValue(overrides.archiveData);
    await click(button("Next archived shortcuts"));
    expect(mocks.loadPage).toHaveBeenCalledWith(20);
    expect(text(render())).toContain("current page has been kept");
    expect(text(render())).toContain("Page 1");
    expect(button("Previous archived shortcuts").props.disabled).toBe(true);
    expect(button("Add shortcut").props.disabled).toBe(false);
  });

  it("does not silently swallow an ordinary save while an archive page is loading", async () => {
    firstPage();
    let finishPage!: (result: ArchiveData) => void;
    mocks.loadPage.mockReturnValue(new Promise<ArchiveData>(resolve => { finishPage = resolve; }));
    const loading = click(button("Next archived shortcuts"));
    changeLabel("Saved during archive read");
    expect(button("Save shortcuts").props.disabled).toBe(false);
    mocks.save.mockResolvedValue({
      status: "saved", eventId: "confirmed", message: "Saved",
      items: [{ ...spotify, label: "Saved during archive read" }],
      expectedVersions: { spotify: restoredVersion },
    });
    await (mocks.saveAction as (previous: unknown, form: FormData) => Promise<unknown>)(INITIAL_NAVBAR_SOCIAL_LINKS_SAVE_STATE, new FormData());
    expect(mocks.save).toHaveBeenCalledOnce();
    finishPage({ available: true, page: { items: [{ ...archivedSpotify, id: "archived-20" }], total: 21, offset: 20 } });
    await loading;
    expect(savedPayload("items")[0].label).toBe("Saved during archive read");
    expect(savedPayload("expectedVersions")).toEqual({ spotify: restoredVersion });
    expect(button("Save shortcuts").props.disabled).toBe(true);
  });
});
