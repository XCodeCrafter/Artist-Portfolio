import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BioEditor from "@/components/admin/v2/BioEditor";
import BioPreviewFrame from "@/components/admin/v2/BioPreviewFrame";
import { createFallbackBioEditorSnapshot, INITIAL_BIO_SAVE_STATE, type BioEditorDraft, type BioEditorSnapshot } from "@/lib/admin/bio-editor";

// Event-handler tests exercise draft isolation; browser QA covers layout and focus.
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

const version = "2026-10-08T10:00:00.000001Z";
const credit = { id: "credit-one", creditType: "film" as const, title: "First film", role: "Lead", production: "Studio", director: "Director", year: "2026", href: "", isPublished: true };
let snapshot: BioEditorSnapshot;
let overrides: Partial<Parameters<typeof BioEditor>[0]>;
type Element = ReactElement<Record<string, unknown>>;
const expand = new Set(["Field", "MoveButtons", "VisibilityToggle", "VisibilityInspector", "ResumeCreditsStatus", "InspectorFields", "InspectorHeader", "HeroInspector", "BiographyInspector", "ResumeInspector", "CreditsInspector", "CollectionHeader", "BioContentArchivePanel"]);
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
    archiveData: { portraits: empty, paragraphs: empty, credits: empty }, ...overrides,
  });
}
function button(label: string) {
  const node = nodes(render()).find(node => node.type === "button" && (node.props["aria-label"] === label || text(node.props.children as ReactNode).trim() === label));
  if (!node) throw new Error(`Missing button: ${label}`);
  return node;
}
function click(node: Element) { return (node.props.onClick as () => void | Promise<void>)(); }
function select(section = "Visibility") { click(button(section)); }
function toggle() { click(button("Show Resume & Credits")); }
function field(label: string, value: string) {
  const node = nodes(render()).find(node => node.type === "label" && text(node.props.children as ReactNode).startsWith(label))!;
  const input = nodes(node.props.children as ReactNode).find(child => child.type === "input" || child.type === "textarea")!;
  (input.props.onChange as (event: unknown) => void)({ target: { value } });
}
function payload(name = "payload") { return JSON.parse(nodes(render()).find(node => node.type === "input" && node.props.name === name)!.props.value as string); }
function preview(): BioEditorDraft { return nodes(render()).find(node => node.type === BioPreviewFrame)!.props.draft as BioEditorDraft; }
async function submitVisibility() {
  const form = new FormData(); form.set("section", "visibility"); form.set("payload", JSON.stringify(payload())); form.set("versions", JSON.stringify(payload("versions")));
  return (mocks.saveAction as (state: unknown, form: FormData) => Promise<unknown>)(INITIAL_BIO_SAVE_STATE, form);
}

beforeEach(() => {
  vi.clearAllMocks(); mocks.values = []; mocks.cursor = 0; mocks.saveAction = undefined; overrides = {};
  snapshot = createFallbackBioEditorSnapshot(); snapshot.visibilityAvailable = true;
  snapshot.versions.visibility = { updatedAt: version };
  snapshot.draft.credits = { items: [credit] }; snapshot.versions.credits = { items: { [credit.id]: version } };
  vi.stubGlobal("window", { matchMedia: () => ({ matches: true }), location: { reload: vi.fn() } });
});
afterEach(() => vi.unstubAllGlobals());

