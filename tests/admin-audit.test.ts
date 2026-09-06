import { beforeEach, describe, expect, it, vi } from "vitest";
import { writeAuditLog } from "@/lib/admin/audit";

const auditMocks = vi.hoisted(() => ({
  createAdminServiceClient: vi.fn<() => unknown>(),
}));

vi.mock("@/lib/admin/service", () => ({
  createAdminServiceClient: auditMocks.createAdminServiceClient,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("admin audit logging", () => {
  it("returns not-configured when the service client is unavailable", async () => {
    auditMocks.createAdminServiceClient.mockReturnValue(null);

    await expect(
      writeAuditLog({ action: "content_update", tableName: "site_settings" })
    ).resolves.toEqual({ ok: false, reason: "not-configured" });
  });

  it("returns a structured failure for a database insert error", async () => {
    const insert = vi.fn(async () => ({
      error: { code: "42501", message: "permission denied" },
    }));
    auditMocks.createAdminServiceClient.mockReturnValue({
      from: vi.fn(() => ({ insert })),
    });

    await expect(
      writeAuditLog({
        actorId: "11111111-1111-4111-8111-111111111111",
        action: "content_update",
        tableName: "site_settings",
        recordId: "main",
      })
    ).resolves.toEqual({
      ok: false,
      reason: "insert-failed",
      errorCode: "42501",
    });
  });

  it("never throws when the audit client rejects with a network error", async () => {
    const insert = vi.fn().mockRejectedValue(new Error("fetch failed"));
    auditMocks.createAdminServiceClient.mockReturnValue({
      from: vi.fn(() => ({ insert })),
    });

    await expect(
      writeAuditLog({
        action: "navigation_v2_save",
        tableName: "site_navigation_items",
        recordId: "main",
      })
    ).resolves.toEqual({ ok: false, reason: "insert-failed" });
    expect(console.error).toHaveBeenCalledWith(
      "[audit] Audit client threw while persisting an event.",
      expect.objectContaining({
        action: "navigation_v2_save",
        message: "fetch failed",
      })
    );
  });
});
