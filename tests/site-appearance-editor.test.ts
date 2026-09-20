import { describe, expect, it } from "vitest";
import { BODY_FONT_KEYS, DISPLAY_FONT_KEYS, UI_FONT_KEYS } from "@/lib/content/fonts";
import { createFallbackAppearanceEditorSnapshot, parseAppearanceEditorSnapshot, parseAppearanceSubmission } from "@/lib/admin/site-appearance-editor";

const snapshot = createFallbackAppearanceEditorSnapshot();
const versions = { updatedAt: "2026-09-20T10:00:00.123456+00:00" };
describe("Site appearance editor contract", () => {
  it("preserves exact database timestamps and trims names without restricting Unicode", () => {
    expect(parseAppearanceSubmission("name", { artistName: "  Žofie 新  " }, versions)).toEqual({ success: true, data: { section: "name", payload: { artistName: "Žofie 新" }, versions } });
    expect(parseAppearanceEditorSnapshot(snapshot)).toEqual(snapshot);
  });
  it.each(["", "  ", "Name\nSecond line", "x".repeat(221)])("rejects empty, multiline and oversized names %#", (artistName) => {
    expect(parseAppearanceSubmission("name", { artistName }, versions).success).toBe(false);
  });
  it("rejects extra fields, inherited sections and fabricated versions", () => {
    expect(parseAppearanceSubmission("name", { artistName: "Owner", location: "Changed" }, versions).success).toBe(false);
    expect(parseAppearanceSubmission("appearance", { ...snapshot.draft.appearance, artistName: "Changed" }, versions).success).toBe(false);
    expect(parseAppearanceSubmission("__proto__", {}, versions).success).toBe(false);
    expect(parseAppearanceSubmission("name", snapshot.draft.name, { updatedAt: "not a date" }).success).toBe(false);
    expect(parseAppearanceSubmission("name", snapshot.draft.name, { ...versions, id: "other-site" }).success).toBe(false);
  });
  it("accepts every supported font and both footer effects", () => {
    for (const displayFont of DISPLAY_FONT_KEYS) expect(parseAppearanceSubmission("appearance", { ...snapshot.draft.appearance, displayFont }, versions).success).toBe(true);
    for (const bodyFont of BODY_FONT_KEYS) expect(parseAppearanceSubmission("appearance", { ...snapshot.draft.appearance, bodyFont }, versions).success).toBe(true);
    for (const uiFont of UI_FONT_KEYS) expect(parseAppearanceSubmission("appearance", { ...snapshot.draft.appearance, uiFont }, versions).success).toBe(true);
    for (const footerEffect of ["soul", "red-light"]) expect(parseAppearanceSubmission("appearance", { ...snapshot.draft.appearance, footerEffect }, versions).success).toBe(true);
  });
  it.each([
    { displayFont: "inter" }, { bodyFont: "prata" }, { uiFont: "https://attacker.invalid/font.css" }, { footerEffect: "other" },
  ])("rejects unsupported and cross-role appearance values %#", (change) => {
    expect(parseAppearanceSubmission("appearance", { ...snapshot.draft.appearance, ...change }, versions).success).toBe(false);
  });
});
