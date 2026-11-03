import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MEDIA_DELIVERY_QUERY,
  getMediaDeliveryEndpoint,
  toDeliveryUrl,
  withMediaDelivery,
} from "@/lib/media-delivery";
import { createContentSecurityPolicy } from "@/lib/security/csp";

const SUPABASE = "https://project-ref.supabase.co";
const ENDPOINT = "https://ik.imagekit.io/artist_account-01";
const PUBLIC = `${SUPABASE}/storage/v1/object/public/portfolio-media`;

function enable() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE);
  vi.stubEnv("NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT", ENDPOINT);
  vi.stubEnv("MEDIA_DELIVERY_CDN", "imagekit");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("media delivery switch", () => {
  it("stays off unless explicitly enabled with a valid endpoint", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE);
    vi.stubEnv("NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT", ENDPOINT);
    vi.stubEnv("MEDIA_DELIVERY_CDN", "");
    expect(getMediaDeliveryEndpoint()).toBeNull();

    vi.stubEnv("MEDIA_DELIVERY_CDN", "imagekit");
    vi.stubEnv("NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT", "https://evil.example/artist");
    expect(getMediaDeliveryEndpoint()).toBeNull();

    vi.stubEnv("NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT", ENDPOINT);
    expect(getMediaDeliveryEndpoint()).toBe(ENDPOINT);
  });

  it("returns the very same data object when delivery is off", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE);
    vi.stubEnv("MEDIA_DELIVERY_CDN", "");
    const data = { src: `${PUBLIC}/image/a.png` };
    expect(withMediaDelivery(data)).toBe(data);
    expect(toDeliveryUrl(data.src)).toBe(data.src);
  });
});

describe("toDeliveryUrl", () => {
  it.each([
    ["image/photo-1.png"],
    ["image/portrait.JPG"],
    ["video/clip.mp4"],
    ["video/live-set.mov"],
  ])("serves the untouched original of %s through the CDN", (path) => {
    enable();
    expect(toDeliveryUrl(`${PUBLIC}/${path}`)).toBe(
      `${ENDPOINT}/storage/v1/object/public/portfolio-media/${path}${MEDIA_DELIVERY_QUERY}`
    );
  });

  it.each([
    ["a local asset", "/images/hero.jpg"],
    ["another host", "https://cdn.example.com/storage/v1/object/public/portfolio-media/image/a.png"],
    ["another Supabase project", "https://other-ref.supabase.co/storage/v1/object/public/portfolio-media/image/a.png"],
    ["a signed storage URL", `${SUPABASE}/storage/v1/object/sign/portfolio-media/image/a.png?token=abc`],
    ["a public URL with a query", `${PUBLIC}/image/a.png?v=2`],
    ["a non-media file", `${PUBLIC}/docs/press-kit.pdf`],
    ["an audio file", `${PUBLIC}/audio/track.mp3`],
    ["plain text", "Raw cigar box blues"],
    ["an empty string", ""],
  ])("leaves %s unchanged", (_label, value) => {
    enable();
    expect(toDeliveryUrl(value)).toBe(value);
  });
});

describe("withMediaDelivery", () => {
  it("rewrites media URLs anywhere in render data without mutating the input", () => {
    enable();
    const input = {
      hero: { backgroundSrc: `${PUBLIC}/video/hero.mp4`, posterSrc: `${PUBLIC}/image/poster.png`, title: "Live" },
      images: [{ src: `${PUBLIC}/image/a.png`, alt: "A", framing: { desktop: { x: 50, y: 20, zoom: 1 } } }],
      links: ["https://open.spotify.com/artist/1", "/booking"],
      count: 3,
      enabled: true,
      missing: null,
    };
    const snapshot = structuredClone(input);

    const output = withMediaDelivery(input);

    expect(input).toEqual(snapshot);
    expect(output.hero.backgroundSrc).toBe(`${ENDPOINT}/storage/v1/object/public/portfolio-media/video/hero.mp4${MEDIA_DELIVERY_QUERY}`);
    expect(output.hero.posterSrc).toBe(`${ENDPOINT}/storage/v1/object/public/portfolio-media/image/poster.png${MEDIA_DELIVERY_QUERY}`);
    expect(output.images[0].src).toBe(`${ENDPOINT}/storage/v1/object/public/portfolio-media/image/a.png${MEDIA_DELIVERY_QUERY}`);
    expect(output.images[0].framing).toEqual(input.images[0].framing);
    expect(output.links).toEqual(input.links);
    expect(output).toMatchObject({ count: 3, enabled: true, missing: null, hero: { title: "Live" } });
  });
});

describe("delivery allowlists", () => {
  it("adds the CDN image pattern only when delivery is enabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_MEDIA_ORIGIN", "");
    vi.stubEnv("NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT", ENDPOINT);
    vi.stubEnv("MEDIA_DELIVERY_CDN", "imagekit");
    const { default: nextConfig } = await import("../next.config");

    expect(nextConfig.images?.remotePatterns).toContainEqual({
      protocol: "https",
      hostname: "ik.imagekit.io",
      port: "",
      pathname: "/artist_account-01/storage/v1/object/public/**",
      search: MEDIA_DELIVERY_QUERY,
    });
  });

  it("lets browsers load CDN images and video under the existing CSP", () => {
    enable();
    const policy = createContentSecurityPolicy("nonce");
    const directive = (name: string) => policy.split("; ").find((value) => value.startsWith(`${name} `)) ?? "";
    expect(directive("img-src")).toContain("https://ik.imagekit.io");
    expect(directive("media-src")).toContain("https://ik.imagekit.io");
    expect(directive("connect-src")).not.toContain("https://ik.imagekit.io");
  });
});

describe("public page wiring", () => {
  const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

  it.each([
    ["app/page.tsx", "<HomePageView data={withMediaDelivery("],
    ["app/bio/page.tsx", "<BioPageView data={withMediaDelivery(data)} />"],
    ["app/gallery/page.tsx", "<GalleryPageView data={withMediaDelivery(data)} />"],
    ["app/music/page.tsx", "<MusicPageView data={withMediaDelivery(selectMusicPageViewData(content))} />"],
    ["app/video/page.tsx", "<ShowreelPageView data={withMediaDelivery(data)} />"],
    ["app/press/page.tsx", "<PressPageView data={withMediaDelivery({"],
    ["app/booking/page.tsx", "<ContactPageView data={withMediaDelivery(data)} />"],
    ["app/layout.tsx", "<FooterContentProvider content={withMediaDelivery(content.settings.footerContent)}>"],
  ])("%s renders through the CDN mapping", (path, snippet) => {
    expect(read(path)).toContain(snippet);
  });

  it("keeps metadata, structured data and admin on canonical Supabase URLs", () => {
    const home = read("app/page.tsx");
    expect(home).toContain("createPageMetadata(withHomeSeoContent(content, home), \"home\")");
    expect(home).toContain("<JsonLd data={createHomeJsonLd(withHomeSeoContent(content, home))} />");
    expect(read("app/bio/page.tsx")).toContain("<JsonLd data={createBioJsonLd(content)} />");
    expect(read("lib/content/index.ts")).not.toContain("withMediaDelivery");
    expect(read("lib/content/site-sharing.ts")).not.toContain("withMediaDelivery");
  });
});
