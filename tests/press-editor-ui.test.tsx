import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PressEditor from "@/components/admin/v2/PressEditor";
import PressPreviewFrame from "@/components/admin/v2/PressPreviewFrame";
import { INITIAL_HOME_SAVE_STATE, type HomeSaveState } from "@/lib/admin/home-editor";
import { createHomeEditorialDefaults, MAX_HOME_PRESS_ITEMS, type HomePress, type HomePressItem } from "@/lib/admin/home-editorial";

const mocks = vi.hoisted(() => ({
  values: [] as unknown[], cursor: 0, pending: false,
  action: undefined as undefined | ((form: FormData) => Promise<HomeSaveState>),
  save: vi.fn(), markDirty: vi.fn(), clearDirty: vi.fn(), confirmDiscard: vi.fn(),
}));
vi.mock("react", async original => {
  const react = await original<typeof import("react")>();
  function state(initial: unknown): [unknown, (value: unknown) => void] {
    const index = mocks.cursor++;
    if (!(index in mocks.values)) mocks.values[index] = typeof initial === "function" ? initial() : initial;
    return [mocks.values[index], next => { mocks.values[index] = typeof next === "function" ? next(mocks.values[index]) : next; }];
  }
  return { ...react, useState: state, useRef: (initial: unknown) => state({ current: initial })[0],
    useMemo: (read: () => unknown) => read(), useCallback: (callback: unknown) => callback, useEffect: () => {},
    useActionState: (action: (previous: HomeSaveState, form: FormData) => Promise<HomeSaveState>, initial: HomeSaveState) => {
      const [value, setValue] = state(initial);
      mocks.action = async (form: FormData) => {
        mocks.pending = true;
        try { const result = await action(value as HomeSaveState, form); setValue(result); return result; }
        finally { mocks.pending = false; }
      };
      return [value, mocks.action, mocks.pending];
    },
  };
});
vi.mock("@/app/admin/v2/pages/press/actions", () => ({ savePressPageV2: mocks.save }));
vi.mock("@/components/admin/useUnsavedChangesGuard", () => ({ default: () => ({ markDirty: mocks.markDirty, clearDirty: mocks.clearDirty, confirmDiscard: mocks.confirmDiscard }) }));
vi.mock("@/components/admin/v2/PressPreviewFrame", () => ({ default: () => null }));

type Element = ReactElement<Record<string, unknown>>;
let props: Parameters<typeof PressEditor>[0];
const expandable = new Set(["HomeEditorialInspector", "Field", "ImageField"]);
const version = "2026-10-08T14:00:00.000001Z";
const nextVersion = "2026-10-08T14:00:00.000002Z";
function nodes(tree: ReactNode): Element[] {
  return Children.toArray(tree).flatMap(node => {
    if (!isValidElement<Record<string, unknown>>(node)) return [];
    if (typeof node.type === "function" && expandable.has(node.type.name)) return nodes((node.type as (props: Record<string, unknown>) => ReactNode)(node.props));
    return [node, ...nodes(node.props.children as ReactNode)];
  });
}
function text(tree: ReactNode): string {
  return Children.toArray(tree).map(node => !isValidElement<Record<string, unknown>>(node) ? String(node) : text(node.props.children as ReactNode)).join("");
}
function render() { mocks.cursor = 0; return nodes(PressEditor(props)); }
function find(test: (node: Element) => boolean) { const node = render().find(test); if (!node) throw new Error("Requested Press control not found"); return node; }
function button(label: string) { return find(node => node.type === "button" && (node.props["aria-label"] === label || text(node.props.children as ReactNode).trim() === label)); }
function click(node: Element) { (node.props.onClick as () => void)(); }
function field(key: string, value: string | boolean) { (find(node => node.props.id === `desktop-home-press-${key}`).props.onChange as (event: unknown) => void)({ target: { value, checked: value } }); }
function draft() { return find(node => node.type === PressPreviewFrame).props.draft as HomePress; }
function hidden(name: string) { return find(node => node.type === "input" && node.props.name === name).props.value as string; }
function form() { const result = new FormData(); for (const name of ["section", "payload", "versions"]) result.set(name, hidden(name)); return result; }
function success(payload: unknown = draft()): HomeSaveState { return { status: "saved", eventId: crypto.randomUUID(), message: "Press saved", section: "press", canonicalSection: payload, versions: { updatedAt: nextVersion } }; }
function item(overrides: Partial<HomePressItem> = {}): HomePressItem { return { id: crypto.randomUUID(), kind: "review", title: "First review", publication: "Example publication", quote: "An attributed quotation.", date: "2026-10-08", href: "https://example.com/review", image: { src: "", alt: "", framing: null }, visible: true, ...overrides }; }
function content() { return render().filter(node => node.type === "p").map(node => text(node.props.children as ReactNode)).join("\n"); }

