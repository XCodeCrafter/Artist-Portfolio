import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HeroMedia from "@/components/HeroMedia";
import { getDefaultHeroFraming } from "@/lib/content/hero-framing";

type Effect = { dependencies: unknown[]; cleanup?: () => void };
const hooks = vi.hoisted(() => ({ refs: [] as { current: unknown }[], refCursor: 0, effects: [] as Effect[], effectCursor: 0, pending: [] as (() => void)[] }));
vi.mock("react", async original => {
  const react = await original<typeof import("react")>();
  return { ...react,
    useRef: (initial: unknown) => { const index = hooks.refCursor++; return hooks.refs[index] ??= { current: initial }; },
    useEffect: (run: () => void | (() => void), dependencies: unknown[]) => {
      const index = hooks.effectCursor++; const previous = hooks.effects[index];
      if (!previous || dependencies.some((value, offset) => !Object.is(value, previous.dependencies[offset]))) hooks.pending.push(() => {
        previous?.cleanup?.(); const cleanup = run(); hooks.effects[index] = { dependencies, cleanup: typeof cleanup === "function" ? cleanup : undefined };
      });
    },
  };
});
type Element = ReactElement<Record<string, unknown>>;
function nodes(tree: ReactNode): Element[] { return Children.toArray(tree).flatMap(node => isValidElement<Record<string, unknown>>(node) ? [node, ...nodes(node.props.children as ReactNode)] : []); }
const video = { play: vi.fn(() => Promise.resolve()), pause: vi.fn() };
let props: Parameters<typeof HeroMedia>[0];
function render() {
  hooks.refCursor = 0; hooks.effectCursor = 0; hooks.pending = [];
  const tree = HeroMedia(props); const player = nodes(tree).find(node => node.type === "video");
  hooks.refs[0].current = player ? video : null;
  hooks.pending.forEach(run => run()); return tree;
}
beforeEach(() => {
  hooks.refs = []; hooks.effects = []; vi.resetAllMocks(); video.play.mockResolvedValue(undefined);
  props = { backgroundSrc: "/media/hero.mp4", mediaType: "video", framing: getDefaultHeroFraming("video"), onPlaybackError: vi.fn() };
});

describe("explicit framing-preview playback", () => {
  it("does not override native public autoplay", () => { render(); expect(video.play).not.toHaveBeenCalled(); expect(video.pause).not.toHaveBeenCalled(); });
  it("starts paused, plays on request and pauses again without remounting", () => {
    props.paused = true; render(); expect(video.pause).toHaveBeenCalledTimes(1); expect(video.play).not.toHaveBeenCalled();
    props.paused = false; render(); expect(video.play).toHaveBeenCalledTimes(1);
    props.paused = true; render(); expect(video.pause).toHaveBeenCalledTimes(2);
  });
  it("does not restart playback while dragging or updating error callbacks", () => {
    props.paused = false; render(); props.framing = { ...props.framing, desktop: { ...props.framing.desktop, x: 35 } }; props.onPlaybackError = vi.fn(); render();
    expect(video.play).toHaveBeenCalledTimes(1);
  });
  it("reports a blocked playback attempt", async () => {
    video.play.mockRejectedValueOnce(new Error("Playback blocked")); props.paused = false; render(); await Promise.resolve();
    expect(props.onPlaybackError).toHaveBeenCalledTimes(1);
  });
  it("reports synchronous browser playback errors", () => {
    video.play.mockImplementationOnce(() => { throw new Error("Playback unavailable"); }); props.paused = false; render(); expect(props.onPlaybackError).toHaveBeenCalledTimes(1);
  });
  it.each(["pause", "source", "unmount"])("ignores a stale playback rejection after %s", async action => {
    let reject!: (reason: Error) => void; video.play.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; })); props.paused = false; render();
    if (action === "pause") { props.paused = true; render(); }
    if (action === "source") { props.backgroundSrc = "/media/other.mp4"; render(); }
    if (action === "unmount") hooks.effects.forEach(effect => effect.cleanup?.());
    reject(new Error("Old request interrupted")); await Promise.resolve(); expect(props.onPlaybackError).not.toHaveBeenCalled();
  });
  it("never starts a player for an inert static preview", () => {
    props.paused = false; props.staticPreview = true; props.posterSrc = "/images/poster.jpg";
    const tree = render(); expect(nodes(tree).some(node => node.type === "video")).toBe(false); expect(video.play).not.toHaveBeenCalled();
  });
  it("reports intrinsic video dimensions, not a separately supplied poster's aspect ratio", () => {
    props.onDimensions = vi.fn(); props.posterSrc = "/images/poster.jpg"; const player = nodes(render()).find(node => node.type === "video")!;
    const loaded = player.props.onLoadedMetadata as (event: unknown) => void;
    loaded({ currentTarget: { videoWidth: 1080, videoHeight: 1920 } }); expect(props.onDimensions).toHaveBeenCalledWith({ width: 1080, height: 1920 });
    for (const videoWidth of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) loaded({ currentTarget: { videoWidth, videoHeight: 1920 } });
    expect(props.onDimensions).toHaveBeenCalledTimes(1);
  });
});
