import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BioEditor from "@/components/admin/v2/BioEditor";
import BioPreviewFrame from "@/components/admin/v2/BioPreviewFrame";
import { createFallbackBioEditorSnapshot, INITIAL_BIO_SAVE_STATE, parseBioBiographyDraft, type BioEditorDraft, type BioEditorSnapshot } from "@/lib/admin/bio-editor";

const mocks = vi.hoisted(() => ({
  values: [] as unknown[], cursor: 0, saveAction: undefined as unknown,
  save: vi.fn(), archive: vi.fn(), clearDirty: vi.fn(), markDirty: vi.fn(), confirmDiscard: vi.fn(),
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
    useActionState: (action: unknown, initial: unknown) => { mocks.saveAction = action; return [initial, action, false]; },
  };
});
vi.mock("@/app/admin/v2/pages/bio/actions", () => ({ saveBioSectionV2: mocks.save }));
vi.mock("@/app/admin/v2/pages/bio/archive-actions", () => ({ mutateBioContentArchive: mocks.archive, loadBioContentArchivePage: vi.fn() }));
vi.mock("@/components/admin/useUnsavedChangesGuard", () => ({ default: () => ({ clearDirty: mocks.clearDirty, markDirty: mocks.markDirty, confirmDiscard: mocks.confirmDiscard, hasUnsavedChanges: false }) }));
vi.mock("@/components/admin/v2/BioPreviewFrame", () => ({ default: () => null }));
vi.mock("@/components/admin/MediaAssetPicker", () => ({ default: () => null }));

const version = "2026-09-21T10:00:00.000001Z";
const portrait = { id: "portrait-one", src: "/images/portrait.webp", alt: "Main portrait", isPublished: true };
const paragraph = { id: "paragraph-one", body: "My first paragraph", revealDelay: 140, isPublished: true };
let snapshot: BioEditorSnapshot;
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
  const empty = { available: true, page: { items: [], total: 0, offset: 0 } };
  return BioEditor({ snapshot, assets: [], disabled: false, migrationRequired: false,
    archiveData: { portraits: empty, paragraphs: empty, credits: empty },
  });
}
function button(label: string) {
  const node = nodes(render()).find(node => node.type === "button" && (node.props["aria-label"] === label || text(node.props.children as ReactNode).trim() === label));
  if (!node) throw new Error(`Missing button: ${label}`);
  return node;
}
function click(node: Element) { return (node.props.onClick as () => void | Promise<void>)(); }
function select(section = "Biography") { click(button(section)); }
function delay(index = 1) {
  const input = nodes(render()).find(node => node.type === "input" && node.props["aria-label"] === `Paragraph ${index} animation delay (ms)`);
  if (!input) throw new Error(`Missing paragraph ${index} timing input`);
  return input;
}
function changeDelay(value: string, index = 1) {
  (delay(index).props.onChange as (event: unknown) => void)({ target: { value } });
}
function field(label: string, value: string) {
  const node = nodes(render()).find(node => node.type === "label" && text(node.props.children as ReactNode).startsWith(label))!;
  const input = nodes(node.props.children as ReactNode).find(child => child.type === "input" || child.type === "textarea")!;
  (input.props.onChange as (event: unknown) => void)({ target: { value } });
}
function payload(name = "payload") { return JSON.parse(nodes(render()).find(node => node.type === "input" && node.props.name === name)!.props.value as string); }
function preview(): BioEditorDraft { return nodes(render()).find(node => node.type === BioPreviewFrame)!.props.draft as BioEditorDraft; }

beforeEach(() => {
  vi.clearAllMocks(); mocks.values = []; mocks.cursor = 0; mocks.saveAction = undefined;
  snapshot = createFallbackBioEditorSnapshot();
  snapshot.draft.biography = { topLabel: "Biography", caption: "My story", introText: "Introduction", galleryImages: [portrait], paragraphs: [paragraph, { ...paragraph, id: "paragraph-two", body: "My second paragraph", revealDelay: 275 }] };
  snapshot.versions.biography = { profileUpdatedAt: version, galleryItems: { [portrait.id]: version }, paragraphItems: { [paragraph.id]: version, "paragraph-two": version } };
  vi.stubGlobal("window", { matchMedia: () => ({ matches: true }), location: { reload: vi.fn() } });
});
afterEach(() => vi.unstubAllGlobals());

