import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveMusicSectionV2 } from "@/app/admin/v2/pages/music/actions";
import {
  getAdminMusicEditorData,
  isMissingMusicEditorSchemaError,
} from "@/lib/admin/music";
import { INITIAL_MUSIC_SAVE_STATE } from "@/lib/admin/music-editor";

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

const SETTINGS_UPDATED_AT = "2026-09-02T10:00:00.000Z";
const PRESENTATION_UPDATED_AT = "2026-09-02T10:01:00.000Z";

const spotifyPayload = {
  releasesHeading: "LATEST RELEASES",
  artistUrl: "https://open.spotify.com/artist/1234567890",
  embedUrl: "https://open.spotify.com/embed/artist/1234567890",
};

const spotifyVersions = {
  settingsUpdatedAt: SETTINGS_UPDATED_AT,
  presentationUpdatedAt: PRESENTATION_UPDATED_AT,
};

function validSpotifyForm(
  overrides: Partial<Record<"section" | "payload" | "versions", string>> = {}
) {
  const formData = new FormData();
  formData.set("section", overrides.section ?? "spotify");
  formData.set(
    "payload",
    overrides.payload ?? JSON.stringify(spotifyPayload)
  );
  formData.set(
    "versions",
    overrides.versions ?? JSON.stringify(spotifyVersions)
  );
  return formData;
}

function sectionForm(
  section: string,
  payload: unknown,
  versions: unknown
) {
  const formData = new FormData();
  formData.set("section", section);
  formData.set("payload", JSON.stringify(payload));
  formData.set("versions", JSON.stringify(versions));
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  actionMocks.verifyOrigin.mockResolvedValue(true);
  actionMocks.requireAdmin.mockResolvedValue({
    id: "admin-id",
    email: "admin@example.com",
  });
});

