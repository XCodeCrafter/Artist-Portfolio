import HeroCinematic from "@/components/HeroCinematic";
import VideoHero from "@/components/VideoHero";
import type { HeroContent } from "@/lib/content";

type AdaptiveHeroProps = HeroContent & {
  staticPreview?: boolean;
};

export default function AdaptiveHero({
  backgroundSrc,
  ctaHref,
  ctaLabel,
  mediaType,
  posterSrc,
  staticPreview = false,
  subtitle,
  title,
}: AdaptiveHeroProps) {
  if (mediaType === "video") {
    return (
      <VideoHero
        backgroundSrc={backgroundSrc}
        ctaHref={ctaHref}
        ctaLabel={ctaLabel}
        poster={posterSrc || undefined}
        staticPreview={staticPreview}
        subtitle={subtitle}
        title={title}
      />
    );
  }

  return (
    <HeroCinematic
      backgroundSrc={backgroundSrc}
      ctaHref={ctaHref}
      ctaLabel={ctaLabel}
      subtitle={subtitle}
      title={title}
    />
  );
}
