import type { Metadata } from "next";
import { getPortfolioContent } from "@/lib/content";
import { createPageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const content = await getPortfolioContent();

  return createPageMetadata(content, "privacy");
}

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
          contact messages submitted through the inquiry form.
        </p>
        <p>
          Form submissions may include your name, email address, message, your
          selected Music, Acting, or General inquiry area, a
          pseudonymous security identifier derived from your IP address, and
          submission time. The raw IP address is not stored by the application.
          This data is used for spam prevention, rate limiting, and replying to
          your inquiry.
        </p>
        <p>
          The site may use privacy-conscious analytics to understand page views
          and link clicks. No payment information is collected on this website.
        </p>
        <p>
          To request deletion of a submitted message, contact the email address
          configured for this website.
        </p>
      </div>
    </main>
  );
}