describe("Admin V2 Music section action", () => {
  it("authenticates before opening a service-role client", async () => {
    actionMocks.requireAdmin.mockRejectedValueOnce(new Error("unauthorized"));
    actionMocks.createAdminServiceClient.mockReturnValue({ rpc: vi.fn() });

    await expect(
      saveMusicSectionV2(INITIAL_MUSIC_SAVE_STATE, validSpotifyForm())
    ).rejects.toThrow("unauthorized");
    expect(actionMocks.createAdminServiceClient).not.toHaveBeenCalled();
  });

  it("saves only the active section, audits it, and revalidates preview and public output", async () => {
    const rpc = vi.fn(async () => ({
      data: { versions: spotifyVersions },
      error: null,
    }));
    actionMocks.createAdminServiceClient.mockReturnValue({ rpc });

    const state = await saveMusicSectionV2(
      INITIAL_MUSIC_SAVE_STATE,
      validSpotifyForm()
    );

    expect(state).toMatchObject({
      status: "saved",
      section: "spotify",
      versions: spotifyVersions,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("save_music_spotify_v2", {
      p_site_id: "main",
      p_expected_settings_updated_at: SETTINGS_UPDATED_AT,
      p_expected_presentation_updated_at: PRESENTATION_UPDATED_AT,
      p_payload: spotifyPayload,
    });
    expect(actionMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "admin-id",
        action: "music_v2_spotify_save",
        recordId: "main",
      })
    );
    expect(actionMocks.revalidatePath).toHaveBeenCalledWith("/music");
    expect(actionMocks.revalidatePath).toHaveBeenCalledWith(
      "/admin/v2/pages/music"
    );
  });

  it.each([
    {
      section: "hero",
      rpcName: "save_music_hero_v2",
      payload: {
        title: "MUSIC",
        subtitle: "Latest releases and mixes.",
        ctaLabel: "Explore",
        ctaHref: "#spotify-releases",
        backgroundSrc: "/images/music-hero.webp",
        posterSrc: "",
        mediaType: "image",
      },
      versions: { updatedAt: SETTINGS_UPDATED_AT },
      expectedArgs: {
        p_site_id: "main",
        p_expected_updated_at: SETTINGS_UPDATED_AT,
      },
    },
    {
      section: "platforms",
      rpcName: "save_music_platforms_v2",
      payload: {
        items: [
          {
            id: "spotify",
            title: "Spotify",
            label: "Listen on Spotify",
            href: "https://open.spotify.com/artist/1234567890",
            imageSrc: "/images/platforms/spotify.webp",
            iconKey: "spotify",
            isPublished: true,
          },
        ],
      },
      versions: { items: { spotify: SETTINGS_UPDATED_AT } },
      expectedArgs: {
        p_site_id: "main",
        p_expected_versions: { spotify: SETTINGS_UPDATED_AT },
      },
    },
    {
      section: "soundcloud",
      rpcName: "save_music_soundcloud_v2",
      payload: {
        mixesHeading: "LATEST MIXES",
        items: [
          {
            id: "mix-01",
            title: "Late Night Mix",
            embedUrl:
              "https://api.soundcloud.com/tracks/soundcloud:tracks:1234567890",
            isPublished: true,
          },
        ],
      },
      versions: {
        presentationUpdatedAt: PRESENTATION_UPDATED_AT,
        items: { "mix-01": SETTINGS_UPDATED_AT },
      },
      expectedArgs: {
        p_site_id: "main",
        p_expected_presentation_updated_at: PRESENTATION_UPDATED_AT,
        p_expected_versions: { "mix-01": SETTINGS_UPDATED_AT },
      },
    },
  ])(
    "routes a $section draft to its section-only RPC",
    async ({ section, rpcName, payload, versions, expectedArgs }) => {
      const rpc = vi.fn(async () => ({ data: { versions }, error: null }));
      actionMocks.createAdminServiceClient.mockReturnValue({ rpc });

      const state = await saveMusicSectionV2(
        INITIAL_MUSIC_SAVE_STATE,
        sectionForm(section, payload, versions)
      );

      expect(state).toMatchObject({ status: "saved", section, versions });
      expect(rpc).toHaveBeenCalledWith(rpcName, {
        ...expectedArgs,
        p_payload: payload,
      });
    }
  );

  it("accepts a new platform while keeping optimistic versions for saved rows", async () => {
    const payload = {
      items: [
        {
          id: "spotify",
          title: "Spotify",
          label: "Listen on Spotify",
          href: "https://open.spotify.com/artist/1234567890",
          imageSrc: "/images/platforms/spotify.webp",
          iconKey: "spotify",
          isPublished: true,
        },
        {
          id: "platform:new-youtube",
          title: "YouTube",
          label: "Watch on YouTube",
          href: "https://youtube.com/@example",
          imageSrc: "/images/platforms/youtube.webp",
          iconKey: "youtube",
          isPublished: true,
        },
      ],
    };
    const baselineVersions = { items: { spotify: SETTINGS_UPDATED_AT } };
    const savedVersions = {
      items: {
        spotify: PRESENTATION_UPDATED_AT,
        "platform:new-youtube": PRESENTATION_UPDATED_AT,
      },
    };
    const rpc = vi.fn(async () => ({
      data: { versions: savedVersions },
      error: null,
    }));
    actionMocks.createAdminServiceClient.mockReturnValue({ rpc });

    const state = await saveMusicSectionV2(
      INITIAL_MUSIC_SAVE_STATE,
      sectionForm("platforms", payload, baselineVersions)
    );

    expect(state).toMatchObject({
      status: "saved",
      section: "platforms",
      versions: savedVersions,
    });
    expect(rpc).toHaveBeenCalledWith("save_music_platforms_v2", {
      p_site_id: "main",
      p_expected_versions: baselineVersions.items,
      p_payload: payload,
    });
  });

  it("rejects a collection save response that omits the new row version", async () => {
    const payload = {
      items: [
        {
          id: "spotify",
          title: "Spotify",
          label: "",
          href: "https://open.spotify.com/artist/1234567890",
          imageSrc: "/images/platforms/spotify.webp",
          iconKey: "spotify",
          isPublished: true,
        },
        {
          id: "platform:new",
          title: "YouTube",
          label: "",
          href: "https://youtube.com/@example",
          imageSrc: "/images/platforms/youtube.webp",
          iconKey: "youtube",
          isPublished: true,
        },
      ],
    };
    const baselineVersions = { items: { spotify: SETTINGS_UPDATED_AT } };
    actionMocks.createAdminServiceClient.mockReturnValue({
      rpc: vi.fn(async () => ({
        data: { versions: baselineVersions },
        error: null,
      })),
    });

    const state = await saveMusicSectionV2(
      INITIAL_MUSIC_SAVE_STATE,
      sectionForm("platforms", payload, baselineVersions)
    );

    expect(state.status).toBe("error");
    expect(actionMocks.writeAuditLog).not.toHaveBeenCalled();
  });

  it("keeps the draft intact when another admin saved first", async () => {
    actionMocks.createAdminServiceClient.mockReturnValue({
      rpc: vi.fn(async () => ({
        data: null,
        error: { code: "40001", message: "music_editor_changed" },
      })),
    });

    const state = await saveMusicSectionV2(
      INITIAL_MUSIC_SAVE_STATE,
      validSpotifyForm()
    );

    expect(state.status).toBe("conflict");
    expect(actionMocks.writeAuditLog).not.toHaveBeenCalled();
    expect(actionMocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("reports a missing section RPC as migration 0029 being required", async () => {
    actionMocks.createAdminServiceClient.mockReturnValue({
      rpc: vi.fn(async () => ({
        data: null,
        error: {
          code: "PGRST202",
          message:
            "Could not find public.save_music_spotify_v2 in the schema cache",
        },
      })),
    });

    const state = await saveMusicSectionV2(
      INITIAL_MUSIC_SAVE_STATE,
      validSpotifyForm()
    );

    expect(state.status).toBe("migration-required");
    expect(actionMocks.writeAuditLog).not.toHaveBeenCalled();
    expect(actionMocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("does not mistake an unrelated undefined SQL function for a missing migration", async () => {
    actionMocks.createAdminServiceClient.mockReturnValue({
      rpc: vi.fn(async () => ({
        data: null,
        error: {
          code: "42883",
          message:
            "function pg_catalog.some_missing_internal_function(jsonb) does not exist",
        },
      })),
    });

    const state = await saveMusicSectionV2(
      INITIAL_MUSIC_SAVE_STATE,
      validSpotifyForm()
    );

    expect(state.status).toBe("error");
  });

  it("blocks an invalid origin before creating a write client", async () => {
    actionMocks.verifyOrigin.mockResolvedValue(false);

    const state = await saveMusicSectionV2(
      INITIAL_MUSIC_SAVE_STATE,
      validSpotifyForm()
    );

    expect(state.status).toBe("security-error");
    expect(actionMocks.createAdminServiceClient).not.toHaveBeenCalled();
    expect(actionMocks.writeAuditLog).not.toHaveBeenCalled();
  });

  it("rejects technical fields before authentication or database access", async () => {
    const state = await saveMusicSectionV2(
      INITIAL_MUSIC_SAVE_STATE,
      validSpotifyForm({
        payload: JSON.stringify({ ...spotifyPayload, sortOrder: 20 }),
      })
    );

    expect(state.status).toBe("invalid");
    expect(actionMocks.requireAdmin).not.toHaveBeenCalled();
    expect(actionMocks.createAdminServiceClient).not.toHaveBeenCalled();
  });
});

describe("Admin V2 Music loader", () => {
  it("treats the missing Music hero prerequisite as a migration repair", () => {
    expect(
      isMissingMusicEditorSchemaError({
        code: "23503",
        message: "music_page_snapshot_missing",
      })
    ).toBe(true);
    expect(
      isMissingMusicEditorSchemaError({
        code: "23503",
        message: "some_other_foreign_key_error",
      })
    ).toBe(false);
  });

  it("checks admin access before creating its service-role read client", async () => {
    actionMocks.requireAdmin.mockRejectedValueOnce(new Error("unauthorized"));
    actionMocks.createAdminServiceClient.mockReturnValue({ rpc: vi.fn() });

    await expect(getAdminMusicEditorData()).rejects.toThrow("unauthorized");
    expect(actionMocks.createAdminServiceClient).not.toHaveBeenCalled();
  });
});
