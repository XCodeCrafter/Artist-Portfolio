import Link from "next/link";
import {
  FaArrowRight,
  FaChartLine,
  FaCheckCircle,
  FaEnvelope,
  FaExclamationTriangle,
  FaExternalLinkAlt,
  FaEye,
  FaHome,
  FaImages,
  FaInbox,
  FaListUl,
  FaMusic,
  FaPalette,
  FaShieldAlt,
  FaUserAlt,
  FaVideo,
} from "react-icons/fa";
import DashboardDestinationFinder from "@/components/admin/v2/DashboardDestinationFinder";
import {
  getAdminV2OverviewData,
  type AdminV2OverviewIssue,
  type AdminV2PageEditorState,
  type AdminV2PageSummary,
} from "@/lib/admin/v2-overview";

export const metadata = { title: "Admin V2" };
export const dynamic = "force-dynamic";

function pageIcon(key: AdminV2PageSummary["key"]) {
  switch (key) {
    case "home":
      return <FaHome />;
    case "bio":
      return <FaUserAlt />;
    case "gallery":
      return <FaImages />;
    case "showreel":
      return <FaVideo />;
    case "music":
      return <FaMusic />;
    case "contact":
      return <FaEnvelope />;
  }
}

const EDITOR_STATE_LABELS: Record<AdminV2PageEditorState, string> = {
  ready: "Editor ready",
  "setup-required": "Setup required",
  unavailable: "Unavailable",
  classic: "Classic editor",
};

const EDITOR_STATE_CLASSES: Record<AdminV2PageEditorState, string> = {
  ready: "border-emerald-300/14 bg-emerald-400/[0.055] text-emerald-100/64",
  "setup-required":
    "border-amber-300/16 bg-amber-400/[0.06] text-amber-100/70",
  unavailable: "border-red-300/16 bg-red-400/[0.06] text-red-100/70",
  classic: "border-white/9 bg-white/[0.035] text-white/40",
};

function AttentionRow({ issue }: { issue: AdminV2OverviewIssue }) {
  const toneClass =
    issue.tone === "error"
      ? "border-red-300/18 bg-red-400/[0.055] text-red-100/74"
      : issue.tone === "warning"
        ? "border-amber-300/18 bg-amber-400/[0.055] text-amber-100/74"
        : "border-blue-200/14 bg-blue-400/[0.045] text-blue-100/66";

  return (
    <Link
      className={`group flex min-h-[72px] items-center gap-3 rounded-2xl border px-3.5 py-3 outline-none transition hover:brightness-125 focus-visible:ring-2 focus-visible:ring-white/70 sm:px-4 ${toneClass}`}
      href={issue.href}
    >
      <FaExclamationTriangle className="shrink-0 text-sm" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{issue.title}</span>
        <span className="mt-1 block text-[11px] leading-5 opacity-65">
          {issue.detail}
        </span>
      </span>
      <FaArrowRight className="shrink-0 text-[11px] opacity-40 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
    </Link>
  );
}

