import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadNavbarShortcutArchivePage,
  mutateNavbarShortcutArchive,
} from "@/app/admin/v2/navigation/archive-actions";
import { getNavbarShortcutArchiveData } from "@/lib/admin/content-archive";
import { getAdminNavbarSocialLinksData } from "@/lib/admin/navbar-social-links";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(), origin: vi.fn(), service: vi.fn(),
  audit: vi.fn(), revalidate: vi.fn(), env: vi.fn(),
}));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.admin }));
vi.mock("@/lib/admin/action-security", () => ({ verifyAdminActionOrigin: mocks.origin }));
vi.mock("@/lib/admin/service", () => ({ createAdminServiceClient: mocks.service, hasAdminServiceEnv: mocks.env }));
vi.mock("@/lib/admin/audit", () => ({ writeAuditLog: mocks.audit }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

const version = "2026-09-21T10:15:30.123456+00:00";
const archiveVersion = "2026-09-21T10:16:30.654321+00:00";
const active = {
  id: "spotify.artist-1", label: "Spotify artist", platform: "spotify",
  href: "https://open.spotify.com/artist/artist-1", iconKey: "spotify",
  isPublished: true, updatedAt: version,
};
const archivedItem = {
  id: active.id, label: active.label, platform: active.platform,
  archivedAt: archiveVersion, updatedAt: archiveVersion,
};
const page = { items: [archivedItem], total: 1, offset: 0 };
const emptyPage = { items: [], total: 0, offset: 0 };
const archiveInput = {
  operation: "archive", itemId: active.id, expectedVersions: { [active.id]: version },
};
const restoreInput = {
  operation: "restore", itemId: active.id, expectedVersions: {},
  expectedArchiveUpdatedAt: archiveVersion,
};
const archiveSuccess = { outcome: "archived", snapshot: { items: [] }, archive: page };
const restoreSuccess = {
  outcome: "restored", snapshot: { items: [{ ...active, isPublished: false, updatedAt: archiveVersion }] },
  archive: emptyPage,
};

function rpcResponse(data: unknown, error: unknown = null) {
  const result = Promise.resolve({ data, error });
  return Object.assign(result, { abortSignal: vi.fn().mockReturnValue(result) });
}

function withRpcResult(data: unknown, error: unknown = null) {
  const rpc = vi.fn().mockImplementation(() => rpcResponse(data, error));
  mocks.service.mockReturnValue({ rpc });
  return rpc;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.admin.mockResolvedValue({ id: "verified-admin" });
  mocks.origin.mockResolvedValue(true);
  mocks.env.mockReturnValue(true);
});

describe("Content archive read boundary", () => {
  it.each([getNavbarShortcutArchiveData, loadNavbarShortcutArchivePage])("authenticates before any privileged read", async (load) => {
    mocks.admin.mockRejectedValue(new Error("unauthorized"));
    await expect(load(0)).rejects.toThrow("unauthorized");
    expect(mocks.service).not.toHaveBeenCalled();
  });

  it("loads only the requested bounded archive page", async () => {
    const laterPage = { ...page, total: 21, offset: 20 };
    const rpc = withRpcResult(laterPage);
    expect(await getNavbarShortcutArchiveData(20)).toMatchObject({ available: true, page: laterPage });
    expect(rpc).toHaveBeenCalledWith("get_navbar_shortcut_archive_v2", { p_offset: 20 });
    expect(mocks.admin.mock.invocationCallOrder[0]).toBeLessThan(mocks.service.mock.invocationCallOrder[0]);
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it.each([-20, 1, 20.5, 1_000_020, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid page offsets without service access: %s", async (offset) => {
    expect(await loadNavbarShortcutArchivePage(offset)).toMatchObject({ available: false });
    expect(mocks.admin).toHaveBeenCalled();
    expect(mocks.service).not.toHaveBeenCalled();
  });

  it("does not present a different returned page as the requested page", async () => {
    withRpcResult(page);
    expect(await getNavbarShortcutArchiveData(20)).toMatchObject({ available: false });
  });

  it("keeps the normal shortcut editor available before migration 0041", async () => {
    const rpc = vi.fn().mockImplementation((name: string) => name === "get_navbar_shortcut_archive_v2"
      ? rpcResponse(null, { code: "PGRST202", message: "secret-schema-details" })
      : rpcResponse({ items: [active] }));
    mocks.service.mockReturnValue({ rpc });
    const archive = await getNavbarShortcutArchiveData();
    expect(archive.available).toBe(false);
    expect(archive.message).toContain("0041");
    expect(JSON.stringify(archive)).not.toContain("secret-schema-details");
    expect(await getAdminNavbarSocialLinksData()).toMatchObject({
      isConfigured: true, migrationRequired: false,
      snapshot: { items: [expect.objectContaining({ id: active.id })] },
    });
  });

  it.each([null, {}, { ...page, items: [{ ...archivedItem, updatedAt: "invalid" }] }])("fails closed on malformed archive snapshots: %j", async (data) => {
    withRpcResult(data);
    expect(await getNavbarShortcutArchiveData()).toMatchObject({ available: false });
  });

  it("returns safe unavailability for a rejected read", async () => {
    mocks.service.mockReturnValue({ rpc: vi.fn().mockReturnValue({
      abortSignal: vi.fn().mockRejectedValue(new Error("private-database-host")),
    }) });
    const result = await getNavbarShortcutArchiveData();
    expect(result.available).toBe(false);
    expect(JSON.stringify(result)).not.toContain("private-database-host");
  });

  it("does not misrepresent missing service access as an empty successful archive", async () => {
    mocks.service.mockReturnValue(null);
    expect(await getNavbarShortcutArchiveData()).toMatchObject({ available: false });
  });
});

describe("Content archive mutation boundary", () => {
  it("authenticates even malformed input before origin or service access", async () => {
    mocks.admin.mockRejectedValue(new Error("unauthorized"));
    await expect(mutateNavbarShortcutArchive(null)).rejects.toThrow("unauthorized");
    expect(mocks.origin).not.toHaveBeenCalled();
    expect(mocks.service).not.toHaveBeenCalled();
  });

  it("blocks cross-origin writes before service access", async () => {
    mocks.origin.mockResolvedValue(false);
    expect(await mutateNavbarShortcutArchive(archiveInput)).toMatchObject({ ok: false });
    expect(mocks.service).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it.each([
    { ...archiveInput, actorId: "intruder" },
    { ...archiveInput, operation: "purge" },
    { ...archiveInput, expectedVersions: {} },
    { ...restoreInput, expectedArchiveUpdatedAt: undefined },
  ])("rejects untrusted payloads before privileged mutation: %j", async (input) => {
    expect(await mutateNavbarShortcutArchive(input)).toMatchObject({ ok: false });
    expect(mocks.service).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("archives through the atomic RPC with the verified actor and exact active versions", async () => {
    const rpc = withRpcResult(archiveSuccess);
    const result = await mutateNavbarShortcutArchive(archiveInput);
    expect(result).toMatchObject({ ok: true, snapshot: { items: [], expectedVersions: {} }, archive: page });
    expect(rpc).toHaveBeenCalledWith("mutate_navbar_shortcut_archive_v2", {
      p_operation: "archive", p_item_id: active.id,
      p_expected_versions: archiveInput.expectedVersions, p_actor_id: "verified-admin",
      p_expected_archive_updated_at: null,
    });
    expect(mocks.admin.mock.invocationCallOrder[0]).toBeLessThan(mocks.origin.mock.invocationCallOrder[0]);
    expect(mocks.origin.mock.invocationCallOrder[0]).toBeLessThan(mocks.service.mock.invocationCallOrder[0]);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ actorId: "verified-admin", recordId: active.id }));
    expect(mocks.revalidate).toHaveBeenCalledWith("/", "layout");
    expect(mocks.revalidate).toHaveBeenCalledWith("/admin/v2/navigation");
  });

  it("restores as hidden and passes the exact archived version to the RPC", async () => {
    const rpc = withRpcResult(restoreSuccess);
    expect(await mutateNavbarShortcutArchive(restoreInput)).toMatchObject({
      ok: true, snapshot: {
        items: [expect.objectContaining({ id: active.id, isPublished: false })],
        expectedVersions: { [active.id]: archiveVersion },
      }, archive: emptyPage,
    });
    expect(rpc).toHaveBeenCalledWith("mutate_navbar_shortcut_archive_v2", {
      p_operation: "restore", p_item_id: active.id, p_expected_versions: {},
      p_actor_id: "verified-admin", p_expected_archive_updated_at: archiveVersion,
    });
  });

  it("does not confirm an archive result that also dropped another saved shortcut", async () => {
    withRpcResult(archiveSuccess);
    expect(await mutateNavbarShortcutArchive({ ...archiveInput,
      expectedVersions: { ...archiveInput.expectedVersions, sibling: version },
    })).toMatchObject({ ok: false, reloadRequired: true });
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("does not confirm an archive result that injected an unrelated shortcut", async () => {
    withRpcResult({ ...archiveSuccess, snapshot: { items: [{ ...active, id: "unexpected" }] } });
    expect(await mutateNavbarShortcutArchive(archiveInput)).toMatchObject({ ok: false, reloadRequired: true });
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it.each(["conflict", "missing", "capacity"])("does not audit or invalidate an unsuccessful %s outcome", async (outcome) => {
    withRpcResult({ outcome });
    expect(await mutateNavbarShortcutArchive(restoreInput)).toMatchObject({ ok: false });
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("treats capacity as a benign refusal rather than a confirmed write", async () => {
    withRpcResult({ outcome: "capacity" });
    const result = await mutateNavbarShortcutArchive(restoreInput);
    expect(result.ok).toBe(false);
    expect(result.reloadRequired).not.toBe(true);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it.each([
    { data: null },
    { data: { outcome: "unexpected" } },
    { data: { ...archiveSuccess, outcome: "restored" } },
    { data: { ...archiveSuccess, snapshot: { items: [active] } } },
    { data: { ...archiveSuccess, snapshot: { items: [{ invalid: true }] } } },
    { data: { ...archiveSuccess, archive: { ...page, items: [archivedItem, archivedItem] } } },
  ])("requires reload when an archive write cannot be confirmed: %j", async ({ data }) => {
    withRpcResult(data);
    expect(await mutateNavbarShortcutArchive(archiveInput)).toMatchObject({ ok: false, reloadRequired: true });
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it.each([
    { ...restoreSuccess, snapshot: { items: [active] } },
    { ...restoreSuccess, snapshot: { items: [] } },
    { ...restoreSuccess, archive: page },
    { ...restoreSuccess, outcome: "archived" },
  ])("does not claim restore success without a confirmed hidden active row: %j", async (data) => {
    withRpcResult(data);
    expect(await mutateNavbarShortcutArchive(restoreInput)).toMatchObject({ ok: false, reloadRequired: true });
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("requires reload after ambiguous transport failure and never exposes its details", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("secret-network-token"));
    mocks.service.mockReturnValue({ rpc });
    const result = await mutateNavbarShortcutArchive(archiveInput);
    expect(result).toMatchObject({ ok: false, reloadRequired: true });
    expect(result.message).not.toContain("secret-network-token");
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("requires reload for an unclassified database failure without exposing private details", async () => {
    withRpcResult(null, { code: "08006", message: "secret-database-password", details: "private-hostname" });
    const result = await mutateNavbarShortcutArchive(archiveInput);
    expect(result).toMatchObject({ ok: false, reloadRequired: true });
    expect(JSON.stringify(result)).not.toMatch(/secret-database-password|private-hostname/);
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("never reports success when no admin service client is available", async () => {
    mocks.service.mockReturnValue(null);
    expect(await mutateNavbarShortcutArchive(archiveInput)).toMatchObject({ ok: false });
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("maps a CAS conflict to failure without a success audit", async () => {
    withRpcResult(null, { code: "40001", message: "private-cas-details" });
    const result = await mutateNavbarShortcutArchive(archiveInput);
    expect(result.ok).toBe(false);
    expect(result.message).not.toContain("private-cas-details");
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("explains a missing migration without leaking database messages", async () => {
    withRpcResult(null, { code: "PGRST202", message: "private-schema-details" });
    const result = await mutateNavbarShortcutArchive(archiveInput);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("0041");
    expect(result.message).not.toContain("private-schema-details");
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
