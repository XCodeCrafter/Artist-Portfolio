import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HomeEditor from "@/components/admin/v2/HomeEditor";
import HomePreviewFrame from "@/components/admin/v2/HomePreviewFrame";
import MediaAssetPicker from "@/components/admin/MediaAssetPicker";
import PhotoFramingControls from "@/components/admin/v2/PhotoFramingControls";
import { createFallbackHomeEditorSnapshot, INITIAL_HOME_SAVE_STATE, type HomeEditorDraft, type HomeEditorSection, type HomeSaveState } from "@/lib/admin/home-editor";
import { MAX_HOME_PRESS_ITEMS, type HomePressItem } from "@/lib/admin/home-editorial";
import type { HeroFraming } from "@/lib/content/hero-framing";

const mocks = vi.hoisted(() => ({
  values: [] as unknown[], cursor: 0, pending: false,
  action: undefined as undefined | ((form: FormData) => Promise<HomeSaveState>),
  submission: undefined as undefined | Promise<HomeSaveState>, transition: vi.fn(),
  save: vi.fn(), markDirty: vi.fn(), clearDirty: vi.fn(), confirmDiscard: vi.fn(),
}));
vi.mock("react", async original => {
  const react = await original<typeof import("react")>();
  function state(initial: unknown): [unknown, (value: unknown) => void] {
    const index = mocks.cursor++;
    if (!(index in mocks.values)) mocks.values[index] = typeof initial === "function" ? initial() : initial;
    return [mocks.values[index], next => { mocks.values[index] = typeof next === "function" ? next(mocks.values[index]) : next; }];
  }
  return {
    ...react, startTransition: (callback: () => void) => { mocks.transition(); callback(); },
    useState: state, useRef: (initial: unknown) => state({ current: initial })[0],
    useCallback: (callback: unknown) => callback, useEffect: () => {},
    useActionState: (action: (previous: HomeSaveState, form: FormData) => Promise<HomeSaveState>, initial: HomeSaveState) => {
      const [value, setValue] = state(initial);
      mocks.action = (form: FormData) => {
        mocks.submission = (async () => {
          mocks.pending = true;
          try { const result = await action(value as HomeSaveState, form); setValue(result); return result; }
          finally { mocks.pending = false; }
        })();
        return mocks.submission;
      };
      return [value, mocks.action, mocks.pending];
    },
  };
});
vi.mock("@/app/admin/v2/pages/home/actions", () => ({ saveHomeSectionV2: mocks.save }));
vi.mock("@/components/admin/useUnsavedChangesGuard", () => ({ default: () => ({ markDirty: mocks.markDirty, clearDirty: mocks.clearDirty, confirmDiscard: mocks.confirmDiscard }) }));
vi.mock("@/components/admin/v2/HomePreviewFrame", () => ({ default: () => null }));

type Element = ReactElement<Record<string, unknown>>;
type Props = Parameters<typeof HomeEditor>[0];
let props: Props;
const expandable = new Set(["ContentInspector", "HomeEditorialInspector", "Field", "TextField", "ImageField"]);
const version = "2026-09-29T14:00:00.000001Z";
const nextVersion = "2026-09-29T14:00:01.000001Z";
const crop: HeroFraming = { desktop: { fit: "cover", x: 65, y: 20, zoom: 1.3 }, mobile: { fit: "contain", x: 40, y: 60, zoom: 1 } };

