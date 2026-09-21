import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AppearanceEditor from "@/components/admin/v2/AppearanceEditor";
import { createFallbackAppearanceEditorSnapshot, type AppearanceSaveState } from "@/lib/admin/site-appearance-editor";
import { FALLBACK_CONTENT } from "@/lib/content/fallback";
import { DISPLAY_FONT_OPTIONS } from "@/lib/content/fonts";

// Execute the real action callback and draft handlers with deterministic hooks.
// This verifies state transitions, not browser layout or focus behavior.
const mocks = vi.hoisted(() => ({
  values: [] as unknown[], cursor: 0, dirty: false,
  save: vi.fn(), refresh: vi.fn(), markDirty: vi.fn(), clearDirty: vi.fn(), confirmDiscard: vi.fn(),
}));
vi.mock("react", async original => {
  const react = await original<typeof import("react")>();
  function state(initial: unknown) {
    const index = mocks.cursor++;
    if (!(index in mocks.values)) mocks.values[index] = typeof initial === "function" ? initial() : initial;
    return [mocks.values[index], (next: unknown) => { mocks.values[index] = typeof next === "function" ? next(mocks.values[index]) : next; }] as const;
  }
  return {
    ...react, useState: state,
    useActionState: (action: (previous: AppearanceSaveState, form: FormData) => Promise<AppearanceSaveState>, initial: AppearanceSaveState) => {
      const [previous, setState] = state(initial);
      return [previous, async (form: FormData) => {
        const result = await action(previous as AppearanceSaveState, form);
        setState(result);
        return result;
      }, false];
    },
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/app/admin/v2/settings/appearance/actions", () => ({ saveSiteAppearanceV2: mocks.save }));
vi.mock("@/components/admin/useUnsavedChangesGuard", () => ({ default: () => ({
  markDirty: mocks.markDirty, clearDirty: mocks.clearDirty, confirmDiscard: mocks.confirmDiscard,
}) }));

const snapshot = createFallbackAppearanceEditorSnapshot();
const savedVersion = snapshot.versions.updatedAt;
const nextVersion = "2026-09-21T20:00:00.000001Z";
const nextFont = DISPLAY_FONT_OPTIONS.find(option => option.key !== snapshot.draft.appearance.displayFont)!.key;
type Element = ReactElement<Record<string, unknown>>;
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
  return AppearanceEditor({
    data: { snapshot, isConfigured: true, migrationRequired: false },
    settings: FALLBACK_CONTENT.settings, socialLinks: FALLBACK_CONTENT.socialLinks,
  });
}
function button(label: string) {
  const found = nodes(render()).find(node => node.type === "button" && text(node.props.children as ReactNode).trim() === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}
function click(label: string) { (button(label).props.onClick as () => void)(); }
function field(id: string) {
  const found = nodes(render()).find(node => node.props.id === id && ["input", "select", "textarea"].includes(node.type as string));
  if (!found) throw new Error(`Missing field: ${id}`);
  return found;
}
function change(id: string, value: string) { (field(id).props.onChange as (event: unknown) => void)({ target: { value } }); }
function hidden(name: string) {
  return nodes(render()).find(node => node.type === "input" && node.props.name === name)!.props.value as string;
}
async function submit() {
  const form = render();
  const body = new FormData();
  for (const node of nodes(form).filter(node => node.type === "input" && node.props.type === "hidden")) {
    body.set(node.props.name as string, node.props.value as string);
  }
  return (form.props.action as (body: FormData) => Promise<AppearanceSaveState>)(body);
}
function success(overrides: Record<string, unknown> = {}) {
  return {
    status: "saved", message: "Appearance saved and published.", eventId: "confirmed-save",
    section: "appearance", versions: { updatedAt: nextVersion },
    canonicalSection: { ...snapshot.draft.appearance, displayFont: nextFont }, ...overrides,
  };
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.values = []; mocks.cursor = 0; mocks.dirty = false;
  mocks.markDirty.mockImplementation(() => { mocks.dirty = true; });
  mocks.clearDirty.mockImplementation(() => { mocks.dirty = false; });
  change("displayFont", nextFont);
  expect(mocks.dirty).toBe(true);
  expect(button("Save appearance").props.disabled).toBe(false);
});

describe("Appearance confirmed-save boundary", () => {
  it.each([
    ["null response", null],
    ["unknown status", { status: "success", message: "Saved" }],
    ["missing event", success({ eventId: undefined })],
    ["missing section", success({ section: undefined })],
    ["missing versions", success({ versions: undefined })],
    ["missing canonical data", success({ canonicalSection: undefined })],
    ["invalid canonical font", success({ canonicalSection: { ...snapshot.draft.appearance, displayFont: "unknown" } })],
    ["invalid version", success({ versions: { updatedAt: "invalid" } })],
    ["wrong valid section", success({ section: "identity", canonicalSection: snapshot.draft.identity })],
    ["unrelated navbar name", success({ section: "name", canonicalSection: snapshot.draft.name })],
  ])("preserves drafts/CAS and blocks retry for %s", async (_label, response) => {
    const originalPayload = hidden("payload");
    mocks.save.mockResolvedValue(response);
    const result = await submit();
    expect(result).toMatchObject({ status: "error", requiresReload: true });
    expect(hidden("payload")).toBe(originalPayload);
    expect(JSON.parse(hidden("versions"))).toEqual({ updatedAt: savedVersion });
    expect(mocks.dirty).toBe(true);
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.clearDirty).not.toHaveBeenCalled();
    expect(button("Save appearance").props.disabled).toBe(true);
    expect(button("Reload saved settings")).toBeTruthy();
    // Also protect a programmatic resubmission rather than relying on disabled UI.
    await submit();
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });

  it("keeps a thrown or lost response private and requires guarded reload", async () => {
    mocks.save.mockRejectedValue(new Error("private response details"));
    const result = await submit();
    expect(result.status).toBe("error");
    expect(result.message).not.toContain("private response details");
    expect(field("displayFont").props.value).toBe(nextFont);
    expect(button("Save appearance").props.disabled).toBe(true);
    click("Reload saved settings");
    expect(mocks.confirmDiscard).toHaveBeenCalledWith(expect.any(Function));
  });

  it.each(["conflict", "error"])("blocks all section saves after a %s", async status => {
    mocks.save.mockResolvedValue({ status, message: "Reload before saving", eventId: "failed-save" });
    await submit();
    click("Profile & introduction");
    change("site-identity-tagline", "Another local draft");
    expect(button("Save profile & introduction").props.disabled).toBe(true);
    await submit();
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(field("site-identity-tagline").props.value).toBe("Another local draft");
    expect(JSON.parse(hidden("versions"))).toEqual({ updatedAt: savedVersion });
  });

  it("keeps a confirmed validation rejection editable without pretending it saved", async () => {
    mocks.save.mockResolvedValue({ status: "invalid", message: "Choose another font", eventId: "invalid-save", section: "appearance" });
    expect((await submit()).status).toBe("invalid");
    expect(field("displayFont").props.value).toBe(nextFont);
    expect(button("Save appearance").props.disabled).toBe(false);
    expect(JSON.parse(hidden("versions"))).toEqual({ updatedAt: savedVersion });
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.dirty).toBe(true);
  });

  it("applies valid canonical data and version only after matching confirmation", async () => {
    mocks.save.mockResolvedValue(success());
    expect((await submit()).status).toBe("saved");
    expect(field("displayFont").props.value).toBe(nextFont);
    expect(JSON.parse(hidden("versions"))).toEqual({ updatedAt: nextVersion });
    expect(button("Save appearance").props.disabled).toBe(true);
    expect(mocks.dirty).toBe(false);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("retains another section's unsaved draft after a valid save", async () => {
    click("Profile & introduction");
    change("site-identity-tagline", "Keep this separate draft");
    click("Fonts & light •");
    mocks.save.mockResolvedValue(success());
    await submit();
    expect(mocks.dirty).toBe(true);
    expect(mocks.clearDirty).not.toHaveBeenCalled();
    click("Profile & introduction •");
    expect(field("site-identity-tagline").props.value).toBe("Keep this separate draft");
    expect(button("Save profile & introduction").props.disabled).toBe(false);
    expect(JSON.parse(hidden("versions"))).toEqual({ updatedAt: nextVersion });
  });
});