function PageRow({ page }: { page: AdminV2PageSummary }) {
  const navbarLabel =
    page.navbarState === "shown"
      ? "In navbar"
      : page.navbarState === "hidden"
        ? "Hidden from navbar"
        : "Navbar unknown";

  return (
    <article className="flex min-w-0 flex-col gap-4 rounded-[22px] border border-white/9 bg-[#101012]/92 p-4 transition hover:border-white/14 sm:flex-row sm:items-center">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/9 bg-white/[0.045] text-sm text-white/50">
        {pageIcon(page.key)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-white">{page.label}</h3>
          <span
            className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.11em] ${EDITOR_STATE_CLASSES[page.editorState]}`}
          >
            {EDITOR_STATE_LABELS[page.editorState]}
          </span>
          <span className="rounded-full border border-white/8 bg-black/18 px-2 py-0.5 text-[9px] text-white/34">
            {navbarLabel}
          </span>
        </div>
        <p className="mt-1.5 truncate text-[11px] text-white/34">
          {page.description}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link
          aria-label={`Preview ${page.label} page`}
          className="grid h-10 w-10 place-items-center rounded-xl border border-white/9 text-[11px] text-white/38 outline-none transition hover:border-white/18 hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-white/60"
          href={page.publicHref}
          target="_blank"
        >
          <FaExternalLinkAlt />
        </Link>
        <Link
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-3.5 text-xs font-semibold text-black outline-none transition hover:bg-[#ff6047] hover:text-white focus-visible:ring-2 focus-visible:ring-white/70"
          href={page.editorHref}
        >
          Edit
          <FaArrowRight className="text-[9px]" />
        </Link>
      </div>
    </article>
  );
}

export default async function AdminV2OverviewPage() {
  const overview = await getAdminV2OverviewData();
  const newMessages = overview.newInquiryCount;
  const hasNewMessages = typeof newMessages === "number" && newMessages > 0;
  const hasNextActions = hasNewMessages || overview.issues.length > 0;
  const nextActionCount =
    (hasNewMessages ? 1 : 0) + overview.issues.length;

  return (
    <div className="grid min-w-0 gap-4">
      <header className="relative overflow-hidden rounded-[26px] border border-white/9 bg-[radial-gradient(circle_at_88%_8%,rgba(255,59,31,0.16),transparent_34%),#0d0d0f] p-5 shadow-[0_22px_80px_rgba(0,0,0,0.34)] sm:p-6 lg:p-7">
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/34">
                Portfolio admin V2
              </span>
              <span className="h-1 w-1 rounded-full bg-[#ff3b1f]" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-200/58">
                Protected workspace
              </span>
            </div>
            <h1 className="heading-ui mt-3 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
              Portfolio control room
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/46">
              Start with the next useful action, or find the exact thing you
              recognize from the public site. Reports and technical detail stay
              available without getting in the way of editing.
            </p>
          </div>
          <Link
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.045] px-4 text-xs font-semibold text-white/62 outline-none transition hover:bg-white hover:text-black focus-visible:ring-2 focus-visible:ring-white/70"
            href="/"
            target="_blank"
          >
            <FaEye /> View live site <FaExternalLinkAlt className="text-[9px]" />
          </Link>
        </div>
      </header>

      <section
        aria-labelledby="dashboard-next-actions"
        className="rounded-[26px] border border-white/9 bg-[#0f0f11]/92 p-4 shadow-[0_20px_70px_rgba(0,0,0,0.26)] sm:p-5"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/30">
              Start here
            </p>
            <h2
              className="heading-ui mt-2 text-xl font-semibold text-white"
              id="dashboard-next-actions"
            >
              {hasNextActions ? "Your next actions" : "Everything is ready"}
            </h2>
          </div>
          {hasNextActions ? (
            <span className="rounded-full border border-white/9 bg-black/20 px-3 py-1.5 text-[10px] tabular-nums text-white/40">
              {nextActionCount} {nextActionCount === 1 ? "item" : "items"}
            </span>
          ) : null}
        </div>

        {hasNextActions ? (
          <div className="mt-4 grid gap-2">
            {hasNewMessages ? (
              <Link
                className="group flex min-h-[76px] items-center gap-3 rounded-2xl border border-[#ff674f]/22 bg-[#ff3b1f]/8 px-3.5 py-3 text-[#ff9a89] outline-none transition hover:border-[#ff674f]/38 hover:bg-[#ff3b1f]/12 focus-visible:ring-2 focus-visible:ring-white/70 sm:px-4"
                href="/admin/v2/inbox#messages"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#ff3b1f] text-sm text-white shadow-[0_8px_24px_rgba(255,59,31,0.2)]">
                  <FaInbox />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-white">
                    {newMessages} new message{newMessages === 1 ? "" : "s"}
                  </span>
                  <span className="mt-1 block text-[11px] text-white/38">
                    Open Inbox and decide what needs a reply.
                  </span>
                </span>
                <FaArrowRight className="shrink-0 text-[11px] transition group-hover:translate-x-0.5" />
              </Link>
            ) : null}
            {overview.issues.map((issue) => (
              <AttentionRow issue={issue} key={issue.id} />
            ))}
          </div>
        ) : (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-emerald-300/13 bg-emerald-400/[0.045] px-4 py-3 text-emerald-100/62">
            <FaCheckCircle className="mt-0.5 shrink-0" />
            <p className="text-xs leading-5">
              No editor setup or new Inbox message needs your attention. Pick
              a page below whenever you want to make a change.
            </p>
          </div>
        )}
      </section>

      <DashboardDestinationFinder newInquiryCount={newMessages} />

      <section aria-labelledby="dashboard-quick-actions">
        <div className="mb-3 px-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/28">
            Shortcuts
          </p>
          <h2
            className="heading-ui mt-1.5 text-xl font-semibold text-white"
            id="dashboard-quick-actions"
          >
            Quick actions
          </h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
          <Link
            className="group rounded-[22px] border border-white/9 bg-[#101012] p-4 outline-none transition hover:border-[#ff674f]/28 hover:bg-[#121214] focus-visible:ring-2 focus-visible:ring-white/70"
            href="/admin/v2/inbox"
          >
            <div className="flex items-start justify-between gap-3">
              <FaInbox className="text-[#ff7059]" />
              <span className="text-[10px] tabular-nums text-white/30">
                {newMessages === null ? "Unavailable" : `${newMessages} new`}
              </span>
            </div>
            <p className="mt-5 text-sm font-semibold text-white">Open Inbox</p>
            <p className="mt-1 text-[11px] text-white/34">Read and reply</p>
          </Link>
          <Link
            className="group rounded-[22px] border border-white/9 bg-[#101012] p-4 outline-none transition hover:border-[#ff674f]/28 hover:bg-[#121214] focus-visible:ring-2 focus-visible:ring-white/70"
            href="/admin/v2/navigation"
          >
            <div className="flex items-start justify-between gap-3">
              <FaListUl className="text-[#ff7059]" />
              <span className="text-[10px] tabular-nums text-white/30">
                {overview.navigation.selectedCount === null
                  ? "Unavailable"
                  : `${overview.navigation.selectedCount}/${overview.navigation.pageCount}`}
              </span>
            </div>
            <p className="mt-5 text-sm font-semibold text-white">Edit navbar</p>
            <p className="mt-1 text-[11px] text-white/34">
              Order and visibility
            </p>
          </Link>
          <Link
            className="group rounded-[22px] border border-white/9 bg-[#101012] p-4 outline-none transition hover:border-[#ff674f]/28 hover:bg-[#121214] focus-visible:ring-2 focus-visible:ring-white/70"
            href="/admin/content#home"
          >
            <div className="flex items-start justify-between gap-3">
              <FaHome className="text-white/52" />
              <span className="rounded-full border border-white/8 px-2 py-0.5 text-[9px] uppercase tracking-[0.1em] text-white/32">
                Classic
              </span>
            </div>
            <p className="mt-5 text-sm font-semibold text-white">Edit Home</p>
            <p className="mt-1 text-[11px] text-white/34">Current editor</p>
          </Link>
          <Link
            className="group rounded-[22px] border border-white/9 bg-[#101012] p-4 outline-none transition hover:border-[#ff674f]/28 hover:bg-[#121214] focus-visible:ring-2 focus-visible:ring-white/70"
            href="/admin/v2/pages/showreel"
          >
            <div className="flex items-start justify-between gap-3">
              <FaVideo className="text-white/52" />
              <FaArrowRight className="text-[10px] text-white/22 transition group-hover:translate-x-0.5 group-hover:text-white/60" />
            </div>
            <p className="mt-5 text-sm font-semibold text-white">Edit Showreel</p>
            <p className="mt-1 text-[11px] text-white/34">Clips and scenes</p>
          </Link>
        </div>
      </section>

      <section
        aria-labelledby="dashboard-pages"
        className="rounded-[26px] border border-white/9 bg-[#0d0d0f]/88 p-4 shadow-[0_20px_70px_rgba(0,0,0,0.24)] sm:p-5"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/28">
              One familiar page at a time
            </p>
            <h2
              className="heading-ui mt-1.5 text-xl font-semibold text-white"
              id="dashboard-pages"
            >
              Portfolio pages
            </h2>
            <p className="mt-2 text-xs leading-5 text-white/34">
              Editor readiness and navbar visibility are separate. Hiding a
              page from the menu never deletes its content.
            </p>
          </div>
          <Link
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/9 px-3.5 text-xs font-semibold text-white/52 outline-none transition hover:bg-white hover:text-black focus-visible:ring-2 focus-visible:ring-white/70"
            href="/admin/v2/navigation"
          >
            <FaListUl />{" "}
            {overview.navigation.visibleCount === null
              ? "Visibility unavailable"
              : `${overview.navigation.visibleCount} visible now`}
          </Link>
        </div>
        <div className="mt-4 grid gap-2 xl:grid-cols-2">
          {overview.pages.map((page) => (
            <PageRow key={page.key} page={page} />
          ))}
        </div>
      </section>

      <section className="grid gap-3 xl:grid-cols-2" aria-label="Reports and settings">
        <Link
          className="group rounded-[26px] border border-white/9 bg-[radial-gradient(circle_at_92%_12%,rgba(76,121,255,0.13),transparent_36%),#0f0f11] p-5 outline-none transition hover:border-white/18 focus-visible:ring-2 focus-visible:ring-white/70"
          href="/admin/v2/insights"
        >
          <div className="flex items-start justify-between gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl border border-blue-200/14 bg-blue-400/8 text-blue-100/70">
              <FaChartLine />
            </span>
            <FaArrowRight className="mt-3 text-white/22 transition group-hover:translate-x-0.5 group-hover:text-white/65" />
          </div>
          <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-100/48">
            Secondary workspace
          </p>
          <h2 className="heading-ui mt-2 text-xl font-semibold text-white">
            Insights
          </h2>
          <p className="mt-2 text-xs leading-5 text-white/36">
            Popular pages, visitors, interactions, recent activity, and data
            health—kept separate from everyday editing.
          </p>
        </Link>

        <div className="rounded-[26px] border border-white/9 bg-[radial-gradient(circle_at_92%_12%,rgba(255,59,31,0.12),transparent_36%),#0f0f11] p-5">
          <div className="flex items-start justify-between gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl border border-[#ff674f]/18 bg-[#ff3b1f]/9 text-[#ff806c]">
              <FaShieldAlt />
            </span>
            <Link
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/9 px-3 text-[11px] font-semibold text-white/48 outline-none transition hover:bg-white hover:text-black focus-visible:ring-2 focus-visible:ring-white/70"
              href="/admin/v2/settings"
            >
              All settings <FaArrowRight className="text-[9px]" />
            </Link>
          </div>
          <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/30">
            Site-wide
          </p>
          <h2 className="heading-ui mt-2 text-xl font-semibold text-white">
            Settings
          </h2>
          <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
            <Link
              className="rounded-full border border-white/8 bg-black/18 px-3 py-2 text-white/44 transition hover:text-white"
              href="/admin/content#settings"
            >
              <FaPalette className="mr-1.5 inline" /> Brand
            </Link>
            <Link
              className="rounded-full border border-white/8 bg-black/18 px-3 py-2 text-white/44 transition hover:text-white"
              href="/admin/v2/security#access"
            >
              Admin access
            </Link>
            <Link
              className="rounded-full border border-white/8 bg-black/18 px-3 py-2 text-white/44 transition hover:text-white"
              href="/admin/v2/security#overview"
            >
              Security
            </Link>
            <Link
              className="rounded-full border border-white/8 bg-black/18 px-3 py-2 text-white/44 transition hover:text-white"
              href="/admin/v2/security#configuration"
            >
              Technical health
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
