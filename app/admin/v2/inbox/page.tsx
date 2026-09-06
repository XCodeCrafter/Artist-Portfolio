import { redirect } from "next/navigation";
import {
  FaCheckCircle,
  FaEnvelope,
  FaExclamationTriangle,
} from "react-icons/fa";
import InquiryInbox from "@/components/admin/InquiryInbox";
import { requireAdmin } from "@/lib/admin/auth";
import { getContactDeliveryStatus } from "@/lib/admin/contact";
import {
  getAdminInquiryPagePath,
  getAdminInquiryStatusPath,
  normalizeAdminInquiryPage,
} from "@/lib/admin/inquiry-routes";
import { getBookingInquiries } from "@/lib/admin/inquiries";

export const metadata = { title: "Inbox | Admin V2" };
export const dynamic = "force-dynamic";

export default async function AdminV2InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const requestedPage = normalizeAdminInquiryPage(params.page);
  const inquiriesResult = await getBookingInquiries({ page: requestedPage });
  const inquiriesAvailable =
    inquiriesResult.isConfigured && !inquiriesResult.loadError;
  const lastAvailablePage = Math.max(
    1,
    inquiriesResult.pagination.totalPages
  );
  const canonicalPage = Math.min(requestedPage, lastAvailablePage);
  const pageParameterIsCanonical =
    params.page === undefined || params.page === String(canonicalPage);

  if (
    inquiriesAvailable &&
    (requestedPage > lastAvailablePage || !pageParameterIsCanonical)
  ) {
    redirect(
      params.status
        ? getAdminInquiryStatusPath("v2", params.status, {
            page: canonicalPage,
          })
        : getAdminInquiryPagePath("v2", canonicalPage)
    );
  }

  const delivery = getContactDeliveryStatus(inquiriesResult.isConfigured);

  return (
    <div className="grid min-w-0 gap-4">
      <header className="relative min-w-0 overflow-hidden rounded-[26px] border border-white/9 bg-[radial-gradient(circle_at_88%_8%,rgba(255,59,31,0.18),transparent_34%),#0d0d0f] p-5 shadow-[0_22px_80px_rgba(0,0,0,0.34)] sm:p-6 lg:p-7">
        <div className="relative flex flex-col gap-6 2xl:flex-row 2xl:items-end 2xl:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/34">
                Admin V2 · Messages
              </span>
              <span className="h-1 w-1 rounded-full bg-[#ff3b1f]" />
              <span
                className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                  inquiriesAvailable
                    ? "text-emerald-200/65"
                    : "text-amber-200/70"
                }`}
              >
                {inquiriesAvailable ? (
                  <FaCheckCircle />
                ) : (
                  <FaExclamationTriangle />
                )}
                {inquiriesAvailable ? "Inbox connected" : "Inbox unavailable"}
              </span>
            </div>
            <h1 className="heading-ui mt-3 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
              Inbox
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/48">
              Handle collaboration and booking messages in one place. Read,
              reply, leave private notes, and archive finished conversations;
              analytics now stays where analytics belongs.
            </p>
          </div>

          <div className="min-w-0 rounded-2xl border border-white/9 bg-black/24 p-4 2xl:w-[280px]">
            <FaEnvelope className="text-[#ff664f]" />
            <p className="mt-3 text-lg font-semibold text-white">
              {inquiriesAvailable
                ? `${inquiriesResult.summary.new} new message${
                    inquiriesResult.summary.new === 1 ? "" : "s"
                  }`
                : "Messages are not being inferred"}
            </p>
            <p className="mt-1 text-[10px] leading-4 text-white/38">
              {delivery.emailConfigured
                ? "Email notification settings are present. Check each message badge for its actual delivery state."
                : "Email notifications are not configured yet; stored Inbox messages remain available."}
            </p>
          </div>
        </div>
      </header>

      <InquiryInbox
        delivery={delivery}
        inquiries={inquiriesResult.inquiries}
        inquiriesAvailable={inquiriesAvailable}
        inquiriesConfigured={inquiriesResult.isConfigured}
        inquiriesError={inquiriesResult.loadError}
        inquiryPagination={inquiriesResult.pagination}
        inquirySummary={inquiriesResult.summary}
        key={`inbox-${requestedPage}-${params.status || "idle"}`}
        status={params.status}
      />
    </div>
  );
}