describe("Bio paragraph animation timing", () => {
  it("is a collapsed Advanced control belonging to each paragraph, not Hero", () => {
    expect(nodes(render()).some(node => node.type === "input" && node.props.type === "number")).toBe(false);
    select(); const details = nodes(render()).filter(node => node.type === "details");
    expect(details.map(node => node.props["aria-label"])).toEqual(["Paragraph 1 advanced settings", "Paragraph 2 advanced settings"]);
    expect(details.every(node => node.props.open === undefined)).toBe(true);
    const input = delay(); expect(input.props).toMatchObject({ type: "number", min: 0, max: 5000, step: 1, required: true });
    expect(text(details[0].props.children as ReactNode)).toContain("Animation delay (ms)");
  });
  it.each([0, 1473, 5000])("keeps loaded timing %s unchanged", value => {
    snapshot.draft.biography.paragraphs = [{ ...paragraph, revealDelay: value }]; select();
    expect(delay().props.value).toBe(value); expect(payload().paragraphs[0].revealDelay).toBe(value);
    expect(preview().biography.paragraphs[0].revealDelay).toBe(value); expect(button("Save Biography").props.disabled).toBe(true);
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.archive).not.toHaveBeenCalled();
  });
  it.each(["0", "375", "5000"])("updates valid timing %s in preview and normal payload without a write", value => {
    select(); changeDelay(value);
    expect(payload().paragraphs[0].revealDelay).toBe(Number(value)); expect(preview().biography.paragraphs[0].revealDelay).toBe(Number(value));
    expect(payload().paragraphs[1].revealDelay).toBe(275); expect(button("Save Biography").props.disabled).toBe(false);
    expect(mocks.markDirty).toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.archive).not.toHaveBeenCalled();
  });
  it.each(["", "-1", "5001", "12.5", "not-a-number", "Infinity"])("keeps invalid input %j unsaved and never sends it to animation preview", value => {
    select(); changeDelay(value);
    expect(button("Save Biography").props.disabled).toBe(true); expect(parseBioBiographyDraft(payload()).success).toBe(false);
    expect(text(render())).toContain("Enter a whole number from 0 to 5000 milliseconds.");
    expect(preview().biography.paragraphs[0].revealDelay).toBe(140); expect(Number.isFinite(preview().biography.paragraphs[0].revealDelay)).toBe(true);
    expect(button("Archive Paragraph 1").props.disabled).toBe(true); expect(button("Archive Main portrait").props.disabled).toBe(true);
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.archive).not.toHaveBeenCalled();
  });
  it("does not turn a cleared zero into an unchanged or publishable draft", () => {
    snapshot.draft.biography.paragraphs[0] = { ...paragraph, revealDelay: 0 }; select(); changeDelay("");
    expect(delay().props.value).toBe(""); expect(payload().paragraphs[0].revealDelay).toBeNull();
    expect(button("Save Biography").props.disabled).toBe(true); expect(button("Archive Paragraph 1").props.disabled).toBe(true);
    changeDelay("0"); expect(payload().paragraphs[0].revealDelay).toBe(0); expect(button("Archive Paragraph 1").props.disabled).toBe(false);
  });
  it("recovers from a half-entered timing without clamping and keeps other edits", () => {
    select(); field("Intro text", "Keep introduction draft"); changeDelay(""); changeDelay("5001");
    expect(delay().props.value).toBe(5001); changeDelay("250");
    expect(payload().introText).toBe("Keep introduction draft"); expect(payload().paragraphs[0].revealDelay).toBe(250);
    expect(button("Save Biography").props.disabled).toBe(false);
  });
  it("keeps existing paragraph-creation defaults unchanged", () => {
    select(); click(button("Add Biography paragraphs"));
    expect(payload().paragraphs.map((item: { revealDelay: number }) => item.revealDelay)).toEqual([140, 275, 260]);
    expect(delay(3).props.value).toBe(260);
    changeDelay("", 3); expect(preview().biography.paragraphs[2].revealDelay).toBe(0); expect(button("Save Biography").props.disabled).toBe(true);
  });
  it("preserves sibling section drafts when discarding timing changes", () => {
    field("Main title", "Keep Hero draft"); select(); changeDelay(""); click(button("Discard changes in Biography"));
    expect(delay().props.value).toBe(140); expect(button("Save Biography").props.disabled).toBe(true); expect(button("Archive Paragraph 1").props.disabled).toBe(false);
    select("Hero"); expect(payload().title).toBe("Keep Hero draft"); expect(button("Save Hero").props.disabled).toBe(false);
  });
  it("keeps timing tied to paragraph identity when moving paragraphs", () => {
    select(); changeDelay("800"); click(button("Move paragraph 1 down"));
    expect(payload().paragraphs.map((item: { revealDelay: number }) => item.revealDelay)).toEqual([275, 800]);
    changeDelay("", 2); expect(preview().biography.paragraphs.map(item => item.revealDelay)).toEqual([275, 140]);
  });
  it("blocks an already-open archive confirmation after timing changes", async () => {
    select(); click(button("Archive Paragraph 1")); changeDelay("250");
    expect(button("Confirm archive").props.disabled).toBe(true); await click(button("Confirm archive")); expect(mocks.archive).not.toHaveBeenCalled();
  });
  it("does not make an invalid Biography timing block a separate Hero save", () => {
    select(); changeDelay(""); select("Hero"); field("Main title", "Independent Hero draft");
    expect(button("Save Hero").props.disabled).toBe(false); select(); expect(delay().props.value).toBe("");
    expect(button("Save Biography").props.disabled).toBe(true);
  });
  it("publishes timing through the existing complete Biography save only", async () => {
    select(); changeDelay("640"); const submitted = payload(); const versions = payload("versions");
    mocks.save.mockResolvedValue({ status: "saved", eventId: "timing-save", message: "Saved", section: "biography", canonicalSection: submitted, versions });
    const form = new FormData(); form.set("section", "biography"); form.set("payload", JSON.stringify(submitted)); form.set("versions", JSON.stringify(versions));
    await (mocks.saveAction as (state: unknown, form: FormData) => Promise<unknown>)(INITIAL_BIO_SAVE_STATE, form);
    expect(mocks.save).toHaveBeenCalledWith(INITIAL_BIO_SAVE_STATE, form); expect(mocks.archive).not.toHaveBeenCalled();
    expect(payload().galleryImages).toEqual([portrait]); expect(payload().paragraphs[0].revealDelay).toBe(640);
    expect(button("Save Biography").props.disabled).toBe(true);
  });
});
