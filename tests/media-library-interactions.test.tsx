import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MediaLibraryEditor from "@/components/admin/v2/MediaLibraryEditor";
import MediaLibraryUpload from "@/components/admin/v2/MediaLibraryUpload";
import type { MediaAsset } from "@/lib/admin/media";

// Exercise the actual handlers with a small deterministic hook store. This
// does not claim browser layout/focus coverage or emulate the shared dialog.
const mocks = vi.hoisted(() => ({
  values: [] as unknown[], cursor: 0, dirty: false, allowDiscard: true,
  markDirty: vi.fn(), clearDirty: vi.fn(), confirmDiscard: vi.fn(), refresh: vi.fn(),
  save: vi.fn(), mutate: vi.fn(),
}));
vi.mock("react", async (original) => {
  const react = await original<typeof import("react")>();
  return {
    ...react,
    useState: (initial: unknown) => {
      const index = mocks.cursor++;
      if (!(index in mocks.values)) mocks.values[index] = typeof initial === "function" ? initial() : initial;
      return [mocks.values[index], (next: unknown) => { mocks.values[index] = typeof next === "function" ? next(mocks.values[index]) : next; }];
    },
    useRef: () => ({ current: null }),
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/app/admin/v2/media/actions", () => ({ saveMediaDetailsV2: mocks.save, mutateMediaAssetV2: mocks.mutate }));
vi.mock("@/lib/admin/media-upload-actions", () => ({ prepareMediaUpload: vi.fn(), finalizeMediaUpload: vi.fn() }));
vi.mock("@/components/admin/useUnsavedChangesGuard", () => ({ default: () => ({
  hasUnsavedChanges: mocks.dirty, markDirty: mocks.markDirty, clearDirty: mocks.clearDirty, confirmDiscard: mocks.confirmDiscard,
}) }));

const photo: MediaAsset = {
  id: "portrait", label: "Portrait", src: "/images/portrait.jpg", alt: "Portrait description", usageKey: "Press",
  mediaType: "image", sortOrder: 10, isPublished: true, storageBucket: "portfolio-media", storagePath: "portrait.jpg",
  fileSize: 1000, mimeType: "image/jpeg", metadata: {}, createdAt: "2026-09-20T10:00:00Z",
  updatedAt: "2026-09-20T10:00:00.000001Z", deletedAt: "", deletedBy: "",
};
type Element = ReactElement<Record<string, unknown>>;
function nodes(tree: ReactNode): Element[] {
  return Children.toArray(tree).flatMap(node => isValidElement<Record<string, unknown>>(node)
    ? [node, ...nodes(node.props.children as ReactNode)] : []);
}
function text(tree: ReactNode): string {
  return Children.toArray(tree).map(node => isValidElement<Record<string, unknown>>(node)
    ? text(node.props.children as ReactNode) : String(node)).join("");
}
let overrides: Partial<Parameters<typeof MediaLibraryEditor>[0]> = {};
function render() {
  mocks.cursor = 0;
  return MediaLibraryEditor({ assets: [photo], usage: { portrait: [{ label: "Bio", count: 1 }] }, disabled: false, ...overrides });
}
function button(label: string) {
  const found = nodes(render()).find(node => node.type === "button" && text(node.props.children as ReactNode).trim() === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}
function click(node: Element) { return (node.props.onClick as () => void | Promise<void>)(); }
function change(label: string, value: string | boolean) {
  const fieldLabel = nodes(render()).find(node => node.type === "label" && text(node.props.children as ReactNode).startsWith(label));
  const field = fieldLabel && nodes(fieldLabel.props.children as ReactNode).find(node => ["input","textarea","select"].includes(node.type as string));
  if (!field) throw new Error(`Missing field: ${label}`);
  (field.props.onChange as (event: unknown) => void)({ target: typeof value === "boolean" ? { checked: value } : { value } });
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.values = []; mocks.cursor = 0; mocks.dirty = false; mocks.allowDiscard = true;
  overrides = {};
  mocks.save.mockResolvedValue({ ok: false, message: "Test response" });
  mocks.markDirty.mockImplementation(() => { mocks.dirty = true; });
  mocks.clearDirty.mockImplementation((callback?: () => void) => { mocks.dirty = false; callback?.(); });
  mocks.confirmDiscard.mockImplementation((callback?: () => void) => {
    if (!mocks.dirty || mocks.allowDiscard) { mocks.dirty = false; callback?.(); return true; }
    return false;
  });
  const choose = nodes(render()).find(node => node.props["aria-label"] === "Edit Portrait")!;
  click(choose);
});
afterEach(() => vi.unstubAllGlobals());

describe("Media details dirty-state interaction", () => {
  it.each([
    ["File name", "Changed name", photo.label],
    ["Image description / alt text", "Changed description", photo.alt],
    ["Library note", "Changed note", photo.usageKey],
    ["Available for new page placements", false, photo.isPublished],
  ] as const)("clears dirty protection when %s returns to its original value", (label, changed, original) => {
    change(label, changed);
    expect(mocks.dirty).toBe(true);
    expect(button("Save details").props.disabled).toBe(false);
    change(label, original);
    expect(mocks.dirty).toBe(false);
    expect(button("Save details").props.disabled).toBe(true);
    expect(button("Replace & remove file").props.disabled).toBe(false);
    expect(nodes(render()).find(node => node.type === MediaLibraryUpload)?.props.disabled).toBe(false);
  });
  it("retains dirty protection when another detail still differs", () => {
    change("File name", "Draft name");
    change("Library note", "Draft note");
    change("File name", photo.label);
    expect(mocks.dirty).toBe(true);
    expect(button("Replace & remove file").props.disabled).toBe(true);
    change("Library note", photo.usageKey);
    expect(mocks.dirty).toBe(false);
  });
  it("uses shared confirmation without losing the draft when discard is cancelled", () => {
    change("File name", "Keep this draft");
    mocks.allowDiscard = false;
    click(button("Discard changes"));
    expect(mocks.confirmDiscard).toHaveBeenCalled();
    expect(mocks.dirty).toBe(true);
    expect(nodes(render()).some(node => node.type === "input" && node.props.value === "Keep this draft")).toBe(true);
    mocks.allowDiscard = true;
    click(button("Discard changes"));
    expect(mocks.dirty).toBe(false);
    expect(nodes(render()).some(node => node.type === "input" && node.props.value === photo.label)).toBe(true);
  });
});

describe("Media browsing without losing drafts", () => {
  it("keeps the chosen draft and its original CAS while filters, sort and search change", async () => {
    change("File name", "My unsaved portrait");
    change("Quick filter", "oversized");
    change("New placements", "unavailable");
    change("Sort files", "largest");
    change("Search media", "unmatched");
    expect(text(render())).toContain("The selected file is outside these results");
    expect(nodes(render()).some(node => node.props.value === "My unsaved portrait")).toBe(true);
    expect(mocks.dirty).toBe(true);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.mutate).not.toHaveBeenCalled();
    click(button("Clear filters"));
    expect(nodes(render()).some(node => node.props["aria-label"] === "Edit Portrait")).toBe(true);
    expect(nodes(render()).some(node => node.props.value === "My unsaved portrait")).toBe(true);
    const form = nodes(render()).find(node => node.type === "form")!;
    await (form.props.onSubmit as (event: unknown) => Promise<void>)({ preventDefault: vi.fn() });
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ id: photo.id, label: "My unsaved portrait", expectedUpdatedAt: photo.updatedAt }));
  });
  it("does not lose edits when selecting a different file is cancelled", () => {
    overrides.assets = [photo, { ...photo, id: "next", label: "Second portrait" }];
    change("File name", "Keep draft");
    mocks.allowDiscard = false;
    click(nodes(render()).find(node => node.props["aria-label"] === "Edit Second portrait")!);
    expect(nodes(render()).some(node => node.props.value === "Keep draft")).toBe(true);
    expect(mocks.dirty).toBe(true);
    mocks.allowDiscard = true;
    click(nodes(render()).find(node => node.props["aria-label"] === "Edit Second portrait")!);
    expect(nodes(render()).some(node => node.props.value === "Second portrait")).toBe(true);
    expect(mocks.dirty).toBe(false);
  });
  it.each(["changed", "removed"])("keeps a filtered-out draft read-only if the selected asset is %s elsewhere", (mode) => {
    change("File name", "Keep stale draft");
    change("Quick filter", "oversized");
    overrides.assets = mode === "removed" ? [] : [{ ...photo, updatedAt: "2026-09-21T12:00:00Z" }];
    const tree = render();
    expect(text(tree)).toContain("Your local draft has been kept");
    expect(nodes(tree).some(node => node.props.value === "Keep stale draft")).toBe(true);
    expect(nodes(tree).find(node => node.type === "fieldset")?.props.disabled).toBe(true);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("does not keep listing apparently unused files when the usage read fails after filtering", () => {
    overrides.usage = {};
    click(button("Unused"));
    expect(nodes(render()).some(node => node.props["aria-label"] === "Edit Portrait")).toBe(true);
    overrides.usageError = "Usage unavailable";
    expect(nodes(render()).some(node => node.props["aria-label"] === "Edit Portrait")).toBe(false);
    expect(button("Unused").props.disabled).toBe(true);
    expect(text(render())).toContain("Removal is disabled");
  });
  it("uses the refreshed server clock so a newly uploaded file appears under Recent", () => {
    const initialTime = Date.parse("2026-09-21T12:00:00Z");
    overrides.referenceTime = initialTime;
    change("Quick filter", "recent");
    const uploaded = { ...photo, id: "new-upload", label: "New upload", createdAt: "2026-09-21T12:01:00Z" };
    overrides.assets = [photo, uploaded];
    overrides.referenceTime = initialTime + 61_000;
    expect(nodes(render()).some(node => node.props["aria-label"] === "Edit New upload")).toBe(true);
  });
});

describe("Media public URL copying", () => {
  it("copies the original URL only after clipboard success without saving metadata", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    change("File name", "Unsaved");
    await click(button("Copy URL"));
    expect(writeText).toHaveBeenCalledWith(photo.src);
    expect(text(render())).toContain("URL copied.");
    expect(mocks.dirty).toBe(true);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it.each(["denied", "missing"])("offers manual copying when clipboard is %s", async (mode) => {
    vi.stubGlobal("navigator", mode === "missing" ? {} : { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    await click(button("Copy URL"));
    expect(text(render())).toContain("Clipboard unavailable. Select and copy the URL field below.");
    expect(text(render())).not.toContain("URL copied.");
    expect(nodes(render()).some(node => node.type === "input" && node.props.readOnly && node.props.value === photo.src)).toBe(true);
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
