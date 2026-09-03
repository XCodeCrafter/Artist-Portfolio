import Link from "next/link";
import {
  FaArrowRight,
  FaCheckCircle,
  FaExclamationTriangle,
  FaEye,
  FaEnvelope,
  FaImages,
  FaListUl,
  FaMusic,
  FaUserAlt,
  FaVideo,
} from "react-icons/fa";
import { getAdminBioEditorData } from "@/lib/admin/bio";
import { getAdminContactEditorData } from "@/lib/admin/contact";
import { getAdminGalleryEditorData } from "@/lib/admin/gallery";
import { getAdminNavigationData } from "@/lib/admin/navigation";
import { getAdminShowreelEditorData } from "@/lib/admin/showreel";
import {
  createNavigationEditorModel,
  toPreviewNavigationItems,
} from "@/lib/admin/navigation-editor";
import { getVisiblePublicPageNavigationItems } from "@/lib/content/navigation";

export const metadata = { title: "Admin V2" };
export const dynamic = "force-dynamic";

export default async function AdminV2OverviewPage() {
  const [data, bio, gallery, showreel, contact] = await Promise.all([
    getAdminNavigationData(),
    getAdminBioEditorData(),
    getAdminGalleryEditorData(),
    getAdminShowreelEditorData(),
    getAdminContactEditorData(),
  ]);
  const model = createNavigationEditorModel(data.navigation);
  const selectedCount = model.items.filter(
    (item) =>
      item.itemType === "known" && item.kind === "page" && item.isVisible
  ).length;
  const pageCount = model.items.filter(
    (item) => item.itemType === "known" && item.kind === "page"
  ).length;
  const visibleCount = getVisiblePublicPageNavigationItems(
    toPreviewNavigationItems(model.items),
    data.availability
  ).length;
  const needsAttention =
    !data.isConfigured ||
    data.migrationRequired ||
    Boolean(data.loadError) ||
    data.configVersion === "unsupported" ||
    model.blockingIssues.length > 0 ||
    !bio.isConfigured ||
    bio.migrationRequired ||
    Boolean(bio.loadError) ||
    !gallery.isConfigured ||
    gallery.migrationRequired ||
    Boolean(gallery.loadError) ||
    !showreel.isConfigured ||
    showreel.migrationRequired ||
    Boolean(showreel.loadError) ||
    !contact.isConfigured ||
    contact.migrationRequired ||
    Boolean(contact.loadError) ||
    !contact.delivery.emailConfigured ||
    !contact.delivery.webhookConfigured;

  return (
    <div className="grid gap-4">
      <header className="rounded-[26px] border border-white/9 bg-[#0d0d0f]/88 p-5 shadow-[0_22px_80px_rgba(0,0,0,0.34)] backdrop-blur-2xl sm:p-6 lg:p-7">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/34">
            Portfolio admin V2
          </span>
          <span className="h-1 w-1 rounded-full bg-[#ff3b1f]" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200/55">
            Protected
          </span>
        </div>
        <h1 className="heading-ui mt-3 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
          What do you want to change?
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/46">
          Choose a focused workspace instead of hunting through one giant form.
          Each editor mirrors the part of the portfolio you already know. The
          original admin stays available while the new pages are completed.
        </p>
      </header>

      <section className="grid gap-4 xl:grid-cols-2">
        <Link
          className="group relative overflow-hidden rounded-[26px] border border-[#ff5a42]/24 bg-[radial-gradient(circle_at_85%_15%,rgba(255,59,31,0.24),transparent_40%),#111113] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.34)] outline-none transition hover:border-[#ff725d]/44 focus-visible:ring-2 focus-visible:ring-white/70 sm:p-7"
          href="/admin/v2/navigation"
        >
          <div className="flex items-start justify-between gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#ff3b1f] text-white shadow-[0_14px_38px_rgba(255,59,31,0.28)]">
              <FaListUl />
            </span>
            <FaArrowRight className="mt-3 text-white/30 transition group-hover:translate-x-1 group-hover:text-white" />
          </div>
          <p className="mt-8 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#ff715b]">
            Navigation and shortcuts
          </p>
          <h2 className="heading-ui mt-2 text-2xl font-semibold text-white sm:text-3xl">
            Manage navbar
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-white/44">
            Choose and order the main portfolio pages, then manage the music
            platform shortcuts shown on the right side of the desktop header.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/9 bg-black/22 px-3 py-2 text-[10px] text-white/58">
              <FaEye /> {selectedCount} selected
            </span>
            <span className="rounded-full border border-white/9 bg-black/22 px-3 py-2 text-[10px] text-white/58">
              {visibleCount} visible now
            </span>
            <span className="rounded-full border border-white/9 bg-black/22 px-3 py-2 text-[10px] text-white/58">
              {pageCount} available pages
            </span>
          </div>
        </Link>

        <Link
          className="group relative overflow-hidden rounded-[26px] border border-white/10 bg-[radial-gradient(circle_at_78%_10%,rgba(255,104,76,0.18),transparent_42%),#111113] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.34)] outline-none transition hover:border-white/24 focus-visible:ring-2 focus-visible:ring-white/70 sm:p-7"
          href="/admin/v2/pages/bio"
        >
          <div className="flex items-start justify-between gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-2xl border border-white/12 bg-white/[0.09] text-white shadow-[0_14px_38px_rgba(0,0,0,0.28)]">
              <FaUserAlt />
            </span>
            <FaArrowRight className="mt-3 text-white/30 transition group-hover:translate-x-1 group-hover:text-white" />
          </div>
          <p className="mt-8 text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-200/70">
            Edit the real page
          </p>
          <h2 className="heading-ui mt-2 text-2xl font-semibold text-white sm:text-3xl">
            Edit Bio page
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-white/44">
            Edit the hero, biography, portraits, resume, and acting credits in
            one familiar view instead of searching across separate forms.
          </p>
          <div className="mt-6 flex flex-wrap gap-2 text-[10px] text-white/58">
            <span className="rounded-full border border-white/9 bg-black/22 px-3 py-2">
              Live page preview
            </span>
            <span className="rounded-full border border-white/9 bg-black/22 px-3 py-2">
              Desktop and mobile
            </span>
            <span className="rounded-full border border-white/9 bg-black/22 px-3 py-2">
              4 clear sections
            </span>
          </div>
        </Link>

        <Link
          className="group relative overflow-hidden rounded-[26px] border border-white/10 bg-[radial-gradient(circle_at_78%_10%,rgba(76,121,255,0.18),transparent_42%),#111113] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.34)] outline-none transition hover:border-white/24 focus-visible:ring-2 focus-visible:ring-white/70 sm:p-7"
          href="/admin/v2/pages/gallery"
        >
          <div className="flex items-start justify-between gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-2xl border border-white/12 bg-white/[0.09] text-white shadow-[0_14px_38px_rgba(0,0,0,0.28)]">
              <FaImages />
            </span>
            <FaArrowRight className="mt-3 text-white/30 transition group-hover:translate-x-1 group-hover:text-white" />
          </div>
          <p className="mt-8 text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-200/70">
            Edit the real page
          </p>
          <h2 className="heading-ui mt-2 text-2xl font-semibold text-white sm:text-3xl">
            Edit Gallery page
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-white/44">
            Shape the opening, introduction, and image sequence in the same
            layout visitors see. Hidden frames stay ready to restore.
          </p>
          <div className="mt-6 flex flex-wrap gap-2 text-[10px] text-white/58">
            <span className="rounded-full border border-white/9 bg-black/22 px-3 py-2">
              Live page preview
            </span>
            <span className="rounded-full border border-white/9 bg-black/22 px-3 py-2">
              Recoverable frames
            </span>
            <span className="rounded-full border border-white/9 bg-black/22 px-3 py-2">
              3 clear sections
            </span>
          </div>
        </Link>

        <Link
          className="group relative overflow-hidden rounded-[26px] border border-white/10 bg-[radial-gradient(circle_at_78%_10%,rgba(255,59,31,0.19),transparent_42%),#111113] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.34)] outline-none transition hover:border-white/24 focus-visible:ring-2 focus-visible:ring-white/70 sm:p-7"
          href="/admin/v2/pages/showreel"
        >
          <div className="flex items-start justify-between gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-2xl border border-white/12 bg-white/[0.09] text-white shadow-[0_14px_38px_rgba(0,0,0,0.28)]">
              <FaVideo />
            </span>
            <FaArrowRight className="mt-3 text-white/30 transition group-hover:translate-x-1 group-hover:text-white" />
          </div>
          <p className="mt-8 text-[10px] font-semibold uppercase tracking-[0.2em] text-red-200/70">
            Edit the real page
          </p>
          <h2 className="heading-ui mt-2 text-2xl font-semibold text-white sm:text-3xl">
            Edit Showreel page
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-white/44">
            Arrange showreels, scenes, and music videos in one visual library.
            Hidden clips remain recoverable and the first shown item gets the
            largest card.
          </p>
          <div className="mt-6 flex flex-wrap gap-2 text-[10px] text-white/58">
            <span className="rounded-full border border-white/9 bg-black/22 px-3 py-2">
              Live page preview
            </span>
            <span className="rounded-full border border-white/9 bg-black/22 px-3 py-2">
              Music videos preserved
            </span>
            <span className="rounded-full border border-white/9 bg-black/22 px-3 py-2">
              3 clear sections
            </span>
          </div>
        </Link>

        <Link
          className="group relative overflow-hidden rounded-[26px] border border-white/10 bg-[radial-gradient(circle_at_78%_10%,rgba(76,121,255,0.18),transparent_42%),#111113] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.34)] outline-none transition hover:border-white/24 focus-visible:ring-2 focus-visible:ring-white/70 sm:p-7"
          href="/admin/v2/pages/music"
        >
          <div className="flex items-start justify-between gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-2xl border border-white/12 bg-white/[0.09] text-white shadow-[0_14px_38px_rgba(0,0,0,0.28)]">
              <FaMusic />
            </span>
            <FaArrowRight className="mt-3 text-white/30 transition group-hover:translate-x-1 group-hover:text-white" />
          </div>
          <p className="mt-8 text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-200/70">
            Edit the real page
          </p>
          <h2 className="heading-ui mt-2 text-2xl font-semibold text-white sm:text-3xl">
            Edit Music page
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-white/44">
            Select Hero, Platforms, Spotify, or SoundCloud directly in the real
            desktop or mobile page preview, then save only that section.
          </p>
          <div className="mt-6 flex flex-wrap gap-2 text-[10px] text-white/58">
            <span className="rounded-full border border-white/9 bg-black/22 px-3 py-2">
              Desktop preview
            </span>
            <span className="rounded-full border border-white/9 bg-black/22 px-3 py-2">
              Mobile preview
            </span>
            <span className="rounded-full border border-white/9 bg-black/22 px-3 py-2">
              4 editable sections
            </span>
          </div>
        </Link>

        <Link
          className="group relative overflow-hidden rounded-[26px] border border-white/10 bg-[radial-gradient(circle_at_78%_10%,rgba(255,112,86,0.18),transparent_42%),#111113] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.34)] outline-none transition hover:border-white/24 focus-visible:ring-2 focus-visible:ring-white/70 sm:p-7"
          href="/admin/v2/pages/contact"
        >
          <div className="flex items-start justify-between gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-2xl border border-white/12 bg-white/[0.09] text-white shadow-[0_14px_38px_rgba(0,0,0,0.28)]">
              <FaEnvelope />
            </span>
            <FaArrowRight className="mt-3 text-white/30 transition group-hover:translate-x-1 group-hover:text-white" />
          </div>
          <p className="mt-8 text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-200/70">
            Page and delivery
          </p>
          <h2 className="heading-ui mt-2 text-2xl font-semibold text-white sm:text-3xl">
            Edit Contact page
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-white/44">
            Edit the opening and contact details in the real page preview, then
            see whether inbox storage and email notifications are configured.
          </p>
          <div className="mt-6 flex flex-wrap gap-2 text-[10px] text-white/58">
            <span className="rounded-full border border-white/9 bg-black/22 px-3 py-2">
              Inert form preview
            </span>
            <span className="rounded-full border border-white/9 bg-black/22 px-3 py-2">
              Delivery context
            </span>
            <span className="rounded-full border border-white/9 bg-black/22 px-3 py-2">
              2 clear sections
            </span>
          </div>
        </Link>

        <aside className="rounded-[26px] border border-white/9 bg-[#0f0f11]/92 p-5 shadow-[0_20px_70px_rgba(0,0,0,0.26)] xl:col-span-2">
          <div className="flex items-start gap-3">
            {needsAttention ? (
              <FaExclamationTriangle className="mt-1 text-amber-300" />
            ) : (
              <FaCheckCircle className="mt-1 text-emerald-300" />
            )}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/34">
                Workspace status
              </p>
              <h2 className="mt-2 text-lg font-semibold text-white">
                {needsAttention ? "Setup needs attention" : "Ready to edit"}
              </h2>
            </div>
          </div>
          <div className="mt-5 grid gap-2 text-xs leading-5 text-white/44">
            <p className="rounded-xl border border-white/8 bg-black/20 px-3 py-2.5">
              V1 remains available for every existing editor.
            </p>
            <p className="rounded-xl border border-white/8 bg-black/20 px-3 py-2.5">
              Navbar changes never delete public content.
            </p>
            {data.migrationRequired ? (
              <p className="rounded-xl border border-amber-300/14 bg-amber-400/[0.055] px-3 py-2.5 text-amber-100/68">
                Migration 0027 is prepared but must be applied before saving.
              </p>
            ) : null}
            {data.loadError ? (
              <p className="rounded-xl border border-red-300/14 bg-red-400/[0.055] px-3 py-2.5 text-red-100/68">
                {data.loadError}
              </p>
            ) : null}
            {bio.migrationRequired ? (
              <p className="rounded-xl border border-amber-300/14 bg-amber-400/[0.055] px-3 py-2.5 text-amber-100/68">
                The Bio editor is ready for review. Migration 0030 is still
                required before it can publish.
              </p>
            ) : null}
            {bio.loadError ? (
              <p className="rounded-xl border border-red-300/14 bg-red-400/[0.055] px-3 py-2.5 text-red-100/68">
                {bio.loadError}
              </p>
            ) : null}
            {gallery.migrationRequired ? (
              <p className="rounded-xl border border-amber-300/14 bg-amber-400/[0.055] px-3 py-2.5 text-amber-100/68">
                The Gallery editor is ready for review. Migration 0031 is
                still required before it can publish.
              </p>
            ) : null}
            {gallery.loadError ? (
              <p className="rounded-xl border border-red-300/14 bg-red-400/[0.055] px-3 py-2.5 text-red-100/68">
                {gallery.loadError}
              </p>
            ) : null}
            {showreel.migrationRequired ? (
              <p className="rounded-xl border border-amber-300/14 bg-amber-400/[0.055] px-3 py-2.5 text-amber-100/68">
                The Showreel editor is ready for review. Migration 0032 is
                still required before it can publish.
              </p>
            ) : null}
            {showreel.loadError ? (
              <p className="rounded-xl border border-red-300/14 bg-red-400/[0.055] px-3 py-2.5 text-red-100/68">
                {showreel.loadError}
              </p>
            ) : null}
            {contact.migrationRequired ? (
              <p className="rounded-xl border border-amber-300/14 bg-amber-400/[0.055] px-3 py-2.5 text-amber-100/68">
                The Contact editor is ready for review. Migration 0033 is still
                required before it can publish.
              </p>
            ) : null}
            {contact.loadError ? (
              <p className="rounded-xl border border-red-300/14 bg-red-400/[0.055] px-3 py-2.5 text-red-100/68">
                {contact.loadError}
              </p>
            ) : null}
            {!contact.delivery.emailConfigured ? (
              <p className="rounded-xl border border-amber-300/14 bg-amber-400/[0.055] px-3 py-2.5 text-amber-100/68">
                Contact submissions can still be retained in the Inbox, but
                one or more Resend email settings are missing in this runtime.
              </p>
            ) : null}
            {!contact.delivery.webhookConfigured ? (
              <p className="rounded-xl border border-amber-300/14 bg-amber-400/[0.055] px-3 py-2.5 text-amber-100/68">
                Contact delivery monitoring is missing its Resend webhook
                secret, so sent email cannot be confirmed as delivered here.
              </p>
            ) : null}
          </div>
        </aside>
      </section>
    </div>
  );
}
