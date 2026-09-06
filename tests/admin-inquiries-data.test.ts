import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBookingInquiries } from "@/lib/admin/inquiries";

const serviceMocks = vi.hoisted(() => ({
  hasAdminServiceEnv: vi.fn(() => true),
  createAdminServiceClient: vi.fn<() => unknown>(),
}));

vi.mock("@/lib/admin/service", () => ({
  hasAdminServiceEnv: serviceMocks.hasAdminServiceEnv,
  createAdminServiceClient: serviceMocks.createAdminServiceClient,
}));

const row = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Ava Artist",
  email: "ava@example.com",
  message: "I would like to discuss a role.",
  portfolio_type: "actor",
  inquiry_type: "collaboration",
  inquiry_intent: "acting",
  status: "new" as const,
  admin_notes: "",
  email_status: "delivered",
  email_status_changed_at: "2026-09-06T12:30:00.000Z",
  created_at: "2026-09-06T12:00:00.000Z",
};

function rowSource(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn(() => ({
      order: vi.fn(() => ({
        range: vi.fn(() => ({
          returns: vi.fn(async () => result),
        })),
      })),
    })),
  };
}

function createReadClient(
  options: {
    fallbackError?: boolean;
    rowsError?: "generic" | "optional-column" | "optional-column-cache";
  } = {}
) {
  const rowsResult = {
    data: options.rowsError ? null : [row],
    error:
      options.rowsError === "generic"
        ? { code: "08006", message: "read failed" }
        : options.rowsError === "optional-column"
          ? { code: "42703", message: "column inquiry_intent does not exist" }
          : options.rowsError === "optional-column-cache"
            ? {
                code: "PGRST204",
                message: "Could not find the email_status column",
              }
          : null,
  };
  const counts = [41, 7, 8, 9, 17, 4, 3];
  const primaryRows = rowSource(rowsResult);
  const fallbackRows = rowSource({
    data: options.fallbackError
      ? null
      : [
          {
            id: row.id,
            name: row.name,
            email: row.email,
            message: row.message,
            portfolio_type: row.portfolio_type,
            inquiry_type: row.inquiry_type,
            status: row.status,
            admin_notes: row.admin_notes,
            created_at: row.created_at,
          },
        ],
    error: options.fallbackError
      ? { code: "08006", message: "fallback read failed" }
      : null,
  });
  const countSources = [
    { select: vi.fn(async () => ({ count: counts[0], error: null })) },
    ...counts.slice(1, 5).map((count) => ({
      select: vi.fn(() => ({
        eq: vi.fn(async () => ({ count, error: null })),
      })),
    })),
    {
      select: vi.fn(() => ({
        gte: vi.fn(async () => ({ count: counts[5], error: null })),
      })),
    },
    {
      select: vi.fn(() => ({
        gte: vi.fn(() => ({
          lt: vi.fn(async () => ({ count: counts[6], error: null })),
        })),
      })),
    },
  ];
  let call = 0;
  const from = vi.fn(() => {
    call += 1;
    if (call === 1) return primaryRows;
    if (
      call === 9 &&
      (options.rowsError === "optional-column" ||
        options.rowsError === "optional-column-cache")
    ) {
      return fallbackRows;
    }
    return countSources.shift();
  });
  return {
    client: { from },
    fallbackSelect: fallbackRows.select,
    firstSelect: primaryRows.select,
    from,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  serviceMocks.hasAdminServiceEnv.mockReturnValue(true);
});

