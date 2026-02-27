//artist-portfolio\app\booking\page.tsx
import HeroCinematic from "@/components/HeroCinematic";
import BookingForm from "@/components/BookingForm";

export default function BookingPage() {
  return (
    <>
      <HeroCinematic
        title="BOOKING"
        subtitle="CONTACT"
        ctaLabel="WRITE"
        ctaHref="#form"
        backgroundSrc="/images/booking-hero.jpg"
      />

    
    <section
        id="form"
        className="py-24 md:py-32 scroll-mt-24"
      >
        <BookingForm />
      </section>
    </>
  );
}
