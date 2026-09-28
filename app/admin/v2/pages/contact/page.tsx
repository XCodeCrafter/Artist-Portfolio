import ContactEditor from "@/components/admin/v2/ContactEditor";
import { requireAdmin } from "@/lib/admin/auth";
import { getAdminContactEditorData } from "@/lib/admin/contact";
import { getMediaAssets } from "@/lib/admin/media";
import { getContactCopyCapability } from "@/lib/admin/contact-copy";
import Link from "next/link";
import { LIVE_CONTACT_PAGE_LABEL } from "@/lib/content/live-contact";

export const metadata = { title: `${LIVE_CONTACT_PAGE_LABEL} · Admin V2` };
export const dynamic = "force-dynamic";

export default async function AdminV2ContactPage() {
  await requireAdmin();
  const [contact, media, optionalCopy] = await Promise.all([
    getAdminContactEditorData(),
    getMediaAssets(),
    getContactCopyCapability(),
  ]);

  return (
    <div className="grid gap-4">
      <header className="rounded-[26px] border border-white/9 bg-[#0d0d0f]/88 p-5 shadow-[0_22px_80px_rgba(0,0,0,0.34)] backdrop-blur-2xl sm:p-6 lg:p-7">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/34">
            Admin V2
          </span>
          <span className="h-1 w-1 rounded-full bg-[#ff3b1f]" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200/55">
            Visual page editor
          </span>
        </div>
        <h1 className="heading-ui mt-3 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
          {LIVE_CONTACT_PAGE_LABEL}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/46">
          One public page for live dates and getting in touch. Edit its Hero and
          contact form here; manage the calendar in Events. The preview form is
          safely disabled and cannot create messages while you edit.
        </p>
        <Link className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-white/15 px-4 text-sm text-white hover:bg-white/10" href="/admin/v2/pages/events">
          Manage this page’s calendar → Events
        </Link>
      </header>

      <ContactEditor
        optionalCopy={optionalCopy}
        assets={media.assets}
        delivery={contact.delivery}
        disabled={
          !contact.isConfigured ||
          contact.migrationRequired ||
          Boolean(contact.loadError)
        }
        loadError={contact.loadError}
        mediaLoadError={media.loadError}
        migrationRequired={contact.migrationRequired}
        snapshot={contact.snapshot}
      />
    </div>
  );
}
