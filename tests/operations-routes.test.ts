import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as getMaintenance } from "../app/api/cron/maintenance/route";
import { GET as getHealth } from "../app/api/health/route";
import { POST as postResendWebhook } from "../app/api/resend/webhook/route";

const routeMocks = vi.hoisted(() => ({
  createAdminServiceClient: vi.fn<() => unknown>(() => null),
  verifyWebhook: vi.fn(),
  writeAuditLog: vi.fn(async () => ({ ok: true as const })),
}));

vi.mock("@/lib/admin/service", () => ({
  createAdminServiceClient: routeMocks.createAdminServiceClient,
}));

vi.mock("@/lib/admin/audit", () => ({
  writeAuditLog: routeMocks.writeAuditLog,
}));

vi.mock("resend", () => ({
  Resend: class {
    webhooks = { verify: routeMocks.verifyWebhook };
  },
}));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  routeMocks.verifyWebhook.mockReset();
  routeMocks.createAdminServiceClient.mockReturnValue(null);
});

function webhookRequest(headers: Record<string, string> = {}) {
  return new Request("https://portfolio.example/api/resend/webhook", {
    method: "POST",
    headers: {
      "svix-id": "webhook-event-id",
      "svix-signature": "signed-value",
      "svix-timestamp": "1787652000",
      ...headers,
    },
    body: "{}",
  });
}

const deliveryEvent = {
  type: "email.delivered",
  created_at: "2026-08-25T10:00:00.000Z",
  data: {
    email_id: "provider-email-id",
    from: "portfolio@example.com",
    to: ["artist@example.com"],
    subject: "Private inquiry subject",
  },
};

function setDeliveryEventAge(ageMs: number) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(Date.parse(deliveryEvent.created_at) + ageMs));
}