function nodes(tree: ReactNode): Element[] {
  return Children.toArray(tree).flatMap(node => {
    if (!isValidElement<Record<string, unknown>>(node)) return [];
    if (typeof node.type === "function" && expandable.has(node.type.name)) {
      return nodes((node.type as (props: Record<string, unknown>) => ReactNode)(node.props));
    }
    return [node, ...nodes(node.props.children as ReactNode)];
  });
}
function text(tree: ReactNode): string {
  return Children.toArray(tree).map(node => !isValidElement<Record<string, unknown>>(node)
    ? String(node) : text(node.props.children as ReactNode)).join("");
}
function render() { mocks.cursor = 0; return nodes(HomeEditor(props)); }
function find(test: (node: Element) => boolean) {
  const node = render().find(test);
  if (!node) throw new Error("Requested Home editor control not found");
  return node;
}
function button(label: string) { return find(node => node.type === "button" && (node.props["aria-label"] === label || text(node.props.children as ReactNode).trim() === label)); }
function click(node: Element) { (node.props.onClick as () => void)(); }
function field(id: string, value: string | boolean) {
  (find(node => node.props.id === id).props.onChange as (event: unknown) => void)({ target: { value, checked: value } });
}
function select(label: string) { click(button(label)); }
function preview() { return find(node => node.type === HomePreviewFrame); }
function draft() { return preview().props.draft as HomeEditorDraft; }
function hidden(name: string) { return find(node => node.type === "input" && node.props.name === name).props.value as string; }
function form() { const result = new FormData(); for (const name of ["section", "payload", "versions"]) result.set(name, hidden(name)); return result; }
function result(section: HomeEditorSection, payload: unknown): HomeSaveState {
  return { status: "saved", eventId: crypto.randomUUID(), message: "Home saved", section, canonicalSection: payload, versions: { updatedAt: nextVersion } } as HomeSaveState;
}
function pressItem(overrides: Partial<HomePressItem> = {}): HomePressItem {
  return { id: crypto.randomUUID(), kind: "review", title: "First review", publication: "Example publication", quote: "An attributed test quotation.", date: "2026-09-29", href: "https://example.com/review", image: { src: "", alt: "", framing: null }, visible: true, ...overrides };
}
function content() { return render().filter(node => node.type === "p").map(node => text(node.props.children as ReactNode)).join("\n"); }

beforeEach(() => {
  vi.clearAllMocks(); mocks.values = []; mocks.cursor = 0; mocks.pending = false; mocks.action = undefined; mocks.submission = undefined;
  mocks.confirmDiscard.mockImplementation((callback: () => void) => callback());
  props = { assets: [], disabled: false, migrationRequired: false, snapshot: { ...createFallbackHomeEditorSnapshot(), editorialAvailable: true, versions: { updatedAt: version } } };
  vi.stubGlobal("window", { matchMedia: () => ({ matches: true }), location: { reload: vi.fn() } });
});
afterEach(() => vi.unstubAllGlobals());

