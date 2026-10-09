import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveBioSectionV2 } from "@/app/admin/v2/pages/bio/actions";
import { getAdminBioEditorData } from "@/lib/admin/bio";
import { createFallbackBioEditorSnapshot, INITIAL_BIO_SAVE_STATE } from "@/lib/admin/bio-editor";
import { BIO_VISIBILITY_COLUMNS } from "@/lib/admin/bio-visibility";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(), origin: vi.fn(), audit: vi.fn(), service: vi.fn(),
  revalidate: vi.fn(), snapshot: vi.fn(),
}));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.admin }));
vi.mock("@/lib/admin/action-security", () => ({ verifyAdminActionOrigin: mocks.origin }));
vi.mock("@/lib/admin/audit", () => ({ writeAuditLog: mocks.audit }));
vi.mock("@/lib/admin/service", () => ({ createAdminServiceClient: mocks.service, hasAdminServiceEnv: () => true }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/admin/photo-framing", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/admin/photo-framing")>(),
  loadPhotoEditorSnapshot: mocks.snapshot,
}));

const BEFORE = "2026-10-07T12:00:00.000Z";
const AFTER = "2026-10-07T12:00:01.123456+00:00";

function form(payload: unknown = { resumeCreditsEnabled: false }, versions: unknown = { updatedAt: BEFORE }) {
  const result = new FormData();
  result.set("section", "visibility");
  result.set("payload", JSON.stringify(payload));
  result.set("versions", JSON.stringify(versions));
  return result;
}

function database(response: { data?: unknown; error?: unknown }) {
  const query = { update: vi.fn(), select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue(response) };
  query.update.mockReturnValue(query);
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  const client = { from: vi.fn().mockReturnValue(query), rpc: vi.fn() };
  mocks.service.mockReturnValue(client);
  return { query, client };
}

function rawSnapshot() {
  const { draft, footer, hasResumeDetails } = createFallbackBioEditorSnapshot();
  return {
    hero: { ...draft.hero, updatedAt: BEFORE },
    biography: {
      ...draft.biography,
      profileUpdatedAt: BEFORE,
      galleryImages: draft.biography.galleryImages.map(item => ({ ...item, updatedAt: BEFORE })),
      paragraphs: draft.biography.paragraphs.map(item => ({ ...item, updatedAt: BEFORE })),
    },
    resume: { ...draft.resume, updatedAt: BEFORE },
    credits: draft.credits.items.map(item => ({ ...item, updatedAt: BEFORE })),
    footer, hasResumeDetails,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin.mockResolvedValue({ id: "admin-id" });
  mocks.origin.mockResolvedValue(true);
  mocks.audit.mockResolvedValue({ ok: true });
  mocks.snapshot.mockResolvedValue({ data: rawSnapshot(), error: null });
});

describe("Bio Resume & Credits visibility loading", () => {
  it.each([true, false])("loads saved %s separately, preserving Bio drafts and their versions", async enabled => {
    const { client, query } = database({ data: { bio_resume_credits_enabled: enabled, updated_at: AFTER }, error: null });
    const loaded = await getAdminBioEditorData();
    expect(loaded).toMatchObject({ isConfigured: true, migrationRequired: false, snapshot: {
      visibilityAvailable: true,
      draft: { visibility: { resumeCreditsEnabled: enabled }, resume: createFallbackBioEditorSnapshot().draft.resume },
      versions: { visibility: { updatedAt: AFTER }, resume: { updatedAt: BEFORE } },
    } });
    expect(client.from).toHaveBeenCalledExactlyOnceWith("site_settings");
    expect(query.select).toHaveBeenCalledWith(BIO_VISIBILITY_COLUMNS);
    expect(query.eq).toHaveBeenCalledWith("id", "main");
    expect(query.update).not.toHaveBeenCalled();
  });

  it.each([
    { data: null, error: { code: "42703", message: "column bio_resume_credits_enabled does not exist" } },
    { data: null, error: { message: "Network unavailable" } },
    { data: null, error: null },
    { data: { updated_at: AFTER }, error: null },
    { data: { bio_resume_credits_enabled: "false", updated_at: AFTER }, error: null },
    { data: { bio_resume_credits_enabled: false, updated_at: "invalid" }, error: null },
  ])("keeps existing editors enabled and preview visible for an unavailable setting: %j", async response => {
    database(response);
    const loaded = await getAdminBioEditorData();
    expect(loaded.isConfigured).toBe(true);
    expect(loaded.migrationRequired).toBe(false);
    expect(loaded.loadError).toBeUndefined();
    expect(loaded.snapshot.visibilityAvailable).toBeUndefined();
    expect(loaded.snapshot.draft.visibility).toEqual({ resumeCreditsEnabled: true });
    expect(loaded.snapshot.versions.visibility.updatedAt).toBe(new Date(0).toISOString());
    expect(loaded.snapshot.versions.resume.updatedAt).toBe(BEFORE);
  });

  it("isolates a thrown settings read from the existing editor snapshot", async () => {
    const { query } = database({ data: null });
    query.maybeSingle.mockRejectedValue(new Error("offline"));
    const loaded = await getAdminBioEditorData();
    expect(loaded).toMatchObject({ isConfigured: true, migrationRequired: false });
    expect(loaded.snapshot.visibilityAvailable).toBeUndefined();
    expect(loaded.snapshot.draft.visibility.resumeCreditsEnabled).toBe(true);
    expect(loaded.snapshot.versions.resume.updatedAt).toBe(BEFORE);
  });
});

