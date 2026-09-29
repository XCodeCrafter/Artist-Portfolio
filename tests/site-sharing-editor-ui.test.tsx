import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SiteSharingEditor from "@/components/admin/v2/SiteSharingEditor";
import MediaAssetPicker from "@/components/admin/MediaAssetPicker";
import SocialPreviewCard from "@/components/seo/SocialPreviewCard";
import type { MediaAsset } from "@/lib/admin/media";
import { type SharingSaveState } from "@/lib/admin/site-sharing-editor";
import { filterAdminV2Destinations } from "@/lib/admin/v2-destinations";
import { getAdminV2ActiveItem } from "@/lib/admin/v2-shell";

const mocks = vi.hoisted(() => ({
  values: [] as unknown[], cursor: 0, pending: false,
  action: undefined as undefined | ((form: FormData) => Promise<SharingSaveState>),
  submission: undefined as undefined | Promise<SharingSaveState>,
  save: vi.fn(), markDirty: vi.fn(), clearDirty: vi.fn(), confirmDiscard: vi.fn(),
}));
vi.mock("react", async original => {
  const react = await original<typeof import("react")>();
  function state(initial: unknown): [unknown, (value: unknown) => void] {
    const index = mocks.cursor++;
    if (!(index in mocks.values)) mocks.values[index] = typeof initial === "function" ? initial() : initial;
    return [mocks.values[index], next => { mocks.values[index] = typeof next === "function" ? next(mocks.values[index]) : next; }];
  }
  return { ...react, useState: state, useRef: (initial: unknown) => state({ current: initial })[0], useEffect: () => {},
    startTransition: (callback: () => void) => callback(),
    useActionState: (action: (previous: SharingSaveState, form: FormData) => Promise<SharingSaveState>, initial: SharingSaveState) => {
      const [value, setValue] = state(initial);
      mocks.action = form => {
        mocks.submission = (async () => {
          mocks.pending = true;
          try { const result = await action(value as SharingSaveState, form); setValue(result); return result; }
          finally { mocks.pending = false; }
        })();
        return mocks.submission;
      };
      return [value, mocks.action, mocks.pending];
    },
  };
});
vi.mock("@/app/admin/v2/settings/sharing/actions", () => ({ saveSiteSharingV2: mocks.save }));
vi.mock("@/components/admin/useUnsavedChangesGuard", () => ({ default: () => ({ markDirty: mocks.markDirty, clearDirty: mocks.clearDirty, confirmDiscard: mocks.confirmDiscard }) }));

type Element = ReactElement<Record<string, unknown>>;
type Props = Parameters<typeof SiteSharingEditor>[0];
const version = "2026-09-29T14:00:00.000001Z";
const nextVersion = "2026-09-29T14:00:01.000001Z";
let props: Props;
const asset = (patch: Partial<MediaAsset> = {}): MediaAsset => ({
  id: crypto.randomUUID(), label: "Share cover", src: "/images/about.jpg", alt: "Guitar player", mediaType: "image",
  usageKey: "", sortOrder: 0, isPublished: true, storageBucket: "", storagePath: "", fileSize: 1000,
  mimeType: "image/jpeg", metadata: {}, createdAt: "", updatedAt: "", deletedAt: "", deletedBy: "", ...patch,
});
function nodes(tree: ReactNode): Element[] {
  return Children.toArray(tree).flatMap(node => !isValidElement<Record<string, unknown>>(node) ? [] : [node, ...nodes(node.props.children as ReactNode)]);
}
function text(tree: ReactNode): string {
  return Children.toArray(tree).map(node => !isValidElement<Record<string, unknown>>(node) ? String(node) : text(node.props.children as ReactNode)).join("");
}
function render() { mocks.cursor = 0; return nodes(SiteSharingEditor(props)); }
function find(predicate: (node: Element) => boolean) {
  const node = render().find(predicate);
  if (!node) throw new Error("Sharing control was not found");
  return node;
}
function button(label: string) { return find(node => node.type === "button" && text(node.props.children as ReactNode).trim() === label); }
function click(node: Element) { (node.props.onClick as () => void)(); }
function field(key: string, value: string) { (find(node => node.props.id === `site-sharing-${key}`).props.onChange as (event: unknown) => void)({ target: { value } }); }
function hidden(name: string) { return find(node => node.type === "input" && node.props.name === name).props.value as string; }
function draft() { return JSON.parse(hidden("payload")); }
function form() { const form = new FormData(); form.set("payload", hidden("payload")); form.set("versions", hidden("versions")); return form; }
function savedResult(patch: Partial<SharingSaveState> = {}): SharingSaveState {
  return { status: "saved", eventId: crypto.randomUUID(), message: "Saved sharing settings", canonical: draft(), versions: { updatedAt: nextVersion }, ...patch };
}
function copy() { return render().filter(node => node.type === "p").map(node => text(node.props.children as ReactNode)).join("\n"); }