describe("Bio Resume & Credits visibility inspector", () => {
  it("shows a named ON switch and keeps a single section-save form", () => {
    select();
    expect(button("Show Resume & Credits").props).toMatchObject({ role: "switch", "aria-checked": true, disabled: false, type: "button" });
    expect(text(button("Show Resume & Credits").props.children as ReactNode)).toContain("ON");
    expect(text(render())).toContain("without deleting saved content");
    expect(nodes(render()).filter(node => node.type === "form")).toHaveLength(1);
    expect(button("Save Visibility").props.disabled).toBe(true);
  });

  it("updates only the local visibility draft and clearly labels unsaved preview state", () => {
    select(); toggle();
    expect(button("Show Resume & Credits").props["aria-checked"]).toBe(false);
    expect(text(button("Show Resume & Credits").props.children as ReactNode)).toContain("OFF");
    expect(payload()).toEqual({ resumeCreditsEnabled: false });
    expect(payload("versions")).toEqual({ updatedAt: version });
    expect(preview().visibility.resumeCreditsEnabled).toBe(false);
    expect(preview().resume).toEqual(snapshot.draft.resume); expect(preview().credits).toEqual(snapshot.draft.credits);
    expect(text(render())).toContain("Preview only: Resume & Credits will be hidden after saving Visibility.");
    expect(text(render())).toContain("Resume & Credits are visible on the website.");
    expect(mocks.markDirty).toHaveBeenCalled(); expect(button("Save Visibility").props.disabled).toBe(false);
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.archive).not.toHaveBeenCalled();
  });

  it("preserves other drafts when discarding Visibility", () => {
    field("Main title", "Keep Hero draft"); select("Resume"); field("Headline", "Keep Resume draft");
    select("Credits"); field("Title", "Keep Credits draft"); select(); toggle();
    click(button("Discard changes in Visibility"));
    expect(preview().visibility.resumeCreditsEnabled).toBe(true); expect(button("Save Visibility").props.disabled).toBe(true);
    expect(preview().hero.title).toBe("Keep Hero draft"); expect(preview().resume.headline).toBe("Keep Resume draft");
    expect(preview().credits.items[0].title).toBe("Keep Credits draft"); expect(mocks.clearDirty).not.toHaveBeenCalled();
  });

  it("keeps both content inspectors editable while the saved block is hidden", () => {
    snapshot.draft.visibility.resumeCreditsEnabled = false;
    select("Resume"); expect(text(render())).toContain("Hidden on the website. Saved content is kept.");
    field("Headline", "Updated hidden resume"); expect(button("Save Resume").props.disabled).toBe(false);
    select("Credits"); expect(text(render())).toContain("Hidden on the website. Saved content is kept.");
    field("Title", "Updated hidden credit"); expect(button("Save Credits").props.disabled).toBe(false);
    expect(preview().visibility.resumeCreditsEnabled).toBe(false);
    select(); expect(button("Show Resume & Credits").props["aria-checked"]).toBe(false); toggle();
    expect(text(render())).toContain("Preview only: Resume & Credits will be shown after saving Visibility.");
  });

  it("saves the boolean through the existing action and keeps sibling drafts dirty", async () => {
    field("Main title", "Keep Hero draft"); select("Resume"); field("Headline", "Keep Resume draft");
    select("Credits"); field("Title", "Keep Credits draft"); select(); toggle();
    const savedVersion = "2026-10-08T10:01:00.000002Z";
    mocks.save.mockResolvedValue({ status: "saved", eventId: "visibility-saved", message: "Visibility saved.", section: "visibility", canonicalSection: { resumeCreditsEnabled: false }, versions: { updatedAt: savedVersion } });
    await submitVisibility();
    expect(mocks.save).toHaveBeenCalledOnce(); expect(mocks.archive).not.toHaveBeenCalled();
    expect(button("Save Visibility").props.disabled).toBe(true); expect(payload("versions")).toEqual({ updatedAt: savedVersion });
    expect(text(render())).toContain("Hidden on the website. Saved content is kept.");
    expect(text(render())).not.toContain("Preview only:"); expect(mocks.clearDirty).not.toHaveBeenCalled();
    select("Hero"); expect(payload().title).toBe("Keep Hero draft"); expect(button("Save Hero").props.disabled).toBe(false);
    select("Resume"); expect(payload().headline).toBe("Keep Resume draft"); expect(button("Save Resume").props.disabled).toBe(false);
    select("Credits"); expect(payload().items[0].title).toBe("Keep Credits draft"); expect(button("Save Credits").props.disabled).toBe(false);
  });

  it("clears the existing dirty guard after saving the only changed section", async () => {
    select(); toggle();
    mocks.save.mockResolvedValue({ status: "saved", eventId: "visibility-only", message: "Visibility saved.", section: "visibility", canonicalSection: { resumeCreditsEnabled: false }, versions: { updatedAt: version } });
    await submitVisibility(); expect(mocks.clearDirty).toHaveBeenCalledOnce(); expect(button("Save Visibility").props.disabled).toBe(true);
  });

  it.each(["error", "conflict", "migration-required"])("keeps visibility and sibling drafts after a %s result", async status => {
    field("Main title", "Keep Hero draft"); select(); toggle();
    mocks.save.mockResolvedValue({ status, eventId: `visibility-${status}`, message: "Not saved.", section: "visibility" });
    await submitVisibility();
    expect(payload()).toEqual({ resumeCreditsEnabled: false }); expect(payload("versions")).toEqual({ updatedAt: version });
    expect(preview().hero.title).toBe("Keep Hero draft"); expect(mocks.clearDirty).not.toHaveBeenCalled();
    expect(text(render())).toContain("Preview only:");
  });

  it("scopes unavailable migration gating to Visibility and guards direct submission", async () => {
    delete snapshot.visibilityAvailable; select();
    expect(button("Show Resume & Credits").props.disabled).toBe(true); expect(button("Save Visibility").props.disabled).toBe(true);
    expect(text(render())).toContain("migration 0059");
    expect(text(render())).toContain("Saved website visibility is unavailable.");
    expect(text(render())).not.toContain("Resume & Credits are visible on the website.");
    toggle(); expect(preview().visibility.resumeCreditsEnabled).toBe(true);
    await submitVisibility(); expect(mocks.save).not.toHaveBeenCalled();
    for (const [section, label] of [["Hero", "Main title"], ["Biography", "Top label"], ["Resume", "Headline"], ["Credits", "Title"]]) {
      select(section); field(label, `Editable ${section}`); expect(button(`Save ${section}`).props.disabled).toBe(false);
      expect(nodes(render()).find(node => node.type === "fieldset")?.props.disabled).toBe(false);
    }
  });

  it("does not let an invalid Credits draft block an independent Visibility save", () => {
    select("Credits"); field("Title", ""); expect(button("Save Credits").props.disabled).toBe(true);
    select(); toggle(); expect(button("Save Visibility").props.disabled).toBe(false);
    expect(preview().credits.items[0].title).toBe("");
  });

  it("exposes the same switch and save behavior in the mobile inspector", () => {
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }), location: { reload: vi.fn() } });
    select();
    const dialog = nodes(render()).find(node => node.type === "dialog")!;
    const mobileSwitch = nodes(dialog.props.children as ReactNode).find(node => node.props.role === "switch")!;
    expect(mobileSwitch.props).toMatchObject({ "aria-label": "Show Resume & Credits", "aria-checked": true, "aria-describedby": "mobile-bio-visibility-hint" });
    click(mobileSwitch);
    const mobileSave = nodes(nodes(render()).find(node => node.type === "dialog")!.props.children as ReactNode).find(node => node.type === "button" && text(node.props.children as ReactNode).trim() === "Save Visibility")!;
    expect(mobileSave.props.disabled).toBe(false); expect(preview().visibility.resumeCreditsEnabled).toBe(false);
    expect(nodes(render()).filter(node => node.type === "form")).toHaveLength(1);
  });
});
