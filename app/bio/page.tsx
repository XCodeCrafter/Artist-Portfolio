// artist-portfolio/app/bio/page.tsx
import HeroCinematic from "@/components/HeroCinematic";
import NewsletterBlock from "@/components/NewsletterBlock";
import BioScrollGallery from "@/components/BioScrollGallery";

export default function BioPage() {
  return (
    <>
      <HeroCinematic
        title="BIOGRAPHY"
        subtitle="BIO"
        ctaLabel="READ"
        ctaHref="#bio"
        backgroundSrc="/images/bio-hero.jpg"
      />

      <div id="bio">
        <BioScrollGallery
          images={[
            { src: "/images/bio.jpg", alt: "Portrait 01" },
            { src: "/images/music.jpg", alt: "Portrait 02" },
            { src: "/images/music-1.jpg", alt: "Portrait 03" },
            { src: "/images/music-2.jpg", alt: "Portrait 04" },
          ]}
          topLabel=""
          introText=""
          caption="New York • Producer • DJ"
        >
         <p data-reveal="up" data-reveal-delay="140">
  I create music that moves between shadow and glow — hypnotic rhythm,
  melodic tension, and textures that feel both intimate and massive.
  The sound is built to pull you in, not just to make noise. It’s not
  about volume. It’s about gravity.
</p>

<p data-reveal="up" data-reveal-delay="200">
  Every track begins as a mood — sometimes fragile, sometimes raw.
  I collect fragments: field recordings, half-finished melodies,
  late-night synth accidents, conversations overheard in strange cities.
  They slowly start speaking to each other. What remains is never random.
</p>

<p data-reveal="up" data-reveal-delay="260">
  My influences are intentionally messy: deeper electronic roots,
  emotional alternative edges, ambient spaces, and cultural fragments
  that show up when you least expect them. The result is always driven
  by narrative — even on a loud dancefloor.
</p>

<p data-reveal="up" data-reveal-delay="320">
  Whether it’s an intimate room or a big stage, the set is shaped like
  a story arc: slow tension, release, a little danger, and a clean
  landing. (Or… a dramatic landing. Depends on the night.)
  I’m obsessed with pacing — how long can you hold a moment before
  it breaks into something bigger?
</p>

<p data-reveal="up" data-reveal-delay="380">
  Over the years, the focus has stayed consistent: emotion, pace,
  atmosphere. I’m not here to fill silence — I’m here to build a world
  for a few minutes where people can actually feel something.
  A world that feels cinematic, but still human.
</p>

<p data-reveal="up" data-reveal-delay="440">
  Production has become more minimal, but more precise. Fewer layers,
  more intention. I’m interested in tension you can almost touch —
  the quiet before a drop, the air between two chords, the breath
  before impact.
</p>

<p data-reveal="up" data-reveal-delay="500">
  Traveling shaped the sound in unexpected ways. Berlin gave it depth.
  New York gave it urgency. Small rooms taught restraint. Big stages
  taught scale. Each city leaves a fingerprint.
</p>

<p data-reveal="up" data-reveal-delay="560">
  I don’t separate studio work from live performance. They feed each
  other constantly. A mistake in a live set can become the core of a
  future release. A studio experiment can redefine the energy of a
  night.
</p>

<p data-reveal="up" data-reveal-delay="620">
  Right now the focus is on pushing production forward — more releases,
  collaborations, and live moments that feel like a short film you can
  dance to. Something immersive. Something that lingers after the
  lights come back on.
</p>

<p data-reveal="up" data-reveal-delay="680">
  At the center of it all is one simple intention: create spaces where
  people feel suspended — just slightly outside of time. Not escaping
  reality. Just experiencing it differently.
</p>

          {/* klidně přidej dalších 20 odstavců — gallery bude dál měnit fotky */}
        </BioScrollGallery>
      </div>

      <NewsletterBlock />
    </>
  );
}