describe("admin inquiry data", () => {
  it("distinguishes missing service configuration from an empty Inbox", async () => {
    serviceMocks.hasAdminServiceEnv.mockReturnValue(false);

    const result = await getBookingInquiries({ page: 3 });

    expect(result.isConfigured).toBe(false);
    expect(result.loadError).toBeUndefined();
    expect(result.inquiries).toEqual([]);
    expect(result.pagination).toMatchObject({ page: 3, totalPages: 0 });
    expect(serviceMocks.createAdminServiceClient).not.toHaveBeenCalled();
  });

  it("loads exact totals while selecting only fields rendered by the Inbox", async () => {
    const service = createReadClient();
    serviceMocks.createAdminServiceClient.mockReturnValue(service.client);

    const result = await getBookingInquiries({ page: 2, pageSize: 25 });

    expect(service.firstSelect).toHaveBeenCalledWith(
      "id,name,email,message,portfolio_type,inquiry_type,inquiry_intent,status,admin_notes,email_status,email_status_changed_at,created_at"
    );
    expect(result.isConfigured).toBe(true);
    expect(result.loadError).toBeUndefined();
    expect(result.summary).toEqual({
      total: 41,
      new: 7,
      read: 8,
      replied: 9,
      archived: 17,
      current7Days: 4,
      previous7Days: 3,
    });
    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 25,
      totalPages: 2,
      from: 26,
      to: 26,
    });
    expect(result.inquiries).toEqual([
      {
        id: row.id,
        name: row.name,
        email: row.email,
        message: row.message,
        portfolioType: "actor",
        inquiryType: "collaboration",
        inquiryIntent: "acting",
        status: "new",
        adminNotes: "",
        emailStatus: "delivered",
        emailStatusChangedAt: row.email_status_changed_at,
        createdAt: row.created_at,
      },
    ]);
    expect(service.from).toHaveBeenCalledTimes(8);
  });

  it("returns unavailable data instead of fabricated zeroes after a query error", async () => {
    const service = createReadClient({ rowsError: "generic" });
    serviceMocks.createAdminServiceClient.mockReturnValue(service.client);

    const result = await getBookingInquiries();

    expect(result.isConfigured).toBe(true);
    expect(result.loadError).toBe(
      "Unable to load exact contact inquiry totals from Supabase."
    );
    expect(result.inquiries).toEqual([]);
    expect(result.summary.total).toBe(0);
  });

  it("falls back to privacy-safe legacy columns when optional migrations are missing", async () => {
    const service = createReadClient({ rowsError: "optional-column" });
    serviceMocks.createAdminServiceClient.mockReturnValue(service.client);

    const result = await getBookingInquiries();

    expect(service.fallbackSelect).toHaveBeenCalledWith(
      "id,name,email,message,portfolio_type,inquiry_type,status,admin_notes,created_at"
    );
    expect(service.from).toHaveBeenCalledTimes(9);
    expect(result.loadError).toBeUndefined();
    expect(result.inquiries[0]).toMatchObject({
      inquiryIntent: null,
      emailStatus: "unknown",
      emailStatusChangedAt: "",
    });
  });

  it("recognizes a PostgREST schema-cache error for another optional column", async () => {
    const service = createReadClient({ rowsError: "optional-column-cache" });
    serviceMocks.createAdminServiceClient.mockReturnValue(service.client);

    const result = await getBookingInquiries();

    expect(service.fallbackSelect).toHaveBeenCalledTimes(1);
    expect(result.loadError).toBeUndefined();
    expect(result.inquiries[0]?.emailStatus).toBe("unknown");
  });

  it("fails closed when the privacy-safe legacy fallback also fails", async () => {
    const service = createReadClient({
      fallbackError: true,
      rowsError: "optional-column",
    });
    serviceMocks.createAdminServiceClient.mockReturnValue(service.client);

    const result = await getBookingInquiries();

    expect(result.inquiries).toEqual([]);
    expect(result.loadError).toBe(
      "Unable to load exact contact inquiry totals from Supabase."
    );
  });

  it("caps hostile page values before creating a database range", async () => {
    const service = createReadClient();
    serviceMocks.createAdminServiceClient.mockReturnValue(service.client);

    const result = await getBookingInquiries({ page: Number.MAX_SAFE_INTEGER });

    expect(result.pagination.page).toBe(10_000);
  });
});
