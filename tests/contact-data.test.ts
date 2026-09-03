import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAdminContactEditorData,
  getContactDeliveryStatus,
  isContactEditorWriteConflict,
  isMissingContactEditorSchemaError,
} from "@/lib/admin/contact";

const contactMocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(async () => ({
    id: "admin-id",
    email: "admin@example.com",
  })),
  hasAdminServiceEnv: vi.fn(() => true),
  createAdminServiceClient: vi.fn<() => unknown>(),
}));

vi.mock("@/lib/admin/auth", () => ({
  requireAdmin: contactMocks.requireAdmin,
}));

vi.mock("@/lib/admin/service", () => ({
  hasAdminServiceEnv: contactMocks.hasAdminServiceEnv,
  createAdminServiceClient: contactMocks.createAdminServiceClient,
}));

const UPDATED_AT = "2026-09-04T08:00:00.000Z";
const hero = {
  title: "CONTACT",
  subtitle: "LET'S WORK TOGETHER",
  ctaLabel: "WRITE",
  ctaHref: "#form",
  backgroundSrc: "/images/booking-hero.jpg",
  posterSrc: "",
  mediaType: "image",
};
const details = {
  location: "Prague / Worldwide",
  contactBlurb: "For acting, music, productions, and creative collaborations.",
};

function legacyQuery(result: { data: unknown; error: unknown }) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(async () => result),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.limit.mockReturnValue(builder);
  return builder;
}

beforeEach(() => {
  contactMocks.requireAdmin.mockResolvedValue({
    id: "admin-id",
    email: "admin@example.com",
  });
  contactMocks.hasAdminServiceEnv.mockReturnValue(true);
  contactMocks.createAdminServiceClient.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("Admin V2 Contact data loader", () => {
  it("authenticates before opening the service client", async () => {
    contactMocks.requireAdmin.mockRejectedValueOnce(new Error("unauthorized"));

    await expect(getAdminContactEditorData()).rejects.toThrow("unauthorized");
    expect(contactMocks.createAdminServiceClient).not.toHaveBeenCalled();
  });

  it("returns a read-only fallback and explicit delivery state without service env", async () => {
    contactMocks.hasAdminServiceEnv.mockReturnValue(false);
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("BOOKING_TO_EMAIL", "owner@example.com");
    vi.stubEnv("BOOKING_FROM_EMAIL", "portfolio@example.com");
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "whsec_test");

    const result = await getAdminContactEditorData();

    expect(result).toMatchObject({
      isConfigured: false,
      migrationRequired: false,
      delivery: {
        inboxConfigured: false,
        emailConfigured: true,
        webhookConfigured: true,
      },
    });
    expect(result.snapshot.draft.hero.title).toBeTruthy();
    expect(contactMocks.createAdminServiceClient).not.toHaveBeenCalled();
  });

  it("parses the service snapshot and exposes booleans without secret values", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_private_value");
    vi.stubEnv("BOOKING_TO_EMAIL", "owner@example.com");
    vi.stubEnv("BOOKING_FROM_EMAIL", "portfolio@example.com");
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "whsec_private_value");
    const rpc = vi.fn(async () => ({
      data: {
        hero: { ...hero, updatedAt: UPDATED_AT },
        details: { ...details, updatedAt: UPDATED_AT },
      },
      error: null,
    }));
    contactMocks.createAdminServiceClient.mockReturnValue({ rpc });

    const result = await getAdminContactEditorData();

    expect(rpc).toHaveBeenCalledWith("get_contact_page_v2_snapshot", {
      p_site_id: "main",
    });
    expect(result).toMatchObject({
      snapshot: { draft: { hero, details } },
      isConfigured: true,
      migrationRequired: false,
      delivery: {
        inboxConfigured: true,
        emailConfigured: true,
        webhookConfigured: true,
      },
    });
    expect(JSON.stringify(result)).not.toContain("re_private_value");
    expect(JSON.stringify(result)).not.toContain("whsec_private_value");
  });

  it("uses live legacy details and fallback Hero when migration and booking row are missing", async () => {
    const settingsQuery = legacyQuery({
      data: {
        location: details.location,
        contact_blurb: details.contactBlurb,
        updated_at: UPDATED_AT,
      },
      error: null,
    });
    const heroQuery = legacyQuery({ data: null, error: null });
    const client = {
      rpc: vi.fn(async () => ({
        data: null,
        error: {
          code: "PGRST202",
          message: "Could not find get_contact_page_v2_snapshot in schema cache",
        },
      })),
      from: vi.fn((table: string) =>
        table === "site_settings" ? settingsQuery : heroQuery
      ),
    };
    contactMocks.createAdminServiceClient.mockReturnValue(client);

    const result = await getAdminContactEditorData();

    expect(result.migrationRequired).toBe(true);
    expect(result.loadError).toContain("0033");
    expect(result.snapshot.draft.hero).toMatchObject({
      title: "CONTACT",
      backgroundSrc: "/images/booking-hero.jpg",
    });
    expect(result.snapshot.draft.details).toEqual(details);
    expect(result.snapshot.versions.hero.updatedAt).toBe(
      new Date(0).toISOString()
    );
    expect(result.snapshot.versions.details.updatedAt).toBe(UPDATED_AT);
  });

  it("fails the editor closed when an RPC returns an unexpected snapshot", async () => {
    contactMocks.createAdminServiceClient.mockReturnValue({
      rpc: vi.fn(async () => ({ data: { hero: null }, error: null })),
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await getAdminContactEditorData();

    expect(result.isConfigured).toBe(true);
    expect(result.migrationRequired).toBe(false);
    expect(result.loadError).toContain("unexpected shape");
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("reports a missing required singleton as data corruption, not a migration retry", async () => {
    contactMocks.createAdminServiceClient.mockReturnValue({
      rpc: vi.fn(async () => ({
        data: null,
        error: {
          code: "23503",
          message: "contact_page_snapshot_missing",
        },
      })),
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await getAdminContactEditorData();

    expect(result.isConfigured).toBe(true);
    expect(result.migrationRequired).toBe(false);
    expect(result.loadError).toContain("could not be loaded");
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe("Contact delivery and database error classification", () => {
  it("requires all three mail variables and reports only booleans", () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("BOOKING_TO_EMAIL", "owner@example.com");
    vi.stubEnv("BOOKING_FROM_EMAIL", "   ");
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "");
    expect(getContactDeliveryStatus(true)).toEqual({
      inboxConfigured: true,
      emailConfigured: false,
      webhookConfigured: false,
    });

    vi.stubEnv("BOOKING_FROM_EMAIL", "portfolio@example.com");
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "whsec_test");
    expect(getContactDeliveryStatus(true)).toEqual({
      inboxConfigured: true,
      emailConfigured: true,
      webhookConfigured: true,
    });
  });

  it("recognizes only Contact-specific migration and write conflicts", () => {
    expect(
      isMissingContactEditorSchemaError({
        code: "23503",
        message: "contact_page_snapshot_missing",
      })
    ).toBe(false);
    expect(
      isMissingContactEditorSchemaError({
        code: "42883",
        message: "function public.save_contact_details_v2 does not exist",
      })
    ).toBe(true);
    expect(
      isMissingContactEditorSchemaError({
        code: "42883",
        message: "function pg_catalog.some_internal_function does not exist",
      })
    ).toBe(false);
    expect(
      isContactEditorWriteConflict({
        code: "40001",
        message: "serialization failure",
      })
    ).toBe(true);
    expect(
      isContactEditorWriteConflict({
        code: "22023",
        message: "invalid_contact_details_payload",
      })
    ).toBe(false);
  });
});
