import HeroCinematic from "@/components/HeroCinematic";
import VideoHero from "@/components/VideoHero";
import type { HeroContent } from "@/lib/content";

type AdaptiveHeroProps = HeroContent;

export default function AdaptiveHero({
  backgroundSrc,
  ctaHref,
  ctaLabel,
  mediaType,
  posterSrc,
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
