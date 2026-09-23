import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadBioContentArchivePage, mutateBioContentArchive } from "@/app/admin/v2/pages/bio/archive-actions";
import { getBioContentArchiveData } from "@/lib/admin/bio-content-archive";
import { getAdminBioEditorData } from "@/lib/admin/bio";
import { createFallbackBioEditorSnapshot } from "@/lib/admin/bio-editor";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), origin: vi.fn(), service: vi.fn(), audit: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.admin }));
vi.mock("@/lib/admin/action-security", () => ({ verifyAdminActionOrigin: mocks.origin }));
vi.mock("@/lib/admin/service", () => ({ createAdminServiceClient: mocks.service, hasAdminServiceEnv: vi.fn(() => true) }));
vi.mock("@/lib/admin/audit", () => ({ writeAuditLog: mocks.audit }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

const version = "2026-09-21T10:15:30.123456+00:00";
const archiveVersion = "2026-09-21T10:16:30.654321+00:00";
const portrait = { id: "portrait-1", src: "/images/portrait.webp", alt: "On stage", isPublished: true };
const paragraph = { id: "paragraph-1", body: "A musician and actor.", revealDelay: 100, isPublished: true };
const credit = { id: "credit-1", creditType: "film", title: "A film", role: "Lead", production: "Studio", director: "Director", year: "2026", href: "https://example.com/film", isPublished: true };
const biography = { topLabel: "Biography", introText: "About the artist", caption: "Portraits", galleryImages: [portrait], paragraphs: [paragraph] };
const bioVersions = { profileUpdatedAt: version, galleryItems: { [portrait.id]: version }, paragraphItems: { [paragraph.id]: version } };
const archivedItem = { id: portrait.id, label: portrait.alt, platform: "portrait", archivedAt: archiveVersion, updatedAt: archiveVersion };
const page = { items: [archivedItem], total: 1, offset: 0 };
const emptyPage = { items: [], total: 0, offset: 0 };
const archiveInput = { collection: "portraits", operation: "archive", itemId: portrait.id, expectedVersions: bioVersions };
const restoreInput = { collection: "portraits", operation: "restore", itemId: portrait.id,
  expectedVersions: { ...bioVersions, galleryItems: {} }, expectedArchiveUpdatedAt: archiveVersion };
const archiveSuccess = { outcome: "archived", collection: "portraits", section: "biography",
  canonicalSection: { ...biography, galleryImages: [] }, versions: { ...bioVersions, galleryItems: {} }, archive: page };
const restoreSuccess = { outcome: "restored", collection: "portraits", section: "biography",
  canonicalSection: { ...biography, galleryImages: [{ ...portrait, isPublished: false }] },
  versions: { ...bioVersions, galleryItems: { [portrait.id]: archiveVersion } }, archive: emptyPage };

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

describe("Bio archive read boundary", () => {
  it.each([getBioContentArchiveData, loadBioContentArchivePage])("authenticates before privileged reads even for invalid collections", async (load) => {
    mocks.admin.mockRejectedValue(new Error("unauthorized"));
    await expect(load("invalid", 0)).rejects.toThrow("unauthorized");
    expect(mocks.service).not.toHaveBeenCalled();
  });

  it.each(["portraits", "paragraphs", "credits"] as const)("loads only the requested bounded %s page with a timeout", async (collection) => {
    const laterPage = { ...page, total: 21, offset: 20 };
    const { rpc, response } = withRpcResult(laterPage);
    expect(await getBioContentArchiveData(collection, 20)).toMatchObject({ available: true, page: laterPage });
    expect(rpc).toHaveBeenCalledWith("get_bio_content_archive_v2", { p_collection: collection, p_offset: 20 });
    expect(response.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(mocks.admin.mock.invocationCallOrder[0]).toBeLessThan(mocks.service.mock.invocationCallOrder[0]);
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it.each([-20, 1, 20.5, 1_000_020, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid offsets before service access: %s", async (offset) => {
    expect(await loadBioContentArchivePage("portraits", offset)).toMatchObject({ available: false });
    expect(mocks.admin).toHaveBeenCalled();
    expect(mocks.service).not.toHaveBeenCalled();
  });

  it.each(["biography", "hero", "bio_gallery_images", "../media"])("rejects unsupported collections: %s", async (collection) => {
    expect(await getBioContentArchiveData(collection, 0)).toMatchObject({ available: false });
    expect(mocks.service).not.toHaveBeenCalled();
  });

  it("refuses a different page from the one requested", async () => {
    withRpcResult(page);
    expect(await getBioContentArchiveData("portraits", 20)).toMatchObject({ available: false });
  });

  it("keeps the regular Bio editor readable before migration 0043", async () => {
    const snapshot = createFallbackBioEditorSnapshot();
    const raw = {
      hero: { ...snapshot.draft.hero, ...snapshot.versions.hero },
      biography: { ...snapshot.draft.biography, profileUpdatedAt: snapshot.versions.biography.profileUpdatedAt,
        galleryImages: snapshot.draft.biography.galleryImages.map((item) => ({ ...item, updatedAt: snapshot.versions.biography.galleryItems[item.id] })),
        paragraphs: snapshot.draft.biography.paragraphs.map((item) => ({ ...item, updatedAt: snapshot.versions.biography.paragraphItems[item.id] })) },
      resume: { ...snapshot.draft.resume, ...snapshot.versions.resume },
      credits: snapshot.draft.credits.items.map((item) => ({ ...item, updatedAt: snapshot.versions.credits.items[item.id] })),
      footer: snapshot.footer, hasResumeDetails: snapshot.hasResumeDetails,
    };
    const rpc = vi.fn((name: string) => name === "get_bio_content_archive_v2"
      ? rpcResponse(null, { code: "PGRST202", message: "secret-schema-details" }) : rpcResponse(raw));
    mocks.service.mockReturnValue({ rpc });
    const archive = await getBioContentArchiveData("portraits");
    expect(archive).toMatchObject({ available: false });
    expect(archive.message).toContain("0043");
    expect(JSON.stringify(archive)).not.toContain("secret-schema-details");
    expect(await getAdminBioEditorData()).toMatchObject({ isConfigured: true, migrationRequired: false, snapshot });
  });

  it.each([null, {}, { ...page, items: [{ ...archivedItem, updatedAt: "invalid" }] }])("fails closed on malformed archive pages: %j", async (data) => {
    withRpcResult(data);
    expect(await getBioContentArchiveData("paragraphs")).toMatchObject({ available: false });
  });

  it("does not leak rejected reads or claim an empty healthy archive", async () => {
    mocks.service.mockReturnValue({ rpc: vi.fn().mockReturnValue({ abortSignal: vi.fn().mockRejectedValue(new Error("private-database-host")) }) });
    const result = await getBioContentArchiveData("credits");
    expect(result.available).toBe(false);
    expect(JSON.stringify(result)).not.toContain("private-database-host");
    mocks.service.mockReturnValue(null);
    expect(await getBioContentArchiveData("credits")).toMatchObject({ available: false });
  });
});

describe("Bio archive mutation boundary", () => {
  it("authenticates malformed input before origin or service access", async () => {
    mocks.admin.mockRejectedValue(new Error("unauthorized"));
    await expect(mutateBioContentArchive(null)).rejects.toThrow("unauthorized");
    expect(mocks.origin).not.toHaveBeenCalled();
    expect(mocks.service).not.toHaveBeenCalled();
  });

  it("blocks cross-origin writes before service access", async () => {
    mocks.origin.mockResolvedValue(false);
    expect(await mutateBioContentArchive(archiveInput)).toMatchObject({ ok: false });
    expect(mocks.service).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it.each([
    { ...archiveInput, actorId: "intruder" },
    { ...archiveInput, collection: "media_assets" },
    { ...archiveInput, operation: "purge" },
    { ...archiveInput, expectedVersions: { ...bioVersions, galleryItems: {} } },
    { ...archiveInput, expectedVersions: { galleryItems: bioVersions.galleryItems, paragraphItems: bioVersions.paragraphItems } },
    { ...archiveInput, collection: "credits" },
    { ...restoreInput, expectedArchiveUpdatedAt: undefined },
    { ...archiveInput, expectedVersions: { ...bioVersions, galleryItems: JSON.parse(`{"${portrait.id}":"${version}","__proto__":"${version}"}`) as unknown } },
  ])("rejects untrusted envelopes before mutation: %j", async (input) => {
    expect(await mutateBioContentArchive(input)).toMatchObject({ ok: false });
    expect(mocks.service).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("archives with the verified actor and complete coupled biography CAS envelope", async () => {
    const { rpc } = withRpcResult(archiveSuccess);
    expect(await mutateBioContentArchive(archiveInput)).toMatchObject({ ok: true, collection: "portraits", section: "biography", canonicalSection: archiveSuccess.canonicalSection, versions: archiveSuccess.versions, archive: page });
    expect(rpc).toHaveBeenCalledWith("mutate_bio_content_archive_v2", {
      p_collection: "portraits", p_operation: "archive", p_item_id: portrait.id,
      p_expected_versions: bioVersions, p_actor_id: "verified-admin", p_expected_archive_updated_at: null,
    });
    expect(mocks.admin.mock.invocationCallOrder[0]).toBeLessThan(mocks.origin.mock.invocationCallOrder[0]);
    expect(mocks.origin.mock.invocationCallOrder[0]).toBeLessThan(mocks.service.mock.invocationCallOrder[0]);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ actorId: "verified-admin", tableName: "bio_gallery_images", recordId: portrait.id }));
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain(portrait.src);
    expect(mocks.revalidate).toHaveBeenCalledWith("/", "layout");
    for (const path of ["/bio", "/admin/v2/pages/bio", "/admin/v2/media"]) expect(mocks.revalidate).toHaveBeenCalledWith(path);
  });

  it("restores a portrait only as hidden and preserves the sibling paragraph snapshot", async () => {
    const { rpc } = withRpcResult(restoreSuccess);
    expect(await mutateBioContentArchive(restoreInput)).toMatchObject({ ok: true, collection: "portraits", section: "biography", canonicalSection: restoreSuccess.canonicalSection, versions: restoreSuccess.versions, archive: emptyPage });
    expect(rpc).toHaveBeenCalledWith("mutate_bio_content_archive_v2", {
      p_collection: "portraits", p_operation: "restore", p_item_id: portrait.id,
      p_expected_versions: restoreInput.expectedVersions, p_actor_id: "verified-admin", p_expected_archive_updated_at: archiveVersion,
    });
  });

  it.each(["archive", "restore"] as const)("preserves portraits and the profile while changing paragraphs on %s", async (operation) => {
    const response = { outcome: operation === "archive" ? "archived" : "restored", collection: "paragraphs", section: "biography",
      canonicalSection: { ...biography, paragraphs: operation === "archive" ? [] : [{ ...paragraph, isPublished: false }] },
      versions: { ...bioVersions, paragraphItems: operation === "archive" ? {} : { [paragraph.id]: archiveVersion } },
      archive: operation === "archive" ? { ...page, items: [{ ...archivedItem, id: paragraph.id, platform: "paragraph" }] } : emptyPage };
    const input = { collection: "paragraphs", operation, itemId: paragraph.id,
      expectedVersions: { ...bioVersions, paragraphItems: operation === "archive" ? { [paragraph.id]: version } : {} },
      ...(operation === "restore" ? { expectedArchiveUpdatedAt: archiveVersion } : {}) };
    const { rpc } = withRpcResult(response);
    expect(await mutateBioContentArchive(input)).toMatchObject({ ok: true, collection: "paragraphs", section: "biography", canonicalSection: response.canonicalSection, versions: response.versions });
    expect(rpc).toHaveBeenCalledWith("mutate_bio_content_archive_v2", { p_collection: "paragraphs", p_operation: operation, p_item_id: paragraph.id,
      p_expected_versions: input.expectedVersions, p_actor_id: "verified-admin", p_expected_archive_updated_at: operation === "restore" ? archiveVersion : null });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ tableName: "bio_paragraphs" }));
  });

  it.each(["archive", "restore"] as const)("uses the independent credits envelope on %s", async (operation) => {
    const response = { outcome: operation === "archive" ? "archived" : "restored", collection: "credits", section: "credits",
      canonicalSection: { items: operation === "archive" ? [] : [{ ...credit, isPublished: false }] },
      versions: { items: operation === "archive" ? {} : { [credit.id]: archiveVersion } },
      archive: operation === "archive" ? { ...page, items: [{ ...archivedItem, id: credit.id, platform: "film" }] } : emptyPage };
    const input = { collection: "credits", operation, itemId: credit.id,
      expectedVersions: { items: operation === "archive" ? { [credit.id]: version } : {} },
      ...(operation === "restore" ? { expectedArchiveUpdatedAt: archiveVersion } : {}) };
    const { rpc } = withRpcResult(response);
    expect(await mutateBioContentArchive(input)).toMatchObject({ ok: true, collection: "credits", section: "credits", canonicalSection: response.canonicalSection, versions: response.versions });
    expect(rpc).toHaveBeenCalledWith("mutate_bio_content_archive_v2", { p_collection: "credits", p_operation: operation, p_item_id: credit.id,
      p_expected_versions: input.expectedVersions, p_actor_id: "verified-admin", p_expected_archive_updated_at: operation === "restore" ? archiveVersion : null });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ tableName: "actor_credits" }));
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain(credit.href);
  });

  it.each(["conflict", "missing", "id_in_use"])("requires reload for %s without success auditing", async (outcome) => {
    withRpcResult({ outcome });
    expect(await mutateBioContentArchive(restoreInput)).toMatchObject({ ok: false, reloadRequired: true });
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("treats full capacity as a benign refusal", async () => {
    withRpcResult({ outcome: "capacity" });
    const result = await mutateBioContentArchive(restoreInput);
    expect(result.ok).toBe(false);
    expect(result.reloadRequired).not.toBe(true);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it.each([
    null, {}, [], { outcome: "unexpected" },
    { ...archiveSuccess, outcome: "restored" },
    { ...archiveSuccess, collection: "paragraphs" },
    { ...archiveSuccess, section: "credits" },
    { ...archiveSuccess, canonicalSection: biography, versions: bioVersions },
    { ...archiveSuccess, canonicalSection: { items: [] }, versions: { items: {} } },
    { ...archiveSuccess, versions: bioVersions },
    { ...archiveSuccess, archive: { ...page, total: 21, offset: 20 } },
    { ...archiveSuccess, archive: { ...page, items: [archivedItem, archivedItem], total: 2 } },
  ])("requires reload after an unconfirmed archive response: %j", async (data) => {
    withRpcResult(data);
    expect(await mutateBioContentArchive(archiveInput)).toMatchObject({ ok: false, reloadRequired: true });
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it.each([
    { ...restoreSuccess, canonicalSection: biography },
    { ...restoreSuccess, canonicalSection: archiveSuccess.canonicalSection, versions: archiveSuccess.versions },
    { ...restoreSuccess, archive: page },
    { ...restoreSuccess, outcome: "archived" },
    { ...restoreSuccess, collection: "paragraphs" },
    { ...restoreSuccess, section: "credits" },
    { ...restoreSuccess, versions: archiveSuccess.versions },
    { ...restoreSuccess, canonicalSection: { ...restoreSuccess.canonicalSection, galleryImages: [{ ...portrait, isPublished: false, src: "javascript:alert(1)" }] } },
  ])("confirms restoration only for the exact hidden target absent from the archive: %j", async (data) => {
    withRpcResult(data);
    expect(await mutateBioContentArchive(restoreInput)).toMatchObject({ ok: false, reloadRequired: true });
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("rejects silently dropped saved survivors in the target collection", async () => {
    withRpcResult(archiveSuccess);
    expect(await mutateBioContentArchive({ ...archiveInput, expectedVersions: { ...bioVersions, galleryItems: { ...bioVersions.galleryItems, survivor: version } } })).toMatchObject({ ok: false, reloadRequired: true });
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("rejects an injected identity even if canonical payload and versions agree", async () => {
    withRpcResult({ ...archiveSuccess, canonicalSection: { ...archiveSuccess.canonicalSection, galleryImages: [{ ...portrait, id: "injected" }] },
      versions: { ...archiveSuccess.versions, galleryItems: { injected: version } } });
    expect(await mutateBioContentArchive(archiveInput)).toMatchObject({ ok: false, reloadRequired: true });
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("rejects a response that drops an unrelated sibling paragraph", async () => {
    withRpcResult({ ...archiveSuccess, canonicalSection: { ...archiveSuccess.canonicalSection, paragraphs: [] },
      versions: { ...archiveSuccess.versions, paragraphItems: {} } });
    expect(await mutateBioContentArchive(archiveInput)).toMatchObject({ ok: false, reloadRequired: true });
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("rejects a response that replaces the shared profile version", async () => {
    withRpcResult({ ...archiveSuccess, versions: { ...archiveSuccess.versions, profileUpdatedAt: archiveVersion } });
    expect(await mutateBioContentArchive(archiveInput)).toMatchObject({ ok: false, reloadRequired: true });
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("rejects a one-microsecond shared profile change", async () => {
    withRpcResult({ ...archiveSuccess, versions: { ...archiveSuccess.versions, profileUpdatedAt: "2026-09-21T10:15:30.123457Z" } });
    expect(await mutateBioContentArchive(archiveInput)).toMatchObject({ ok: false, reloadRequired: true });
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("accepts an unchanged profile instant represented with equivalent timestamp formatting", async () => {
    const input = { ...archiveInput, expectedVersions: { ...bioVersions, profileUpdatedAt: "2026-09-21T10:15:30.000000+00:00" } };
    withRpcResult({ ...archiveSuccess, versions: { ...archiveSuccess.versions, profileUpdatedAt: "2026-09-21T10:15:30Z" } });
    expect(await mutateBioContentArchive(input)).toMatchObject({ ok: true });
  });

  it("accepts an unchanged microsecond profile instant with an equivalent timezone", async () => {
    withRpcResult({ ...archiveSuccess, versions: { ...archiveSuccess.versions, profileUpdatedAt: "2026-09-21T12:15:30.123456+02:00" } });
    expect(await mutateBioContentArchive(archiveInput)).toMatchObject({ ok: true });
  });

  it("does not retry an ambiguous transport failure or expose transport details", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("secret-network-token"));
    mocks.service.mockReturnValue({ rpc });
    const result = await mutateBioContentArchive(archiveInput);
    expect(result).toMatchObject({ ok: false, reloadRequired: true });
    expect(result.message).not.toContain("secret-network-token");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it.each(["08006", "40001"])("fails safely on database error %s without leaking details", async (code) => {
    withRpcResult(null, { code, message: "secret-password", details: "private-host" });
    const result = await mutateBioContentArchive(archiveInput);
    expect(result).toMatchObject({ ok: false, reloadRequired: true });
    expect(JSON.stringify(result)).not.toMatch(/secret-password|private-host/);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it.each(["PGRST202", "42883"])("explains missing 0043 RPC %s without claiming an ambiguous write", async (code) => {
    withRpcResult(null, { code, message: "private-schema-details" });
    const result = await mutateBioContentArchive(archiveInput);
    expect(result.ok).toBe(false);
    expect(result.reloadRequired).not.toBe(true);
    expect(result.message).toContain("0043");
    expect(result.message).not.toContain("private-schema-details");
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("does not report success without a service client", async () => {
    mocks.service.mockReturnValue(null);
    expect(await mutateBioContentArchive(archiveInput)).toMatchObject({ ok: false });
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("preserves confirmed success and warns if only audit logging fails", async () => {
    withRpcResult(archiveSuccess);
    mocks.audit.mockResolvedValue({ ok: false });
    const result = await mutateBioContentArchive(archiveInput);
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/audit/i);
    expect(mocks.revalidate).toHaveBeenCalledWith("/bio");
  });
});
