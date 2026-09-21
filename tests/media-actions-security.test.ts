import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { restoreMediaAsset } from "@/app/admin/media/actions";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), origin: vi.fn(), service: vi.fn(), audit: vi.fn(), revalidate: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.admin }));
vi.mock("@/lib/admin/action-security", () => ({ verifyAdminActionOrigin: mocks.origin }));
vi.mock("@/lib/admin/service", () => ({ createAdminServiceClient: mocks.service }));
vi.mock("@/lib/admin/audit", () => ({ writeAuditLog: mocks.audit }));
vi.mock("@/lib/admin/media-upload-actions", () => ({ prepareMediaUpload: vi.fn(), finalizeMediaUpload: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.admin.mockResolvedValue({ id: "verified-admin" });
  mocks.origin.mockResolvedValue(true);
  mocks.redirect.mockImplementation((path: string) => { throw new Error(`redirect:${path}`); });
});

const mediaActions = readFileSync(
  new URL("../lib/admin/media-upload-actions.ts", import.meta.url),
  "utf8"
);

describe("media action error handling", () => {
  it("keeps media insert details server-side and returns a generic client error", () => {
    const finalizeAction = mediaActions.slice(
      mediaActions.indexOf("export async function finalizeMediaUpload")
    );

    expect(finalizeAction).toContain(
      'console.error("Media asset insert failed after upload verification.", {'
    );
    expect(finalizeAction).toContain(
      'error: "Uploaded media could not be added to the library."'
    );
    expect(finalizeAction).not.toContain(
      "error: insertResult.error.message"
    );
  });
});

describe("Classic Trash restore handoff", () => {
  it("authenticates before processing any old form or redirecting", async () => {
    mocks.admin.mockRejectedValue(new Error("unauthorized"));
    await expect(restoreMediaAsset(new FormData())).rejects.toThrow("unauthorized");
    expect(mocks.origin).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.service).not.toHaveBeenCalled();
  });

  it("retains origin verification without opening service access", async () => {
    mocks.origin.mockResolvedValue(false);
    await expect(restoreMediaAsset(new FormData())).rejects.toThrow("redirect:/admin/media?status=security-error&view=library");
    expect(mocks.origin).toHaveBeenCalledWith("verified-admin", "media");
    expect(mocks.service).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it.each(["previously-trashed-file", "", "../../other-file"])("hands old ID %s off without restoring or trusting form destinations", async (id) => {
    const form = new FormData();
    form.set("id", id);
    form.set("next", "https://untrusted.example/");
    await expect(restoreMediaAsset(form)).rejects.toThrow("redirect:/admin/v2/media");
    expect(mocks.admin).toHaveBeenCalledOnce();
    expect(mocks.origin).toHaveBeenCalledWith("verified-admin", "media");
    expect(mocks.redirect).toHaveBeenCalledWith("/admin/v2/media");
    expect(mocks.service).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("describes the review handoff rather than claiming an immediate restore", () => {
    const manager = readFileSync(new URL("../components/admin/MediaManager.tsx", import.meta.url), "utf8");
    expect(manager).toContain("Review Trash in V2");
    expect(manager).toContain('pendingLabel="Opening V2..."');
    expect(manager).toContain("select Trash, and review the latest file state");
    expect(manager).not.toContain('pendingLabel="Restoring..."');
  });
});
