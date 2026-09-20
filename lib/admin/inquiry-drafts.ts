import type { BookingInquiry, InquiryStatus } from "@/lib/admin/inquiries";

export type InquiryFormDraft = {
  expectedUpdatedAt: string;
  initialStatus: InquiryStatus;
  initialAdminNotes: string;
  status: InquiryStatus;
  adminNotes: string;
};

export type PendingInquiryDraft = InquiryFormDraft & { id: string };

const statuses: InquiryStatus[] = ["new", "read", "replied", "archived"];

export function isInquiryDraftDiscardRequested(form: Pick<HTMLFormElement, "dataset">) {
  return form.dataset.inquiryDiscardRequested === "true";
}

export function discardInquiryFormDraft(form: Pick<HTMLFormElement, "dataset" | "reset">) {
  form.dataset.inquiryDiscardRequested = "true";
  try {
    form.reset();
  } finally {
    delete form.dataset.inquiryDiscardRequested;
  }
}

export function createInquiryFormDraft(inquiry: Pick<BookingInquiry, "updatedAt" | "status" | "adminNotes">): InquiryFormDraft {
  return {
    expectedUpdatedAt: inquiry.updatedAt || "",
    initialStatus: inquiry.status,
    initialAdminNotes: inquiry.adminNotes,
    status: inquiry.status,
    adminNotes: inquiry.adminNotes,
  };
}

export function parsePendingInquiryDraft(value: unknown): PendingInquiryDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const draft = value as Partial<PendingInquiryDraft>;
  if (
    typeof draft.id !== "string" || !draft.id ||
    typeof draft.expectedUpdatedAt !== "string" ||
    draft.expectedUpdatedAt.length > 64 ||
    !/^\d{4}-\d{2}-\d{2}T/.test(draft.expectedUpdatedAt) ||
    !Number.isFinite(Date.parse(draft.expectedUpdatedAt)) ||
    typeof draft.adminNotes !== "string" || draft.adminNotes.length > 4000 ||
    typeof draft.initialAdminNotes !== "string" || draft.initialAdminNotes.length > 4000 ||
    !statuses.includes(draft.status as InquiryStatus) ||
    !statuses.includes(draft.initialStatus as InquiryStatus)
  ) return null;
  return draft as PendingInquiryDraft;
}

export function pendingInquiryMatchesSaved(draft: PendingInquiryDraft, inquiry: Pick<BookingInquiry, "id" | "updatedAt" | "status" | "adminNotes">) {
  return draft.id === inquiry.id &&
    Boolean(inquiry.updatedAt) && draft.expectedUpdatedAt !== inquiry.updatedAt &&
    draft.status === inquiry.status && draft.adminNotes.trim() === inquiry.adminNotes;
}
