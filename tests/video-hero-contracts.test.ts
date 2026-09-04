import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const videoHeroSource = readFileSync(
  fileURLToPath(new URL("../components/VideoHero.tsx", import.meta.url)),
  "utf8"
);

describe("VideoHero delivery contract", () => {
  it("mounts one responsive video instead of duplicate breakpoint players", () => {
    expect(videoHeroSource.match(/<video\b/g)).toHaveLength(1);
    expect(videoHeroSource).not.toContain('"sm:hidden"');
    expect(videoHeroSource).not.toContain('"hidden sm:block"');
  });

  it("preserves separate mobile and desktop focal points on that video", () => {
    expect(videoHeroSource).toContain(
      "[object-position:var(--video-position-mobile)]"
    );
    expect(videoHeroSource).toContain(
      "sm:[object-position:var(--video-position-desktop)]"
    );
    expect(videoHeroSource).toContain(
      '"--video-position-mobile": videoPosMobile'
    );
    expect(videoHeroSource).toContain(
      '"--video-position-desktop": videoPosDesktop'
    );
  });

  it("keeps the silent looping background playback contract", () => {
    for (const attribute of [
      "autoPlay",
      "muted",
      "loop",
      "playsInline",
      'preload="metadata"',
      "poster={poster}",
    ]) {
      expect(videoHeroSource).toContain(attribute);
    }
  });
});
