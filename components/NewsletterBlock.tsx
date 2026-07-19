"use client";

import GalleryFooter from "@/components/GalleryFooter";
import type { FooterEffect, PortfolioType, SocialLink } from "@/lib/content";

type NewsletterBlockProps = {
  artistName?: string;
  contactBlurb?: string;
  location?: string;
  portfolioType?: PortfolioType;
  footerEffect?: FooterEffect;
  socialLinks?: SocialLink[];
  spotifyUrl?: string;
  tagline?: string;
};

// Kept as a compatibility wrapper for existing pages. The gallery footer is the
// single visual source of truth for every public page.
export default function NewsletterBlock({
  artistName = "Franky Fugazi",
  contactBlurb,
  location = "Amsterdam, The Netherlands",
  portfolioType = "musician",
  footerEffect = "soul",
  socialLinks = [],
  spotifyUrl,
  tagline,
}: NewsletterBlockProps) {
  return (
    <GalleryFooter
      artistName={artistName}
      contactBlurb={contactBlurb}
      location={location}
      portfolioType={portfolioType}
      footerEffect={footerEffect}
      socialLinks={socialLinks}
      spotifyUrl={spotifyUrl}
      tagline={tagline}
    />
  );
}
