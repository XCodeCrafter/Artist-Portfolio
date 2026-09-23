import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PhotoFramingControls, { type PhotoFramingControlsProps } from "@/components/admin/v2/PhotoFramingControls";
import HeroFramingControls from "@/components/admin/v2/HeroFramingControls";

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }));
vi.mock("react", async original => {
  const react = await original<typeof import("react")>();
  return { ...react, useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = initial;
    return [hooks.values[index], (value: unknown) => { hooks.values[index] = value; }];
  } };
});
vi.mock("@/components/admin/v2/HeroFramingControls", () => ({ default: () => null }));
type Element = ReactElement<Record<string, unknown>>;
function nodes(tree: ReactNode): Element[] {
  return Children.toArray(tree).flatMap(node => isValidElement<Record<string, unknown>>(node) ? [node, ...nodes(node.props.children as ReactNode)] : []);
}
function text(tree: ReactNode): string {
  return Children.toArray(tree).map(node => isValidElement<Record<string, unknown>>(node) ? text(node.props.children as ReactNode) : String(node)).join("");
}
let props: PhotoFramingControlsProps;
function render() { hooks.cursor = 0; return PhotoFramingControls(props); }
function toggle(open: boolean) { (render().props.onToggle as (event: unknown) => void)({ currentTarget: { open } }); }
function controls() { return nodes(render()).find(node => node.type === HeroFramingControls); }

beforeEach(() => {
  hooks.cursor = 0; hooks.values = [];
  props = { src: "/images/portrait.jpg", value: null, onChange: vi.fn(), saveSection: "Biography" };
});

describe("Photo framing disclosure", () => {
  it("does not mount media for closed collection cards", () => {
    expect(text(render())).toBe("Photo position & zoom");
    expect(controls()).toBeUndefined();
    toggle(true); expect(controls()).toBeDefined();
    toggle(false); expect(controls()).toBeUndefined();
  });
  it("reuses the proven image-only controls with centered defaults for both devices", () => {
    toggle(true);
    expect(controls()?.props).toMatchObject({ mediaType: "image", subjectLabel: "Photo", disabled: false, src: props.src, value: null,
      defaultFraming: { desktop: { fit: "cover", x: 50, y: 50, zoom: 1 }, mobile: { fit: "cover", x: 50, y: 50, zoom: 1 } } });
    expect(controls()?.props.saveDescription).toContain("save Biography");
    expect(controls()?.props.saveDescription).toContain("This placement only");
    expect(controls()?.props.saveDescription).toContain("original library file stays unchanged");
  });
  it("keeps pre-migration framing disabled without affecting surrounding fields", () => {
    props.value = undefined; expect(text(render())).toContain("setup required"); toggle(true);
    expect(controls()?.props.disabled).toBe(true);
    expect(controls()?.props.unavailableReason).toContain("migration 0051");
    expect(controls()?.props.unavailableReason).toContain("Other fields remain editable");
  });
  it("retains save-time disabled guards even when framing is available", () => {
    props.disabled = true; toggle(true);
    expect(controls()?.props.disabled).toBe(true);
    expect(controls()?.props.unavailableReason).toBeUndefined();
  });
  it("passes placement geometry, device selection and draft edits through unchanged", () => {
    props.device = "mobile"; props.onDeviceChange = vi.fn();
    props.previewViewport = { desktop: { width: 400, height: 300 }, mobile: { width: 300, height: 400 } };
    toggle(true);
    expect(controls()?.props.previewViewport).toEqual(props.previewViewport);
    expect(controls()?.props.device).toBe("mobile");
    expect(controls()?.props.onDeviceChange).toBe(props.onDeviceChange);
    expect(controls()?.props.onChange).toBe(props.onChange);
    expect(props.onChange).not.toHaveBeenCalled();
  });
  it("lets Gallery inspect variable shapes without changing content or mobile geometry", () => {
    props.variableAspect = true; toggle(true);
    const select = nodes(render()).find(node => node.type === "select")!;
    expect(controls()?.props.previewViewport).toEqual({ desktop: { width: 400, height: 500 }, mobile: { width: 350, height: 280 } });
    (select.props.onChange as (event: unknown) => void)({ target: { value: "landscape" } });
    expect(controls()?.props.previewViewport).toEqual({ desktop: { width: 600, height: 400 }, mobile: { width: 350, height: 280 } });
    (select.props.onChange as (event: unknown) => void)({ target: { value: "unknown" } });
    expect(controls()?.props.previewViewport).toEqual({ desktop: { width: 600, height: 400 }, mobile: { width: 350, height: 280 } });
    expect(text(render())).toContain("not your Gallery layout");
    expect(props.onChange).not.toHaveBeenCalled();
  });
});
