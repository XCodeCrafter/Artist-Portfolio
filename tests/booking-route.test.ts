import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  consumeDatabaseRateLimit: vi.fn<(input: unknown) => Promise<unknown>>(),
  createAdminServiceClient: vi.fn<() => unknown>(() => null),
  keyedDigest: vi.fn<(context: string, value: string) => string>(),
  resendSend: vi.fn<(input: unknown) => Promise<unknown>>(),
  writeAuditLog: vi.fn(async () => ({ ok: true as const })),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  consumeDatabaseRateLimit: routeMocks.consumeDatabaseRateLimit,
}));

vi.mock("@/lib/admin/service", () => ({
  createAdminServiceClient: routeMocks.createAdminServiceClient,
}));

vi.mock("@/lib/admin/security-secret", () => ({
  keyedDigest: routeMocks.keyedDigest,
}));

vi.mock("@/lib/admin/audit", () => ({
  writeAuditLog: routeMocks.writeAuditLog,
}));

vi.mock("resend", () => ({
  Resend: class MockResend {
    emails = { send: routeMocks.resendSend };
  },
}));

import { POST as postBooking } from "../app/api/booking/route";

type DatabaseResult = {
  data: unknown;
  error: { code?: string; message: string } | null;
};

function resultChain(result: DatabaseResult) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(async () => result);
  return chain;
}

function createServiceFixture(
  inquiryResult: DatabaseResult = {
    data: { id: "3ce818fd-4b49-45c4-8c0f-c1c3f030ca24" },
    error: null,
  }
) {
  const siteChain = resultChain({
    data: { portfolio_type: "actor" },
    error: null,
  });
  const inquiryInsertChain = resultChain(inquiryResult);
  const inquiryUpdateChain = resultChain({
    data: { id: "3ce818fd-4b49-45c4-8c0f-c1c3f030ca24" },
    error: null,
  });
  const inquiryInsert = vi.fn(() => inquiryInsertChain);
  const inquiryUpdate = vi.fn(() => inquiryUpdateChain);
  const analyticsInsert = vi.fn(async () => ({ data: null, error: null }));
  const from = vi.fn((table: string) => {
    if (table === "site_settings") return siteChain;
    if (table === "booking_inquiries") {
      return { insert: inquiryInsert, update: inquiryUpdate };
    }
    if (table === "analytics_events") return { insert: analyticsInsert };
    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    analyticsInsert,
    client: { from },
    from,
    inquiryInsert,
    inquiryUpdate,
  };
}

function allowedRateLimit() {
  return {
    allowed: true,
    configured: true,
    firstDenied: false,
    limit: 30,
    remaining: 29,
    retryAfterSeconds: 60,
  };
}

function bookingRequest(
  overrides: Record<string, unknown> = {},
  headers: Record<string, string> = {}
) {
  return new Request("https://portfolio.example/api/booking", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://portfolio.example",
      "user-agent": "Mozilla/5.0 ContactFormTest",
      ...headers,
    },
    body: JSON.stringify({
      name: "Ada Lovelace",
      email: "ada@example.com",
      message: "I would like to discuss an acting project.",
      company: "",
      website: "",
      inquiryIntent: "acting",
      startedAt: Date.now() - 5_000,
      ...overrides,
    }),
  });
}

