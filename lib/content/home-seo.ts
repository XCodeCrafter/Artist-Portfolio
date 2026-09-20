import type { HomeEditorDraft } from "@/lib/admin/home-editor";
import type { PortfolioContent } from "@/lib/content/types";

/** Use edited HOME identity without publishing media belonging to hidden sections. */
export function withHomeSeoContent(content: PortfolioContent, home: HomeEditorDraft): PortfolioContent {
  const heroEnabled = home.layout.some((section) => section.id === "hero" && section.enabled);
  const aboutEnabled = home.layout.some((section) => section.id === "about" && section.enabled);
  return {
    ...content,
    heroes: {
      ...content.heroes,
      home: heroEnabled ? home.hero : { ...home.hero, title: "", backgroundSrc: "", posterSrc: "" },
    },
    aboutHome: aboutEnabled ? home.about : { ...home.about, imageSrc: "" },
  };
}
