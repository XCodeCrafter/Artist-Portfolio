import {
  createAdminServiceClient,
  hasAdminServiceEnv,
} from "@/lib/admin/service";
import { normalizePortfolioType } from "@/lib/content/profile";
import type { PortfolioType } from "@/lib/content";

export type InquiryStatus = "new" | "read" | "replied" | "archived";
export type InquiryType = "booking" | "collaboration";
export type InquiryEmailStatus =
  | "unknown"
  | "pending"
  | "sent"
  | "delivered"
  | "delayed"
  | "bounced"
  | "complained"
  | "failed"
  | "suppressed";

export type BookingInquiry = {
  id: string;
  name: string;
  email: string;
  message: string;
  portfolioType: PortfolioType;
  inquiryType: InquiryType;
  status: InquiryStatus;
  sourceIp: string;
  userAgent: string;
  adminNotes: string;
  resendEmailId: string;
  emailStatus: InquiryEmailStatus;
  emailStatusChangedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type InquirySummary = {
  total: number;
  new: number;
  read: number;
  replied: number;
  archived: number;
  current7Days: number;
  previous7Days: number;
};

export type InquiryPagination = {
  page: number;
  pageSize: number;
  totalPages: number;
  from: number;
  to: number;
};

type BookingInquiryRow = {
  id: string;
  name: string;
  email: string;
  message: string;
  portfolio_type?: string | null;
  inquiry_type?: string | null;
  status: InquiryStatus;
  source_ip: string | null;
  user_agent: string | null;
  admin_notes: string;
  resend_email_id?: string | null;
  email_status?: string | null;
  email_status_changed_at?: string | null;
  created_at: string;
  updated_at: string;
};

const EMPTY_SUMMARY: InquirySummary = {
  total: 0,
  new: 0,
  read: 0,
  replied: 0,
  archived: 0,
  current7Days: 0,
  previous7Days: 0,
};

function mapInquiry(row: BookingInquiryRow): BookingInquiry {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    message: row.message,
    portfolioType: normalizePortfolioType(row.portfolio_type),
    inquiryType:
      row.inquiry_type === "collaboration" ? "collaboration" : "booking",
    status: row.status,
    sourceIp: row.source_ip || "",
    userAgent: row.user_agent || "",
    adminNotes: row.admin_notes,
    resendEmailId: row.resend_email_id || "",
    emailStatus: isInquiryEmailStatus(row.email_status)
      ? row.email_status
      : "unknown",
    emailStatusChangedAt: row.email_status_changed_at || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isInquiryEmailStatus(value: unknown): value is InquiryEmailStatus {
  return [
    "unknown",
    "pending",
    "sent",
    "delivered",
    "delayed",
    "bounced",
    "complained",
    "failed",
    "suppressed",
  ].includes(String(value));
}

function emptyPagination(page: number, pageSize: number): InquiryPagination {
  return { page, pageSize, totalPages: 0, from: 0, to: 0 };
}

export async function getBookingInquiries(
  options: { page?: number; pageSize?: number } = {}
): Promise<{
  inquiries: BookingInquiry[];
  summary: InquirySummary;
  pagination: InquiryPagination;
  isConfigured: boolean;
  loadError?: string;
}> {
  const page = Math.max(1, Math.floor(options.page || 1));
  const pageSize = Math.min(50, Math.max(10, Math.floor(options.pageSize || 25)));

  if (!hasAdminServiceEnv()) {
    return {
      inquiries: [],
      summary: { ...EMPTY_SUMMARY },
      pagination: emptyPagination(page, pageSize),
      isConfigured: false,
    };
  }

  const supabase = createAdminServiceClient();
  if (!supabase) {
    return {
      inquiries: [],
      summary: { ...EMPTY_SUMMARY },
      pagination: emptyPagination(page, pageSize),
      isConfigured: false,
    };
  }

  const now = new Date();
  const currentStart = new Date(now);
  currentStart.setUTCDate(currentStart.getUTCDate() - 7);
  const previousStart = new Date(now);
  previousStart.setUTCDate(previousStart.getUTCDate() - 14);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const countStatus = (status: InquiryStatus) =>
    supabase
      .from("booking_inquiries")
      .select("id", { count: "exact", head: true })
      .eq("status", status);

  const [
    rowsResult,
    totalResult,
    newResult,
    readResult,
    repliedResult,
    archivedResult,
    currentResult,
    previousResult,
  ] = await Promise.all([
    supabase
      .from("booking_inquiries")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, to)
      .returns<BookingInquiryRow[]>(),
    supabase
      .from("booking_inquiries")
      .select("id", { count: "exact", head: true }),
    countStatus("new"),
    countStatus("read"),
    countStatus("replied"),
    countStatus("archived"),
    supabase
      .from("booking_inquiries")
      .select("id", { count: "exact", head: true })
      .gte("created_at", currentStart.toISOString()),
    supabase
      .from("booking_inquiries")
      .select("id", { count: "exact", head: true })
      .gte("created_at", previousStart.toISOString())
      .lt("created_at", currentStart.toISOString()),
  ]);

  const results = [
    rowsResult,
    totalResult,
    newResult,
    readResult,
    repliedResult,
    archivedResult,
    currentResult,
    previousResult,
  ];
  if (results.some((result) => result.error)) {
    return {
      inquiries: [],
      summary: { ...EMPTY_SUMMARY },
      pagination: emptyPagination(page, pageSize),
      isConfigured: true,
      loadError: "Unable to load exact contact inquiry totals from Supabase.",
    };
  }

  const total = totalResult.count || 0;
  const inquiries = (rowsResult.data || []).map(mapInquiry);

  return {
    inquiries,
    summary: {
      total,
      new: newResult.count || 0,
      read: readResult.count || 0,
      replied: repliedResult.count || 0,
      archived: archivedResult.count || 0,
      current7Days: currentResult.count || 0,
      previous7Days: previousResult.count || 0,
    },
    pagination: {
      page,
      pageSize,
      totalPages: total ? Math.ceil(total / pageSize) : 0,
      from: inquiries.length ? from + 1 : 0,
      to: inquiries.length ? from + inquiries.length : 0,
    },
    isConfigured: true,
  };
}
