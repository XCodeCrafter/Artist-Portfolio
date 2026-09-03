import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveContactSectionV2 } from "@/app/admin/v2/pages/contact/actions";
import { INITIAL_CONTACT_SAVE_STATE } from "@/lib/admin/contact-editor";

const actionMocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(async () => ({
    id: "admin-id",
    email: "admin@example.com",
  })),
  verifyOrigin: vi.fn(async () => true),
  writeAuditLog: vi.fn(async () => ({ ok: true as const })),
  createAdminServiceClient: vi.fn<() => unknown>(),
  revalidatePath: vi.fn(),
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
  hasAdminServiceEnv: vi.fn(() => true),
}));

vi.mock("next/cache", () => ({
  revalidatePath: actionMocks.revalidatePath,
}));

const UPDATED_AT = "2026-09-04T10:00:00.000Z";
const NEXT_UPDATED_AT = "2026-09-04T10:01:00.000Z";

const hero = {
  title: "CONTACT",
  subtitle: "LET'S WORK TOGETHER",
  ctaLabel: "OPEN FORM",
  ctaHref: "#contact-form",
  backgroundSrc: "/images/booking-hero.jpg",
  posterSrc: "",
  mediaType: "image",
};

const details = {
  location: "Prague / Worldwide",
  contactBlurb: "For acting, music, and creative collaborations.",
};

function sectionForm(section: string, payload: unknown, versions: unknown) {
  const formData = new FormData();
  formData.set("section", section);
  formData.set("payload", JSON.stringify(payload));
  formData.set("versions", JSON.stringify(versions));
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  actionMocks.requireAdmin.mockResolvedValue({
    id: "admin-id",
    email: "admin@example.com",
  });
  actionMocks.verifyOrigin.mockResolvedValue(true);
});

