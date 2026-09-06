import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteInquiry as deleteClassicInquiry,
  updateInquiry as updateClassicInquiry,
} from "@/app/admin/analytics/actions";
import {
  deleteInquiry as deleteV2Inquiry,
  updateInquiry as updateV2Inquiry,
} from "@/app/admin/v2/inbox/actions";

const actionMocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(async () => ({
    id: "11111111-1111-4111-8111-111111111111",
    email: "owner@example.com",
    role: "owner" as const,
  })),
  verifyOrigin: vi.fn(async () => true),
  writeAuditLog: vi.fn<
    (
      input: unknown
    ) => Promise<
      { ok: true } | { ok: false; reason: "not-configured" | "insert-failed" }
    >
  >(async () => ({ ok: true })),
  createAdminServiceClient: vi.fn<() => unknown>(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/admin/auth", () => ({
  requireAdmin: actionMocks.requireAdmin,
}));

vi.mock("@/lib/admin/action-security", () => ({
  verifyAdminActionOrigin: actionMocks.verifyOrigin,
}));

vi.mock("@/lib/admin/audit", () => ({
  writeAuditLog: actionMocks.writeAuditLog,
}));

vi.mock("@/lib/admin/service", () => ({
  createAdminServiceClient: actionMocks.createAdminServiceClient,
}));

vi.mock("next/cache", () => ({
  revalidatePath: actionMocks.revalidatePath,
}));

vi.mock("next/navigation", () => ({
  redirect: (destination: string) => {
    actionMocks.redirect(destination);
    throw Object.assign(new Error("NEXT_REDIRECT"), { destination });
  },
}));

const INQUIRY_ID = "22222222-2222-4222-8222-222222222222";

function updateForm(
  overrides: Partial<{
    id: string;
    status: string;
    adminNotes: string;
    page: number;
    rangeDays: number;
  }> = {}
) {
  const values = {
    id: INQUIRY_ID,
    status: "read",
    adminNotes: "Follow up next week.",
    ...overrides,
  };
  const formData = new FormData();
  formData.set("id", values.id);
  formData.set("status", values.status);
  formData.set("adminNotes", values.adminNotes);
  if (values.page !== undefined) formData.set("page", String(values.page));
  if (values.rangeDays !== undefined) {
    formData.set("rangeDays", String(values.rangeDays));
  }
  return formData;
}

function deleteForm(
  id = INQUIRY_ID,
  context: { page?: number; rangeDays?: number } = {}
) {
  const formData = new FormData();
  formData.set("id", id);
  if (context.page !== undefined) formData.set("page", String(context.page));
  if (context.rangeDays !== undefined) {
    formData.set("rangeDays", String(context.rangeDays));
  }
  return formData;
}

function createMutationClient(options: {
  data?: { id: string } | null;
  error?: { message: string } | null;
} = {}) {
  const result = {
    data: options.data === undefined ? { id: INQUIRY_ID } : options.data,
    error: options.error || null,
  };
  const maybeSingle = vi.fn(async () => result);
  const select = vi.fn(() => ({ maybeSingle }));
  const eq = vi.fn(() => ({ select }));
  const update = vi.fn(() => ({ eq }));
  const deleteRow = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ delete: deleteRow, update }));
  return {
    client: { from },
    deleteRow,
    eq,
    from,
    maybeSingle,
    select,
    update,
  };
}

async function expectRedirect(action: Promise<unknown>, destination: string) {
  await expect(action).rejects.toMatchObject({ destination });
  expect(actionMocks.redirect).toHaveBeenLastCalledWith(destination);
}

beforeEach(() => {
  vi.clearAllMocks();
  actionMocks.requireAdmin.mockResolvedValue({
    id: "11111111-1111-4111-8111-111111111111",
    email: "owner@example.com",
    role: "owner",
  });
  actionMocks.verifyOrigin.mockResolvedValue(true);
  actionMocks.writeAuditLog.mockResolvedValue({ ok: true });
});

