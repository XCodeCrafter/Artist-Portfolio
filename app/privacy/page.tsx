import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy",
  description: "Privacy information for this artist portfolio.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-[900px] px-5 sm:px-8 pb-24 pt-36">
      <p className="text-xs uppercase tracking-[0.35em] text-white/50">Legal</p>
      <h1 className="mt-4 text-5xl font-semibold tracking-tight sm:text-7xl">
        Privacy
      </h1>

      <div className="mt-10 space-y-6 text-sm leading-7 text-white/70 sm:text-base">
        <p>
          This portfolio collects only the information needed to respond to
          booking and inquiry messages submitted through the contact form.
        </p>
        <p>
          Form submissions may include your name, email address, message, IP
          address, and submission time. This data is used for spam prevention,
          rate limiting, and replying to your inquiry.
        </p>
        <p>
          The site may use privacy-conscious analytics to understand page views
          and link clicks. No payment information is collected on this website.
        </p>
        <p>
          To request deletion of a submitted message, contact the booking email
          configured for this website.
        </p>
      </div>
    </main>
  );
}
