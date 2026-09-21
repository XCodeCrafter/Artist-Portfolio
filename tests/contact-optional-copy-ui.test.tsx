import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ContactEditor from "@/components/admin/v2/ContactEditor";
import ContactPreviewFrame from "@/components/admin/v2/ContactPreviewFrame";
import { createFallbackContactEditorSnapshot, INITIAL_CONTACT_SAVE_STATE, type ContactEditorDraft, type ContactEditorSnapshot } from "@/lib/admin/contact-editor";
import type { ContactCopyCapability } from "@/lib/admin/contact-copy";

// State/event-handler coverage without writing real Contact content.
const mocks = vi.hoisted(() => ({
  values: [] as unknown[], cursor: 0, saveAction: undefined as unknown,
  pending: false, saveState: undefined as unknown,
  save: vi.fn(), clearDirty: vi.fn(), markDirty: vi.fn(), confirmDiscard: vi.fn(),
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
vi.mock("@/app/admin/v2/pages/contact/actions", () => ({ saveContactSectionV2: mocks.save }));
vi.mock("@/components/admin/useUnsavedChangesGuard", () => ({ default: () => ({ clearDirty: mocks.clearDirty, markDirty: mocks.markDirty, confirmDiscard: mocks.confirmDiscard, hasUnsavedChanges: false }) }));
vi.mock("@/components/admin/v2/ContactPreviewFrame", () => ({ default: () => null }));
vi.mock("@/components/admin/MediaAssetPicker", () => ({ default: () => null }));

const version = "2026-09-21T10:00:00.000001Z";
const updatedVersion = "2026-09-21T10:10:00.000002Z";
const details = { location: "Prague / Worldwide", contactBlurb: "For music and acting collaborations." };
const available: ContactCopyCapability = { available: true, migrationRequired: false };
const missing: ContactCopyCapability = { available: false, migrationRequired: true, message: "Apply migration 0045 to save empty Contact details." };
const unknown: ContactCopyCapability = { available: false, migrationRequired: false, message: "Optional Contact fields could not be verified. Reload to retry." };
let snapshot: ContactEditorSnapshot;
let capability: ContactCopyCapability | undefined;
let disabled: boolean;
type Element = ReactElement<Record<string, unknown>>;
const expand = new Set(["Field", "HeroInspector", "DetailsInspector", "InspectorHeader", "DeliveryItem"]);
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
  return ContactEditor({ snapshot, optionalCopy: capability, assets: [], disabled, migrationRequired: false,
    delivery: { emailConfigured: false, inboxConfigured: true, webhookConfigured: false },
  });
}
function button(label: string) {
  const node = nodes(render()).find(node => node.type === "button" && (node.props["aria-label"] === label || text(node.props.children as ReactNode).trim() === label));
  if (!node) throw new Error(`Missing button: ${label}`);
  return node;
}
function click(node: Element) { return (node.props.onClick as () => void | Promise<void>)(); }
function select(section = "Contact & form") { click(button(section)); }
function field(label: string) {
  const node = nodes(render()).find(node => node.type === "label" && text(node.props.children as ReactNode).startsWith(label));
  if (!node) throw new Error(`Missing field: ${label}`);
  return nodes(node.props.children as ReactNode).find(child => child.type === "input" || child.type === "textarea")!;
}
function change(label: string, value: string) { (field(label).props.onChange as (event: unknown) => void)({ target: { value } }); }
function payload(name = "payload") { return JSON.parse(nodes(render()).find(node => node.type === "input" && node.props.name === name)!.props.value as string); }
function preview(): ContactEditorDraft { return nodes(render()).find(node => node.type === ContactPreviewFrame)!.props.draft as ContactEditorDraft; }

beforeEach(() => {
  vi.clearAllMocks(); mocks.values = []; mocks.cursor = 0; mocks.saveAction = undefined; mocks.pending = false; mocks.saveState = undefined;
  capability = available; disabled = false; snapshot = createFallbackContactEditorSnapshot();
  snapshot.draft.details = { ...details }; snapshot.versions = { hero: { updatedAt: version }, details: { updatedAt: version } };
  vi.stubGlobal("window", { matchMedia: () => ({ matches: true }), requestAnimationFrame: vi.fn(), location: { reload: vi.fn() } });
});
afterEach(() => vi.unstubAllGlobals());

describe("Contact optional copy controls", () => {
  it("labels both fields optional without HTML required constraints", () => {
    select(); expect(text(render())).toContain("Both fields are optional. Leave a field blank to hide that detail.");
    expect(field("Based in").props.required).not.toBe(true); expect(field("Collaboration introduction").props.required).not.toBe(true);
    expect(field("Based in").props.maxLength).toBe(220); expect(field("Collaboration introduction").props.maxLength).toBe(1000);
    expect(nodes(render()).filter(node => node.type === "form")).toHaveLength(1);
  });
  it.each(["Based in", "Collaboration introduction"])("keeps empty %s controlled in the payload and real preview before Save", label => {
    select(); change(label, ""); const key = label === "Based in" ? "location" : "contactBlurb";
    expect(field(label).props.value).toBe(""); expect(payload()[key]).toBe(""); expect(preview().details[key]).toBe("");
    expect(button("Save Contact & form").props.disabled).toBe(false); expect(mocks.markDirty).toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("preserves two saved blank fields without falling back to sample copy", () => {
    snapshot.draft.details = { location: "", contactBlurb: "" }; select();
    expect(field("Based in").props.value).toBe(""); expect(field("Collaboration introduction").props.value).toBe("");
    expect(payload()).toEqual({ location: "", contactBlurb: "" }); expect(preview().details).toEqual({ location: "", contactBlurb: "" });
    expect(button("Save Contact & form").props.disabled).toBe(true); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("allows both fields to be cleared when optional-copy capability is verified", () => {
    select(); change("Based in", ""); change("Collaboration introduction", "");
    expect(payload()).toEqual({ location: "", contactBlurb: "" }); expect(preview().details).toEqual({ location: "", contactBlurb: "" });
    expect(button("Save Contact & form").props.disabled).toBe(false); expect(text(render())).not.toContain("Apply migration 0045");
  });
  it.each(["missing", "unknown", "older-caller"])("keeps filled Details editable for %s capability", mode => {
    capability = mode === "missing" ? missing : mode === "unknown" ? unknown : undefined; select();
    expect(text(render())).toContain(mode === "unknown" ? "could not be verified" : "0045");
    expect(nodes(render()).find(node => node.type === "fieldset")?.props.disabled).toBe(false);
    change("Based in", "London / Worldwide"); expect(button("Save Contact & form").props.disabled).toBe(false); expect(mocks.save).not.toHaveBeenCalled();
  });
  it.each([
    ["missing", "Based in", ""], ["missing", "Collaboration introduction", ""],
    ["unknown", "Based in", ""], ["unknown", "Collaboration introduction", ""],
    ["older-caller", "Based in", ""], ["older-caller", "Collaboration introduction", ""],
    ["missing", "Based in", "   "], ["unknown", "Collaboration introduction", " \n "],
  ])("blocks an empty %s / %s draft without losing the entered text", (mode, label, value) => {
    capability = mode === "missing" ? missing : mode === "unknown" ? unknown : undefined; select(); change(label, value);
    expect(button("Save Contact & form").props.disabled).toBe(true); expect(field(label).props.value).toBe(value);
    const key = label === "Based in" ? "location" : "contactBlurb";
    expect(payload()[key]).toBe(value); expect(preview().details[key]).toBe(value);
    expect(text(render())).toContain("Empty Contact details are not ready to save"); expect(mocks.save).not.toHaveBeenCalled();
  });
  it.each([missing, unknown])("allows filling blocked fields without a reload (%j)", status => {
    capability = status; select(); change("Based in", ""); change("Collaboration introduction", "");
    change("Based in", "Amsterdam"); expect(button("Save Contact & form").props.disabled).toBe(true);
    change("Collaboration introduction", "Bookings and productions"); expect(button("Save Contact & form").props.disabled).toBe(false);
    expect(payload()).toEqual({ location: "Amsterdam", contactBlurb: "Bookings and productions" });
  });
  it("keeps Hero editable and preserves the blocked Details draft across sections", () => {
    capability = missing; select(); change("Based in", ""); select("Hero"); change("Main title", "Talk to the artist");
    expect(button("Save Hero").props.disabled).toBe(false); expect(preview().details.location).toBe("");
    select(); expect(field("Based in").props.value).toBe(""); expect(button("Save Contact & form").props.disabled).toBe(true);
  });
  it("can discard a blocked Details draft without discarding Hero edits", () => {
    capability = missing; change("Main title", "Keep my Hero draft"); select(); change("Based in", "");
    click(button("Discard changes in Contact & form")); expect(payload()).toEqual(details); expect(button("Save Contact & form").props.disabled).toBe(true);
    select("Hero"); expect(payload().title).toBe("Keep my Hero draft"); expect(button("Save Hero").props.disabled).toBe(false);
  });
  it("shows the capability explanation inside the mobile inspector", () => {
    capability = unknown; vi.stubGlobal("window", { matchMedia: () => ({ matches: false }), requestAnimationFrame: vi.fn(), location: { reload: vi.fn() } });
    select(); change("Based in", ""); const dialog = nodes(render()).find(node => node.type === "dialog")!;
    expect(text(dialog.props.children as ReactNode)).toContain("could not be verified");
    expect(nodes(dialog.props.children as ReactNode).find(node => node.type === "button" && text(node.props.children as ReactNode).trim() === "Save Contact & form")?.props.disabled).toBe(true);
  });
  it.each(["Based in", "Collaboration introduction"])("retains the maximum length validation for optional %s", label => {
    select(); change(label, "a".repeat(label === "Based in" ? 221 : 1001)); expect(button("Save Contact & form").props.disabled).toBe(true);
  });
  it.each(["read-only", "pending", "conflict"])("does not let optional copy bypass %s state", mode => {
    select(); change("Based in", "");
    if (mode === "read-only") disabled = true;
    if (mode === "pending") mocks.pending = true;
    if (mode === "conflict") mocks.saveState = { ...INITIAL_CONTACT_SAVE_STATE, status: "conflict" };
    expect(button(mode === "pending" ? "Saving Contact & form..." : "Save Contact & form").props.disabled).toBe(true);
  });
  it("adopts a confirmed empty Details save and leaves a Hero draft untouched", async () => {
    change("Main title", "Keep Hero draft"); select(); change("Based in", ""); change("Collaboration introduction", "");
    const form = new FormData(); form.set("section", "details"); form.set("payload", JSON.stringify(payload())); form.set("versions", JSON.stringify(payload("versions")));
    mocks.save.mockResolvedValue({ status: "saved", eventId: "contact-empty-copy", message: "Contact details saved.", section: "details", canonicalSection: { location: "", contactBlurb: "" }, versions: { updatedAt: updatedVersion } });
    expect(mocks.save).not.toHaveBeenCalled();
    await (mocks.saveAction as (state: unknown, form: FormData) => Promise<unknown>)(INITIAL_CONTACT_SAVE_STATE, form);
    expect(mocks.save).toHaveBeenCalledWith(INITIAL_CONTACT_SAVE_STATE, form); expect(payload()).toEqual({ location: "", contactBlurb: "" });
    expect(payload("versions")).toEqual({ updatedAt: updatedVersion }); expect(button("Save Contact & form").props.disabled).toBe(true);
    expect(preview().details).toEqual({ location: "", contactBlurb: "" }); select("Hero"); expect(payload().title).toBe("Keep Hero draft"); expect(button("Save Hero").props.disabled).toBe(false);
  });
});
