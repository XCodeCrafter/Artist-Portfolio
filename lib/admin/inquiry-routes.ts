export const ADMIN_INQUIRY_SURFACE_PATHS = {
  classic: "/admin/analytics",
  v2: "/admin/v2/inbox",
} as const;

export type AdminInquirySurface = keyof typeof ADMIN_INQUIRY_SURFACE_PATHS;

export const MAX_ADMIN_INQUIRY_PAGE = 10_000;

const ALLOWED_ANALYTICS_RANGES = new Set([7, 30, 90, 180]);

export type AdminInquiryNavigationContext = {
  page?: number;
  rangeDays?: number;
};

function parseAdminInteger(value: unknown) {
  if (typeof value === "number") return value;
  const text = String(value ?? "").trim();
  return /^\d+$/.test(text) ? Number(text) : Number.NaN;
}

export function normalizeAdminInquiryPage(value: unknown) {
  const parsed = parseAdminInteger(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(MAX_ADMIN_INQUIRY_PAGE, Math.max(1, Math.floor(parsed)));
}

export function normalizeAdminInquiryRange(value: unknown) {
  const parsed = parseAdminInteger(value);
  return ALLOWED_ANALYTICS_RANGES.has(parsed) ? parsed : 30;
}

export function getAdminInquiryPath(surface: AdminInquirySurface) {
  return ADMIN_INQUIRY_SURFACE_PATHS[surface];
}

export function getAdminInquiryStatusPath(
  surface: AdminInquirySurface,
  status: string,
  context: AdminInquiryNavigationContext = {}
) {
  const params = new URLSearchParams({ status });
  if (context.page !== undefined) {
    params.set(
      surface === "classic" ? "inquiryPage" : "page",
      String(normalizeAdminInquiryPage(context.page))
    );
  }
  if (surface === "classic" && context.rangeDays !== undefined) {
    params.set("range", String(normalizeAdminInquiryRange(context.rangeDays)));
  }
  const hash = surface === "classic" ? "inquiries" : "messages";
  return `${getAdminInquiryPath(surface)}?${params.toString()}#${hash}`;
}

export function getAdminInquiryPagePath(
  surface: AdminInquirySurface,
  page: number,
  rangeDays = 30
) {
  const normalizedPage = normalizeAdminInquiryPage(page);
  const params =
    surface === "classic"
      ? new URLSearchParams({
          range: String(normalizeAdminInquiryRange(rangeDays)),
          inquiryPage: String(normalizedPage),
        })
      : new URLSearchParams({ page: String(normalizedPage) });
  const hash = surface === "classic" ? "inquiries" : "messages";
  return `${getAdminInquiryPath(surface)}?${params.toString()}#${hash}`;
}
