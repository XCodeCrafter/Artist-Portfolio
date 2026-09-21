import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadVisualContentArchivePage, mutateVisualContentArchive } from "@/app/admin/v2/content-archive-actions";
import { getVisualContentArchiveData } from "@/lib/admin/visual-content-archive";
import { getAdminGalleryEditorData } from "@/lib/admin/gallery";
import { getAdminShowreelEditorData } from "@/lib/admin/showreel";
import { createFallbackGalleryEditorSnapshot } from "@/lib/admin/gallery-editor";
import { createFallbackShowreelEditorSnapshot } from "@/lib/admin/showreel-editor";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), origin: vi.fn(), service: vi.fn(), audit: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.admin }));
vi.mock("@/lib/admin/action-security", () => ({ verifyAdminActionOrigin: mocks.origin }));
vi.mock("@/lib/admin/service", () => ({ createAdminServiceClient: mocks.service, hasAdminServiceEnv: vi.fn(() => true) }));
vi.mock("@/lib/admin/audit", () => ({ writeAuditLog: mocks.audit }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

const version = "2026-09-21T10:15:30.123456+00:00";
const archiveVersion = "2026-09-21T10:16:30.654321+00:00";
const frame = { id: "frame-1", title: "Private title", src: "/images/stage.webp", alt: "Live set", caption: "At the club", category: "music", isMosaic: true, isPublished: true };
const work = { id: "legacy / Živě 01", title: "Private title", description: "Showreel", embedUrl: "https://www.youtube.com/watch?v=abc123", platform: "youtube", thumbnailSrc: "/images/stage.webp", videoType: "showreel", isFeatured: false, isPublished: true };
const archivedItem = { id: frame.id, label: frame.title, platform: "gallery", archivedAt: archiveVersion, updatedAt: archiveVersion };
const page = { items: [archivedItem], total: 1, offset: 0, activeLimit: 120 };
const emptyPage = { items: [], total: 0, offset: 0, activeLimit: 120 };
const archiveInput = { collection: "gallery", operation: "archive", itemId: frame.id, expectedVersions: { items: { [frame.id]: version } } };
const restoreInput = { collection: "gallery", operation: "restore", itemId: frame.id, expectedVersions: { items: {} }, expectedArchiveUpdatedAt: archiveVersion };
const archiveSuccess = { outcome: "archived", collection: "gallery", section: "frames", canonicalSection: { items: [] }, versions: { items: {} }, archive: page };
const restoreSuccess = { outcome: "restored", collection: "gallery", section: "frames", canonicalSection: { items: [{ ...frame, isPublished: false }] }, versions: { items: { [frame.id]: archiveVersion } }, archive: emptyPage };

function rpcResponse(data: unknown, error: unknown = null) {
  const result = Promise.resolve({ data, error });
  return Object.assign(result, { abortSignal: vi.fn().mockReturnValue(result) });
}

function withRpcResult(data: unknown, error: unknown = null) {
  const response = rpcResponse(data, error);
  const rpc = vi.fn().mockReturnValue(response);
  mocks.service.mockReturnValue({ rpc });
  return { rpc, response };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.admin.mockResolvedValue({ id: "verified-admin" });
  mocks.origin.mockResolvedValue(true);
  mocks.audit.mockResolvedValue({ ok: true });
});

describe("Visual archive read boundary", () => {
  it.each([getVisualContentArchiveData, loadVisualContentArchivePage])("authenticates before privileged reads even for invalid collections", async (load) => {
    mocks.admin.mockRejectedValue(new Error("unauthorized"));
    await expect(load("invalid", 0)).rejects.toThrow("unauthorized");
    expect(mocks.service).not.toHaveBeenCalled();
  });

  it.each(["gallery", "showreel"] as const)("loads a bounded %s archive page with a read timeout", async (collection) => {
    const laterPage = { ...page, total: 21, offset: 20, activeLimit: collection === "showreel" ? 143 : 120 };
    const { rpc, response } = withRpcResult(laterPage);
    expect(await getVisualContentArchiveData(collection, 20)).toMatchObject({ available: true, page: laterPage });
    expect(rpc).toHaveBeenCalledWith("get_visual_content_archive_v2", { p_collection: collection, p_offset: 20 });
    expect(response.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(mocks.admin.mock.invocationCallOrder[0]).toBeLessThan(mocks.service.mock.invocationCallOrder[0]);
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it.each([-20, 1, 20.5, 1_000_020, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid offsets before privileged access: %s", async (offset) => {
    expect(await loadVisualContentArchivePage("gallery", offset)).toMatchObject({ available: false });
    expect(mocks.admin).toHaveBeenCalled();
    expect(mocks.service).not.toHaveBeenCalled();
  });

  it.each(["frames", "works", "videos", "gallery_images", "../media"])("rejects unsupported collections: %s", async (collection) => {
    expect(await getVisualContentArchiveData(collection)).toMatchObject({ available: false });
    expect(mocks.service).not.toHaveBeenCalled();
  });

  it("does not display an unexpected page as the requested one", async () => {
    withRpcResult(page);
    expect(await getVisualContentArchiveData("gallery", 20)).toMatchObject({ available: false });
  });

  it.each(["gallery", "showreel"] as const)("keeps ordinary %s editing readable before migration 0044", async (collection) => {
    const gallery = createFallbackGalleryEditorSnapshot();
    const showreel = createFallbackShowreelEditorSnapshot();
    const rawGallery = { hero: { ...gallery.draft.hero, ...gallery.versions.hero },
      introduction: { ...gallery.draft.introduction, ...gallery.versions.introduction },
      frames: { items: gallery.draft.frames.items.map((item) => ({ ...item, updatedAt: gallery.versions.frames.items[item.id] })) }, footer: gallery.footer };
    const rawShowreel = { hero: { ...showreel.draft.hero, ...showreel.versions.hero },
      introduction: { ...showreel.draft.introduction, ...showreel.versions.introduction },
      works: { items: showreel.draft.works.items.map((item) => ({ ...item, updatedAt: showreel.versions.works.items[item.id] })) }, footer: showreel.footer };
    const rpc = vi.fn((name: string) => name === "get_visual_content_archive_v2"
      ? rpcResponse(null, { code: "PGRST202", message: "secret-schema-details" }) : rpcResponse(collection === "gallery" ? rawGallery : rawShowreel));
    mocks.service.mockReturnValue({ rpc });
    const archive = await getVisualContentArchiveData(collection);
    expect(archive.available).toBe(false);
    expect(archive.message).toContain("0044");
    expect(JSON.stringify(archive)).not.toContain("secret-schema-details");
    const editor = await (collection === "gallery" ? getAdminGalleryEditorData() : getAdminShowreelEditorData());
    expect(editor).toMatchObject({ isConfigured: true, migrationRequired: false, snapshot: collection === "gallery" ? gallery : showreel });
  });

  it.each([null, {}, { ...page, activeLimit: 121 }, { ...page, items: [{ ...archivedItem, updatedAt: "invalid" }] }])("fails closed on malformed Gallery pages: %j", async (data) => {
    withRpcResult(data);
    expect(await getVisualContentArchiveData("gallery")).toMatchObject({ available: false });
  });

  it("does not leak read failures or claim a healthy empty archive without service access", async () => {
    mocks.service.mockReturnValue({ rpc: vi.fn().mockReturnValue({ abortSignal: vi.fn().mockRejectedValue(new Error("private-database-host")) }) });
    const result = await getVisualContentArchiveData("showreel");
    expect(result.available).toBe(false);
    expect(JSON.stringify(result)).not.toContain("private-database-host");
    mocks.service.mockReturnValue(null);
    expect(await getVisualContentArchiveData("showreel")).toMatchObject({ available: false });
  });
});

describe("Visual archive mutation boundary", () => {
  it("authenticates before inspecting malformed requests or resolving service access", async () => {
    mocks.admin.mockRejectedValue(new Error("unauthorized"));
    await expect(mutateVisualContentArchive(null)).rejects.toThrow("unauthorized");
    expect(mocks.origin).not.toHaveBeenCalled();
    expect(mocks.service).not.toHaveBeenCalled();
  });

  it("blocks cross-origin writes before privileged access", async () => {
    mocks.origin.mockResolvedValue(false);
    expect(await mutateVisualContentArchive(archiveInput)).toMatchObject({ ok: false });
    expect(mocks.service).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it.each([
    { ...archiveInput, actorId: "untrusted" }, { ...archiveInput, collection: "media_assets" },
    { ...archiveInput, operation: "purge" }, { ...archiveInput, expectedVersions: { items: {} } },
    { ...archiveInput, expectedVersions: { items: undefined } },
    { ...restoreInput, expectedArchiveUpdatedAt: undefined },
    { ...archiveInput, expectedVersions: { items: JSON.parse(`{"${frame.id}":"${version}","__proto__":"${version}"}`) as unknown } },
  ])("rejects untrusted envelopes before mutation: %j", async (input) => {
    expect(await mutateVisualContentArchive(input)).toMatchObject({ ok: false });
    expect(mocks.service).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it.each(["archive", "restore"] as const)("uses trusted actors and the full Gallery CAS envelope on %s", async (operation) => {
    const input = operation === "archive" ? archiveInput : restoreInput;
    const response = operation === "archive" ? archiveSuccess : restoreSuccess;
    const { rpc } = withRpcResult(response);
    expect(await mutateVisualContentArchive(input)).toMatchObject({ ok: true, collection: "gallery", section: "frames", canonicalSection: response.canonicalSection, versions: response.versions, archive: response.archive });
    expect(rpc).toHaveBeenCalledWith("mutate_visual_content_archive_v2", { p_collection: "gallery", p_operation: operation, p_item_id: frame.id,
      p_expected_versions: input.expectedVersions, p_actor_id: "verified-admin", p_expected_archive_updated_at: operation === "restore" ? archiveVersion : null });
    expect(mocks.admin.mock.invocationCallOrder[0]).toBeLessThan(mocks.origin.mock.invocationCallOrder[0]);
    expect(mocks.origin.mock.invocationCallOrder[0]).toBeLessThan(mocks.service.mock.invocationCallOrder[0]);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ actorId: "verified-admin", tableName: "gallery_images", recordId: frame.id }));
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain(frame.title);
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain(frame.src);
    expect(mocks.revalidate).toHaveBeenCalledWith("/", "layout");
    for (const path of ["/gallery", "/admin/v2/pages/gallery", "/admin/v2/media"]) expect(mocks.revalidate).toHaveBeenCalledWith(path);
  });

  it.each(["archive", "restore"] as const)("retains legacy Showreel identity and featured state on %s without publishing a restore", async (operation) => {
    const item = { ...work, isFeatured: true, isPublished: false };
    const response = { outcome: operation === "archive" ? "archived" : "restored", collection: "showreel", section: "works",
      canonicalSection: { items: operation === "archive" ? [] : [item] },
      versions: { items: operation === "archive" ? {} : { [work.id]: archiveVersion } },
      archive: operation === "archive" ? { ...page, items: [{ ...archivedItem, id: work.id, platform: "showreel" }] } : emptyPage };
    const input = { collection: "showreel", operation, itemId: work.id,
      expectedVersions: { items: operation === "archive" ? { [work.id]: version } : {} },
      ...(operation === "restore" ? { expectedArchiveUpdatedAt: archiveVersion } : {}) };
    const { rpc } = withRpcResult(response);
    expect(await mutateVisualContentArchive(input)).toMatchObject({ ok: true, collection: "showreel", section: "works", canonicalSection: response.canonicalSection, versions: response.versions });
    expect(rpc).toHaveBeenCalledWith("mutate_visual_content_archive_v2", { p_collection: "showreel", p_operation: operation, p_item_id: work.id,
      p_expected_versions: input.expectedVersions, p_actor_id: "verified-admin", p_expected_archive_updated_at: operation === "restore" ? archiveVersion : null });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ tableName: "videos", recordId: work.id }));
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toMatch(/Private title|youtube\.com/);
    for (const path of ["/video", "/admin/v2/pages/showreel", "/admin/v2/media"]) expect(mocks.revalidate).toHaveBeenCalledWith(path);
  });

  it.each(["__proto__", "constructor", "prototype"])("preserves an own Showreel legacy identity safely through the RPC: %s", async (itemId) => {
    const versions = { items: Object.fromEntries([[itemId, archiveVersion]]) };
    withRpcResult({ ...restoreSuccess, collection: "showreel", section: "works", canonicalSection: { items: [{ ...work, id: itemId, isPublished: false }] }, versions });
    const result = await mutateVisualContentArchive({ ...restoreInput, collection: "showreel", itemId });
    expect(result).toMatchObject({ ok: true, versions });
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
  });

  it.each([120, 121])("confirms historical Showreel restoration only when the reported capacity %d fits the canonical collection", async (activeLimit) => {
    const survivors = Array.from({ length: 120 }, (_, i) => ({ ...work, id: `legacy / survivor ${i}`, isPublished: false }));
    const restored = { ...work, isPublished: false };
    const input = { ...restoreInput, collection: "showreel", itemId: restored.id,
      expectedVersions: { items: Object.fromEntries(survivors.map((item) => [item.id, version])) } };
    const items = [...survivors, restored];
    withRpcResult({ ...restoreSuccess, collection: "showreel", section: "works", canonicalSection: { items },
      versions: { items: Object.fromEntries(items.map((item) => [item.id, item.id === restored.id ? archiveVersion : version])) },
      archive: { ...emptyPage, activeLimit } });
    const result = await mutateVisualContentArchive(input);
    expect(result).toMatchObject(activeLimit === 121 ? { ok: true } : { ok: false, reloadRequired: true });
    if (activeLimit === 120) expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("restores historical broken Showreel sources only as hidden data for repair", async () => {
    const item = { ...work, isPublished: false, embedUrl: "broken legacy source", thumbnailSrc: "not a URL" };
    withRpcResult({ ...restoreSuccess, collection: "showreel", section: "works", canonicalSection: { items: [item] },
      versions: { items: { [item.id]: archiveVersion } } });
    expect(await mutateVisualContentArchive({ ...restoreInput, collection: "showreel", itemId: item.id })).toMatchObject({ ok: true, canonicalSection: { items: [item] } });
  });

  it.each(["conflict", "missing", "id_in_use"])("requires a reload for %s without success auditing", async (outcome) => {
    withRpcResult({ outcome });
    expect(await mutateVisualContentArchive(restoreInput)).toMatchObject({ ok: false, reloadRequired: true });
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it.each(["capacity", "featured_conflict"])("treats %s as a benign refusal", async (outcome) => {
    withRpcResult({ outcome });
    const result = await mutateVisualContentArchive({ ...restoreInput, collection: "showreel" });
    expect(result.ok).toBe(false);
    expect(result.reloadRequired).not.toBe(true);
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it.each([
    null, {}, [], { outcome: "unexpected" },
    { ...archiveSuccess, outcome: "restored" }, { ...archiveSuccess, collection: "showreel" }, { ...archiveSuccess, section: "works" },
    { ...archiveSuccess, canonicalSection: { items: [frame] }, versions: archiveInput.expectedVersions },
    { ...archiveSuccess, canonicalSection: { items: [{ invalid: true }] } },
    { ...archiveSuccess, versions: archiveInput.expectedVersions },
    { ...archiveSuccess, archive: { ...page, total: 21, offset: 20 } },
    { ...archiveSuccess, archive: { ...page, activeLimit: 121 } },
    { ...archiveSuccess, archive: { ...page, items: [archivedItem, archivedItem], total: 2 } },
  ])("locks reload after an unconfirmed archive response: %j", async (data) => {
    withRpcResult(data);
    expect(await mutateVisualContentArchive(archiveInput)).toMatchObject({ ok: false, reloadRequired: true });
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it.each([
    { ...restoreSuccess, canonicalSection: { items: [frame] } },
    { ...restoreSuccess, canonicalSection: { items: [] }, versions: { items: {} } },
    { ...restoreSuccess, archive: page },
    { ...restoreSuccess, outcome: "archived" }, { ...restoreSuccess, collection: "showreel" }, { ...restoreSuccess, section: "works" },
    { ...restoreSuccess, versions: { items: {} } },
    { ...restoreSuccess, canonicalSection: { items: [{ ...frame, isPublished: false, src: "javascript:alert(1)" }] } },
  ])("confirms restore only with the exact hidden target absent from the archive: %j", async (data) => {
    withRpcResult(data);
    expect(await mutateVisualContentArchive(restoreInput)).toMatchObject({ ok: false, reloadRequired: true });
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("rejects a success response that silently drops a saved survivor", async () => {
    withRpcResult(archiveSuccess);
    expect(await mutateVisualContentArchive({ ...archiveInput, expectedVersions: { items: { ...archiveInput.expectedVersions.items, survivor: version } } })).toMatchObject({ ok: false, reloadRequired: true });
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("rejects an injected active identity even with a matching returned version map", async () => {
    withRpcResult({ ...archiveSuccess, canonicalSection: { items: [{ ...frame, id: "injected" }] }, versions: { items: { injected: version } } });
    expect(await mutateVisualContentArchive(archiveInput)).toMatchObject({ ok: false, reloadRequired: true });
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("does not retry ambiguous transport errors or expose network details", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("secret-network-token"));
    mocks.service.mockReturnValue({ rpc });
    const result = await mutateVisualContentArchive(archiveInput);
    expect(result).toMatchObject({ ok: false, reloadRequired: true });
    expect(result.message).not.toContain("secret-network-token");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it.each(["08006", "40001"])("requires reload after database error %s without leaking database details", async (code) => {
    withRpcResult(null, { code, message: "secret-password", details: "private-host" });
    const result = await mutateVisualContentArchive(archiveInput);
    expect(result).toMatchObject({ ok: false, reloadRequired: true });
    expect(JSON.stringify(result)).not.toMatch(/secret-password|private-host/);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it.each(["PGRST202", "42883"])("explains missing migration 0044 for %s without requiring ambiguous-write recovery", async (code) => {
    withRpcResult(null, { code, message: "private-schema-details" });
    const result = await mutateVisualContentArchive(archiveInput);
    expect(result.ok).toBe(false);
    expect(result.reloadRequired).not.toBe(true);
    expect(result.message).toContain("0044");
    expect(result.message).not.toContain("private-schema-details");
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("does not claim success without a service client", async () => {
    mocks.service.mockReturnValue(null);
    expect(await mutateVisualContentArchive(archiveInput)).toMatchObject({ ok: false });
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("preserves confirmed success but warns when only audit logging fails", async () => {
    withRpcResult(archiveSuccess);
    mocks.audit.mockResolvedValue({ ok: false });
    const result = await mutateVisualContentArchive(archiveInput);
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/audit/i);
    expect(mocks.revalidate).toHaveBeenCalledWith("/gallery");
  });
});
