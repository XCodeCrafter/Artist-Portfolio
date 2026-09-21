import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { needsEditorReload, runEditorSave } from "@/lib/admin/editor-save-recovery";

const idle = { status: "idle", message: "", eventId: "" };

describe("V2 save reconciliation", () => {
  it("keeps draft/CAS untouched and blocks retry when the action rejects", async () => {
    const action = vi.fn().mockRejectedValue(new Error("private internal detail"));
    const apply = vi.fn();
    const result = await runEditorSave(idle, action, apply);
    expect(result.status).toBe("error");
    expect(result.message).toContain("server may have saved");
    expect(JSON.stringify(result)).not.toContain("private internal detail");
    expect(apply).not.toHaveBeenCalled();
    expect(needsEditorReload(result)).toBe(true);
    expect(await runEditorSave(result, action, apply)).toBe(result);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("does not present an unverified canonical response as saved", async () => {
    const apply = vi.fn().mockReturnValue(false);
    const result = await runEditorSave(idle, async () => ({ status: "saved", message: "saved", eventId: "save-1" }), apply);
    expect(result.status).toBe("error");
    expect(needsEditorReload(result)).toBe(true);
  });

  it("applies verified canonical data once and leaves validation errors editable", async () => {
    const saved = { status: "saved", message: "Saved", eventId: "save-2" };
    const apply = vi.fn().mockReturnValue(true);
    expect(await runEditorSave(idle, async () => saved, apply)).toBe(saved);
    expect(apply).toHaveBeenCalledExactlyOnceWith(saved);
    const invalid = { status: "invalid", message: "Choose an image", eventId: "invalid-1" };
    expect(await runEditorSave(idle, async () => invalid, apply)).toBe(invalid);
    expect(needsEditorReload(invalid)).toBe(false);
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it.each(["conflict", "error"])("requires reconciliation for server %s responses", async (status) => {
    const state = { status, message: "Reload saved content", eventId: "server-result" };
    const save = vi.fn();
    expect(needsEditorReload(state)).toBe(true);
    expect(await runEditorSave(state, save, vi.fn())).toBe(state);
    expect(save).not.toHaveBeenCalled();
  });

  it("rejects malformed response envelopes without touching state", async () => {
    const apply = vi.fn();
    for (const response of [null, {}, { status: "saved" }, { status: "unknown", message: "" }]) {
      const result = await runEditorSave(idle, async () => response as typeof idle, apply);
      expect(needsEditorReload(result)).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it.each(["BioEditor", "ContactEditor", "GalleryEditor", "MusicEditor", "ShowreelEditor", "HomeEditor", "NavigationManager", "NavbarNameEditor", "NavbarSocialLinksManager"])("wires recovery into %s save and controls", (name) => {
    const source = readFileSync(new URL(`../components/admin/v2/${name}.tsx`, import.meta.url), "utf8");
    expect(source).toContain("runEditorSave(");
    expect(source).toContain("needsEditorReload(");
    expect(source).toContain("confirmDiscard(");
  });

  it("keeps app-controlled confirmations out of the native browser modal", () => {
    const source = readFileSync(new URL("../components/admin/useUnsavedChangesGuard.ts", import.meta.url), "utf8");
    expect(source).not.toContain("window.confirm(");
    expect(source).toContain("beforeunload");
    const dialog = readFileSync(new URL("../components/admin/discardConfirmation.ts", import.meta.url), "utf8");
    expect(dialog).toContain('document.createElement("dialog")');
    expect(dialog).toContain('"aria-labelledby"');
    expect(dialog).toContain('"cancel"');
    expect(dialog).toContain("cancel.focus()");
  });
});
