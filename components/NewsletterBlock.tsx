"use client";

import GalleryFooter from "@/components/GalleryFooter";
import type { FooterEffect, SocialLink } from "@/lib/content";

type NewsletterBlockProps = {
  artistName?: string;
  contactBlurb?: string;
  location?: string;
  footerEffect?: FooterEffect;
  socialLinks?: SocialLink[];
  tagline?: string;
};

// Kept as a compatibility wrapper for existing pages. The gallery footer is the
// single visual source of truth for every public page.
export default function NewsletterBlock({
  artistName = "Franky Fugazi",
  contactBlurb,
  location = "Amsterdam, The Netherlands",
  footerEffect = "soul",
  socialLinks = [],
  tagline,
}: NewsletterBlockProps) {
  return (
    <GalleryFooter
      artistName={artistName}
      contactBlurb={contactBlurb}
      location={location}
      footerEffect={footerEffect}
      socialLinks={socialLinks}
      tagline={tagline}
    />
  );
}
