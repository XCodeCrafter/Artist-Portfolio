import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HeroFramingControls, { type HeroFramingControlsProps } from "@/components/admin/v2/HeroFramingControls";
import HeroMedia from "@/components/HeroMedia";
import { getDefaultHeroFraming, type HeroFraming } from "@/lib/content/hero-framing";

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }));
vi.mock("react", async original => {
  const react = await original<typeof import("react")>();
  function state(initial: unknown) {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = typeof initial === "function" ? initial() : initial;
    return [hooks.values[index], (next: unknown) => { hooks.values[index] = typeof next === "function" ? next(hooks.values[index]) : next; }];
  }
  return { ...react, useId: () => "framing", useState: state, useRef: (initial: unknown) => state({ current: initial })[0] };
});
vi.mock("@/components/HeroMedia", () => ({ default: () => null }));

type Element = ReactElement<Record<string, unknown>>;
function nodes(tree: ReactNode): Element[] {
  return Children.toArray(tree).flatMap(node => isValidElement<Record<string, unknown>>(node) ? [node, ...nodes(node.props.children as ReactNode)] : []);
}
function text(tree: ReactNode): string {
  return Children.toArray(tree).map(node => isValidElement<Record<string, unknown>>(node) ? text(node.props.children as ReactNode) : String(node)).join("");
}
let props: HeroFramingControlsProps;
const changed = vi.fn();
let inheritedDisabled = false;
const target = {
  matches: () => inheritedDisabled,
  closest: () => inheritedDisabled ? {} : null,
  getBoundingClientRect: () => ({ width: 400, height: 250 }),
  setPointerCapture: vi.fn(), hasPointerCapture: vi.fn(() => true), releasePointerCapture: vi.fn(),
};
function render() { hooks.cursor = 0; return HeroFramingControls(props); }
function button(label: string) {
  const found = nodes(render()).find(node => node.type === "button" && (node.props["aria-label"] === label || text(node.props.children as ReactNode) === label));
  if (!found) throw new Error(`Missing button ${label}`);
  return found;
}
function click(label: string) { (button(label).props.onClick as () => void)(); }
function media() { return nodes(render()).find(node => node.type === HeroMedia)!; }
function dimensions(width = 200, height = 400) { (media().props.onDimensions as (size: unknown) => void)({ width, height }); }
function slider(label: string) { return nodes(render()).find(node => node.type === "input" && node.props["aria-label"] === label)!; }
function change(label: string, value: string) { (slider(label).props.onChange as (event: unknown) => void)({ target: { value } }); }
function stage() { return button(`Position ${props.device ?? (button("Mobile").props["aria-pressed"] ? "mobile" : "desktop")} Hero media`); }
function pointer(handler: string, overrides: Record<string, unknown> = {}) {
  const event = { pointerId: 1, clientX: 20, clientY: 20, button: 0, isPrimary: true, currentTarget: target, preventDefault: vi.fn(), ...overrides };
  (stage().props[handler] as (event: unknown) => void)(event);
  return event;
}
function lastValue() { return changed.mock.calls.at(-1)?.[0] as HeroFraming | null | undefined; }

beforeEach(() => {
  vi.clearAllMocks(); hooks.values = []; hooks.cursor = 0; inheritedDisabled = false;
  target.setPointerCapture.mockImplementation(() => {});
  props = { src: "/images/portrait.jpg", mediaType: "image", onChange: value => { changed(value); props = { ...props, value }; } };
});