beforeEach(() => {
  vi.clearAllMocks(); mocks.values = []; mocks.cursor = 0; mocks.pending = false; mocks.action = undefined;
  mocks.confirmDiscard.mockImplementation((callback: () => void) => callback());
  props = { assets: [], disabled: false, migrationRequired: false, snapshot: { draft: createHomeEditorialDefaults().press, versions: { updatedAt: version } } };
  vi.stubGlobal("window", { matchMedia: () => ({ matches: true }), location: { reload: vi.fn() } });
});
afterEach(() => vi.unstubAllGlobals());

describe("Standalone Press collection editor", () => {
  it("loads existing heading, intro and all records without changing data on mount", () => {
    props.snapshot.draft = { ...props.snapshot.draft, title: "Saved heading", body: "Saved introduction", items: [item(), item({ title: "Hidden interview", kind: "interview", visible: false })] };
    expect(draft()).toEqual(props.snapshot.draft); expect(button("Save Press & reviews").props.disabled).toBe(true);
    expect(render().filter(node => node.type === "form")).toHaveLength(1);
    expect(find(node => node.props.href === "/press")).toBeDefined();
    expect(text(find(node => node.props.htmlFor === "desktop-home-press-featured").props.children as ReactNode)).toContain("Featured press item");
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("keeps empty guidance and correct public storage wording", () => {
    expect(content()).toContain("No press items yet."); expect(content()).toContain("public website configuration");
    expect(content()).not.toContain("public Home configuration"); expect(content()).toContain("Only visible items appear on the Press page.");
  });
  it("creates a hidden blank item and requires attributed content before saving", () => {
    click(button("Add press item"));
    expect(draft().items[0]).toMatchObject({ title: "", publication: "", quote: "", visible: false });
    expect(button("Save Press & reviews").props.disabled).toBe(true);
    field("item-title", "A real review"); field("item-publication", "A real publication"); field("item-quote", "The quotation.");
    expect(button("Save Press & reviews").props.disabled).toBe(false); expect(draft().items[0].visible).toBe(false);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("edits and reorders selected items by stable identity, preserving all other records", () => {
    const first = item(); const second = item({ title: "Second review" }); props.snapshot.draft.items = [first, second];
    field("item-kind", "interview"); field("item-date", "2026-08-15"); field("item-href", "https://example.com/interview");
    field("featured", first.id); field("item-visible", false);
    expect(draft().featuredId).toBe(""); expect(draft().items[1]).toEqual(second);
    expect(draft().items[0]).toMatchObject({ kind: "interview", date: "2026-08-15", href: "https://example.com/interview", visible: false });
    click(button("Move selected press item down")); expect(draft().items.map(row => row.id)).toEqual([second.id, first.id]);
    expect(find(node => node.props.id === "desktop-home-press-item-selector").props.value).toBe(first.id);
    field("item-selector", second.id); field("item-title", "Changed second review"); expect(draft().items[1].title).toBe(first.title);
  });
  it("confirms removal locally, clears feature selection and restores all fields on discard", () => {
    const entry = item(); props.snapshot.draft.items = [entry]; props.snapshot.draft.featuredId = entry.id;
    field("title", "New heading"); field("body", "New intro"); click(button("Remove press item"));
    expect(content()).toContain("Remove this item from Press?"); click(button("Keep item")); expect(draft().items).toHaveLength(1);
    click(button("Remove press item")); click(button("Confirm removal"));
    expect(draft().items).toEqual([]); expect(draft().featuredId).toBe(""); expect(mocks.save).not.toHaveBeenCalled();
    click(button("Discard Press changes")); expect(draft()).toEqual(props.snapshot.draft); expect(mocks.clearDirty).toHaveBeenCalled();
  });
  it("enforces the collection limit even on direct add handler invocation", () => {
    props.snapshot.draft.items = Array.from({ length: MAX_HOME_PRESS_ITEMS }, () => item());
    expect(button("Add press item").props.disabled).toBe(true); click(button("Add press item")); expect(draft().items).toHaveLength(20);
  });
  it("saves heading, intro, ordering and all items atomically with the exact shared CAS", async () => {
    props.snapshot.draft.items = [item(), item({ title: "Second review" })];
    field("title", "  New heading  "); field("body", "New introduction"); click(button("Move selected press item down"));
    const submitted = structuredClone(draft()); mocks.save.mockResolvedValue(success(submitted)); const data = form();
    await mocks.action!(data);
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith(INITIAL_HOME_SAVE_STATE, data);
    expect(JSON.parse(data.get("payload") as string)).toEqual(submitted); expect(data.get("section")).toBe("press");
    expect(draft().title).toBe("New heading"); expect(draft().items.map(row => row.id)).toEqual(submitted.items.map(row => row.id));
    expect(JSON.parse(hidden("versions"))).toEqual({ updatedAt: nextVersion }); expect(button("Save Press & reviews").props.disabled).toBe(true);
    expect(mocks.clearDirty).toHaveBeenCalledOnce();
  });
  it.each(["wrong-section", "unchanged-version", "malformed-content", "transport"])("keeps drafts and blocks retries after %s", async failure => {
    field("title", "Keep draft"); const before = structuredClone(draft()); const result = success();
    if (failure === "wrong-section") result.section = "work";
    if (failure === "unchanged-version") result.versions = { updatedAt: version };
    if (failure === "malformed-content") result.canonicalSection = {};
    if (failure === "transport") mocks.save.mockRejectedValue(new Error("private details")); else mocks.save.mockResolvedValue(result);
    const state = await mocks.action!(form()); expect(state.status).toBe("error"); expect(draft()).toEqual(before);
    expect(JSON.parse(hidden("versions"))).toEqual({ updatedAt: version }); expect(button("Save Press & reviews").props.disabled).toBe(true);
    await mocks.action!(form()); expect(mocks.save).toHaveBeenCalledOnce(); expect(content()).not.toContain("private details");
    click(button("Reload saved Press")); expect(mocks.confirmDiscard).toHaveBeenCalledOnce();
  });
  it("keeps the draft on cross-editor conflict and requires reload", async () => {
    field("body", "Keep introduction"); mocks.save.mockResolvedValue({ status: "conflict", eventId: "conflict", message: "Content changed elsewhere.", section: "press" });
    await mocks.action!(form()); expect(draft().body).toBe("Keep introduction"); expect(button("Save Press & reviews").props.disabled).toBe(true);
    expect(button("Discard Press changes").props.disabled).toBe(true); expect(button("Reload saved Press")).toBeDefined();
  });
  it.each(["disabled", "migrationRequired", "loadError"])("keeps %s review-only including direct handlers", mode => {
    if (mode === "loadError") props.loadError = "Unavailable"; else props[mode as "disabled" | "migrationRequired"] = true;
    field("title", "Blocked change"); expect(draft().title).toBe(props.snapshot.draft.title);
    expect(button("Save Press & reviews").props.disabled).toBe(true); expect(find(node => node.type === PressPreviewFrame).props.isLive).toBe(false);
  });
  it("rejects stale payloads and another section before invoking the server action", async () => {
    field("title", "Current draft"); const stale = form(); field("title", "Newer draft"); await mocks.action!(stale);
    const other = form(); other.set("section", "work"); await mocks.action!(other); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("suppresses double submissions and changes queued during an in-flight request", async () => {
    field("title", "Submitted"); const data = form(); const submitted = structuredClone(draft()); let finish: (result: HomeSaveState) => void = () => {};
    mocks.save.mockImplementation(() => new Promise(resolve => { finish = resolve; })); const work = mocks.action!(data);
    field("title", "Queued change"); expect(draft().title).toBe("Submitted"); await mocks.action!(data); expect(mocks.save).toHaveBeenCalledOnce();
    finish(success(submitted)); await work; render(); await mocks.action!(data); expect(mocks.save).toHaveBeenCalledOnce();
  });
});
