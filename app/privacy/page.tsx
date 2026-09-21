import type { Metadata } from "next";
import Link from "next/link";
import { getPortfolioContent } from "@/lib/content";
import { createPageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const content = await getPortfolioContent();

  return createPageMetadata(content, "privacy");
}

export default async function PrivacyPage() {
  const { settings } = await getPortfolioContent();
  return (
    <main className="mx-auto max-w-[900px] px-5 sm:px-8 pb-24 pt-36">
      <p className="text-xs uppercase tracking-[0.3em] text-[#ff866e]">Backstage / The privacy notes</p>
      <h1 className="mt-4 text-5xl font-semibold tracking-tight sm:text-7xl">
        Your visit.<br /><span className="text-[#ff866e]">Your choices.</span>
      </h1>

      <p className="mt-7 max-w-xl text-base leading-7 text-white/65">This notice explains how the portfolio of {settings.artistName} handles visits, optional players and contact messages. Use the Privacy choices button at any time to change your preferences.</p>
      <div className="mt-12 space-y-10 text-sm leading-7 text-white/70 sm:text-base [&_h2]:mb-3 [&_h2]:font-ui [&_h2]:text-xl [&_h2]:text-white [&_a]:text-[#ffc0ae] [&_a]:underline [&_a]:underline-offset-4">
        <section>
          <h2>01 — Essential website delivery</h2>
          <p>The website and its infrastructure providers process technical connection information, including IP addresses, to deliver pages, images and videos and keep the site secure. The portfolio uses Vercel for hosting, Supabase for application data and media, and ImageKit where configured for media delivery. Google Fonts serves the selected typefaces. These requests are separate from optional audience analytics.</p>
          <p className="mt-3">The first-party cookie <code>portfolio_privacy_v1</code> remembers your analytics and external-player choices and the time you made them for 180 days. It contains no visitor identifier. Administrator sign-in uses separate authentication cookies; those are not audience analytics cookies.</p>
        </section>
        <section>
          <h2>02 — Optional audience insights</h2>
          <p>Only after you enable Audience insights do we collect page paths, broad traffic sources and supported campaign-source categories, device/browser categories, and actions such as opening a gallery image or a reel, following a platform link or submitting a contact enquiry. Analytics does not include the content of your messages, URL query strings or a full browsing history. This portfolio does not use these events to create advertising profiles.</p>
          <p className="mt-3">A random identifier in your browser tab’s session storage (<code>portfolio.analytics.session.v1</code>) groups activity into visits. It expires after 30 minutes of inactivity and is removed from this tab when analytics is turned off. Visits are not a count of uniquely identified people. Our collection endpoint also uses technical request information for abuse protection; pseudonymous analytics is not the same as completely anonymous data.</p>
          <p className="mt-3">Raw analytics has a configured 180-day retention target. Automated cleanup depends on the site’s maintenance scheduler being enabled and monitored; the owner is responsible for verifying that it runs. Turning analytics off stops future collection and clears the local session identifier. It does not itself delete previously recorded server-side events. Contact the portfolio owner for an access or deletion request.</p>
        </section>
        <section>
          <h2>03 — Optional external players</h2>
          <p>Spotify, SoundCloud, YouTube and Vimeo players are not loaded until you allow External players. When loaded, those services receive connection information, such as your IP address and browser information, and may store or access cookies or associate activity with an account you have with them. Their processing is governed by their own policies:</p>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            <li><a href="https://www.spotify.com/legal/privacy-policy/" rel="noreferrer" target="_blank">Spotify privacy policy</a></li>
            <li><a href="https://soundcloud.com/pages/privacy" rel="noreferrer" target="_blank">SoundCloud privacy policy</a></li>
            <li><a href="https://policies.google.com/privacy" rel="noreferrer" target="_blank">Google / YouTube privacy policy</a></li>
            <li><a href="https://vimeo.com/privacy" rel="noreferrer" target="_blank">Vimeo privacy policy</a></li>
          </ul>
          <p className="mt-3">Turning this choice off unloads embedded players. We cannot erase cookies already set on another provider’s domain; manage them in your browser or provider account. Our hosted video previews and images still work without optional consent. Ordinary external links open another website only when you follow them.</p>
        </section>
        <section>
          <h2>04 — Contact and booking messages</h2>
          <p>When you send an enquiry, we process your name, email address, message, chosen enquiry area and submission time to respond and manage the conversation. Spam protection also uses a pseudonymous security identifier derived from your IP address; the application does not store the raw IP address in the enquiry. Infrastructure providers may separately process technical request logs.</p>
          <p className="mt-3">Enquiries are stored in the owner’s private inbox. When email notifications are configured, the notification service also processes information needed to deliver them. Contact submission works even if you reject all optional categories. Messages may be kept while the conversation is active; the maintenance policy targets deletion of archived enquiries after 365 days when scheduled cleanup runs.</p>
        </section>
        <section>
          <h2>05 — Your controls and requests</h2>
          <p>Use Privacy choices to accept, reject or select individual optional purposes at any time. Closing the panel without saving does not grant consent. You can also clear this site’s data in your browser. If preferences cannot be stored, optional features stay off.</p>
          <p className="mt-3">For questions, access, correction or deletion requests, <Link href="/booking">contact the portfolio owner</Link> and describe the information concerned. The owner may need enough information to locate an enquiry and verify your request. Rights and the appropriate supervisory authority depend on the applicable data-protection law.</p>
        </section>
      </div>
    </main>
  );
}
