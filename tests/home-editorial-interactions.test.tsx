import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LatestReleaseSection, PressReviewsSection } from "@/components/home/HomeEditorialSections";
import { createHomeEditorialDefaults, type HomePressItem } from "@/lib/admin/home-editorial";

// Exercise the component's real event handlers and effects without fetching media.
const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, effects: [] as Array<() => void | (() => void)>, cleanups: [] as Array<() => void> }));
vi.mock("react", async original => {
  const react = await original<typeof import("react")>();
  function state(initial: unknown): [unknown, (next: unknown) => void] {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = typeof initial === "function" ? initial() : initial;
    return [hooks.values[index], next => { hooks.values[index] = typeof next === "function" ? next(hooks.values[index]) : next; }];
  }
  return {
    ...react, useState: state, useRef: (initial: unknown) => state({ current: initial })[0], useId: () => "test-title",
    useEffect: (effect: () => void | (() => void)) => {
      const index = hooks.cursor++;
      if (!(index in hooks.values)) { hooks.values[index] = true; hooks.effects.push(effect); }
    },
  };
});

type Node = ReactElement<Record<string, unknown>>;
type Handler = (event?: unknown) => void | Promise<void>;
let release: ReturnType<typeof createHomeEditorialDefaults>["release"];
let press: ReturnType<typeof createHomeEditorialDefaults>["press"];
let mode: "audio" | "press";
let audio: ReturnType<typeof createAudio>;
const focus = vi.fn();
const dialog = {
  open: false,
  showModal: vi.fn(() => { dialog.open = true; }),
  close: vi.fn(() => { dialog.open = false; }),
  scrollTo: vi.fn(),
  getBoundingClientRect: () => ({ left: 100, top: 100, right: 900, bottom: 700 }),
};
class FakeElement { closest = vi.fn(() => null as unknown); }
function createAudio() {
  const element = {
    src: "", paused: true, currentTime: 0, duration: 0,
    getAttribute: (name: string) => name === "src" ? element.src || null : null,
    removeAttribute: vi.fn(() => { element.src = ""; }),
    load: vi.fn(() => { element.currentTime = 0; element.paused = true; }),
    pause: vi.fn(() => { element.paused = true; }),
    play: vi.fn<() => Promise<void>>(() => new Promise(() => {})),
  };
  return element;
}
function nodes(tree: ReactNode): Node[] {
  return Children.toArray(tree).flatMap(node => {
    if (!isValidElement<Record<string, unknown>>(node)) return [];
    if (typeof node.type === "function" && ["ReleaseRecord", "DirectAudioPlayer", "PressReader"].includes(node.type.name)) {
      return nodes((node.type as (props: Record<string, unknown>) => ReactNode)(node.props));
    }
    if (node.props.ref && typeof node.props.ref === "object") {
      (node.props.ref as { current: unknown }).current = node.type === "audio" ? audio : node.type === "dialog" ? dialog : { focus };
    }
    return [node, ...nodes(node.props.children as ReactNode)];
  });
}
function render() {
  hooks.cursor = 0;
  const result = nodes(mode === "audio" ? LatestReleaseSection({ data: release }) : PressReviewsSection({ data: press }));
  for (const effect of hooks.effects.splice(0)) { const cleanup = effect(); if (cleanup) hooks.cleanups.push(cleanup); }
  return result;
}
function find(predicate: (node: Node) => boolean) { const node = render().find(predicate); if (!node) throw new Error("Control not found"); return node; }
function button(label: string) { return find(node => node.type === "button" && node.props["aria-label"] === label); }
function handle(node: Node, name: string, event?: unknown) { return (node.props[name] as Handler)(event); }
function play() { return handle(button("Play Test release"), "onClick"); }
function media(name: string) { return handle(find(node => node.type === "audio"), name); }
function text(tree: ReactNode): string { return Children.toArray(tree).map(node => isValidElement<Record<string, unknown>>(node) ? text(node.props.children as ReactNode) : String(node)).join(""); }
function status() { return render().filter(node => node.props.role === "status").map(node => text(node.props.children as ReactNode)).join(" "); }
function reader() { return find(node => node.type === "dialog"); }
function pressItem(id: string): HomePressItem {
  return { id, title: `Review ${id}`, publication: `Publication ${id}`, kind: "review", quote: "An actual quotation", date: "", href: "", visible: true, image: { src: "", alt: "", framing: null } };
}
function openReader() { mode = "press"; handle(find(node => node.props["aria-haspopup"] === "dialog"), "onClick"); return reader(); }

beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers();
  hooks.values = []; hooks.cursor = 0; hooks.effects = []; hooks.cleanups = [];
  ({ release, press } = createHomeEditorialDefaults());
  release.releaseTitle = "Test release"; release.playback = { kind: "audio", url: "https://audio.example.com/release.mp3" };
  press.items = [pressItem("first"), pressItem("second"), pressItem("third")];
  mode = "audio"; audio = createAudio(); dialog.open = false;
  vi.stubGlobal("Element", FakeElement); vi.stubGlobal("HTMLElement", FakeElement);
  vi.stubGlobal("document", { body: { style: { overflow: "auto" } }, activeElement: null });
});
afterEach(() => {
  for (const cleanup of hooks.cleanups.splice(0)) cleanup();
  vi.useRealTimers(); vi.unstubAllGlobals();
});

describe("Home audio playback resilience", () => {
  it("does not fetch before interaction and prevents overlapping start attempts", () => {
    render(); expect(audio.src).toBe("");
    void play(); void play();
    expect(audio.play).toHaveBeenCalledOnce();
    expect(audio.src).toBe(release.playback.url);
    expect(button("Play Test release").props.disabled).toBe(true);
  });
  it("aborts a play promise that never settles and allows a clean retry", () => {
    void play(); vi.advanceTimersByTime(15000);
    expect(status()).toContain("taking too long");
    expect(button("Play Test release").props.disabled).toBe(false);
    expect(audio.pause).toHaveBeenCalled(); expect(audio.load).toHaveBeenCalledOnce(); expect(audio.src).toBe("");
    void play(); expect(audio.play).toHaveBeenCalledTimes(2); expect(status()).toBe("");
  });
  it.each(["resolve", "reject"] as const)("ignores a stale %s from an aborted attempt while a retry is loading", async settlement => {
    let resolve: () => void = () => {}; let reject: (reason: Error) => void = () => {};
    audio.play.mockImplementationOnce(() => new Promise((yes, no) => { resolve = yes; reject = no; }));
    const first = play(); vi.advanceTimersByTime(15000); void play();
    if (settlement === "resolve") resolve(); else reject(new Error("old playback failure"));
    await first;
    expect(button("Play Test release").props.disabled).toBe(true);
    expect(status()).toBe(""); expect(audio.load).toHaveBeenCalledOnce();
  });
  it("settles on the playing event, clears its watchdog, and keeps Pause available", () => {
    void play(); audio.paused = false; media("onPlaying");
    expect(button("Pause Test release").props.disabled).toBe(false);
    vi.advanceTimersByTime(15000); expect(status()).toBe(""); expect(audio.load).not.toHaveBeenCalled();
    handle(button("Pause Test release"), "onClick"); expect(audio.pause).toHaveBeenCalledOnce();
  });
  it("settles a successful play promise even if the playing event has not yet been dispatched", async () => {
    audio.play.mockImplementationOnce(async () => { audio.paused = false; });
    await play();
    expect(button("Pause Test release").props.disabled).toBe(false);
    vi.advanceTimersByTime(15000); expect(status()).toBe(""); expect(audio.load).not.toHaveBeenCalled();
  });
  it("recovers from a rejected play promise without leaking provider details", async () => {
    audio.play.mockRejectedValueOnce(new Error("private provider error"));
    await play();
    expect(button("Play Test release").props.disabled).toBe(false);
    expect(status()).toContain("could not start"); expect(status()).not.toContain("private");
    expect(audio.src).toBe(""); expect(audio.load).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(15000); expect(status()).toContain("could not start");
  });
  it("recovers from media errors without letting the pending play rejection replace the error", async () => {
    let reject: (reason: Error) => void = () => {};
    audio.play.mockImplementationOnce(() => new Promise((_, no) => { reject = no; }));
    const playing = play(); media("onError"); reject(new Error("private host details")); await playing;
    expect(status()).toContain("could not be loaded"); expect(status()).not.toContain("private");
    expect(button("Play Test release").props.disabled).toBe(false); expect(audio.src).toBe("");
  });
  it("releases the media request and watchdog when the section is removed", async () => {
    let reject: (reason: Error) => void = () => {};
    audio.play.mockImplementationOnce(() => new Promise((_, no) => { reject = no; }));
    const playing = play(); for (const cleanup of hooks.cleanups.splice(0)) cleanup();
    const state = [...hooks.values];
    reject(new Error("aborted on unmount")); await playing; vi.advanceTimersByTime(15000);
    expect(hooks.values).toEqual(state); expect(audio.src).toBe(""); expect(audio.load).toHaveBeenCalledOnce();
  });
});