describe("Hero framing controls", () => {
  it("starts with legacy-compatible values without publishing or creating a draft", () => {
    expect(media().props.framing).toEqual(getDefaultHeroFraming("image"));
    expect(slider("desktop Hero zoom").props.value).toBe(1);
    expect(button("Reset both to original").props.disabled).toBe(true);
    expect(text(render())).toContain("only when you save Hero");
    expect(changed).not.toHaveBeenCalled();
  });
  it("uses the actual shared renderer and desktop/mobile Hero dimensions", () => {
    expect(media().props).toMatchObject({ backgroundSrc: props.src, mediaType: "image", deviceOverride: "desktop", paused: true });
    expect(stage().props.style).toMatchObject({ aspectRatio: "1440 / 900" });
    click("Mobile"); expect(stage().props.style).toMatchObject({ aspectRatio: "390 / 506.4" });
    expect(media().props.deviceOverride).toBe("mobile"); expect(changed).not.toHaveBeenCalled();
  });
  it("can synchronize the crop device with the full page preview", () => {
    props.device = "desktop"; const switchDevice = vi.fn(); props.onDeviceChange = switchDevice;
    click("Mobile"); expect(switchDevice).toHaveBeenCalledWith("mobile"); expect(media().props.deviceOverride).toBe("desktop");
    props.device = "mobile"; expect(media().props.deviceOverride).toBe("mobile");
  });
  it("zooms independently by device and keeps the sibling frame", () => {
    change("desktop Hero zoom", "2.17"); expect(lastValue()?.desktop.zoom).toBe(2.17); expect(lastValue()?.mobile.zoom).toBe(1);
    click("Mobile"); change("mobile Hero vertical position", "7"); expect(lastValue()?.mobile.y).toBe(7); expect(lastValue()?.desktop.zoom).toBe(2.17);
  });
  it("fits the whole portrait at 100 percent and explains the black space", () => {
    change("desktop Hero zoom", "2"); click("Fit whole media");
    expect(lastValue()?.desktop).toMatchObject({ fit: "contain", zoom: 1 });
    expect(text(render())).toContain("Unused space stays black");
    click("Fill Hero"); expect(lastValue()?.desktop.fit).toBe("cover");
  });
  it("resets only the selected device or explicitly restores legacy framing for both", () => {
    change("desktop Hero zoom", "2.2"); click("Mobile"); change("mobile Hero vertical position", "11"); click("Reset mobile");
    expect(lastValue()?.mobile).toEqual(getDefaultHeroFraming("image").mobile); expect(lastValue()?.desktop.zoom).toBe(2.2);
    click("Reset both to original"); expect(lastValue()).toBeNull();
  });
  it("keeps invalid range input out of the draft and clamps range boundaries", () => {
    for (const value of ["", "NaN", "Infinity"]) change("desktop Hero zoom", value);
    expect(changed).not.toHaveBeenCalled(); change("desktop Hero zoom", "9"); expect(lastValue()?.desktop.zoom).toBe(3);
    change("desktop Hero horizontal position", "-1"); expect(lastValue()?.desktop.x).toBe(0);
  });
  it("does not drag before valid media metadata arrives", () => {
    pointer("onPointerDown"); pointer("onPointerMove", { clientY: 70 }); expect(changed).not.toHaveBeenCalled();
    dimensions(0, 0); pointer("onPointerDown"); pointer("onPointerMove", { clientY: 70 }); expect(changed).not.toHaveBeenCalled();
  });
  it("pans a cropped portrait naturally from the original pointer position", () => {
    dimensions(); pointer("onPointerDown"); expect(target.setPointerCapture).toHaveBeenCalledWith(1);
    pointer("onPointerMove", { clientY: 75 }); expect(lastValue()?.desktop.y).toBe(40);
    pointer("onPointerMove", { clientY: 130 }); expect(lastValue()?.desktop.y).toBe(30);
    pointer("onPointerUp"); expect(target.releasePointerCapture).toHaveBeenCalledWith(1);
  });
  it("pans a contained portrait across letterboxed space", () => {
    click("Fit whole media"); dimensions(); changed.mockClear(); pointer("onPointerDown"); pointer("onPointerMove", { clientX: 47.5 });
    expect(lastValue()?.desktop).toMatchObject({ x: 60, y: 50, fit: "contain" });
  });
  it.each(["onPointerCancel", "onLostPointerCapture", "onPointerUp"])("ends a drag safely on %s", event => {
    dimensions(); pointer("onPointerDown"); pointer(event); pointer("onPointerMove", { clientY: 130 }); expect(changed).not.toHaveBeenCalled();
  });
  it("ignores right-click, secondary pointers, and unrelated move events", () => {
    dimensions(); pointer("onPointerDown", { button: 2 }); pointer("onPointerMove", { clientY: 80 });
    pointer("onPointerDown", { isPrimary: false }); pointer("onPointerMove", { clientY: 80 }); expect(changed).not.toHaveBeenCalled();
    pointer("onPointerDown"); pointer("onPointerMove", { pointerId: 2, clientY: 80 }); expect(changed).not.toHaveBeenCalled();
  });
  it("ignores a second pointer down without hijacking an active drag", () => {
    dimensions(); pointer("onPointerDown"); pointer("onPointerDown", { pointerId: 2 }); pointer("onPointerMove", { clientY: 75 });
    expect(lastValue()?.desktop.y).toBe(40); expect(target.setPointerCapture).toHaveBeenCalledTimes(1);
  });
  it("does not start an uncaptured gesture", () => {
    target.setPointerCapture.mockImplementation(() => { throw new Error("No active pointer"); }); dimensions();
    pointer("onPointerDown"); pointer("onPointerMove", { clientY: 80 }); expect(changed).not.toHaveBeenCalled();
  });
  it("supports keyboard positioning without trapping unrelated keys", () => {
    dimensions(); const preventDefault = vi.fn(); const key = (key: string, shiftKey = false) => (stage().props.onKeyDown as (event: unknown) => void)({ key, shiftKey, currentTarget: target, preventDefault });
    key("ArrowDown"); expect(lastValue()?.desktop.y).toBe(49.27); key("ArrowUp", true); expect(lastValue()?.desktop.y).toBe(52.91);
    preventDefault.mockClear(); changed.mockClear(); key("Tab"); expect(preventDefault).not.toHaveBeenCalled(); expect(changed).not.toHaveBeenCalled();
  });
  it("cannot mutate framing through a disabled control or disabled parent fieldset", () => {
    dimensions(); inheritedDisabled = true; pointer("onPointerDown"); pointer("onPointerMove", { clientY: 80 }); expect(changed).not.toHaveBeenCalled();
    inheritedDisabled = false; props.disabled = true; expect(stage().props.disabled).toBe(true); click("Fit whole media"); change("desktop Hero zoom", "2"); expect(changed).not.toHaveBeenCalled();
  });
  it("stops a gesture if saving or a disabled fieldset locks the editor", () => {
    dimensions(); pointer("onPointerDown"); inheritedDisabled = true; pointer("onPointerMove", { clientY: 80 }); inheritedDisabled = false; pointer("onPointerMove", { clientY: 90 }); expect(changed).not.toHaveBeenCalled();
  });
  it("does not reuse stale source dimensions or a drag when the media changes", () => {
    dimensions(); pointer("onPointerDown"); props.src = "/images/new.jpg"; pointer("onPointerMove", { clientY: 80 });
    pointer("onPointerDown"); pointer("onPointerMove", { clientY: 80 }); expect(changed).not.toHaveBeenCalled();
    expect(text(render())).toContain("when the media dimensions load");
  });
  it("keeps errors honest and stops a drag after a media load error", () => {
    dimensions(); pointer("onPointerDown"); (media().props.onError as () => void)(); pointer("onPointerMove", { clientY: 80 });
    expect(changed).not.toHaveBeenCalled(); expect(text(render())).toContain("Media could not be loaded");
    change("desktop Hero vertical position", "10"); expect(lastValue()?.desktop.y).toBe(10);
  });
  it("shows capability unavailability and prevents all framing edits", () => {
    props.unavailableReason = "Apply migration 0046 to enable framing.";
    expect(text(render())).toContain(props.unavailableReason); expect(stage().props.disabled).toBe(true);
    click("Fit whole media"); click("Mobile"); change("desktop Hero zoom", "2"); expect(changed).not.toHaveBeenCalled();
  });
  it.each(["javascript:alert(1)", "https://untrusted.example/image.jpg", "//evil.example/image.jpg", ""])("never loads unsafe or incomplete source %s", src => {
    props.src = src; expect(media()).toBeUndefined(); expect(stage().props.disabled).toBe(true); expect(changed).not.toHaveBeenCalled();
  });
  it("uses actual video dimensions, a paused player, and the video-specific mobile ratio", () => {
    props.mediaType = "video"; props.src = "/media/hero.mp4"; props.posterSrc = "/images/poster.jpg";
    expect(media().props).toMatchObject({ mediaType: "video", posterSrc: props.posterSrc, paused: true });
    expect(slider("desktop Hero zoom").props.value).toBe(1.04); click("Mobile"); expect(stage().props.style).toMatchObject({ aspectRatio: "390 / 422" });
    expect(text(render())).toContain("separate poster may have a different crop");
    dimensions(1920, 1080); pointer("onPointerDown"); pointer("onPointerMove", { clientX: 45 }); expect(changed).toHaveBeenCalledTimes(1);
  });
  it("does not request an unsafe poster", () => {
    props.mediaType = "video"; props.src = "/media/hero.mp4"; props.posterSrc = "https://unknown.example/poster.jpg";
    expect(media().props.posterSrc).toBeUndefined();
  });
  it("plays or pauses the muted video preview only on demand, without changing the Hero draft", () => {
    props.mediaType = "video"; props.src = "/media/hero.mp4";
    expect(media().props.paused).toBe(true); click("Play video preview"); expect(media().props.paused).toBe(false);
    click("Pause video preview"); expect(media().props.paused).toBe(true); expect(changed).not.toHaveBeenCalled();
    click("Play video preview"); props.src = "/media/other.mp4"; expect(media().props.paused).toBe(true);
  });
  it("reports playback rejection honestly and leaves position controls available", () => {
    props.mediaType = "video"; props.src = "/media/hero.mp4"; click("Play video preview");
    (media().props.onPlaybackError as () => void)(); expect(media().props.paused).toBe(true);
    expect(text(render())).toContain("Video playback could not start");
    change("desktop Hero zoom", "1.6"); expect(lastValue()?.desktop.zoom).toBe(1.6);
    click("Play video preview"); expect(text(render())).not.toContain("Video playback could not start");
  });
});
