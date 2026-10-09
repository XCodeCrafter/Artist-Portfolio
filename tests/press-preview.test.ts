import { describe, expect, it } from "vitest";
import { createHomeEditorialDefaults } from "@/lib/admin/home-editorial";
import { parsePressPreviewUpdateMessage, PRESS_PREVIEW_UPDATE_MESSAGE } from "@/lib/admin/press-preview";

describe("Press preview draft boundary", () => {
  it("keeps incomplete typing while removing unsafe links, images and invalid dates", () => {
    const draft = createHomeEditorialDefaults().press;
    draft.background.src = "javascript:alert(1)";
    draft.items = [{ id: crypto.randomUUID(), title: "", publication: "", kind: "review", quote: "Incomplete draft", href: "javascript:alert(1)", date: "2026-02-31", visible: true, image: { src: "https://unsafe.example/scan.png", alt: "", framing: null } }];
    const message = parsePressPreviewUpdateMessage({ type: PRESS_PREVIEW_UPDATE_MESSAGE, draft });
    expect(message?.draft.items[0]).toMatchObject({ title: "", publication: "", href: "", date: "", image: { src: "", framing: null } });
    expect(message?.draft.background.src).toBe(""); expect(draft.background.src).toBe("javascript:alert(1)");
  });
  it("rejects malformed messages, unsupported types and oversized collections", () => {
    const draft = createHomeEditorialDefaults().press;
    expect(parsePressPreviewUpdateMessage({ type: "home-preview-update", draft })).toBeNull();
    expect(parsePressPreviewUpdateMessage({ type: PRESS_PREVIEW_UPDATE_MESSAGE, draft, extra: true })).toBeNull();
    expect(parsePressPreviewUpdateMessage({ type: PRESS_PREVIEW_UPDATE_MESSAGE, draft: { ...draft, items: Array(21).fill({}) } })).toBeNull();
  });
});