describe("admin inquiry actions", () => {
  it("keeps invalid input on its server-owned surface without authenticating", async () => {
    await expectRedirect(
      updateV2Inquiry(updateForm({ id: "not-a-uuid" })),
      "/admin/v2/inbox?status=invalid#messages"
    );
    await expectRedirect(
      updateClassicInquiry(updateForm({ status: "invented" })),
      "/admin/analytics?status=invalid#inquiries"
    );

    expect(actionMocks.requireAdmin).not.toHaveBeenCalled();
    expect(actionMocks.createAdminServiceClient).not.toHaveBeenCalled();
  });

  it("blocks a bad origin before creating a service-role client", async () => {
    actionMocks.verifyOrigin.mockResolvedValue(false);

    await expectRedirect(
      updateV2Inquiry(updateForm()),
      "/admin/v2/inbox?status=security-error#messages"
    );

    expect(actionMocks.verifyOrigin).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "analytics:inquiries"
    );
    expect(actionMocks.createAdminServiceClient).not.toHaveBeenCalled();
  });

  it("updates through an existence-checking mutation and refreshes both surfaces", async () => {
    const service = createMutationClient();
    actionMocks.createAdminServiceClient.mockReturnValue(service.client);

    await expectRedirect(
      updateV2Inquiry(updateForm()),
      "/admin/v2/inbox?status=saved#messages"
    );

    expect(service.from).toHaveBeenCalledWith("booking_inquiries");
    expect(service.update).toHaveBeenCalledWith({
      status: "read",
      admin_notes: "Follow up next week.",
    });
    expect(service.eq).toHaveBeenCalledWith("id", INQUIRY_ID);
    expect(service.select).toHaveBeenCalledWith("id");
    expect(service.maybeSingle).toHaveBeenCalledTimes(1);
    expect(actionMocks.writeAuditLog).toHaveBeenCalledWith({
      actorId: "11111111-1111-4111-8111-111111111111",
      action: "inquiry_update",
      tableName: "booking_inquiries",
      recordId: INQUIRY_ID,
      metadata: { status: "read" },
    });
    for (const path of [
      "/admin/analytics",
      "/admin/v2/inbox",
      "/admin",
      "/admin/v2",
    ]) {
      expect(actionMocks.revalidatePath).toHaveBeenCalledWith(path);
    }
  });

  it("does not claim success or write an audit event for a missing record", async () => {
    const service = createMutationClient({ data: null });
    actionMocks.createAdminServiceClient.mockReturnValue(service.client);

    await expectRedirect(
      updateClassicInquiry(updateForm()),
      "/admin/analytics?status=not-found#inquiries"
    );

    expect(actionMocks.writeAuditLog).not.toHaveBeenCalled();
    expect(actionMocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("reports a successful save whose audit write could not be verified", async () => {
    const service = createMutationClient();
    actionMocks.createAdminServiceClient.mockReturnValue(service.client);
    actionMocks.writeAuditLog.mockResolvedValue({
      ok: false,
      reason: "insert-failed",
    });

    await expectRedirect(
      updateV2Inquiry(updateForm()),
      "/admin/v2/inbox?status=saved-audit-warning#messages"
    );
  });

  it("treats a thrown audit request as a warning after the save succeeded", async () => {
    const service = createMutationClient();
    actionMocks.createAdminServiceClient.mockReturnValue(service.client);
    actionMocks.writeAuditLog.mockRejectedValue(new Error("network failed"));

    await expectRedirect(
      updateV2Inquiry(updateForm()),
      "/admin/v2/inbox?status=saved-audit-warning#messages"
    );

    expect(actionMocks.revalidatePath).toHaveBeenCalledWith("/admin/v2/inbox");
  });

  it("preserves only validated numeric page context on each fixed surface", async () => {
    const service = createMutationClient();
    actionMocks.createAdminServiceClient.mockReturnValue(service.client);

    await expectRedirect(
      updateV2Inquiry(updateForm({ page: 4, rangeDays: 180 })),
      "/admin/v2/inbox?status=saved&page=4#messages"
    );

    await expectRedirect(
      deleteClassicInquiry(
        deleteForm(INQUIRY_ID, { page: 3, rangeDays: 90 })
      ),
      "/admin/analytics?status=deleted&inquiryPage=3&range=90#inquiries"
    );

    await expectRedirect(
      updateClassicInquiry(
        updateForm({ page: 999_999, rangeDays: 123 })
      ),
      "/admin/analytics?status=saved&inquiryPage=10000&range=30#inquiries"
    );
  });

  it("deletes on the fixed Classic surface and verifies that a row existed", async () => {
    const service = createMutationClient();
    actionMocks.createAdminServiceClient.mockReturnValue(service.client);

    await expectRedirect(
      deleteClassicInquiry(deleteForm()),
      "/admin/analytics?status=deleted#inquiries"
    );

    expect(service.deleteRow).toHaveBeenCalledTimes(1);
    expect(service.select).toHaveBeenCalledWith("id");
    expect(actionMocks.writeAuditLog).toHaveBeenCalledWith({
      actorId: "11111111-1111-4111-8111-111111111111",
      action: "inquiry_delete",
      tableName: "booking_inquiries",
      recordId: INQUIRY_ID,
    });
  });

  it("keeps missing service configuration on the requested V2 surface", async () => {
    actionMocks.createAdminServiceClient.mockReturnValue(null);

    await expectRedirect(
      deleteV2Inquiry(deleteForm()),
      "/admin/v2/inbox?status=missing-service#messages"
    );

    expect(actionMocks.writeAuditLog).not.toHaveBeenCalled();
  });
});
