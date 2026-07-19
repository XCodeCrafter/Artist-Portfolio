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
import {
  getFontFamily,
  getGoogleFontsStylesheetUrl,
} from "@/lib/content/fonts";
import { getSiteUrl } from "@/lib/site-url";

type TypographyStyle = CSSProperties & {
  "--font-display": string;
  "--font-body": string;
  "--font-ui": string;
};

export async function generateMetadata(): Promise<Metadata> {
  const content = await getPortfolioContent();
  const artistName = content.settings.artistName;
  const description = content.settings.description;

  return {
    metadataBase: new URL(getSiteUrl()),
    title: {
      default: artistName,
      template: `%s | ${artistName}`,
    },
    description,
    applicationName: artistName,
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      siteName: artistName,
      title: artistName,
      description,
      images: [
        {
          url: "/opengraph-image",
          width: 1200,
          height: 630,
          alt: `${artistName} portfolio`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: artistName,
      description,
      images: ["/twitter-image"],
    },
    icons: { icon: [{ url: "/favicon.ico" }] },
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // A per-request CSP nonce requires dynamic rendering.
  await connection();
  const content = await getPortfolioContent();
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
          portfolioType={content.settings.portfolioType}
          socialLinks={content.socialLinks}
        />

        <div className="relative z-10">
          <MotionShell>{children}</MotionShell>
        </div>
      </body>
    </html>
  );
}
