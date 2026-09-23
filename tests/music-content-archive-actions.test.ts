import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadMusicContentArchivePage, mutateMusicContentArchive } from "@/app/admin/v2/pages/music/archive-actions";
import { getMusicContentArchiveData } from "@/lib/admin/music-content-archive";
import { getAdminMusicEditorData } from "@/lib/admin/music";
import { createFallbackMusicEditorSnapshot } from "@/lib/admin/music-editor";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), origin: vi.fn(), service: vi.fn(), audit: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.admin }));
vi.mock("@/lib/admin/action-security", () => ({ verifyAdminActionOrigin: mocks.origin }));
vi.mock("@/lib/admin/service", () => ({ createAdminServiceClient: mocks.service, hasAdminServiceEnv: vi.fn(() => true) }));
vi.mock("@/lib/admin/audit", () => ({ writeAuditLog: mocks.audit }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

const version = "2026-09-21T10:15:30.123456+00:00";
const archiveVersion = "2026-09-21T10:16:30.654321+00:00";
const platform = { id: "spotify.artist-1", title: "Spotify artist", label: "Listen now", href: "https://open.spotify.com/artist/artist-1", imageSrc: "/images/spotify.webp", iconKey: "spotify", isPublished: true };
const track = { id: "mix-1", title: "Live set", embedUrl: "https://soundcloud.com/artist/live-set", isPublished: true };
const archivedItem = { id: platform.id, label: platform.title, platform: "spotify", archivedAt: archiveVersion, updatedAt: archiveVersion };
const page = { items: [archivedItem], total: 1, offset: 0 };
const emptyPage = { items: [], total: 0, offset: 0 };
const archiveInput = { section: "platforms", operation: "archive", itemId: platform.id, expectedVersions: { items: { [platform.id]: version } } };
const restoreInput = { section: "platforms", operation: "restore", itemId: platform.id, expectedVersions: { items: {} }, expectedArchiveUpdatedAt: archiveVersion };
const archiveSuccess = { outcome: "archived", section: "platforms", canonicalSection: { items: [] }, versions: { items: {} }, archive: page };
const restoreSuccess = { outcome: "restored", section: "platforms", canonicalSection: { items: [{ ...platform, isPublished: false }] }, versions: { items: { [platform.id]: archiveVersion } }, archive: emptyPage };

function rpcResponse(data: unknown, error: unknown = null) {
  const result = Promise.resolve({ data, error });
  return Object.assign(result, { abortSignal: vi.fn().mockReturnValue(result) });
}

function withRpcResult(data: unknown, error: unknown = null) {
  const response = rpcResponse(data, error);
  // Existing archive fixtures represent a database before additive 0051.
  const rpc = vi.fn().mockImplementation((name: string) => name === "get_photo_editor_with_framing_v2"
    ? rpcResponse(null, { code: "PGRST202", message: "get_photo_editor_with_framing_v2 missing" }) : response);
  mocks.service.mockReturnValue({ rpc });
  return { rpc, response };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.admin.mockResolvedValue({ id: "verified-admin" });
  mocks.origin.mockResolvedValue(true);
  mocks.audit.mockResolvedValue({ ok: true });
});

describe("Music archive read boundary", () => {
  it.each([getMusicContentArchiveData, loadMusicContentArchivePage])("authenticates before privileged reads, even for invalid sections", async (load) => {
    mocks.admin.mockRejectedValue(new Error("unauthorized"));
    await expect(load("platforms", 0)).rejects.toThrow("unauthorized");
    expect(mocks.service).not.toHaveBeenCalled();
  });

  it.each(["platforms", "soundcloud"] as const)("loads only the requested bounded %s archive page with a timeout", async (section) => {
    const laterPage = { ...page, total: 21, offset: 20 };
    const { rpc, response } = withRpcResult(laterPage);
    expect(await getMusicContentArchiveData(section, 20)).toMatchObject({ available: true, page: laterPage });
    expect(rpc).toHaveBeenCalledWith("get_music_content_archive_v2", { p_section: section, p_offset: 20 });
    expect(response.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(mocks.admin.mock.invocationCallOrder[0]).toBeLessThan(mocks.service.mock.invocationCallOrder[0]);
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it.each([-20, 1, 20.5, 1_000_020, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid offsets before service access: %s", async (offset) => {
    expect(await loadMusicContentArchivePage("platforms", offset)).toMatchObject({ available: false });
    expect(mocks.admin).toHaveBeenCalled();
    expect(mocks.service).not.toHaveBeenCalled();
  });

  it.each(["hero", "spotify", "social_links", "../media"])("rejects an unsupported section before service access: %s", async (section) => {
    expect(await getMusicContentArchiveData(section, 0)).toMatchObject({ available: false });
    expect(mocks.service).not.toHaveBeenCalled();
  });

  it("does not display a different returned page as the requested page", async () => {
    withRpcResult(page);
    expect(await getMusicContentArchiveData("platforms", 20)).toMatchObject({ available: false });
  });

  it("keeps the existing Music editor available before migration 0042", async () => {
    const snapshot = createFallbackMusicEditorSnapshot();
    const raw = {
      hero: { ...snapshot.draft.hero, ...snapshot.versions.hero },
      spotify: { ...snapshot.draft.spotify, ...snapshot.versions.spotify },
      platforms: snapshot.draft.platforms.items.map((item) => ({ ...item, updatedAt: snapshot.versions.platforms.items[item.id] })),
      soundcloud: { mixesHeading: snapshot.draft.soundcloud.mixesHeading, presentationUpdatedAt: snapshot.versions.soundcloud.presentationUpdatedAt,
        tracks: snapshot.draft.soundcloud.items.map((item) => ({ ...item, updatedAt: snapshot.versions.soundcloud.items[item.id] })) },
      footer: snapshot.footer,
    };
    const rpc = vi.fn((name: string) => name === "get_music_content_archive_v2"
      ? rpcResponse(null, { code: "PGRST202", message: "secret-schema-details" }) : rpcResponse(raw));
    mocks.service.mockReturnValue({ rpc });
    const archive = await getMusicContentArchiveData("platforms");
    expect(archive).toMatchObject({ available: false });
    expect(archive.message).toContain("0042");
    expect(JSON.stringify(archive)).not.toContain("secret-schema-details");
    expect(await getAdminMusicEditorData()).toMatchObject({ isConfigured: true, migrationRequired: false, snapshot });
  });

  it.each([null, {}, { ...page, items: [{ ...archivedItem, updatedAt: "invalid" }] }])("fails closed on malformed archive pages: %j", async (data) => {
    withRpcResult(data);
    expect(await getMusicContentArchiveData("soundcloud")).toMatchObject({ available: false });
  });

  it("does not leak rejected read details", async () => {
    mocks.service.mockReturnValue({ rpc: vi.fn().mockReturnValue({ abortSignal: vi.fn().mockRejectedValue(new Error("private-database-host")) }) });
    const result = await getMusicContentArchiveData("platforms");
    expect(result.available).toBe(false);
    expect(JSON.stringify(result)).not.toContain("private-database-host");
  });

  it("does not report an empty healthy archive when service access is unavailable", async () => {
    mocks.service.mockReturnValue(null);
    expect(await getMusicContentArchiveData("platforms")).toMatchObject({ available: false });
  });
});

describe("Music archive mutation boundary", () => {
  it("authenticates even malformed input before origin or service access", async () => {
    mocks.admin.mockRejectedValue(new Error("unauthorized"));
    await expect(mutateMusicContentArchive(null)).rejects.toThrow("unauthorized");
    expect(mocks.origin).not.toHaveBeenCalled();
    expect(mocks.service).not.toHaveBeenCalled();
  });

  it("blocks cross-origin writes before service access", async () => {
    mocks.origin.mockResolvedValue(false);
    expect(await mutateMusicContentArchive(archiveInput)).toMatchObject({ ok: false });
    expect(mocks.service).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it.each([
    { ...archiveInput, actorId: "intruder" },
    { ...archiveInput, section: "media_assets" },
    { ...archiveInput, operation: "purge" },
    { ...archiveInput, expectedVersions: { items: {} } },
    { ...archiveInput, section: "soundcloud" },
    { ...restoreInput, expectedArchiveUpdatedAt: undefined },
    { ...archiveInput, expectedVersions: { items: JSON.parse(`{"${platform.id}":"${version}","__proto__":"${version}"}`) as unknown } },
  ])("rejects untrusted envelopes before mutation: %j", async (input) => {
    expect(await mutateMusicContentArchive(input)).toMatchObject({ ok: false });
    expect(mocks.service).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("archives atomically with a verified actor and exact active CAS map", async () => {
    const { rpc } = withRpcResult(archiveSuccess);
    expect(await mutateMusicContentArchive(archiveInput)).toMatchObject({ ok: true, section: "platforms", canonicalSection: { items: [] }, versions: { items: {} }, archive: page });
    expect(rpc).toHaveBeenCalledWith("mutate_music_content_archive_v2", {
      p_section: "platforms", p_operation: "archive", p_item_id: platform.id,
      p_expected_versions: archiveInput.expectedVersions.items, p_actor_id: "verified-admin",
      p_expected_presentation_updated_at: null, p_expected_archive_updated_at: null,
    });
    expect(mocks.admin.mock.invocationCallOrder[0]).toBeLessThan(mocks.origin.mock.invocationCallOrder[0]);
    expect(mocks.origin.mock.invocationCallOrder[0]).toBeLessThan(mocks.service.mock.invocationCallOrder[0]);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ actorId: "verified-admin", tableName: "music_platform_links", recordId: platform.id }));
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain(platform.href);
    expect(mocks.revalidate).toHaveBeenCalledWith("/", "layout");
    for (const path of ["/music", "/admin/v2/pages/music", "/admin/v2/media"]) expect(mocks.revalidate).toHaveBeenCalledWith(path);
  });

  it("restores a platform only as hidden and uses its archive timestamp", async () => {
    const { rpc } = withRpcResult(restoreSuccess);
    expect(await mutateMusicContentArchive(restoreInput)).toMatchObject({ ok: true, section: "platforms", canonicalSection: restoreSuccess.canonicalSection, versions: restoreSuccess.versions, archive: emptyPage });
    expect(rpc).toHaveBeenCalledWith("mutate_music_content_archive_v2", {
      p_section: "platforms", p_operation: "restore", p_item_id: platform.id, p_expected_versions: {},
      p_actor_id: "verified-admin", p_expected_presentation_updated_at: null, p_expected_archive_updated_at: archiveVersion,
    });
  });

  it.each(["archive", "restore"] as const)("preserves SoundCloud presentation and only changes its target collection on %s", async (operation) => {
    const items = operation === "archive" ? [] : [{ ...track, isPublished: false }];
    const response = { outcome: operation === "archive" ? "archived" : "restored", section: "soundcloud", canonicalSection: { mixesHeading: "LIVE MIXES", items },
      versions: { presentationUpdatedAt: version, items: operation === "archive" ? {} : { [track.id]: archiveVersion } },
      archive: operation === "archive" ? { ...page, items: [{ ...archivedItem, id: track.id, platform: "soundcloud" }] } : emptyPage };
    const { rpc } = withRpcResult(response);
    const input = { section: "soundcloud", operation, itemId: track.id,
      expectedVersions: { items: operation === "archive" ? { [track.id]: version } : {}, presentationUpdatedAt: version },
      ...(operation === "restore" ? { expectedArchiveUpdatedAt: archiveVersion } : {}) };
    expect(await mutateMusicContentArchive(input)).toMatchObject({ ok: true, section: "soundcloud", canonicalSection: response.canonicalSection, versions: response.versions, archive: response.archive });
    expect(rpc).toHaveBeenCalledWith("mutate_music_content_archive_v2", {
      p_section: "soundcloud", p_operation: operation, p_item_id: track.id, p_expected_versions: input.expectedVersions.items,
      p_actor_id: "verified-admin", p_expected_presentation_updated_at: version,
      p_expected_archive_updated_at: operation === "restore" ? archiveVersion : null,
    });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ tableName: "soundcloud_tracks", recordId: track.id }));
  });

  it.each(["conflict", "missing", "id_in_use"])("requires a reload for %s without a success audit", async (outcome) => {
    withRpcResult({ outcome });
    expect(await mutateMusicContentArchive(restoreInput)).toMatchObject({ ok: false, reloadRequired: true });
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("treats full capacity as a benign refusal", async () => {
    withRpcResult({ outcome: "capacity" });
    const result = await mutateMusicContentArchive(restoreInput);
    expect(result.ok).toBe(false);
    expect(result.reloadRequired).not.toBe(true);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it.each([
    null, {}, [], { outcome: "unexpected" },
    { ...archiveSuccess, outcome: "restored" },
    { ...archiveSuccess, section: "soundcloud" },
    { ...archiveSuccess, canonicalSection: { items: [platform] }, versions: archiveInput.expectedVersions },
    { ...archiveSuccess, canonicalSection: { items: [{ invalid: true }] } },
    { ...archiveSuccess, versions: archiveInput.expectedVersions },
    { ...archiveSuccess, archive: { ...page, total: 21, offset: 20 } },
    { ...archiveSuccess, archive: { ...page, items: [archivedItem, archivedItem], total: 2 } },
  ])("requires reload after an unconfirmed archive response: %j", async (data) => {
    withRpcResult(data);
    expect(await mutateMusicContentArchive(archiveInput)).toMatchObject({ ok: false, reloadRequired: true });
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it.each([
    { ...restoreSuccess, canonicalSection: { items: [platform] } },
    { ...restoreSuccess, canonicalSection: { items: [] }, versions: { items: {} } },
    { ...restoreSuccess, archive: page },
    { ...restoreSuccess, outcome: "archived" },
    { ...restoreSuccess, section: "soundcloud" },
    { ...restoreSuccess, versions: { items: {} } },
  ])("never reports restoration unless the exact target is active, hidden and absent from the archive: %j", async (data) => {
    withRpcResult(data);
    expect(await mutateMusicContentArchive(restoreInput)).toMatchObject({ ok: false, reloadRequired: true });
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("rejects a response that silently drops an unrelated saved survivor", async () => {
    withRpcResult(archiveSuccess);
    expect(await mutateMusicContentArchive({ ...archiveInput, expectedVersions: { items: { ...archiveInput.expectedVersions.items, survivor: version } } })).toMatchObject({ ok: false, reloadRequired: true });
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("rejects a response that injects an unrelated active identity", async () => {
    withRpcResult({ ...archiveSuccess, canonicalSection: { items: [{ ...platform, id: "injected" }] }, versions: { items: { injected: version } } });
    expect(await mutateMusicContentArchive(archiveInput)).toMatchObject({ ok: false, reloadRequired: true });
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("never automatically retries an ambiguous mutation transport failure", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("secret-network-token"));
    mocks.service.mockReturnValue({ rpc });
    const result = await mutateMusicContentArchive(archiveInput);
    expect(result).toMatchObject({ ok: false, reloadRequired: true });
    expect(result.message).not.toContain("secret-network-token");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it.each(["08006", "40001"])("fails safely on database error %s without leaking details", async (code) => {
    withRpcResult(null, { code, message: "secret-password", details: "private-host" });
    const result = await mutateMusicContentArchive(archiveInput);
    expect(result).toMatchObject({ ok: false, reloadRequired: true });
    expect(JSON.stringify(result)).not.toMatch(/secret-password|private-host/);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it.each(["PGRST202", "42883"])("explains migration 0042 without treating unavailable RPC %s as a committed write", async (code) => {
    withRpcResult(null, { code, message: "private-schema-details" });
    const result = await mutateMusicContentArchive(archiveInput);
    expect(result.ok).toBe(false);
    expect(result.reloadRequired).not.toBe(true);
    expect(result.message).toContain("0042");
    expect(result.message).not.toContain("private-schema-details");
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("never reports success when no service client is available", async () => {
    mocks.service.mockReturnValue(null);
    expect(await mutateMusicContentArchive(archiveInput)).toMatchObject({ ok: false });
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("preserves confirmed success and warns if only audit logging is unavailable", async () => {
    withRpcResult(archiveSuccess);
    mocks.audit.mockResolvedValue({ ok: false });
    const result = await mutateMusicContentArchive(archiveInput);
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/audit/i);
    expect(mocks.revalidate).toHaveBeenCalledWith("/music");
  });
});
