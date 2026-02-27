//artist-portfolio\app\booking\page.tsx
import HeroCinematic from "@/components/HeroCinematic";
import PageHero from "@/components/PageHero";
import BookingForm from "@/components/BookingForm";

export default function BookingPage() {
  return (
    <>
      <HeroCinematic
        title="BOOKING"
        subtitle="CONTACT"
        ctaLabel="WRITE"
        ctaHref="#booking"
        backgroundSrc="/images/booking-hero.jpg"
      />

      <div id="booking">
        <PageHero
          title="BOOKING"
          text="Kontakty + rychlý formulář. Jednoduché, čisté, funkční. Další krok: napojíme odesílání na backend (API route) a přidáme spam ochranu."
          ctaLabel="SEND A MESSAGE"
          ctaHref="#form"
          imageSrc="/images/booking.jpg"
          imageAlt="Booking image"
        />
      </div>

      <div id="form">
        <BookingForm />
      </div>
    </>
  );
}