describe("Home press reader resilience", () => {
  it("keeps the selected item when entries are reordered and clamps controls when it disappears", () => {
    openReader(); handle(button("Next press item"), "onClick");
    expect(status()).toContain("2 / 3 — Review second");
    press.items = [press.items[2], press.items[0], press.items[1]];
    expect(status()).toContain("3 / 3 — Review second");
    press.items = [press.items[0]];
    expect(status()).toContain("1 / 1 — Review third");
    expect(button("Previous press item").props.disabled).toBe(true);
    expect(button("Next press item").props.disabled).toBe(true);
  });
  it("does not treat dialog padding or a drag ending outside as a backdrop click", () => {
    openReader();
    const inside = { currentTarget: dialog, target: dialog, clientX: 110, clientY: 110 };
    const outside = { currentTarget: dialog, target: dialog, clientX: 50, clientY: 50 };
    handle(reader(), "onPointerDown", inside); handle(reader(), "onClick", inside); expect(reader()).toBeDefined();
    handle(reader(), "onPointerDown", inside); handle(reader(), "onClick", outside); expect(reader()).toBeDefined();
    handle(reader(), "onPointerDown", outside); handle(reader(), "onClick", outside);
    expect(render().some(node => node.type === "dialog")).toBe(false);
  });
  it("does not hijack modified arrow keys or scan/range keyboard controls", () => {
    openReader(); const preventDefault = vi.fn();
    handle(reader(), "onKeyDown", { key: "ArrowRight", altKey: true, preventDefault, target: {} });
    const target = new FakeElement(); target.closest.mockReturnValue({});
    handle(reader(), "onKeyDown", { key: "ArrowRight", preventDefault, target });
    expect(preventDefault).not.toHaveBeenCalled(); expect(status()).toContain("1 / 3");
    handle(reader(), "onKeyDown", { key: "ArrowRight", preventDefault, target: {} });
    expect(preventDefault).toHaveBeenCalledOnce(); expect(status()).toContain("2 / 3");
  });
  it.each(["cancel", "multitouch"])("discards a swipe after %s instead of navigating on a later touch end", kind => {
    openReader(); const target = new FakeElement();
    handle(reader(), "onTouchStart", { target, touches: [{ clientX: 300, clientY: 200 }] });
    if (kind === "cancel") handle(reader(), "onTouchCancel");
    else handle(reader(), "onTouchMove", { touches: [{}, {}] });
    handle(reader(), "onTouchEnd", { changedTouches: [{ clientX: 150, clientY: 205 }] });
    expect(status()).toContain("1 / 3");
  });
  it("allows a deliberate horizontal swipe but ignores a swipe begun on a control", () => {
    openReader(); const target = new FakeElement(); target.closest.mockReturnValue({});
    const start = { target, touches: [{ clientX: 300, clientY: 200 }] };
    const end = { changedTouches: [{ clientX: 150, clientY: 205 }] };
    handle(reader(), "onTouchStart", start); handle(reader(), "onTouchEnd", end); expect(status()).toContain("1 / 3");
    target.closest.mockReturnValue(null);
    handle(reader(), "onTouchStart", start); handle(reader(), "onTouchEnd", end); expect(status()).toContain("2 / 3");
  });
  it("retains native Escape close, scroll restoration and a focused close control", () => {
    openReader(); expect(dialog.showModal).toHaveBeenCalledOnce(); expect(focus).toHaveBeenCalledOnce();
    expect(document.body.style.overflow).toBe("hidden");
    const preventDefault = vi.fn(); handle(reader(), "onCancel", { preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce(); expect(render().some(node => node.type === "dialog")).toBe(false);
    for (const cleanup of hooks.cleanups.splice(0)) cleanup();
    expect(document.body.style.overflow).toBe("auto"); expect(dialog.close).toHaveBeenCalledOnce();
  });
});