describe("Admin V2 Contact section action", () => {
  it("authenticates before parsing or opening a service-role client", async () => {
    actionMocks.requireAdmin.mockRejectedValueOnce(new Error("unauthorized"));
    actionMocks.createAdminServiceClient.mockReturnValue({ rpc: vi.fn() });

    await expect(
      saveContactSectionV2(INITIAL_CONTACT_SAVE_STATE, new FormData())
    ).rejects.toThrow("unauthorized");

    expect(actionMocks.verifyOrigin).not.toHaveBeenCalled();
    expect(actionMocks.createAdminServiceClient).not.toHaveBeenCalled();
  });

  it("rejects an invalid draft before origin or database access", async () => {
    const state = await saveContactSectionV2(
      INITIAL_CONTACT_SAVE_STATE,
      sectionForm(
        "details",
        { ...details, inboxSecret: "must-not-pass" },
        { updatedAt: UPDATED_AT }
      )
    );

    expect(state).toMatchObject({ status: "invalid", section: "details" });
    expect(actionMocks.verifyOrigin).not.toHaveBeenCalled();
    expect(actionMocks.createAdminServiceClient).not.toHaveBeenCalled();
  });

  it("blocks an invalid origin before creating the service-role client", async () => {
    actionMocks.verifyOrigin.mockResolvedValue(false);

    const state = await saveContactSectionV2(
      INITIAL_CONTACT_SAVE_STATE,
      sectionForm("details", details, { updatedAt: UPDATED_AT })
    );

    expect(state).toMatchObject({
      status: "security-error",
      section: "details",
    });
    expect(actionMocks.verifyOrigin).toHaveBeenCalledWith(
      "admin-id",
      "contact-v2:details"
    );
    expect(actionMocks.createAdminServiceClient).not.toHaveBeenCalled();
  });

  it("reports missing service configuration without attempting an RPC", async () => {
    actionMocks.createAdminServiceClient.mockReturnValue(null);

    const state = await saveContactSectionV2(
      INITIAL_CONTACT_SAVE_STATE,
      sectionForm("hero", hero, { updatedAt: UPDATED_AT })
    );

    expect(state).toMatchObject({ status: "missing-service", section: "hero" });
    expect(actionMocks.writeAuditLog).not.toHaveBeenCalled();
    expect(actionMocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("keeps the draft intact after an optimistic-lock conflict", async () => {
    actionMocks.createAdminServiceClient.mockReturnValue({
      rpc: vi.fn(async () => ({
        data: null,
        error: { code: "40001", message: "contact_details_changed" },
      })),
    });

    const state = await saveContactSectionV2(
      INITIAL_CONTACT_SAVE_STATE,
      sectionForm("details", details, { updatedAt: UPDATED_AT })
    );

    expect(state).toMatchObject({ status: "conflict", section: "details" });
    expect(actionMocks.writeAuditLog).not.toHaveBeenCalled();
    expect(actionMocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("reports migration 0033 when a Contact RPC is absent", async () => {
    actionMocks.createAdminServiceClient.mockReturnValue({
      rpc: vi.fn(async () => ({
        data: null,
        error: {
          code: "PGRST202",
          message:
            "Could not find public.save_contact_details_v2 in the schema cache",
        },
      })),
    });

    const state = await saveContactSectionV2(
      INITIAL_CONTACT_SAVE_STATE,
      sectionForm("details", details, { updatedAt: UPDATED_AT })
    );

    expect(state).toMatchObject({
      status: "migration-required",
      section: "details",
    });
    expect(state.message).toContain("0033");
    expect(actionMocks.writeAuditLog).not.toHaveBeenCalled();
  });

  it.each([
    {
      section: "hero" as const,
      payload: hero,
      rpcName: "save_contact_hero_v2",
      tableName: "page_heroes",
      recordId: "booking",
    },
    {
      section: "details" as const,
      payload: details,
      rpcName: "save_contact_details_v2",
      tableName: "site_settings",
      recordId: "main",
    },
  ])(
    "saves and publishes only the $section section",
    async ({ section, payload, rpcName, tableName, recordId }) => {
      const rpc = vi.fn(async () => ({
        data: { versions: { updatedAt: NEXT_UPDATED_AT } },
        error: null,
      }));
      actionMocks.createAdminServiceClient.mockReturnValue({ rpc });

      const state = await saveContactSectionV2(
        INITIAL_CONTACT_SAVE_STATE,
        sectionForm(section, payload, { updatedAt: UPDATED_AT })
      );

      expect(state).toMatchObject({
        status: "saved",
        section,
        canonicalSection: payload,
        versions: { updatedAt: NEXT_UPDATED_AT },
      });
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(rpc).toHaveBeenCalledWith(rpcName, {
        p_site_id: "main",
        p_expected_updated_at: UPDATED_AT,
        p_payload: payload,
      });
      expect(actionMocks.writeAuditLog).toHaveBeenCalledWith({
        actorId: "admin-id",
        action: `contact_v2_${section}_save`,
        tableName,
        recordId,
        metadata: { section },
      });
      for (const path of [
        "/booking",
        "/admin/v2/pages/contact",
        "/admin/v2-preview/contact",
      ]) {
        expect(actionMocks.revalidatePath).toHaveBeenCalledWith(path);
      }
    }
  );

  it("rejects an unconfirmable RPC response before audit or revalidation", async () => {
    actionMocks.createAdminServiceClient.mockReturnValue({
      rpc: vi.fn(async () => ({
        data: { versions: {} },
        error: null,
      })),
    });

    const state = await saveContactSectionV2(
      INITIAL_CONTACT_SAVE_STATE,
      sectionForm("details", details, { updatedAt: UPDATED_AT })
    );

    expect(state).toMatchObject({ status: "error", section: "details" });
    expect(actionMocks.writeAuditLog).not.toHaveBeenCalled();
    expect(actionMocks.revalidatePath).not.toHaveBeenCalled();
  });
});
