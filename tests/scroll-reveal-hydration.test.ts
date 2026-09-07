import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const scrollReveal = readFileSync(
  new URL("../components/ScrollReveal.tsx", import.meta.url),
  "utf8"
);

describe("scroll reveal hydration boundary", () => {
  it("tracks observed elements without mutating server-rendered attributes", () => {
    expect(scrollReveal).toContain("new WeakSet<RevealEl>()");
    expect(scrollReveal).toContain("observed.has(el)");
    expect(scrollReveal).toContain("observed.add(el)");
    expect(scrollReveal).not.toContain("data-reveal-bound");
    expect(scrollReveal).not.toContain("setAttribute(");
  });
});
