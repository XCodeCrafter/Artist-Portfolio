import {
  createAdminServiceClient,
  hasAdminServiceEnv,
} from "@/lib/admin/service";
import { normalizePortfolioType } from "@/lib/content/profile";
import type { PortfolioType } from "@/lib/content";

export type InquiryStatus = "new" | "read" | "replied" | "archived";
export type InquiryType = "booking" | "collaboration";

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
  createdAt: string;
  updatedAt: string;
};

export type InquirySummary = {
  total: number;
  new: number;
  read: number;
  replied: number;
  archived: number;
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
  created_at: string;
  updated_at: string;
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function summarize(inquiries: BookingInquiry[]): InquirySummary {
  return inquiries.reduce<InquirySummary>(
    (summary, inquiry) => ({
      ...summary,
      total: summary.total + 1,
      [inquiry.status]: summary[inquiry.status] + 1,
    }),
    {
      total: 0,
      new: 0,
      read: 0,
      replied: 0,
      archived: 0,
    }
  );
}

export async function getBookingInquiries(): Promise<{
  inquiries: BookingInquiry[];
  summary: InquirySummary;
  isConfigured: boolean;
  loadError?: string;
}> {
  if (!hasAdminServiceEnv()) {
    return {
      inquiries: [],
      summary: summarize([]),
      isConfigured: false,
    };
  }

  const supabase = createAdminServiceClient();
  if (!supabase) {
    return {
      inquiries: [],
      summary: summarize([]),
      isConfigured: false,
    };
  }

  const { data, error } = await supabase
    .from("booking_inquiries")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<BookingInquiryRow[]>();

  if (error) {
    return {
      inquiries: [],
      summary: summarize([]),
      isConfigured: true,
      loadError: "Unable to load contact inquiries from Supabase.",
    };
  }

  const inquiries = (data || []).map(mapInquiry);

  return {
    inquiries,
    summary: summarize(inquiries),
    isConfigured: true,
  };
}
