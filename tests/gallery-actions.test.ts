import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveGallerySectionV2 } from "@/app/admin/v2/pages/gallery/actions";
import {
  getAdminGalleryEditorData,
  isMissingGalleryEditorSchemaError,
} from "@/lib/admin/gallery";
import { INITIAL_GALLERY_SAVE_STATE } from "@/lib/admin/gallery-editor";

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
const migrationSql = readFileSync(
  new URL("../supabase/migrations/0031_gallery_page_editor.sql", import.meta.url),
  "utf8"
);

const hero = {
  title: "GALLERY",
  subtitle: "HEADSHOTS",
  ctaLabel: "VIEW",
  ctaHref: "#gallery",
  backgroundSrc: "/images/gallery.jpg",
  posterSrc: "",
  mediaType: "image",
};

const introduction = {
  introEyebrow: "Selected frames",
  introTitle: "A visual archive.",
};

const frames = {
  items: [
    {
      id: "gallery:portrait-01",
      title: "Editorial portrait",
      src: "/images/bio.jpg",
      alt: "Editorial actor portrait",
      caption: "Natural-light portrait.",
      category: "Headshot",
      isMosaic: true,
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

describe("Admin V2 Gallery section action", () => {
  it("authenticates before parsing or opening a service client", async () => {
    actionMocks.requireAdmin.mockRejectedValueOnce(new Error("unauthorized"));
    actionMocks.createAdminServiceClient.mockReturnValue({ rpc: vi.fn() });

    await expect(
      saveGallerySectionV2(INITIAL_GALLERY_SAVE_STATE, new FormData())
    ).rejects.toThrow("unauthorized");
    expect(actionMocks.createAdminServiceClient).not.toHaveBeenCalled();
  });

  it.each([
    {
      section: "hero",
      rpcName: "save_gallery_hero_v2",
      payload: hero,
      versions: { updatedAt: UPDATED_AT },
      expectedArgs: {
        p_site_id: "main",
        p_expected_updated_at: UPDATED_AT,
      },
    },
    {
      section: "introduction",
      rpcName: "save_gallery_introduction_v2",
      payload: introduction,
      versions: { updatedAt: UPDATED_AT },
      expectedArgs: {
        p_site_id: "main",
        p_expected_updated_at: UPDATED_AT,
      },
    },
    {
      section: "frames",
      rpcName: "save_gallery_frames_v2",
      payload: frames,
      versions: { items: { "gallery:portrait-01": UPDATED_AT } },
      expectedArgs: {
        p_site_id: "main",
        p_expected_versions: { "gallery:portrait-01": UPDATED_AT },
      },
    },
  ])(
    "routes a $section draft only to its section RPC",
    async ({ section, rpcName, payload, versions, expectedArgs }) => {
      const rpc = vi.fn(async () => ({ data: { versions }, error: null }));
      actionMocks.createAdminServiceClient.mockReturnValue({ rpc });

      const state = await saveGallerySectionV2(
        INITIAL_GALLERY_SAVE_STATE,
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
          action: `gallery_v2_${section}_save`,
        })
      );
      expect(actionMocks.revalidatePath).toHaveBeenCalledWith("/gallery");
      expect(actionMocks.revalidatePath).toHaveBeenCalledWith(
        "/admin/v2/pages/gallery"
      );
    }
  );

  it("accepts an appended frame only when the RPC returns exact versions", async () => {
    const payload = {
      items: [
        ...frames.items,
        { ...frames.items[0], id: "gallery:new", title: "New frame" },
      ],
    };
    const baseline = { items: { "gallery:portrait-01": UPDATED_AT } };
    const returned = {
      items: {
        "gallery:portrait-01": NEXT_UPDATED_AT,
        "gallery:new": NEXT_UPDATED_AT,
      },
    };
    actionMocks.createAdminServiceClient.mockReturnValue({
      rpc: vi.fn(async () => ({ data: { versions: returned }, error: null })),
    });

    const state = await saveGallerySectionV2(
      INITIAL_GALLERY_SAVE_STATE,
      sectionForm("frames", payload, baseline)
    );

    expect(state).toMatchObject({
      status: "saved",
      section: "frames",
      versions: returned,
    });
  });

  it("rejects a save response with missing or extra frame versions", async () => {
    actionMocks.createAdminServiceClient.mockReturnValue({
      rpc: vi.fn(async () => ({
        data: {
          versions: {
            items: {
              "gallery:portrait-01": NEXT_UPDATED_AT,
              "gallery:ghost": NEXT_UPDATED_AT,
            },
          },
        },
        error: null,
      })),
    });

    const state = await saveGallerySectionV2(
      INITIAL_GALLERY_SAVE_STATE,
      sectionForm("frames", frames, {
        items: { "gallery:portrait-01": UPDATED_AT },
      })
    );

    expect(state.status).toBe("error");
    expect(actionMocks.writeAuditLog).not.toHaveBeenCalled();
  });

  it("blocks an invalid origin before creating the write client", async () => {
    actionMocks.verifyOrigin.mockResolvedValue(false);

    const state = await saveGallerySectionV2(
      INITIAL_GALLERY_SAVE_STATE,
      sectionForm("introduction", introduction, { updatedAt: UPDATED_AT })
    );

    expect(state.status).toBe("security-error");
    expect(actionMocks.createAdminServiceClient).not.toHaveBeenCalled();
  });

  it("keeps a draft intact when another admin saved first", async () => {
    actionMocks.createAdminServiceClient.mockReturnValue({
      rpc: vi.fn(async () => ({
        data: null,
        error: { code: "40001", message: "gallery_frames_changed" },
      })),
    });

    const state = await saveGallerySectionV2(
      INITIAL_GALLERY_SAVE_STATE,
      sectionForm("frames", frames, {
        items: { "gallery:portrait-01": UPDATED_AT },
      })
    );

    expect(state.status).toBe("conflict");
    expect(actionMocks.writeAuditLog).not.toHaveBeenCalled();
    expect(actionMocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("reports migration 0031 when a Gallery RPC is absent", async () => {
    actionMocks.createAdminServiceClient.mockReturnValue({
      rpc: vi.fn(async () => ({
        data: null,
        error: {
          code: "PGRST202",
          message:
            "Could not find public.save_gallery_introduction_v2 in the schema cache",
        },
      })),
    });

    const state = await saveGallerySectionV2(
      INITIAL_GALLERY_SAVE_STATE,
      sectionForm("introduction", introduction, { updatedAt: UPDATED_AT })
    );

    expect(state.status).toBe("migration-required");
  });

  it("rejects HOME story fields before database access", async () => {
    const state = await saveGallerySectionV2(
      INITIAL_GALLERY_SAVE_STATE,
      sectionForm(
        "frames",
        {
          items: [{ ...frames.items[0], isFreelanceStory: true }],
        },
        { items: { "gallery:portrait-01": UPDATED_AT } }
      )
    );

    expect(state.status).toBe("invalid");
    expect(actionMocks.createAdminServiceClient).not.toHaveBeenCalled();
  });
});

describe("Admin V2 Gallery loader", () => {
  it("recognises only Gallery-specific missing schema errors", () => {
    expect(
      isMissingGalleryEditorSchemaError({
        code: "23503",
        message: "gallery_page_snapshot_missing",
      })
    ).toBe(true);
    expect(
      isMissingGalleryEditorSchemaError({
        code: "42883",
        message: "function pg_catalog.some_internal_function does not exist",
      })
    ).toBe(false);
  });

  it("authenticates before creating its service-role snapshot client", async () => {
    actionMocks.requireAdmin.mockRejectedValueOnce(new Error("unauthorized"));
    actionMocks.createAdminServiceClient.mockReturnValue({ rpc: vi.fn() });

    await expect(getAdminGalleryEditorData()).rejects.toThrow("unauthorized");
    expect(actionMocks.createAdminServiceClient).not.toHaveBeenCalled();
  });
});

describe("Batch 6B Gallery migration contract", () => {
  it("splits dual-use Gallery/HOME rows deterministically without deleting", () => {
    expect(migrationSql).toContain(
      "'gallery-v2:' || pg_catalog.md5(image.id)"
    );
    expect(migrationSql).toContain("where image.is_mosaic = true");
    expect(migrationSql).toContain("and image.is_freelance_story = true");
    expect(migrationSql).toContain("set is_mosaic = false");
    expect(migrationSql).toContain("gallery_images_single_page_owner_check");
    expect(migrationSql).toContain("check (not (is_mosaic and is_freelance_story))");
    expect(migrationSql).not.toMatch(/delete\s+from\s+public[.]gallery_images/i);
  });

  it("keeps snapshots and frame saves outside HOME story ownership", () => {
    expect(migrationSql).toContain("where image.is_freelance_story = false");
    expect(migrationSql).toContain("is_freelance_story = false");
    expect(migrationSql).toContain("freelance_story_order = 0");
    expect(migrationSql).toContain("lock table public.gallery_images");
    expect(migrationSql).toContain("p_expected_versions ->> current_image.id");
  });

  it("exposes only the four service-role Gallery RPCs", () => {
    for (const name of [
      "get_gallery_page_v2_snapshot",
      "save_gallery_hero_v2",
      "save_gallery_introduction_v2",
      "save_gallery_frames_v2",
    ]) {
      expect(migrationSql).toContain(`function public.${name}`);
    }
    expect(migrationSql.match(/security definer/g)).toHaveLength(4);
    expect(migrationSql.match(/set search_path = ''/g)).toHaveLength(4);
    expect(migrationSql.match(/to service_role;/g)).toHaveLength(4);
  });
});
