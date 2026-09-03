// artist-portfolio/app/layout.tsx
import "@/styles/globals.css";
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { connection } from "next/server";
import MotionShell from "@/components/MotionShell";
import AnalyticsTracker from "@/components/AnalyticsTracker";
import ScrollReveal from "@/components/ScrollReveal";
import SmoothScroll from "@/components/SmoothScroll";
import TopNav from "@/components/TopNav";
import { getPortfolioContent } from "@/lib/content";
import { getVisiblePublicPageNavigationItems } from "@/lib/content/navigation";
import { hasPublishedCncPrograms } from "@/lib/content/cnc-programs.server";
import {
  getFontFamily,
  getGoogleFontsStylesheetUrl,
} from "@/lib/content/fonts";
import { createRootMetadata } from "@/lib/seo";

type TypographyStyle = CSSProperties & {
  "--font-display": string;
  "--font-body": string;
  "--font-ui": string;
};

export async function generateMetadata(): Promise<Metadata> {
  const content = await getPortfolioContent();

  return createRootMetadata(content);
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // A per-request CSP nonce requires dynamic rendering.
  await connection();
  const [content, hasCncPrograms] = await Promise.all([
    getPortfolioContent(),
    hasPublishedCncPrograms(),
  ]);
  const navigationItems = getVisiblePublicPageNavigationItems(
    content.navigation.items,
    {
      hasPublishedCncPrograms: hasCncPrograms,
      hasResumeContent:
        content.hasActorResume || content.actorCredits.length > 0,
    }
  );
  const typographyStyle: TypographyStyle = {
    "--font-display": getFontFamily(content.settings.displayFont),
    "--font-body": getFontFamily(content.settings.bodyFont),
    "--font-ui": getFontFamily(content.settings.uiFont),
  };
  const typographyStylesheet = getGoogleFontsStylesheetUrl([
    content.settings.displayFont,
    content.settings.bodyFont,
    content.settings.uiFont,
  ]);

  return (
    <html
      lang="en"
      className="bg-black text-white"
      style={typographyStyle}
    >
      <head>
        <link href="https://fonts.googleapis.com" rel="preconnect" />
        <link crossOrigin="anonymous" href="https://fonts.gstatic.com" rel="preconnect" />
        <link href={typographyStylesheet} rel="stylesheet" />
      </head>
      <body className="min-h-screen antialiased">
        <AnalyticsTracker />
        <SmoothScroll />
        <ScrollReveal />

        <div className="pointer-events-none fixed inset-0 z-0 opacity-60 noise" />
        <TopNav
          artistName={content.settings.artistName}
          navigationItems={navigationItems}
          socialLinks={content.socialLinks}
        />

        <div className="relative z-10">
          <MotionShell>{children}</MotionShell>
        </div>
      </body>
    </html>
  );
}
