import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getContactCopyCapability, readContactCopyCapability } from "@/lib/admin/contact-copy";
import { saveContactSectionV2 } from "@/app/admin/v2/pages/contact/actions";
import { INITIAL_CONTACT_SAVE_STATE } from "@/lib/admin/contact-editor";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(), createClient: vi.fn(), origin: vi.fn(), audit: vi.fn(), revalidate: vi.fn(),
}));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/admin/service", () => ({ createAdminServiceClient: mocks.createClient, hasAdminServiceEnv: () => true }));
vi.mock("@/lib/admin/action-security", () => ({ verifyAdminActionOrigin: mocks.origin }));
vi.mock("@/lib/admin/audit", () => ({ writeAuditLog: mocks.audit }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

const version = "2026-09-21T10:00:00.000Z";
const nextVersion = "2026-09-21T11:00:00.000Z";
function makeClient(data: unknown = { optionalDetails: true }, error: unknown = null) {
  const abortSignal = vi.fn().mockResolvedValue({ data, error });
  const rpc = vi.fn((name: string) => name === "get_contact_copy_capabilities_v2"
    ? { abortSignal } : Promise.resolve({ data: { versions: { updatedAt: nextVersion } }, error: null }));
  const client = { rpc } as unknown as SupabaseClient;
  mocks.createClient.mockReturnValue(client);
  return { client, rpc, abortSignal };
}
function form(payload: unknown = { location: "", contactBlurb: "" }, section = "details") {
  const result = new FormData();
  result.set("section", section);
  result.set("payload", JSON.stringify(payload));
  result.set("versions", JSON.stringify({ updatedAt: version }));
  return result;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ id: "owner", email: "owner@example.com" });
  mocks.origin.mockResolvedValue(true);
  mocks.audit.mockResolvedValue({ ok: true });
});

describe("Contact optional-copy capability", () => {
  it("authenticates before opening a service client", async () => {
    mocks.requireAdmin.mockRejectedValueOnce(new Error("Unauthorized"));
    await expect(getContactCopyCapability()).rejects.toThrow("Unauthorized");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it("reports absent service configuration as unverified, not a missing migration", async () => {
    mocks.createClient.mockReturnValue(null);
    expect(await getContactCopyCapability()).toMatchObject({ available: false, migrationRequired: false });
  });
  it("isolates a service-client construction failure after authentication", async () => {
    mocks.createClient.mockImplementationOnce(() => { throw new Error("private config detail"); });
    const result = await getContactCopyCapability();
    expect(result).toMatchObject({ available: false, migrationRequired: false });
    expect(JSON.stringify(result)).not.toContain("private config");
  });
  it("uses a bounded read-only RPC and accepts only its exact capability contract", async () => {
    const { rpc, abortSignal } = makeClient();
    expect(await getContactCopyCapability()).toEqual({ available: true, migrationRequired: false });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("get_contact_copy_capabilities_v2");
    expect(abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it.each(["PGRST202", "42883"])("identifies absent capability %s without a write probe", async (code) => {
    const { client } = makeClient(null, { code, message: "private SQL detail" });
    const result = await readContactCopyCapability(client);
    expect(result).toMatchObject({ available: false, migrationRequired: true });
    expect(result.message).toContain("0045");
    expect(JSON.stringify(result)).not.toContain("private SQL");
  });
  it.each([null, {}, false, [], "true", { optionalDetails: false }, { optionalDetails: "true" }, { optionalDetails: true, secret: "private" }])("fails closed for malformed capability %#", async (data) => {
    const { client } = makeClient(data);
    expect(await readContactCopyCapability(client)).toMatchObject({ available: false, migrationRequired: false });
  });
  it.each(["42501", "57014", "22023"])("does not mislabel unrelated read error %s as a missing migration", async (code) => {
    const { client } = makeClient(null, { code, message: "private SQL detail" });
    const result = await readContactCopyCapability(client);
    expect(result).toMatchObject({ available: false, migrationRequired: false });
    expect(JSON.stringify(result)).not.toContain("private SQL");
  });
  it("handles a rejected/aborted capability request without leaking details", async () => {
    const { client, abortSignal } = makeClient();
    abortSignal.mockRejectedValueOnce(new Error("private network detail"));
    expect(await readContactCopyCapability(client)).toMatchObject({ available: false, migrationRequired: false });
  });
});

describe("Optional Contact save gate", () => {
  it("checks fresh capability after authentication and origin, then saves normalized empty values", async () => {
    const { rpc } = makeClient();
    const result = await saveContactSectionV2(INITIAL_CONTACT_SAVE_STATE, form({ location: " \t ", contactBlurb: " \n " }));
    expect(result).toMatchObject({ status: "saved", canonicalSection: { location: "", contactBlurb: "" } });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["get_contact_copy_capabilities_v2", "save_contact_details_v2"]);
    expect(rpc).toHaveBeenLastCalledWith("save_contact_details_v2", { p_site_id: "main", p_expected_updated_at: version, p_payload: { location: "", contactBlurb: "" } });
    expect(mocks.origin.mock.invocationCallOrder[0]).toBeLessThan(rpc.mock.invocationCallOrder[0]);
    expect(mocks.revalidate).toHaveBeenCalledWith("/", "layout");
    expect(mocks.revalidate).toHaveBeenCalledWith("/admin/v2/settings/appearance");
  });
  it.each([
    { data: null, error: { code: "PGRST202" }, status: "migration-required" },
    { data: null, error: { code: "57014" }, status: "invalid" },
    { data: {}, error: null, status: "invalid" },
  ])("does not write when blank fields cannot be verified ($status)", async ({ data, error, status }) => {
    const { rpc } = makeClient(data, error);
    expect(await saveContactSectionV2(INITIAL_CONTACT_SAVE_STATE, form())).toMatchObject({ status, section: "details" });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("get_contact_copy_capabilities_v2");
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("does not retry a rejected read or dispatch a write", async () => {
    const { rpc, abortSignal } = makeClient();
    abortSignal.mockRejectedValueOnce(new Error("request aborted"));
    expect(await saveContactSectionV2(INITIAL_CONTACT_SAVE_STATE, form())).toMatchObject({ status: "invalid" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("blocks unauthorized origins before even reading capabilities", async () => {
    const { rpc } = makeClient();
    mocks.origin.mockResolvedValueOnce(false);
    expect(await saveContactSectionV2(INITIAL_CONTACT_SAVE_STATE, form())).toMatchObject({ status: "security-error" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([
    { location: "Prague", contactBlurb: "" },
    { location: "", contactBlurb: "Bookings" },
  ])("checks optional capability when just one field is cleared (%j)", async (payload) => {
    const { rpc } = makeClient();
    expect(await saveContactSectionV2(INITIAL_CONTACT_SAVE_STATE, form(payload))).toMatchObject({ status: "saved" });
    expect(rpc).toHaveBeenNthCalledWith(1, "get_contact_copy_capabilities_v2");
  });
  it.each([
    { section: "details", payload: { location: "Prague", contactBlurb: "Bookings" } },
    { section: "hero", payload: { title: "Contact", subtitle: "", ctaLabel: "", ctaHref: "", backgroundSrc: "/images/booking-hero.jpg", posterSrc: "", mediaType: "image" } },
  ])("preserves filled details and Hero without migration 0045: $section", async ({ section, payload }) => {
    const { rpc } = makeClient(null, { code: "PGRST202" });
    expect(await saveContactSectionV2(INITIAL_CONTACT_SAVE_STATE, form(payload, section))).toMatchObject({ status: "saved" });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe(`save_contact_${section}_v2`);
  });
});