describe("Bio Resume & Credits visibility saves", () => {
  it.each([true, false])("saves only the %s visibility flag using the settings CAS and confirmed response", async enabled => {
    const { client, query } = database({ data: { bio_resume_credits_enabled: enabled, updated_at: AFTER }, error: null });
    const state = await saveBioSectionV2(INITIAL_BIO_SAVE_STATE, form({ resumeCreditsEnabled: enabled }));
    expect(state).toMatchObject({ status: "saved", section: "visibility", canonicalSection: { resumeCreditsEnabled: enabled }, versions: { updatedAt: AFTER } });
    expect(mocks.origin).toHaveBeenCalledWith("admin-id", "bio-v2:visibility");
    expect(client.from).toHaveBeenCalledExactlyOnceWith("site_settings");
    expect(client.rpc).not.toHaveBeenCalled();
    expect(query.update).toHaveBeenCalledExactlyOnceWith({ bio_resume_credits_enabled: enabled });
    expect(query.eq.mock.calls).toEqual([["id", "main"], ["updated_at", BEFORE]]);
    expect(query.select).toHaveBeenCalledWith(BIO_VISIBILITY_COLUMNS);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ actorId: "admin-id", action: "bio_v2_visibility_save", tableName: "site_settings", recordId: "main" }));
    expect(mocks.revalidate).toHaveBeenCalledWith("/", "layout");
    for (const path of ["/bio", "/admin/v2/pages/bio", "/admin/v2-preview/bio", "/admin/v2/navigation", "/admin/v2/settings/appearance"]) expect(mocks.revalidate).toHaveBeenCalledWith(path);
  });

  it("authenticates and verifies the origin before opening the visibility write client", async () => {
    mocks.admin.mockRejectedValueOnce(new Error("unauthorized"));
    await expect(saveBioSectionV2(INITIAL_BIO_SAVE_STATE, form())).rejects.toThrow("unauthorized");
    expect(mocks.service).not.toHaveBeenCalled();
    mocks.origin.mockResolvedValue(false);
    expect((await saveBioSectionV2(INITIAL_BIO_SAVE_STATE, form())).status).toBe("security-error");
    expect(mocks.service).not.toHaveBeenCalled();
  });

  it.each([
    [{ resumeCreditsEnabled: "false" }, { updatedAt: BEFORE }],
    [{}, { updatedAt: BEFORE }],
    [{ resumeCreditsEnabled: false, resume: {} }, { updatedAt: BEFORE }],
    [{ resumeCreditsEnabled: false }, { updatedAt: "yesterday" }],
  ])("rejects unconfirmed or coerced input before opening the database", async (payload, versions) => {
    expect((await saveBioSectionV2(INITIAL_BIO_SAVE_STATE, form(payload, versions))).status).toBe("invalid");
    expect(mocks.service).not.toHaveBeenCalled();
  });

  it.each([
    { data: null, error: null },
    { data: null, error: { code: "40001" } },
  ])("keeps a stale draft without retrying or invalidating when the settings CAS fails", async response => {
    const { query } = database(response);
    expect((await saveBioSectionV2(INITIAL_BIO_SAVE_STATE, form())).status).toBe("conflict");
    expect(query.update).toHaveBeenCalledTimes(1);
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it.each([
    { bio_resume_credits_enabled: "false", updated_at: AFTER },
    { bio_resume_credits_enabled: false, updated_at: BEFORE },
    { bio_resume_credits_enabled: false },
    { updated_at: AFTER },
  ])("does not report an unconfirmed response as saved: %j", async data => {
    const { client, query } = database({ data, error: null });
    expect((await saveBioSectionV2(INITIAL_BIO_SAVE_STATE, form())).status).toBe("error");
    expect(client.from).toHaveBeenCalledExactlyOnceWith("site_settings");
    expect(query.update).toHaveBeenCalledExactlyOnceWith({ bio_resume_credits_enabled: false });
    expect(client.rpc).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("reports migration guidance only for this missing column", async () => {
    database({ data: null, error: { code: "PGRST204", message: "Could not find bio_resume_credits_enabled in the schema cache" } });
    const missing = await saveBioSectionV2(INITIAL_BIO_SAVE_STATE, form());
    expect(missing.status).toBe("migration-required");
    expect(missing.message).toContain("0059_bio_resume_visibility.sql");
    database({ data: null, error: { code: "42703", message: "column unrelated_column does not exist" } });
    expect((await saveBioSectionV2(INITIAL_BIO_SAVE_STATE, form())).status).toBe("error");
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("keeps the local draft after an uncertain transport failure", async () => {
    const { query } = database({ data: null });
    query.maybeSingle.mockRejectedValue(new Error("connection dropped"));
    const state = await saveBioSectionV2(INITIAL_BIO_SAVE_STATE, form());
    expect(state.status).toBe("error");
    expect(state.message).toContain("Reload to verify");
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
