//artist-portfolio/app/layout.tsx
import "@/styles/globals.css";
import type { Metadata } from "next";
import SmoothScroll from "@/components/SmoothScroll";
import ScrollReveal from "@/components/ScrollReveal";
import MotionShell from "@/components/MotionShell";
import TopNav from "@/components/TopNav";

// Fonts live here (single source of truth).
// Swap them anytime — everything else uses CSS variables.
import { Uncial_Antiqua, Inter } from "next/font/google";

// Headings / big titles
const displayFont = Uncial_Antiqua({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-display",
  display: "swap",
});

// Body / paragraphs / UI
const bodyFont = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});

const siteUrl =
  process.env.SITE_URL?.startsWith("http")
    ? process.env.SITE_URL
    : "https://example.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Artist Portfolio",
    template: "%s · Artist Portfolio",
  },
  description: "Dark cinematic portfolio – music, photos, illustration.",
  applicationName: "Artist Portfolio",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Artist Portfolio",
    title: "Artist Portfolio",
    description: "Dark cinematic portfolio – music, photos, illustration.",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Artist Portfolio",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Artist Portfolio",
    description: "Dark cinematic portfolio – music, photos, illustration.",
    images: ["/twitter-image"],
  },
  icons: {
    icon: [{ url: "/icon.png" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="cs"
      className={`bg-black text-white ${displayFont.variable} ${bodyFont.variable}`}
    >
      <body className="min-h-screen antialiased">
        <SmoothScroll />
        <ScrollReveal />

        {/* Noise/texture overlay */}
        <div className="pointer-events-none fixed inset-0 z-0 opacity-60 noise" />

        {/* Fixed UI */}
        <TopNav />

        {/* Page content */}
        <div className="relative z-10">
          <MotionShell>{children}</MotionShell>
        </div>
      </body>
    </html>
  );
}