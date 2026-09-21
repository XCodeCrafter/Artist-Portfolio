import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestDiscardConfirmation } from "@/components/admin/discardConfirmation";

class FakeElement {
  className = "";
  id = "";
  type = "";
  textContent = "";
  isConnected = true;
  open = false;
  style = { overflow: "auto" };
  children: FakeElement[] = [];
  attributes: Record<string, string> = {};
  listeners: Record<string, ((event: { preventDefault: () => void }) => void)[]> = {};
  focus = vi.fn();
  constructor(readonly tag: string) {}
  append(...elements: FakeElement[]) { this.children.push(...elements); }
  setAttribute(name: string, value: string) { this.attributes[name] = value; }
  addEventListener(name: string, handler: (event: { preventDefault: () => void }) => void) {
    (this.listeners[name] ||= []).push(handler);
  }
  emit(name: string) { const event = { preventDefault: vi.fn() }; this.listeners[name]?.forEach((handler) => handler(event)); return event; }
  showModal() { this.open = true; }
  close() { this.open = false; }
  remove() { this.isConnected = false; }
}

let body: FakeElement;
let previousFocus: FakeElement;
let controller: AbortController;

beforeEach(() => {
  body = new FakeElement("body");
  previousFocus = new FakeElement("input");
  controller = new AbortController();
  vi.stubGlobal("HTMLElement", FakeElement);
  vi.stubGlobal("document", { body, activeElement: previousFocus, createElement: (tag: string) => new FakeElement(tag) });
});
afterEach(() => { controller.abort(); vi.unstubAllGlobals(); });

describe("in-app discard confirmation", () => {
  it("uses a labelled modal, safe text, and focuses the non-destructive choice", async () => {
    const result = requestDiscardConfirmation("<img src=x> is plain text", controller.signal);
    const dialog = body.children[0];
    expect(dialog.open).toBe(true);
    expect(dialog.attributes["aria-labelledby"]).toBe(dialog.children[0].id);
    expect(dialog.attributes["aria-describedby"]).toBe(dialog.children[1].id);
    expect(dialog.children[1].textContent).toBe("<img src=x> is plain text");
    const [cancel] = dialog.children[2].children;
    expect(cancel.focus).toHaveBeenCalledTimes(1);
    expect(body.style.overflow).toBe("hidden");
    cancel.emit("click");
    expect(await result).toBe(false);
    expect(body.style.overflow).toBe("auto");
    expect(previousFocus.focus).toHaveBeenCalledTimes(1);
  });

  it("confirms once and removes its modal", async () => {
    const result = requestDiscardConfirmation("Discard?", controller.signal);
    const dialog = body.children[0];
    dialog.children[2].children[1].emit("click");
    dialog.emit("close");
    expect(await result).toBe(true);
    expect(dialog.isConnected).toBe(false);
    expect(previousFocus.focus).toHaveBeenCalledTimes(1);
  });

  it("cancels on Escape and does not open competing confirmations", async () => {
    const result = requestDiscardConfirmation("First", controller.signal);
    expect(await requestDiscardConfirmation("Second")).toBe(false);
    const event = body.children[0].emit("cancel");
    expect(event.preventDefault).toHaveBeenCalled();
    expect(await result).toBe(false);
    expect(body.children).toHaveLength(1);
  });

  it("removes a pending dialog when its editor unmounts", async () => {
    const result = requestDiscardConfirmation("Discard?", controller.signal);
    controller.abort();
    expect(await result).toBe(false);
    expect(body.children[0].isConnected).toBe(false);
    expect(body.style.overflow).toBe("auto");
  });
});
