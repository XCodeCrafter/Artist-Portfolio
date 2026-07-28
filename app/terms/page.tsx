import type { Metadata } from "next";
import { getPortfolioContent } from "@/lib/content";
import { createPageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const content = await getPortfolioContent();

  return createPageMetadata(content, "terms");
}

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-[900px] px-5 sm:px-8 pb-24 pt-36">
      <p className="text-xs uppercase tracking-[0.35em] text-white/50">Legal</p>
      <h1 className="mt-4 text-5xl font-semibold tracking-tight sm:text-7xl">
        Terms
      </h1>

      <div className="mt-10 space-y-6 text-sm leading-7 text-white/70 sm:text-base">
        <p>
          This website is provided as an official artist portfolio for browsing
          music, video, biography, press material, and booking information.
        </p>
        <p>
          All images, audio references, videos, names, and brand materials remain
          the property of their respective owners. Do not reuse portfolio assets
          without permission.
        </p>
        <p>
          Sending a contact inquiry does not create a contract or guarantee
          availability. Confirmed work requires direct written agreement.
        </p>
      </div>
    </main>
  );
}
