import ContactEditor from "@/components/admin/v2/ContactEditor";
import { requireAdmin } from "@/lib/admin/auth";
import { getAdminContactEditorData } from "@/lib/admin/contact";
import { getMediaAssets } from "@/lib/admin/media";

export const metadata = { title: "Contact page · Admin V2" };
export const dynamic = "force-dynamic";

export default async function AdminV2ContactPage() {
  await requireAdmin();
  const [contact, media] = await Promise.all([
    getAdminContactEditorData(),
    getMediaAssets(),
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
          Contact page
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/46">
          Edit the same Hero and contact area visitors see, then check where a
          submitted inquiry is configured to go. The preview form is safely
          disabled; it cannot create test messages while you edit.
        </p>
      </header>

      <ContactEditor
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
