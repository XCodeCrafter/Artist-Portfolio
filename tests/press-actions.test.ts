import { beforeEach, describe, expect, it, vi } from "vitest";
import { savePressPageV2 } from "@/app/admin/v2/pages/press/actions";
import { saveHomeSectionV2 } from "@/app/admin/v2/pages/home/actions";
import { getAdminPressEditorData } from "@/lib/admin/press";
import { INITIAL_HOME_SAVE_STATE } from "@/lib/admin/home-editor";
import { createHomeEditorialDefaults } from "@/lib/admin/home-editorial";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), origin: vi.fn(), service: vi.fn(), env: vi.fn(), audit: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.admin }));
vi.mock("@/lib/admin/action-security", () => ({ verifyAdminActionOrigin: mocks.origin }));
vi.mock("@/lib/admin/service", () => ({ createAdminServiceClient: mocks.service, hasAdminServiceEnv: mocks.env }));
vi.mock("@/lib/admin/audit", () => ({ writeAuditLog: mocks.audit }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

const before = "2026-10-08T12:00:00.000001+00:00";
const after = "2026-10-08T12:00:00.000002+00:00";
const press = {
  ...createHomeEditorialDefaults().press,
  items: [
    { id: "11111111-1111-4111-8111-111111111111", kind: "review" as const, title: "Existing review", quote: "Keep the quotation", publication: "Publication", date: "2026-10-08", href: "https://example.com/review", image: { src: "/images/press.jpg", alt: "Clipping", framing: null }, visible: true },
    { id: "22222222-2222-4222-8222-222222222222", kind: "radio" as const, title: "Hidden radio item", quote: "Still stored", publication: "Station", date: "", href: "", image: { src: "", alt: "", framing: null }, visible: false },
  ],
};
function form() {
  const data = new FormData();
  data.set("payload", JSON.stringify(press));
  data.set("versions", JSON.stringify({ updatedAt: before }));
  return data;
}
function reader(response: unknown) {
  const query = { select: vi.fn(), eq: vi.fn(), abortSignal: vi.fn(), maybeSingle: vi.fn().mockResolvedValue(response) };
  for (const method of [query.select, query.eq, query.abortSignal]) method.mockReturnValue(query);
  const from = vi.fn().mockReturnValue(query);
  mocks.service.mockReturnValue({ from });
  return { query, from };
}
function writer(response: unknown) {
  const abortSignal = vi.fn().mockResolvedValue(response);
  const rpc = vi.fn().mockReturnValue({ abortSignal });
  mocks.service.mockReturnValue({ rpc });
  return { rpc, abortSignal };
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.admin.mockResolvedValue({ id: "admin-id" });
  mocks.origin.mockResolvedValue(true);
  mocks.env.mockReturnValue(true);
  mocks.audit.mockResolvedValue({ ok: true });
});

describe("Dedicated Press loader", () => {
  it("authenticates before opening the saved Press data", async () => {
    mocks.admin.mockRejectedValueOnce(new Error("unauthorized"));
    await expect(getAdminPressEditorData()).rejects.toThrow("unauthorized");
    expect(mocks.service).not.toHaveBeenCalled();
  });

  it("reads the existing collection with hidden items and the exact shared CAS version", async () => {
    // An unrelated legacy Home section does not invalidate the Press collection.
    const { from, query } = reader({ data: { draft: { press, hero: { unrelated: "legacy" } }, updated_at: before }, error: null });
    expect(await getAdminPressEditorData()).toEqual({ snapshot: { draft: press, versions: { updatedAt: before } }, isConfigured: true, migrationRequired: false });
    expect(from).toHaveBeenCalledExactlyOnceWith("home_page_config");
    expect(query.select).toHaveBeenCalledWith("draft,updated_at");
    expect(query.eq).toHaveBeenCalledWith("id", "main");
    expect(query.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it.each([
    { data: null, error: { code: "PGRST205", message: "home_page_config missing from schema cache" } },
    { data: { draft: { hero: {} }, updated_at: before }, error: null },
  ])("keeps predecessor schemas read-only until migration", async response => {
    reader(response);
    expect(await getAdminPressEditorData()).toMatchObject({ isConfigured: true, migrationRequired: true });
  });

  it.each([
    { data: null, error: null },
    { data: null, error: { code: "42703", message: "network failure" } },
    { data: { draft: { press }, updated_at: "invalid" }, error: null },
    { data: { draft: { press: { ...press, items: "invalid" } }, updated_at: before }, error: null },
  ])("never enables saving fallback content after a failed or invalid read", async response => {
    reader(response);
    const result = await getAdminPressEditorData();
    expect(result.migrationRequired).toBe(false);
    expect(result.loadError).toBeTruthy();
    expect(result.snapshot.versions.updatedAt).toBe(new Date(0).toISOString());
  });

  it("makes a thrown read failure read-only", async () => {
    const { query } = reader(null);
    query.maybeSingle.mockRejectedValueOnce(new Error("offline"));
    expect(await getAdminPressEditorData()).toMatchObject({ isConfigured: true, migrationRequired: false, loadError: expect.any(String) });
  });
});

describe("Dedicated Press save facade", () => {
  it("pins writes to existing Press storage and returns canonical content/version", async () => {
    const canonical = { ...press, title: "Canonical Press title" };
    const { rpc, abortSignal } = writer({ data: { canonicalSection: canonical, versions: { updatedAt: after } }, error: null });
    const submitted = form();
    submitted.set("section", "hero");
    const result = await savePressPageV2(INITIAL_HOME_SAVE_STATE, submitted);
    expect(result).toMatchObject({ status: "saved", section: "press", canonicalSection: canonical, versions: { updatedAt: after } });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("save_home_editorial_section_v2", {
      p_site_id: "main", p_section: "press", p_expected_updated_at: before, p_payload: press,
    });
    expect(abortSignal).toHaveBeenCalledExactlyOnceWith(expect.any(AbortSignal));
    expect(mocks.origin).toHaveBeenCalledWith("admin-id", "home-v2:press");
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ tableName: "home_page_config", recordId: "main", metadata: { section: "press" } }));
    for (const path of ["/press", "/admin/v2/pages/press", "/admin/v2-preview/press", "/", "/admin/v2/pages/home"]) expect(mocks.revalidate).toHaveBeenCalledWith(path);
  });

  it("retains authentication and origin checks before privileged access", async () => {
    mocks.admin.mockRejectedValueOnce(new Error("unauthorized"));
    await expect(savePressPageV2(INITIAL_HOME_SAVE_STATE, new FormData())).rejects.toThrow("unauthorized");
    expect(mocks.service).not.toHaveBeenCalled();
    mocks.origin.mockResolvedValue(false);
    expect((await savePressPageV2(INITIAL_HOME_SAVE_STATE, form())).status).toBe("security-error");
    expect(mocks.service).not.toHaveBeenCalled();
  });

  it.each(["payload", "versions"])("preserves duplicate %s rejection rather than silently flattening FormData", async key => {
    const submitted = form(); submitted.append(key, String(submitted.get(key)));
    expect((await savePressPageV2(INITIAL_HOME_SAVE_STATE, submitted)).status).toBe("invalid");
    expect(mocks.service).not.toHaveBeenCalled();
  });

  it.each([
    { ...press, items: [{ ...press.items[0], href: "javascript:alert(1)" }] },
    { ...press, items: [{ ...press.items[0], image: { src: "https://unmanaged.example/image.jpg", alt: "Image", framing: null } }] },
    { ...press, extra: true },
  ])("keeps exact Press schema and managed-media validation", async payload => {
    const submitted = form(); submitted.set("payload", JSON.stringify(payload));
    expect((await savePressPageV2(INITIAL_HOME_SAVE_STATE, submitted)).status).toBe("invalid");
    expect(mocks.service).not.toHaveBeenCalled();
  });

  it("keeps a stale Press draft without retrying or overwriting Home content", async () => {
    const { rpc } = writer({ data: null, error: { code: "40001", message: "home_page_changed" } });
    const result = await savePressPageV2(INITIAL_HOME_SAVE_STATE, form());
    expect(result.status).toBe("conflict");
    expect(result.message).toContain("Website content changed");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("requires a confirmed canonical response and newer version", async () => {
    writer({ data: { canonicalSection: press, versions: { updatedAt: before } }, error: null });
    expect((await savePressPageV2(INITIAL_HOME_SAVE_STATE, form())).status).toBe("error");
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("refreshes the Press page even when an old Home editor submits the save", async () => {
    writer({ data: { canonicalSection: press, versions: { updatedAt: after } }, error: null });
    const submitted = form(); submitted.set("section", "press");
    expect((await saveHomeSectionV2(INITIAL_HOME_SAVE_STATE, submitted)).status).toBe("saved");
    for (const path of ["/press", "/admin/v2/pages/press", "/admin/v2-preview/press"]) expect(mocks.revalidate).toHaveBeenCalledWith(path);
  });
});
