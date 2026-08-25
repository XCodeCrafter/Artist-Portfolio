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
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  routeMocks.createAdminServiceClient.mockReturnValue(null);
});

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
  });

  it("records a valid delivery event that cannot be matched to an inquiry", async () => {
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "webhook-secret");
    routeMocks.verifyWebhook.mockReturnValue({
      type: "email.delivered",
      created_at: "2026-08-25T10:00:00.000Z",
      data: { email_id: "provider-email-id" },
    });
    const rpc = vi.fn(async () => ({ data: [], error: null }));
    routeMocks.createAdminServiceClient.mockReturnValue({ rpc });

    const response = await postResendWebhook(
      new Request("https://portfolio.example/api/resend/webhook", {
        method: "POST",
        headers: {
          "svix-id": "webhook-event-id",
          "svix-signature": "signed-value",
          "svix-timestamp": "1787652000",
        },
        body: "{}",
      })
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("record_booking_email_delivery", {
      p_resend_email_id: "provider-email-id",
      p_email_status: "delivered",
      p_event_at: "2026-08-25T10:00:00.000Z",
      p_webhook_id: "webhook-event-id",
    });
    expect(routeMocks.writeAuditLog).toHaveBeenCalledWith({
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
    expect(JSON.stringify(routeMocks.writeAuditLog.mock.calls)).not.toContain(
      "provider-email-id"
    );
  });
});
