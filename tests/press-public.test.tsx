import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import PressPage from "@/app/press/page";
import HomePageView from "@/components/home/HomePageView";
import { PressReviewsSection } from "@/components/home/HomeEditorialSections";
import PressPageView from "@/components/press/PressPageView";
import { createHomeDraftFromContent } from "@/lib/admin/home-editor";
import type { HomePressItem } from "@/lib/admin/home-editorial";
import { FALLBACK_CONTENT } from "@/lib/content/fallback";

const mocks = vi.hoisted(() => ({ getPublishedHomeDraft: vi.fn() }));
vi.mock("@/lib/content", () => ({ getPortfolioContent: async () => FALLBACK_CONTENT }));
vi.mock("@/lib/content/home.server", () => ({ getPublishedHomeDraft: mocks.getPublishedHomeDraft }));
vi.mock("@/components/NewsletterBlock", () => ({ default: () => <footer>Shared website footer</footer> }));

function article(id: string, overrides: Partial<HomePressItem> = {}): HomePressItem {
  return { id, title: `Article ${id}`, publication: `Publication ${id}`, kind: "review", quote: `Quote ${id}`,
    date: "2026-10-08", href: "https://example.com/review", visible: true, image: { src: "", alt: "", framing: null }, ...overrides };
}

function setup() {
  const data = createHomeDraftFromContent(FALLBACK_CONTENT);
  data.press.title = "PRESS & REVIEWS";
  data.press.items = [article("first"), article("private", { visible: false }), article("second")];
  data.press.featuredId = "second";
  return data;
}

describe("dedicated public Press page", () => {
  it.each(["public", "preview"] as const)("removes saved Press from %s Home without changing the saved collection", mode => {
    const data = setup();
    data.layout = [{ id: "press", enabled: true }];
    const before = structuredClone(data);
    const html = renderToStaticMarkup(<HomePageView data={data} programs={[]} mode={mode} />);
    expect(html).not.toContain("PRESS &amp; REVIEWS");
    expect(html).not.toContain("Article first");
    expect(html).not.toContain("home-press");
    expect(html).not.toContain('data-home-preview-section="press"');
    expect(data).toEqual(before);
  });

  it("renders one page heading, the chosen feature and every visible article in saved order", () => {
    const data = setup();
    const before = structuredClone(data.press);
    const html = renderToStaticMarkup(<PressPageView data={{ press: data.press, footer: {} }} />);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain('id="press"');
    expect(html).toContain("PRESS &amp; REVIEWS");
    expect(html).toContain("“Quote second”");
    expect(html).toContain("All press");
    expect(html).toContain("2 stories");
    expect(html.indexOf('aria-label="Read Article first"')).toBeLessThan(html.indexOf('aria-label="Read Article second"'));
    expect(html).not.toContain("Article private");
    expect(html).not.toContain("Quote private");
    expect(html).not.toContain("Publication private");
    expect(html).toContain("Shared website footer");
    expect(data.press).toEqual(before);
  });

  it("excludes hidden article data before crossing into the public client component", () => {
    const view = PressPageView({ data: { press: setup().press, footer: {} } });
    const pressComponent = view.props.children[0].props.children;
    expect(pressComponent.props.data.items.map((item: HomePressItem) => item.id)).toEqual(["first", "second"]);
  });

  it.each([{ items: [] }, { items: [article("private", { visible: false })] }])("shows an honest empty page without a reader or invented articles (%j)", ({ items }) => {
    const data = setup();
    data.press.items = items;
    data.press.title = "";
    const html = renderToStaticMarkup(<PressReviewsSection data={data.press} standalone />);
    expect(html).toContain("Press &amp; reviews</h1>");
    expect(html).toContain("Press features, reviews and interviews will appear here.");
    expect(html).not.toContain('aria-haspopup="dialog"');
    expect(html).not.toContain("All press");
    expect(html).not.toContain("private");
  });

  it("reads the existing saved Press content independently of the obsolete Home visibility flag", async () => {
    const data = setup();
    data.layout = data.layout.map(row => ({ ...row, enabled: false }));
    mocks.getPublishedHomeDraft.mockResolvedValue(data);
    const html = renderToStaticMarkup(await PressPage());
    expect(mocks.getPublishedHomeDraft).toHaveBeenCalledWith(FALLBACK_CONTENT);
    expect(html).toContain("Article first");
    expect(html).toContain("Article second");
    expect(html).not.toContain("Article private");
  });

  it("keeps cards visible but disables readers in the static editor preview", () => {
    const html = renderToStaticMarkup(<PressReviewsSection data={setup().press} standalone staticPreview />);
    expect(html).toContain("Article first");
    expect(html.match(/disabled=""/g)).toHaveLength(3);
    expect(html).not.toContain("<dialog");
  });
});
