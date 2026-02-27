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
        ctaHref="#booking"
        backgroundSrc="/images/booking-hero.jpg"
      />

    
      <div id="form">
        <BookingForm />
      </div>
    </>
  );
}