beforeEach(() => {
  vi.clearAllMocks(); mocks.values = []; mocks.cursor = 0; mocks.pending = false; mocks.action = undefined; mocks.submission = undefined;
  mocks.confirmDiscard.mockImplementation((callback: () => void) => callback());
  props = { data: { snapshot: { draft: { title: "", description: "", imageSrc: "", imageAlt: "" }, versions: { updatedAt: version } }, isConfigured: true, migrationRequired: false }, assets: [asset()], artistName: "Franky Fugazi", description: "Cigar box blues and live dates.", siteUrl: "https://portfolio.example.com/" };
  vi.stubGlobal("window", { location: { reload: vi.fn() } });
});
afterEach(() => vi.unstubAllGlobals());

describe("Sharing settings editor", () => {
  it("previews the artist name rather than a Home headline and keeps untouched settings unsaved", () => {
    expect(find(node => node.type === SocialPreviewCard).props.title).toBe("Franky Fugazi");
    expect(copy()).toContain("Cigar box blues and live dates.");
    expect(button("Save sharing settings").props.disabled).toBe(true);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("updates title and description without changing owner defaults", () => {
    field("title", "Franky Fugazi | Cigar Box Blues"); field("description", "Songs from the spaces in between.");
    expect(find(node => node.type === SocialPreviewCard).props.title).toBe("Franky Fugazi | Cigar Box Blues");
    expect(copy()).toContain("Songs from the spaces in between.");
    expect(draft()).toMatchObject({ title: "Franky Fugazi | Cigar Box Blues", description: "Songs from the spaces in between." });
    expect(props.artistName).toBe("Franky Fugazi");
    expect(button("Save sharing settings").props.disabled).toBe(false);
    expect(mocks.markDirty).toHaveBeenCalled();
  });
  it("limits the picker to published active social-compatible images", () => {
    props.assets.push(asset({ isPublished: false }), asset({ deletedAt: version }), asset({ mimeType: "image/gif", src: "/images/test.gif" }), asset({ mediaType: "video", mimeType: "video/mp4" }), asset({ mimeType: "image/avif", src: "/images/test.avif" }), asset({ src: "https://untrusted.example.test/photo.jpg" }));
    expect(find(node => node.type === MediaAssetPicker).props.assets).toEqual([props.assets[0]]);
    expect(find(node => node.type === MediaAssetPicker).props.showPreview).toBe(false);
  });
  it("rejects raw unregistered image URLs without fetching a preview", () => {
    const picker = find(node => node.type === MediaAssetPicker);
    (picker.props.onValueChange as (src: string) => void)("https://untrusted.example.test/photo.jpg");
    expect(button("Save sharing settings").props.disabled).toBe(true);
    expect(find(node => node.type === SocialPreviewCard)).toBeDefined();
    expect(find(node => node.type === MediaAssetPicker).props.error).toContain("published");
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("selects a complete cover with accessible text and restores the generated design", () => {
    const picker = find(node => node.type === MediaAssetPicker);
    (picker.props.onValueChange as (src: string, asset: MediaAsset) => void)(props.assets[0].src, props.assets[0]);
    expect(draft()).toMatchObject({ imageSrc: "/images/about.jpg", imageAlt: "Guitar player" });
    expect(render().some(node => node.type === SocialPreviewCard)).toBe(false);
    field("imageAlt", "Franky playing a cigar box guitar");
    expect(draft().imageAlt).toBe("Franky playing a cigar box guitar");
    click(button("Use automatic cover"));
    expect(draft()).toMatchObject({ imageSrc: "", imageAlt: "" });
    expect(find(node => node.type === SocialPreviewCard)).toBeDefined();
  });
  it("blocks invalid text and preserves it for correction", () => {
    field("title", "x".repeat(121));
    expect(button("Save sharing settings").props.disabled).toBe(true);
    expect(draft().title).toHaveLength(121);
    expect(find(node => node.props.id === "site-sharing-title").props["aria-invalid"]).toBe(true);
    field("title", "New title"); field("description", "One\nTwo");
    expect(draft().description).toBe("One Two");
    expect(button("Save sharing settings").props.disabled).toBe(false);
  });
  it.each(["migration", "unconfigured", "load-error"])("keeps %s data read-only without writing fallback", async mode => {
    if (mode === "migration") props.data.migrationRequired = true;
    if (mode === "unconfigured") props.data.isConfigured = false;
    if (mode === "load-error") props.data.loadError = "Unavailable";
    field("title", "Cannot edit");
    expect(draft().title).toBe("");
    expect(button("Save sharing settings").props.disabled).toBe(true);
    await mocks.action!(form());
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("applies a confirmed saved response and advances the version", async () => {
    field("title", "New title");
    mocks.save.mockResolvedValue(savedResult());
    await mocks.action!(form());
    expect(button("Save sharing settings").props.disabled).toBe(true);
    expect(JSON.parse(hidden("versions"))).toEqual({ updatedAt: nextVersion });
    expect(draft().title).toBe("New title");
    expect(mocks.clearDirty).toHaveBeenCalled();
  });
  it("lets the owner repair an unavailable saved cover without changing the preserved text", async () => {
    props.data.loadWarning = "Select a new cover or save the built-in preview.";
    expect(button("Save sharing settings").props.disabled).toBe(false);
    expect(button("Discard changes").props.disabled).toBe(true);
    expect(copy()).toContain(props.data.loadWarning);
    mocks.save.mockResolvedValue(savedResult());
    await mocks.action!(form());
    expect(draft()).toEqual(props.data.snapshot.draft);
    expect(button("Save sharing settings").props.disabled).toBe(true);
    expect(copy()).not.toContain(props.data.loadWarning);
    await mocks.action!(form());
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });
  it.each(["lost", "invalid-canonical", "same-version"])("keeps the draft and CAS after %s response until reload", async outcome => {
    field("title", "Keep this draft");
    if (outcome === "lost") mocks.save.mockRejectedValue(new Error("Private transport details"));
    else mocks.save.mockResolvedValue(savedResult(outcome === "invalid-canonical" ? { canonical: { title: "wrong" } as never } : { versions: { updatedAt: version } }));
    await mocks.action!(form());
    expect(draft().title).toBe("Keep this draft");
    expect(JSON.parse(hidden("versions"))).toEqual({ updatedAt: version });
    expect(button("Save sharing settings").props.disabled).toBe(true);
    expect(copy()).not.toContain("Private transport details");
    await mocks.action!(form());
    expect(mocks.save).toHaveBeenCalledTimes(1);
    click(button("Reload saved settings"));
    expect(mocks.confirmDiscard).toHaveBeenCalled();
    expect(window.location.reload).toHaveBeenCalled();
  });
  it("keeps a conflicting draft read-only and refuses queued repeat saves", async () => {
    field("title", "My draft");
    mocks.save.mockResolvedValue({ status: "conflict", eventId: "conflict", message: "Another save won." });
    await mocks.action!(form());
    expect(draft().title).toBe("My draft");
    expect(button("Save sharing settings").props.disabled).toBe(true);
    field("title", "Another mutation");
    expect(draft().title).toBe("My draft");
    await mocks.action!(form());
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });
  it("locks edits while saving and suppresses duplicate pending submissions", async () => {
    field("title", "Submitted title");
    const confirmed = savedResult();
    let finish!: (state: SharingSaveState) => void;
    mocks.save.mockReturnValue(new Promise<SharingSaveState>(resolve => { finish = resolve; }));
    const action = mocks.action!;
    const first = action(form());
    await action(form());
    field("title", "Should not replace submission");
    expect(draft().title).toBe("Submitted title");
    expect(mocks.save).toHaveBeenCalledTimes(1);
    finish(confirmed); await first;
    expect(draft().title).toBe("Submitted title");
  });
  it("rejects an obsolete payload or version without calling the server", async () => {
    field("title", "Before"); const oldForm = form(); field("title", "After");
    await mocks.action!(oldForm);
    const stale = form(); stale.set("versions", JSON.stringify({ updatedAt: nextVersion }));
    await mocks.action!(stale);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("discards only after confirmation and restores the last confirmed snapshot", () => {
    field("title", "Not saved"); click(button("Discard changes"));
    expect(mocks.confirmDiscard).toHaveBeenCalled();
    expect(draft().title).toBe("");
    expect(button("Save sharing settings").props.disabled).toBe(true);
  });
  it("uses the explicit submit handler and only sends payload plus versions", async () => {
    field("title", "Save me"); mocks.save.mockResolvedValue(savedResult());
    const node = find(node => node.type === "form");
    expect(node.props.action).toBeUndefined();
    const preventDefault = vi.fn();
    (node.props.onSubmit as (event: unknown) => void)({ preventDefault });
    await mocks.submission;
    expect(preventDefault).toHaveBeenCalled();
    const sent = mocks.save.mock.calls[0][1] as FormData;
    expect([...sent.keys()]).toEqual(["payload", "versions"]);
  });
});

describe("Sharing settings discoverability", () => {
  it.each(["WhatsApp", "Messenger", "sdílení", "náhled", "sharing", "seo"])("finds the editor for %s", query => {
    expect(filterAdminV2Destinations(query)[0]).toMatchObject({ id: "sharing", href: "/admin/v2/settings/sharing" });
  });
  it("has a dedicated sidebar destination and links from settings and Appearance", () => {
    expect(getAdminV2ActiveItem("/admin/v2/settings/sharing").key).toBe("sharing");
    for (const file of ["../app/admin/v2/settings/page.tsx", "../components/admin/v2/AppearanceEditor.tsx"]) {
      expect(readFileSync(new URL(file, import.meta.url), "utf8")).toContain('href="/admin/v2/settings/sharing"');
    }
  });
});
