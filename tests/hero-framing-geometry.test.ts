import { describe, expect, it } from "vitest";
import { getHeroFramingPreviewViewport, getHeroFramingTravel, moveHeroFrame, validHeroDimensions } from "@/lib/admin/hero-framing-geometry";
import type { HeroFrame } from "@/lib/content/hero-framing";

const frame: HeroFrame = { fit: "cover", x: 50, y: 50, zoom: 1 };
const wide = { width: 400, height: 200 };
const portrait = { width: 200, height: 400 };

describe("Hero framing geometry", () => {
  it("matches the existing real Hero heights in each device preview", () => {
    expect(getHeroFramingPreviewViewport("desktop", "image")).toEqual({ width: 1440, height: 900 });
    expect(getHeroFramingPreviewViewport("desktop", "video")).toEqual({ width: 1440, height: 900 });
    expect(getHeroFramingPreviewViewport("mobile", "image")).toEqual({ width: 390, height: 506.4 });
    expect(getHeroFramingPreviewViewport("mobile", "video")).toEqual({ width: 390, height: 422 });
  });
  it.each([null, undefined, { width: 0, height: 1 }, { width: 1, height: -1 }, { width: Infinity, height: 2 }, { width: 2, height: NaN }])("rejects unavailable dimensions %j", dimensions => {
    expect(validHeroDimensions(dimensions)).toBe(false);
  });
  it("computes negative crop travel for a portrait filling a wide Hero", () => {
    expect(getHeroFramingTravel(frame, wide, portrait)).toEqual({ x: 0, y: -600 });
    expect(moveHeroFrame(frame, wide, portrait, { x: 30, y: 60 })).toEqual({ ...frame, y: 40 });
  });
  it("moves a fitted portrait in the same drag direction across black space", () => {
    const fit = { ...frame, fit: "contain" as const };
    expect(getHeroFramingTravel(fit, wide, portrait)).toEqual({ x: 300, y: 0 });
    expect(moveHeroFrame(fit, wide, portrait, { x: 60, y: 60 })).toEqual({ ...fit, x: 70 });
  });
  it("includes zoom in travel and keeps object-position and transform-origin aligned", () => {
    const zoomed = { ...frame, zoom: 2 };
    expect(getHeroFramingTravel(zoomed, wide, wide)).toEqual({ x: -400, y: -200 });
    expect(moveHeroFrame(zoomed, wide, wide, { x: 40, y: -20 })).toEqual({ ...zoomed, x: 40, y: 60 });
  });
  it("handles contain with zoom transitioning from letterbox to crop", () => {
    const zoomed = { ...frame, fit: "contain" as const, zoom: 3 };
    expect(getHeroFramingTravel(zoomed, wide, portrait)).toEqual({ x: 100, y: -400 });
    expect(moveHeroFrame(zoomed, wide, portrait, { x: 10, y: 40 })).toEqual({ ...zoomed, x: 60, y: 40 });
  });
  it("clamps extreme drags without changing fit or zoom", () => {
    expect(moveHeroFrame(frame, wide, portrait, { x: 99999, y: 99999 })).toEqual({ ...frame, y: 0 });
    expect(moveHeroFrame(frame, wide, portrait, { x: -99999, y: -99999 })).toEqual({ ...frame, y: 100 });
  });
  it("does not turn a perfectly fitted axis or tiny float residue into a jump", () => {
    expect(moveHeroFrame(frame, wide, wide, { x: 50, y: 100 })).toEqual(frame);
    expect(moveHeroFrame({ ...frame, zoom: 1.00001 }, wide, wide, { x: 50, y: 100 })).toEqual({ ...frame, zoom: 1.00001 });
  });
  it("ignores invalid dimensions, zoom, and pointer deltas", () => {
    expect(moveHeroFrame(frame, { width: 0, height: 2 }, portrait, { x: 1, y: 1 })).toBe(frame);
    expect(getHeroFramingTravel({ ...frame, zoom: NaN }, wide, portrait)).toBeNull();
    expect(getHeroFramingTravel({ ...frame, zoom: 0 }, wide, portrait)).toBeNull();
    expect(moveHeroFrame(frame, wide, portrait, { x: Infinity, y: NaN })).toEqual(frame);
  });
  it("uses displayed CSS pixels, so scaled admin previews remain accurate", () => {
    const full = moveHeroFrame(frame, { width: 1440, height: 900 }, portrait, { x: 0, y: 99 });
    const scaled = moveHeroFrame(frame, { width: 360, height: 225 }, portrait, { x: 0, y: 24.75 });
    expect(scaled).toEqual(full);
  });
});
