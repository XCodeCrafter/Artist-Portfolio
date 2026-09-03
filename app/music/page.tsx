// artist-portfolio/app/music/page.tsx
import type { Metadata } from "next";
import MusicPageView from "@/components/music/MusicPageView";
import { getPortfolioContent } from "@/lib/content";
import { selectMusicPageViewData } from "@/lib/content/music";
import { createPageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const content = await getPortfolioContent();

  return createPageMetadata(content, "music");
}

export default async function MusicPage() {
  const content = await getPortfolioContent();

  return <MusicPageView data={selectMusicPageViewData(content)} />;
}