function configureEmail() {
  vi.stubEnv("RESEND_API_KEY", "resend-test-key");
  vi.stubEnv("BOOKING_TO_EMAIL", "artist@example.com");
  vi.stubEnv("BOOKING_FROM_EMAIL", "portfolio@example.com");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("SITE_URL", "https://portfolio.example");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://portfolio.example");
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("BOOKING_TO_EMAIL", "");
  vi.stubEnv("BOOKING_FROM_EMAIL", "");
  routeMocks.keyedDigest.mockReturnValue("a".repeat(64));
  routeMocks.consumeDatabaseRateLimit.mockResolvedValue(allowedRateLimit());
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/booking", () => {
  it("accepts an inbox-persisted inquiry when email is not configured", async () => {
    const service = createServiceFixture();
    routeMocks.createAdminServiceClient.mockReturnValue(service.client);

    const response = await postBooking(bookingRequest());
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body).toMatchObject({ ok: true });
    expect(body.message).toContain("saved in the inbox");
    expect(service.inquiryInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "ada@example.com",
        inquiry_intent: "acting",
        inquiry_type: "collaboration",
        portfolio_type: "actor",
      })
    );
    expect(service.inquiryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ email_status: "failed" })
    );
    expect(service.analyticsInsert).toHaveBeenCalledWith(
      expect.objectContaining({ event_name: "booking_submit" })
    );
    expect(routeMocks.resendSend).not.toHaveBeenCalled();
  });

  it("returns accepted when the inbox save succeeds but Resend throws", async () => {
    configureEmail();
    const service = createServiceFixture();
    routeMocks.createAdminServiceClient.mockReturnValue(service.client);
    routeMocks.resendSend.mockRejectedValue(new Error("network unavailable"));

    const response = await postBooking(bookingRequest());
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body).toMatchObject({ ok: true });
    expect(body.message).toContain("saved in the inbox");
    expect(service.analyticsInsert).toHaveBeenCalledWith(
      expect.objectContaining({ event_name: "booking_submit" })
    );
    expect(routeMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "booking_email_failed",
        metadata: expect.objectContaining({ reason: "provider-request-failed" }),
      })
    );
  });

  it("returns accepted when the inbox save succeeds but Resend rejects", async () => {
    configureEmail();
    const service = createServiceFixture();
    routeMocks.createAdminServiceClient.mockReturnValue(service.client);
    routeMocks.resendSend.mockResolvedValue({
      data: null,
      error: { message: "sender is not verified" },
    });

    const response = await postBooking(bookingRequest());

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ ok: true });
    expect(service.analyticsInsert).toHaveBeenCalledTimes(1);
    expect(routeMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "booking_email_failed",
        metadata: expect.objectContaining({ reason: "provider-rejected" }),
      })
    );
  });

  it("does not turn an accepted inquiry into a retry when analytics fails", async () => {
    configureEmail();
    const service = createServiceFixture();
    routeMocks.createAdminServiceClient.mockReturnValue(service.client);
    routeMocks.resendSend.mockRejectedValue(new Error("network unavailable"));
    service.analyticsInsert.mockRejectedValue(new Error("analytics unavailable"));

    const response = await postBooking(bookingRequest());

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ ok: true });
    expect(service.inquiryInsert).toHaveBeenCalledTimes(1);
  });

  it("returns an error when neither persistence nor email succeeds", async () => {
    configureEmail();
    const service = createServiceFixture({
      data: null,
      error: { code: "XX000", message: "database unavailable" },
    });
    routeMocks.createAdminServiceClient.mockReturnValue(service.client);
    routeMocks.resendSend.mockRejectedValue(new Error("network unavailable"));

    const response = await postBooking(bookingRequest());
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toMatchObject({ ok: false });
    expect(service.analyticsInsert).not.toHaveBeenCalled();
    expect(routeMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "booking_inquiry_persistence_failed" })
    );
  });

  it("sends email, tracks it, and records analytics on full success", async () => {
    configureEmail();
    const service = createServiceFixture();
    routeMocks.createAdminServiceClient.mockReturnValue(service.client);
    routeMocks.resendSend.mockResolvedValue({
      data: { id: "resend-email-id" },
      error: null,
    });

    const response = await postBooking(bookingRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true });
    expect(routeMocks.resendSend).toHaveBeenCalledWith(
      expect.objectContaining({
        replyTo: "ada@example.com",
        subject: "New acting inquiry - Ada Lovelace",
      })
    );
    expect(service.inquiryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        email_status: "sent",
        resend_email_id: "resend-email-id",
      })
    );
    expect(service.analyticsInsert).toHaveBeenCalledTimes(1);
  });

  it("rejects a cross-origin request before reading or persisting it", async () => {
    const service = createServiceFixture();
    routeMocks.createAdminServiceClient.mockReturnValue(service.client);

    const response = await postBooking(
      bookingRequest({}, { origin: "https://attacker.example" })
    );

    expect(response.status).toBe(403);
    expect(service.from).not.toHaveBeenCalled();
    expect(routeMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "security_contact_bad_origin" })
    );
  });

  it("silently accepts honeypot submissions without storing or sending them", async () => {
    configureEmail();
    const service = createServiceFixture();
    routeMocks.createAdminServiceClient.mockReturnValue(service.client);

    const response = await postBooking(
      bookingRequest({ website: "https://spam.example" })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
    expect(service.inquiryInsert).not.toHaveBeenCalled();
    expect(routeMocks.resendSend).not.toHaveBeenCalled();
    expect(routeMocks.consumeDatabaseRateLimit).toHaveBeenCalledTimes(1);
    expect(routeMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "security_contact_honeypot" })
    );
  });

  it("returns 429 when the admission rate limit is exhausted", async () => {
    routeMocks.consumeDatabaseRateLimit.mockResolvedValueOnce({
      allowed: false,
      configured: true,
      firstDenied: true,
      limit: 30,
      remaining: 0,
      retryAfterSeconds: 42,
    });

    const response = await postBooking(bookingRequest());

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("42");
    expect(routeMocks.createAdminServiceClient).not.toHaveBeenCalled();
    expect(routeMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "security_contact_rate_limited" })
    );
  });
});
