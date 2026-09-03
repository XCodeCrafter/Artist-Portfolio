import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveShowreelSectionV2 } from "@/app/admin/v2/pages/showreel/actions";
import {
  getAdminShowreelEditorData,
  isMissingShowreelEditorSchemaError,
  isShowreelEditorWriteConflict,
} from "@/lib/admin/showreel";
import { INITIAL_SHOWREEL_SAVE_STATE } from "@/lib/admin/showreel-editor";

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
  title: "SHOWREEL",
  subtitle: "ACTOR",
  ctaLabel: "WATCH",
  ctaHref: "#videos",
  backgroundSrc: "/images/showreel.jpg",
  posterSrc: "",
  mediaType: "image",
};

const introduction = {
  sectionEyebrow: "Selected work",
  sectionTitle: "Showreels, scenes, and music videos",
  sectionBody: "Screen work and selected performances.",
  emptyText: "More video work is coming soon.",
};

const works = {
  items: [
    {
      id: "showreel:main",
      title: "Casting reel",
      description: "A concise acting reel.",
      embedUrl: "https://www.youtube.com/watch?v=abcdefghijk",
      platform: "YouTube",
      thumbnailSrc: "/images/showreel-thumb.jpg",
      videoType: "showreel",
      isFeatured: true,
      isPublished: true,
    },
    {
      id: "legacy-music-video",
      title: "Legacy music video",
      description: "Kept from the musician portfolio.",
      embedUrl: "https://vimeo.com/123456789",
      platform: "Vimeo",
      thumbnailSrc: "",
      videoType: "music_video",
      isFeatured: false,
      isPublished: false,
    },
  ],
};

const workVersions = {
  items: {
    "showreel:main": UPDATED_AT,
    "legacy-music-video": UPDATED_AT,
  },
};