describe("operations route guards", () => {
  it("keeps public health shallow and rejects an invalid deep-health token", async () => {
    vi.stubEnv("HEALTHCHECK_SECRET", "health-secret");

    const shallow = await getHealth(new Request("https://portfolio.example/api/health"));
    const unauthorized = await getHealth(
      new Request("https://portfolio.example/api/health", {
        headers: { authorization: "Bearer wrong-secret" },
      })
    );

    expect(shallow.status).toBe(200);
    expect(await shallow.json()).toMatchObject({ status: "ok", check: "liveness" });
    expect(unauthorized.status).toBe(401);
  });

  it("rejects maintenance requests without the exact cron token", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");

    const response = await getMaintenance(
      new Request("https://portfolio.example/api/cron/maintenance", {
        headers: { authorization: "Bearer wrong-secret" },
      })
    );

    expect(response.status).toBe(401);
  });

  it("fails closed when the webhook is unconfigured or oversized", async () => {
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "");
    const unconfigured = await postResendWebhook(
      new Request("https://portfolio.example/api/resend/webhook", {
        method: "POST",
        body: "{}",
      })
    );

    vi.stubEnv("RESEND_WEBHOOK_SECRET", "webhook-secret");
    const oversized = await postResendWebhook(
      new Request("https://portfolio.example/api/resend/webhook", {
        method: "POST",
        headers: { "content-length": String(70 * 1024) },
        body: "{}",
      })
    );

    expect(unconfigured.status).toBe(503);
    expect(oversized.status).toBe(413);
    expect(routeMocks.verifyWebhook).not.toHaveBeenCalled();
    expect(routeMocks.createAdminServiceClient).not.toHaveBeenCalled();
  });

  it.each(["svix-id", "svix-signature", "svix-timestamp"])(
    "rejects a webhook missing %s before verification or database access",
    async (header) => {
      vi.stubEnv("RESEND_WEBHOOK_SECRET", "webhook-secret");

      const response = await postResendWebhook(webhookRequest({ [header]: "" }));

      expect(response.status).toBe(400);
      expect(routeMocks.verifyWebhook).not.toHaveBeenCalled();
      expect(routeMocks.createAdminServiceClient).not.toHaveBeenCalled();
      expect(routeMocks.writeAuditLog).not.toHaveBeenCalled();
    }
  );

  it("rejects an invalid signature before database access", async () => {
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "webhook-secret");
    routeMocks.verifyWebhook.mockImplementation(() => {
      throw new Error("Invalid signature");
    });

    const response = await postResendWebhook(webhookRequest());

    expect(response.status).toBe(400);
    expect(routeMocks.verifyWebhook).toHaveBeenCalledWith({
      payload: "{}",
      headers: {
        id: "webhook-event-id",
        timestamp: "1787652000",
        signature: "signed-value",
      },
      webhookSecret: "webhook-secret",
    });
    expect(routeMocks.createAdminServiceClient).not.toHaveBeenCalled();
    expect(routeMocks.writeAuditLog).not.toHaveBeenCalled();
  });

  it.each([
    { ...deliveryEvent, type: "email.opened" },
    { ...deliveryEvent, data: {} },
  ])("acknowledges an ignored event without database access: %j", async (event) => {
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "webhook-secret");
    routeMocks.verifyWebhook.mockReturnValue(event);

    const response = await postResendWebhook(webhookRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(routeMocks.createAdminServiceClient).not.toHaveBeenCalled();
    expect(routeMocks.writeAuditLog).not.toHaveBeenCalled();
  });

  it("rejects an invalid event timestamp without database access", async () => {
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "webhook-secret");
    routeMocks.verifyWebhook.mockReturnValue({ ...deliveryEvent, created_at: "invalid" });

    const response = await postResendWebhook(webhookRequest());

    expect(response.status).toBe(400);
    expect(routeMocks.createAdminServiceClient).not.toHaveBeenCalled();
    expect(routeMocks.writeAuditLog).not.toHaveBeenCalled();
  });

  it("keeps a valid delivery retryable when the database is unavailable", async () => {
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "webhook-secret");
    routeMocks.verifyWebhook.mockReturnValue(deliveryEvent);

    const response = await postResendWebhook(webhookRequest());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false });
    expect(routeMocks.writeAuditLog).not.toHaveBeenCalled();
  });

  it("keeps a failed database write retryable without claiming delivery", async () => {
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "webhook-secret");
    routeMocks.verifyWebhook.mockReturnValue(deliveryEvent);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const rpc = vi.fn(async () => ({ data: null, error: { code: "08006" } }));
    routeMocks.createAdminServiceClient.mockReturnValue({ rpc });

    const response = await postResendWebhook(webhookRequest());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false });
    expect(routeMocks.writeAuditLog).not.toHaveBeenCalled();
  });

  it("retries a delivery before its provider ID is saved, then acknowledges the match and duplicate", async () => {
    setDeliveryEventAge(30_000);
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "webhook-secret");
    routeMocks.verifyWebhook.mockReturnValue({
      ...deliveryEvent,
      data: { ...deliveryEvent.data, tags: { source: "portfolio_booking" } },
    });
    const inquiryId = "3ce818fd-4b49-45c4-8c0f-c1c3f030ca24";
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [{ inquiry_id: inquiryId, applied: true }], error: null })
      .mockResolvedValueOnce({ data: [{ inquiry_id: inquiryId, applied: false }], error: null });
    routeMocks.createAdminServiceClient.mockReturnValue({ rpc });

    const unmatched = await postResendWebhook(webhookRequest());

    expect(unmatched.status).toBe(503);
    expect(await unmatched.json()).toEqual({ ok: false });
    expect(rpc).toHaveBeenNthCalledWith(1, "record_booking_email_delivery", {
      p_resend_email_id: "provider-email-id",
      p_email_status: "delivered",
      p_event_at: "2026-08-25T10:00:00.000Z",
      p_webhook_id: "webhook-event-id",
    });
    expect(routeMocks.writeAuditLog).toHaveBeenCalledTimes(1);
    expect(routeMocks.writeAuditLog).toHaveBeenNthCalledWith(1, {
      action: "booking_email_webhook_unmatched",
      tableName: "booking_inquiries",
      recordId: "webhook-event-id",
      metadata: {
        provider: "resend",
        providerEventAt: "2026-08-25T10:00:00.000Z",
        status: "delivered",
        webhookId: "webhook-event-id",
      },
    });

    const matched = await postResendWebhook(webhookRequest());

    expect(matched.status).toBe(200);
    expect(await matched.json()).toEqual({ ok: true });
    expect(routeMocks.writeAuditLog).toHaveBeenCalledTimes(2);
    expect(routeMocks.writeAuditLog).toHaveBeenNthCalledWith(2, {
      action: "booking_email_delivered",
      tableName: "booking_inquiries",
      recordId: inquiryId,
      metadata: {
        provider: "resend",
        providerEventAt: "2026-08-25T10:00:00.000Z",
        webhookId: "webhook-event-id",
      },
    });

    const duplicate = await postResendWebhook(webhookRequest());

    expect(duplicate.status).toBe(200);
    expect(await duplicate.json()).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledTimes(3);
    expect(rpc.mock.calls[1]).toEqual(rpc.mock.calls[0]);
    expect(rpc.mock.calls[2]).toEqual(rpc.mock.calls[0]);
    expect(routeMocks.writeAuditLog).toHaveBeenCalledTimes(2);
    const audit = JSON.stringify(routeMocks.writeAuditLog.mock.calls);
    for (const privateValue of [
      deliveryEvent.data.email_id,
      deliveryEvent.data.from,
      ...deliveryEvent.data.to,
      deliveryEvent.data.subject,
    ]) expect(audit).not.toContain(privateValue);
  });

  it.each([
    { label: "untagged legacy", tags: undefined },
    { label: "tagged", tags: { source: "portfolio_booking" } },
  ])("applies an old $label delivery using its exact provider ID after the retry grace", async ({ tags }) => {
    setDeliveryEventAge(24 * 60 * 60 * 1000);
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "webhook-secret");
    routeMocks.verifyWebhook.mockReturnValue({
      ...deliveryEvent,
      data: { ...deliveryEvent.data, ...(tags ? { tags } : {}) },
    });
    const inquiryId = "3ce818fd-4b49-45c4-8c0f-c1c3f030ca24";
    const rpc = vi.fn(async () => ({
      data: [{ inquiry_id: inquiryId, applied: true }],
      error: null,
    }));
    routeMocks.createAdminServiceClient.mockReturnValue({ rpc });

    const response = await postResendWebhook(webhookRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("record_booking_email_delivery", {
      p_resend_email_id: "provider-email-id",
      p_email_status: "delivered",
      p_event_at: "2026-08-25T10:00:00.000Z",
      p_webhook_id: "webhook-event-id",
    });
    expect(routeMocks.writeAuditLog).toHaveBeenCalledExactlyOnceWith({
      action: "booking_email_delivered",
      tableName: "booking_inquiries",
      recordId: inquiryId,
      metadata: {
        provider: "resend",
        providerEventAt: "2026-08-25T10:00:00.000Z",
        webhookId: "webhook-event-id",
      },
    });
  });

  it.each([
    { label: "last millisecond of grace", ageMs: 300_000, status: 503 },
    { label: "expired grace", ageMs: 300_001, status: 200 },
    { label: "maximum allowed future clock skew", ageMs: -60_000, status: 503 },
    { label: "future timestamp beyond clock skew", ageMs: -60_001, status: 200 },
    { label: "extreme future timestamp", ageMs: -86_400_000, status: 200 },
  ])("bounds unmatched tagged retries at $label", async ({ ageMs, status }) => {
    setDeliveryEventAge(ageMs);
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "webhook-secret");
    routeMocks.verifyWebhook.mockReturnValue({
      ...deliveryEvent,
      data: { ...deliveryEvent.data, tags: { source: "portfolio_booking" } },
    });
    const rpc = vi.fn(async () => ({ data: [], error: null }));
    routeMocks.createAdminServiceClient.mockReturnValue({ rpc });

    const response = await postResendWebhook(webhookRequest());

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ ok: status === 200 });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("record_booking_email_delivery", {
      p_resend_email_id: "provider-email-id",
      p_email_status: "delivered",
      p_event_at: "2026-08-25T10:00:00.000Z",
      p_webhook_id: "webhook-event-id",
    });
    expect(routeMocks.writeAuditLog).toHaveBeenCalledExactlyOnceWith({
      action: "booking_email_webhook_unmatched",
      tableName: "booking_inquiries",
      recordId: "webhook-event-id",
      metadata: {
        provider: "resend",
        providerEventAt: "2026-08-25T10:00:00.000Z",
        status: "delivered",
        webhookId: "webhook-event-id",
      },
    });
  });

  it.each([
    { label: "untagged legacy or fallback", tags: undefined },
    { label: "unrelated shared-account", tags: { source: "auth_smtp" } },
    { label: "different tag name", tags: { purpose: "portfolio_booking" } },
  ])("acknowledges unmatched $label mail after attempting the exact provider ID", async ({ tags }) => {
    setDeliveryEventAge(30_000);
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "webhook-secret");
    routeMocks.verifyWebhook.mockReturnValue({
      ...deliveryEvent,
      data: { ...deliveryEvent.data, ...(tags ? { tags } : {}) },
    });
    const rpc = vi.fn(async () => ({ data: [], error: null }));
    routeMocks.createAdminServiceClient.mockReturnValue({ rpc });

    const response = await postResendWebhook(webhookRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("record_booking_email_delivery", {
      p_resend_email_id: "provider-email-id",
      p_email_status: "delivered",
      p_event_at: "2026-08-25T10:00:00.000Z",
      p_webhook_id: "webhook-event-id",
    });
    expect(routeMocks.writeAuditLog).toHaveBeenCalledExactlyOnceWith({
      action: "booking_email_webhook_unmatched",
      tableName: "booking_inquiries",
      recordId: "webhook-event-id",
      metadata: {
        provider: "resend",
        providerEventAt: "2026-08-25T10:00:00.000Z",
        status: "delivered",
        webhookId: "webhook-event-id",
      },
    });
  });
});