describe("Home editorial section inspector", () => {
  it("exposes three new sections and no obsolete Artist freelancer life editor", () => {
    expect(button("Latest release")).toBeDefined(); expect(button("Selected work")).toBeDefined(); expect(button("Press & reviews")).toBeDefined();
    expect(render().some(node => node.type === "button" && text(node.props.children as ReactNode) === "Stories")).toBe(false);
    expect(draft().layout.map(item => item.id)).not.toContain("stories");
    expect(draft().layout.find(item => item.id === "release")?.enabled).toBe(false);
    expect(draft().layout.find(item => item.id === "press")?.enabled).toBe(false);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("edits direct audio and listening links separately, with no player when unset", () => {
    select("Latest release");
    expect(content()).toContain("AI-generated placeholders");
    expect(render().some(node => node.props.id === "desktop-home-release-playback-url")).toBe(false);
    field("desktop-home-release-releaseTitle", "New single");
    field("desktop-home-release-playback-kind", "audio"); field("desktop-home-release-playback-url", "https://audio.example.com/song.mp3");
    field("desktop-home-release-primaryLabel", "Listen now"); field("desktop-home-release-primaryHref", "https://example.com/listen");
    expect(draft().release.playback).toEqual({ kind: "audio", url: "https://audio.example.com/song.mp3" });
    expect(draft().release.primaryHref).toBe("https://example.com/listen");
    expect(button("Save Latest release").props.disabled).toBe(false);
    field("desktop-home-release-playback-kind", "none");
    expect(draft().release.playback).toEqual({ kind: "none", url: "" });
    expect(draft().release.primaryHref).toBe("https://example.com/listen");
  });
  it("validates provider choices against their link format and leaves invalid edits visible", () => {
    select("Latest release"); field("desktop-home-release-playback-kind", "spotify");
    field("desktop-home-release-playback-url", "https://example.com/spotify");
    expect(button("Save Latest release").props.disabled).toBe(true);
    expect(draft().release.playback.url).toBe("https://example.com/spotify");
    field("desktop-home-release-playback-url", "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT");
    expect(button("Save Latest release").props.disabled).toBe(false);
    field("desktop-home-release-playback-kind", "youtube");
    expect(draft().release.playback.url).toBe("");
    field("desktop-home-release-playback-url", "https://youtu.be/dQw4w9WgXcQ");
    expect(button("Save Latest release").props.disabled).toBe(false);
  });
  it("keeps identical image sources cropped per placement, and clears a crop only on source change", () => {
    select("Selected work");
    const originalFilmCrop = structuredClone(draft().work.cards[2].image.framing);
    const controls = render().filter(node => node.type === PhotoFramingControls);
    expect(controls).toHaveLength(5);
    (controls[1].props.onChange as (value: HeroFraming) => void)(crop);
    expect(draft().work.cards[0].image.framing).toEqual(crop);
    expect(draft().work.cards[2].image.src).toBe(draft().work.cards[0].image.src);
    expect(draft().work.cards[2].image.framing).toEqual(originalFilmCrop);
    const picker = () => find(node => node.type === MediaAssetPicker && node.props.name === "desktop-home-work-cards-0-image-src");
    (picker().props.onValueChange as (src: string) => void)(draft().work.cards[0].image.src);
    expect(draft().work.cards[0].image.framing).toEqual(crop);
    (picker().props.onValueChange as (src: string) => void)("/images/replacement.webp");
    expect(draft().work.cards[0].image.framing).toBeNull();
    expect(draft().work.cards[2].image.src).not.toBe("/images/replacement.webp");
    expect(controls[1].props.device).toBe("desktop");
    (controls[1].props.onDeviceChange as (value: string) => void)("mobile");
    expect(preview().props.device).toBe("mobile");
  });
  it("reorders four stable work cards without changing another card's crop or destination", () => {
    select("Selected work");
    field("desktop-home-work-card-music-href", "/music#releases");
    field("desktop-home-work-card-music-tone", "red");
    click(button("Move music card down"));
    expect(draft().work.cards.map(card => card.id)).toEqual(["photography", "music", "film", "live"]);
    expect(draft().work.cards[1]).toMatchObject({ href: "/music#releases", tone: "red" });
    expect(draft().work.cards[0].href).toBe("/gallery");
    expect(button("Save Selected work").props.disabled).toBe(false);
  });
  it("creates only blank hidden press items and requires real content before saving", () => {
    select("Press & reviews");
    expect(text(find(node => node.props.id === "desktop-home-press-featured").props.children as ReactNode)).toContain("Automatic — first visible quotation, then first item");
    expect(content()).toContain("not private"); expect(draft().press.items).toEqual([]);
    click(button("Add press item"));
    expect(draft().press.items[0]).toMatchObject({ title: "", publication: "", quote: "", visible: false, image: { framing: null, src: "" } });
    expect(button("Save Press & reviews").props.disabled).toBe(true);
    field("desktop-home-press-item-title", "A real review"); field("desktop-home-press-item-publication", "A real publication"); field("desktop-home-press-item-quote", "The actual quotation.");
    expect(button("Save Press & reviews").props.disabled).toBe(false);
    expect(draft().press.items[0].visible).toBe(false);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("manages type, publication, source, visibility and feature selection without losing other items", () => {
    const first = pressItem(); const second = pressItem({ title: "Second review" }); props.snapshot.draft.press.items = [first, second];
    select("Press & reviews");
    field("desktop-home-press-item-kind", "interview"); field("desktop-home-press-item-date", "2026-08-15"); field("desktop-home-press-item-href", "https://example.com/interview");
    field("desktop-home-press-featured", first.id);
    expect(draft().press.featuredId).toBe(first.id);
    field("desktop-home-press-item-visible", false);
    expect(draft().press.featuredId).toBe("");
    expect(draft().press.items[0]).toMatchObject({ kind: "interview", date: "2026-08-15", href: "https://example.com/interview", visible: false });
    expect(draft().press.items[1]).toEqual(second);
    click(button("Move selected press item down"));
    expect(draft().press.items.map(item => item.id)).toEqual([second.id, first.id]);
    expect(find(node => node.props.id === "desktop-home-press-item-selector").props.value).toBe(first.id);
  });
  it("confirms press removal, clears its feature selection, and only mutates the draft", () => {
    const item = pressItem(); props.snapshot.draft.press.items = [item]; props.snapshot.draft.press.featuredId = item.id;
    select("Press & reviews"); click(button("Remove press item"));
    expect(draft().press.items).toHaveLength(1); click(button("Keep item"));
    expect(draft().press.items).toHaveLength(1);
    click(button("Remove press item")); click(button("Confirm removal"));
    expect(draft().press.items).toEqual([]); expect(draft().press.featuredId).toBe("");
    expect(button("Save Press & reviews").props.disabled).toBe(false);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("enforces the press collection limit even when the add handler is called directly", () => {
    props.snapshot.draft.press.items = Array.from({ length: MAX_HOME_PRESS_ITEMS }, () => pressItem());
    select("Press & reviews"); expect(button("Add press item").props.disabled).toBe(true);
    click(button("Add press item")); expect(draft().press.items).toHaveLength(MAX_HOME_PRESS_ITEMS);
  });
});

describe("Home editorial versioned save integration", () => {
  it("applies canonical section data without overwriting another unsaved section", async () => {
    select("Selected work"); field("desktop-home-work-title", "Unsaved work heading");
    select("Latest release"); field("desktop-home-release-releaseTitle", "  Canonical single  ");
    const submitted = structuredClone(draft().release); const data = form();
    mocks.save.mockResolvedValue(result("release", submitted));
    await mocks.action!(data);
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith(INITIAL_HOME_SAVE_STATE, data);
    expect(draft().release.releaseTitle).toBe("Canonical single");
    expect(draft().work.title).toBe("Unsaved work heading");
    expect(JSON.parse(hidden("versions"))).toEqual({ updatedAt: nextVersion });
    expect(button("Save Latest release").props.disabled).toBe(true);
    select("Selected work"); expect(button("Save Selected work").props.disabled).toBe(false);
  });
  it("uses static initial state on repeated saves instead of duplicating the canonical payload", async () => {
    select("Selected work"); field("desktop-home-work-title", "First heading");
    mocks.save.mockResolvedValue(result("work", draft().work)); await mocks.action!(form());
    field("desktop-home-work-title", "Second heading");
    mocks.save.mockResolvedValue(result("work", draft().work)); const data = form(); await mocks.action!(data);
    expect(mocks.save).toHaveBeenLastCalledWith(INITIAL_HOME_SAVE_STATE, data);
    expect(mocks.save).toHaveBeenCalledTimes(2);
  });
  it("locks an unavailable migration, including direct change handler invocations", () => {
    props.snapshot.editorialAvailable = undefined;
    select("Selected work"); field("desktop-home-work-title", "Do not write");
    expect(draft().work.title).toBe(props.snapshot.draft.work.title);
    expect(button("Save Selected work").props.disabled).toBe(true);
    expect(content()).toContain("migration 0055"); expect(preview().props.isLive).toBe(false);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("keeps unsaved content after an uncertain save and requires reconciliation", async () => {
    select("Latest release"); field("desktop-home-release-releaseTitle", "Keep this release");
    mocks.save.mockRejectedValue(new Error("private-provider-details"));
    await mocks.action!(form());
    expect(draft().release.releaseTitle).toBe("Keep this release");
    expect(button("Save Latest release").props.disabled).toBe(true);
    expect(content()).not.toContain("private-provider-details");
    await mocks.action!(form()); expect(mocks.save).toHaveBeenCalledTimes(1);
    click(button("Reload saved Home")); expect(mocks.confirmDiscard).toHaveBeenCalled();
  });
  it("suppresses double submits and edits queued during an in-flight request", async () => {
    select("Selected work"); field("desktop-home-work-title", "Submitted work");
    const data = form(); const submitted = structuredClone(draft().work);
    let finish: (value: HomeSaveState) => void = () => {};
    mocks.save.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const work = mocks.action!(data);
    field("desktop-home-work-title", "Queued change"); expect(draft().work.title).toBe("Submitted work");
    await mocks.action!(data); expect(mocks.save).toHaveBeenCalledTimes(1);
    finish(result("work", submitted)); await work;
    render(); await mocks.action!(data); expect(mocks.save).toHaveBeenCalledTimes(1);
  });
  it("dispatches native submit in a transition without an auto-resetting form action", async () => {
    select("Selected work"); field("desktop-home-work-title", "Native submit");
    const data = form(); const NativeFormData = globalThis.FormData; const formElement = {};
    vi.stubGlobal("FormData", class extends NativeFormData {
      constructor(element?: unknown) { super(); if (element === formElement) data.forEach((value, key) => this.set(key, value)); }
    });
    mocks.save.mockResolvedValue(result("work", draft().work));
    const formNode = find(node => node.type === "form"); const preventDefault = vi.fn();
    expect(formNode.props.action).toBeUndefined();
    (formNode.props.onSubmit as (event: unknown) => void)({ preventDefault, currentTarget: formElement });
    expect(preventDefault).toHaveBeenCalledOnce(); expect(mocks.transition).toHaveBeenCalledOnce();
    await mocks.submission;
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(mocks.save.mock.calls[0][0]).toEqual(INITIAL_HOME_SAVE_STATE);
    expect(Array.from(mocks.save.mock.calls[0][1].entries())).toEqual(Array.from(data.entries()));
  });
});