const nextWorkVersions = {
  items: {
    "showreel:main": NEXT_UPDATED_AT,
    "legacy-music-video": NEXT_UPDATED_AT,
  },
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

describe("Admin V2 Showreel section action", () => {
  it("authenticates before parsing or opening a service-role client", async () => {
    actionMocks.requireAdmin.mockRejectedValueOnce(new Error("unauthorized"));
    actionMocks.createAdminServiceClient.mockReturnValue({ rpc: vi.fn() });

    await expect(
      saveShowreelSectionV2(INITIAL_SHOWREEL_SAVE_STATE, new FormData())
    ).rejects.toThrow("unauthorized");
    expect(actionMocks.createAdminServiceClient).not.toHaveBeenCalled();
  });

  it.each([
    {
      section: "hero",
      rpcName: "save_showreel_hero_v2",
      payload: hero,
      versions: { updatedAt: UPDATED_AT },
      returnedVersions: { updatedAt: NEXT_UPDATED_AT },
      expectedArgs: {
        p_site_id: "main",
        p_expected_updated_at: UPDATED_AT,
      },
      tableName: "page_heroes",
      recordId: "video",
    },
    {
      section: "introduction",
      rpcName: "save_showreel_introduction_v2",
      payload: introduction,
      versions: { updatedAt: UPDATED_AT },
      returnedVersions: { updatedAt: NEXT_UPDATED_AT },
      expectedArgs: {
        p_site_id: "main",
        p_expected_updated_at: UPDATED_AT,
      },
      tableName: "media_assets",
      recordId: "showreel-studio-settings",
    },
    {
      section: "works",
      rpcName: "save_showreel_works_v2",
      payload: works,
      versions: workVersions,
      returnedVersions: nextWorkVersions,
      expectedArgs: {
        p_site_id: "main",
        p_expected_versions: workVersions.items,
      },
      tableName: "videos",
      recordId: "all",
    },
  ])(
    "routes a $section draft only to its section RPC",
    async ({
      section,
      rpcName,
      payload,
      versions,
      returnedVersions,
      expectedArgs,
      tableName,
      recordId,
    }) => {
      const rpc = vi.fn(async () => ({
        data: { versions: returnedVersions },
        error: null,
      }));
      actionMocks.createAdminServiceClient.mockReturnValue({ rpc });

      const state = await saveShowreelSectionV2(
        INITIAL_SHOWREEL_SAVE_STATE,
        sectionForm(section, payload, versions)
      );

      expect(state).toMatchObject({
        status: "saved",
        section,
        versions: returnedVersions,
      });
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(rpc).toHaveBeenCalledWith(rpcName, {
        ...expectedArgs,
        p_payload: payload,
      });
      expect(actionMocks.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: "admin-id",
          action: `showreel_v2_${section}_save`,
          tableName,
          recordId,
        })
      );
      for (const path of [
        "/video",
        "/admin/v2/pages/showreel",
        "/admin/v2-preview/showreel",
      ]) {
        expect(actionMocks.revalidatePath).toHaveBeenCalledWith(path);
      }
    }
  );

  it("rejects a save response that omits the preserved music-video version", async () => {
    actionMocks.createAdminServiceClient.mockReturnValue({
      rpc: vi.fn(async () => ({
        data: {
          versions: {
            items: { "showreel:main": NEXT_UPDATED_AT },
          },
        },
        error: null,
      })),
    });

    const state = await saveShowreelSectionV2(
      INITIAL_SHOWREEL_SAVE_STATE,
      sectionForm("works", works, workVersions)
    );

    expect(state.status).toBe("error");
    expect(actionMocks.writeAuditLog).not.toHaveBeenCalled();
    expect(actionMocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("blocks an invalid origin before creating the write client", async () => {
    actionMocks.verifyOrigin.mockResolvedValue(false);

    const state = await saveShowreelSectionV2(
      INITIAL_SHOWREEL_SAVE_STATE,
      sectionForm("introduction", introduction, { updatedAt: UPDATED_AT })
    );

    expect(state.status).toBe("security-error");
    expect(actionMocks.createAdminServiceClient).not.toHaveBeenCalled();
  });

  it("keeps the draft intact on an optimistic-lock conflict", async () => {
    actionMocks.createAdminServiceClient.mockReturnValue({
      rpc: vi.fn(async () => ({
        data: null,
        error: { code: "40001", message: "showreel_works_changed" },
      })),
    });

    const state = await saveShowreelSectionV2(
      INITIAL_SHOWREEL_SAVE_STATE,
      sectionForm("works", works, workVersions)
    );

    expect(state).toMatchObject({ status: "conflict", section: "works" });
    expect(actionMocks.writeAuditLog).not.toHaveBeenCalled();
    expect(actionMocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("reports migration 0032 when a Showreel RPC is absent", async () => {
    actionMocks.createAdminServiceClient.mockReturnValue({
      rpc: vi.fn(async () => ({
        data: null,
        error: {
          code: "PGRST202",
          message:
            "Could not find public.save_showreel_introduction_v2 in the schema cache",
        },
      })),
    });

    const state = await saveShowreelSectionV2(
      INITIAL_SHOWREEL_SAVE_STATE,
      sectionForm("introduction", introduction, { updatedAt: UPDATED_AT })
    );

    expect(state.status).toBe("migration-required");
    expect(state.message).toContain("0032");
  });

  it("rejects duplicate video ids before opening the write client", async () => {
    const state = await saveShowreelSectionV2(
      INITIAL_SHOWREEL_SAVE_STATE,
      sectionForm(
        "works",
        { items: [works.items[0], works.items[0]] },
        { items: { "showreel:main": UPDATED_AT } }
      )
    );

    expect(state.status).toBe("invalid");
    expect(actionMocks.createAdminServiceClient).not.toHaveBeenCalled();
  });
});

describe("Admin V2 Showreel loader error classification", () => {
  it("recognises only Showreel-specific missing schema and conflict errors", () => {
    expect(
      isMissingShowreelEditorSchemaError({
        code: "23503",
        message: "showreel_page_snapshot_missing",
      })
    ).toBe(true);
    expect(
      isMissingShowreelEditorSchemaError({
        code: "42883",
        message: "function public.save_showreel_works_v2 does not exist",
      })
    ).toBe(true);
    expect(
      isMissingShowreelEditorSchemaError({
        code: "42883",
        message: "function pg_catalog.some_internal_function does not exist",
      })
    ).toBe(false);
    expect(
      isShowreelEditorWriteConflict({
        code: "40001",
        message: "serialization failure",
      })
    ).toBe(true);
    expect(
      isShowreelEditorWriteConflict({
        code: "22023",
        message: "invalid_showreel_works_payload",
      })
    ).toBe(false);
  });

  it("authenticates before creating the snapshot client", async () => {
    actionMocks.requireAdmin.mockRejectedValueOnce(new Error("unauthorized"));
    actionMocks.createAdminServiceClient.mockReturnValue({ rpc: vi.fn() });

    await expect(getAdminShowreelEditorData()).rejects.toThrow("unauthorized");
    expect(actionMocks.createAdminServiceClient).not.toHaveBeenCalled();
  });
});
