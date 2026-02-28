//artist-portfolio\app\page.tsx
import HeroCinematic from "@/components/HeroCinematic";
import LatestUpdates from "@/components/LatestUpdates";
import AboutHome from "@/components/AboutHome";
import MusicPlatforms from "@/components/MusicPlatforms";
import NewsletterBlock from "@/components/NewsletterBlock";

export default function HomePage() {
  return (
    <>
      <HeroCinematic
        title="FRANKY FUGAZI"
        subtitle="MUSIC • PHOTOS • ILLUSTRATION"
        ctaLabel=""
        ctaHref="#home-about"
        backgroundSrc="/images/hero.jpg"
      />

      <LatestUpdates />
      <AboutHome />

      <MusicPlatforms />

      <NewsletterBlock />
    </>
  );
}
