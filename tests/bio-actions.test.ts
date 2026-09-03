import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveBioSectionV2 } from "@/app/admin/v2/pages/bio/actions";
import {
  getAdminBioEditorData,
  isMissingBioEditorSchemaError,
} from "@/lib/admin/bio";
import { INITIAL_BIO_SAVE_STATE } from "@/lib/admin/bio-editor";

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

const UPDATED_AT = "2026-09-03T10:00:00.000Z";
const NEXT_UPDATED_AT = "2026-09-03T10:01:00.000Z";

const hero = {
  title: "BIOGRAPHY",
  subtitle: "BIO",
  ctaLabel: "READ",
  ctaHref: "#bio",
  backgroundSrc: "/images/bio-hero.jpg",
  posterSrc: "",
  mediaType: "image",
};

const biography = {
  topLabel: "About",
  introText: "Actor and musician.",
  caption: "Amsterdam",
  galleryImages: [
    {
      id: "portrait-01",
      src: "/images/bio.jpg",
      alt: "Portrait",
      isPublished: true,
    },
  ],
  paragraphs: [
    {
      id: "bio-01",
      body: "First paragraph.",
      revealDelay: 140,
      isPublished: true,
    },
  ],
};

const resume = {
  headline: "Actor resume",
  summary: "Screen and stage performer.",
  location: "Amsterdam",
  playingAge: "28–38",
  height: "180 cm",
  eyes: "Brown",
  hair: "Brown",
  languages: "English, Dutch",
  skills: "Movement, guitar",
  representation: "Independent",
  resumeUrl: "/resume.pdf",
};

