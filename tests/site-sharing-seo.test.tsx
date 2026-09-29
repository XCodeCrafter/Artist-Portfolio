import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FALLBACK_CONTENT } from "@/lib/content/fallback";
import { createPageMetadata, createBioJsonLd, getPageSeo } from "@/lib/seo";
import { resolveSiteSharing } from "@/lib/site-sharing-preview";
import SocialPreviewCard from "@/components/seo/SocialPreviewCard";

const draft = { title: "Franky Fugazi | Cigar Box Blues", description: "Raw blues, live dates and music.", imageSrc: "", imageAlt: "" };
const content = () => ({ ...structuredClone(FALLBACK_CONTENT), settings: { ...FALLBACK_CONTENT.settings, sharingMetadata: { ...draft } } });
afterEach(() => vi.unstubAllEnvs());

describe("editable site sharing metadata", () => {
  it("uses saved home title and description in search, Open Graph and Twitter", () => {
    const metadata = createPageMetadata(content(), "home");
    expect(metadata.title).toEqual({ absolute: draft.title });
    expect(metadata.description).toBe(draft.description);
    expect(metadata.openGraph).toMatchObject({ title: draft.title, description: draft.description });
    expect(metadata.twitter).toMatchObject({ title: draft.title, description: draft.description, card: "summary_large_image" });
  });
  it("decouples SEO and person identity from campaign headings", () => {
    const data = content();
    data.heroes.home.title = "ARTIST FREELANCER LIFE / Programing on Heidenhain";
    delete (data.settings as { sharingMetadata?: unknown }).sharingMetadata;
    expect(getPageSeo(data, "home").title).toBe("Franky Fugazi");
    expect(getPageSeo(data, "music").title).not.toContain("Heidenhain");
    expect(createBioJsonLd(data)["@graph"].find(node => node["@type"] === "Person")).toMatchObject({ name: "Franky Fugazi" });
  });
  it("keeps page-specific titles and descriptions on subpages", () => {
    const data = content();
    expect(getPageSeo(data, "music").title).toBe("Music & Releases | Franky Fugazi");
    expect(getPageSeo(data, "music").description).not.toBe(draft.description);
    expect(getPageSeo(data, "booking").path).toBe("/booking");
  });
  it("publishes one absolute PNG cover with real dimensions and matching Twitter image", () => {
    vi.stubEnv("SITE_URL", "https://artist.example");
    const metadata = createPageMetadata(content(), "home");
    const images = (metadata.openGraph as { images: unknown }).images;
    expect(images).toEqual([{ url: expect.stringMatching(/^https:\/\/artist\.example\/opengraph-image\?v=[a-f0-9]+$/), width: 1200, height: 630, type: "image/png", alt: `${draft.title} — official website` }]);
    expect((metadata.twitter as { images: unknown }).images).toEqual(images);
  });
  it("uses a selected complete cover without lying about its dimensions", () => {
    vi.stubEnv("SITE_URL", "https://artist.example");
    const data = content();
    data.settings.sharingMetadata.imageSrc = "/images/custom-cover.jpg";
    data.settings.sharingMetadata.imageAlt = "Franky on stage";
    expect(createPageMetadata(data, "home").openGraph).toMatchObject({ images: [{ url: "https://artist.example/images/custom-cover.jpg", alt: "Franky on stage" }] });
    const image = (createPageMetadata(data, "home").openGraph as { images: object[] }).images[0];
    expect(image).not.toHaveProperty("width");
  });
  it("preserves custom description when sharing fields are blank", () => {
    const settings = { ...FALLBACK_CONTENT.settings, description: "My own saved introduction." };
    expect(resolveSiteSharing(settings).description).toBe(settings.description);
  });
  it("changes generated image version when its visible title or owner changes", () => {
    const settings = content().settings;
    const original = resolveSiteSharing(settings).generatedImagePath;
    expect(resolveSiteSharing(settings).generatedImagePath).toBe(original);
    expect(resolveSiteSharing({ ...settings, sharingMetadata: { ...draft, title: "Another title" } }).generatedImagePath).not.toBe(original);
    expect(resolveSiteSharing({ ...settings, artistName: "Another artist" }).generatedImagePath).not.toBe(original);
    expect(original).not.toContain(encodeURIComponent(draft.title));
  });
  it("never turns an arbitrary external source into an OG URL", () => {
    const data = content();
    data.settings.sharingMetadata.imageSrc = "https://attacker.invalid/a.jpg";
    expect(JSON.stringify(createPageMetadata(data, "home"))).not.toContain("attacker.invalid");
  });
  it("escapes owner-authored text in the shared DOM card", () => {
    const html = renderToStaticMarkup(<SocialPreviewCard brandName={'<script>alert(1)</script>'} title={'<img src=x onerror=alert(1)>'} />);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;img");
    expect(html).toContain("press-social.jpg");
  });
  it("keeps image routes out of file-convention override and uses no remote image fetch", () => {
    expect(existsSync("app/opengraph-image.tsx")).toBe(false);
    expect(existsSync("app/twitter-image.tsx")).toBe(false);
    const route = readFileSync("app/opengraph-image/route.tsx", "utf8");
    expect(route).toContain('dynamic = "force-dynamic"');
    expect(route).toContain('public/images/home-editorial/press-social.jpg');
    expect(route).not.toMatch(/fetch\s*\(|searchParams|imageSrc/);
    const jpg = readFileSync("public/images/home-editorial/press-social.jpg");
    expect([...jpg.subarray(0, 3)]).toEqual([255, 216, 255]);
  });
});