const credits = {
  items: [
    {
      id: "film-01",
      creditType: "film",
      title: "Example Film",
      role: "Lead",
      production: "Example Studio",
      director: "Example Director",
      year: "2026",
      href: "",
      isPublished: true,
    },
  ],
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

describe("Admin V2 Bio section action", () => {
  it("authenticates before parsing or opening a service client", async () => {
    actionMocks.requireAdmin.mockRejectedValueOnce(new Error("unauthorized"));
    actionMocks.createAdminServiceClient.mockReturnValue({ rpc: vi.fn() });

    await expect(
      saveBioSectionV2(INITIAL_BIO_SAVE_STATE, new FormData())
    ).rejects.toThrow("unauthorized");
    expect(actionMocks.createAdminServiceClient).not.toHaveBeenCalled();
  });

  it.each([
    {
      section: "hero",
      rpcName: "save_bio_hero_v2",
      payload: hero,
      versions: { updatedAt: UPDATED_AT },
      expectedArgs: {
        p_site_id: "main",
        p_expected_updated_at: UPDATED_AT,
      },
    },
    {
      section: "biography",
      rpcName: "save_bio_biography_v2",
      payload: biography,
      versions: {
        profileUpdatedAt: UPDATED_AT,
        galleryItems: { "portrait-01": UPDATED_AT },
        paragraphItems: { "bio-01": UPDATED_AT },
      },
      expectedArgs: {
        p_site_id: "main",
        p_expected_profile_updated_at: UPDATED_AT,
        p_expected_gallery_versions: { "portrait-01": UPDATED_AT },
        p_expected_paragraph_versions: { "bio-01": UPDATED_AT },
      },
    },
    {
      section: "resume",
      rpcName: "save_bio_resume_v2",
      payload: resume,
      versions: { updatedAt: UPDATED_AT },
      expectedArgs: {
        p_site_id: "main",
        p_expected_updated_at: UPDATED_AT,
      },
    },
    {
      section: "credits",
      rpcName: "save_bio_credits_v2",
      payload: credits,
      versions: { items: { "film-01": UPDATED_AT } },
      expectedArgs: {
        p_site_id: "main",
        p_expected_versions: { "film-01": UPDATED_AT },
      },
    },
  ])(
    "routes a $section draft only to its section RPC",
    async ({ section, rpcName, payload, versions, expectedArgs }) => {
      const rpc = vi.fn(async () => ({ data: { versions }, error: null }));
      actionMocks.createAdminServiceClient.mockReturnValue({ rpc });

      const state = await saveBioSectionV2(
        INITIAL_BIO_SAVE_STATE,
        sectionForm(section, payload, versions)
      );

      expect(state).toMatchObject({ status: "saved", section, versions });
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(rpc).toHaveBeenCalledWith(rpcName, {
        ...expectedArgs,
        p_payload: payload,
      });
      expect(actionMocks.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: "admin-id",
          action: `bio_v2_${section}_save`,
        })
      );
      expect(actionMocks.revalidatePath).toHaveBeenCalledWith("/bio");
      expect(actionMocks.revalidatePath).toHaveBeenCalledWith(
        "/admin/v2/pages/bio"
      );
    }
  );

  it("accepts appended biography rows when the RPC returns every version", async () => {
    const payload = {
      ...biography,
      paragraphs: [
        ...biography.paragraphs,
        {
          id: "bio:new",
          body: "A new paragraph.",
          revealDelay: 200,
          isPublished: false,
        },
      ],
    };
    const baseline = {
      profileUpdatedAt: UPDATED_AT,
      galleryItems: { "portrait-01": UPDATED_AT },
      paragraphItems: { "bio-01": UPDATED_AT },
    };
    const returned = {
      profileUpdatedAt: NEXT_UPDATED_AT,
      galleryItems: { "portrait-01": NEXT_UPDATED_AT },
      paragraphItems: {
        "bio-01": NEXT_UPDATED_AT,
        "bio:new": NEXT_UPDATED_AT,
      },
    };
    const rpc = vi.fn(async () => ({
      data: { versions: returned },
      error: null,
    }));
    actionMocks.createAdminServiceClient.mockReturnValue({ rpc });

    const state = await saveBioSectionV2(
      INITIAL_BIO_SAVE_STATE,
      sectionForm("biography", payload, baseline)
    );

    expect(state).toMatchObject({
      status: "saved",
      section: "biography",
      versions: returned,
    });
  });

  it("rejects a save response that omits a newly inserted collection version", async () => {
    const payload = {
      items: [
        ...credits.items,
        { ...credits.items[0], id: "film:new", title: "New Film" },
      ],
    };
    const baseline = { items: { "film-01": UPDATED_AT } };
    actionMocks.createAdminServiceClient.mockReturnValue({
      rpc: vi.fn(async () => ({ data: { versions: baseline }, error: null })),
    });

    const state = await saveBioSectionV2(
      INITIAL_BIO_SAVE_STATE,
      sectionForm("credits", payload, baseline)
    );

    expect(state.status).toBe("error");
    expect(actionMocks.writeAuditLog).not.toHaveBeenCalled();
  });

  it("blocks an invalid origin before creating the write client", async () => {
    actionMocks.verifyOrigin.mockResolvedValue(false);

    const state = await saveBioSectionV2(
      INITIAL_BIO_SAVE_STATE,
      sectionForm("resume", resume, { updatedAt: UPDATED_AT })
    );

    expect(state.status).toBe("security-error");
    expect(actionMocks.createAdminServiceClient).not.toHaveBeenCalled();
  });

  it("keeps a draft intact when another admin saved first", async () => {
    actionMocks.createAdminServiceClient.mockReturnValue({
      rpc: vi.fn(async () => ({
        data: null,
        error: { code: "40001", message: "bio_resume_changed" },
      })),
    });

    const state = await saveBioSectionV2(
      INITIAL_BIO_SAVE_STATE,
      sectionForm("resume", resume, { updatedAt: UPDATED_AT })
    );

    expect(state.status).toBe("conflict");
    expect(actionMocks.writeAuditLog).not.toHaveBeenCalled();
    expect(actionMocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("reports migration 0030 when a Bio RPC is absent", async () => {
    actionMocks.createAdminServiceClient.mockReturnValue({
      rpc: vi.fn(async () => ({
        data: null,
        error: {
          code: "PGRST202",
          message: "Could not find public.save_bio_resume_v2 in the schema cache",
        },
      })),
    });

    const state = await saveBioSectionV2(
      INITIAL_BIO_SAVE_STATE,
      sectionForm("resume", resume, { updatedAt: UPDATED_AT })
    );

    expect(state.status).toBe("migration-required");
  });

  it("rejects extra implementation fields after authentication but before database access", async () => {
    const state = await saveBioSectionV2(
      INITIAL_BIO_SAVE_STATE,
      sectionForm("hero", { ...hero, sortOrder: 20 }, { updatedAt: UPDATED_AT })
    );

    expect(state.status).toBe("invalid");
    expect(actionMocks.requireAdmin).toHaveBeenCalledTimes(1);
    expect(actionMocks.createAdminServiceClient).not.toHaveBeenCalled();
  });
});

describe("Admin V2 Bio loader", () => {
  it("recognises only Bio-specific missing schema errors", () => {
    expect(
      isMissingBioEditorSchemaError({
        code: "23503",
        message: "bio_page_snapshot_missing",
      })
    ).toBe(true);
    expect(
      isMissingBioEditorSchemaError({
        code: "42883",
        message: "function pg_catalog.some_internal_function does not exist",
      })
    ).toBe(false);
  });

  it("authenticates before creating its service-role snapshot client", async () => {
    actionMocks.requireAdmin.mockRejectedValueOnce(new Error("unauthorized"));
    actionMocks.createAdminServiceClient.mockReturnValue({ rpc: vi.fn() });

    await expect(getAdminBioEditorData()).rejects.toThrow("unauthorized");
    expect(actionMocks.createAdminServiceClient).not.toHaveBeenCalled();
  });
});
