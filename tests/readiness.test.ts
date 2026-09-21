import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getProductionReadiness } from "@/lib/admin/readiness";
import { DEFAULT_FOOTER_CONTENT } from "@/lib/content/footer";

const mocks = vi.hoisted(() => ({
  service: vi.fn(), serviceConfigured: vi.fn(), browserConfigured: vi.fn(),
  secret: vi.fn(), siteUrl: vi.fn(), media: vi.fn(), fetch: vi.fn(),
  from: vi.fn(), rpc: vi.fn(), bucket: vi.fn(),
  results: new Map<string, { data: unknown; error: unknown } | Promise<never>>(),
  signals: [] as AbortSignal[],
}));
vi.mock("@/lib/admin/service", () => ({ createAdminServiceClient: mocks.service, hasAdminServiceEnv: mocks.serviceConfigured }));
vi.mock("@/lib/admin/security-secret", () => ({ hasAuthSecuritySecret: mocks.secret }));
vi.mock("@/lib/supabase/env", () => ({ hasSupabaseBrowserEnv: mocks.browserConfigured, getSupabaseUrl: () => "https://project.supabase.co", getSupabasePublishableKey: () => "public-test-key" }));
vi.mock("@/lib/site-url", () => ({ hasProductionSiteUrl: mocks.siteUrl }));
vi.mock("@/lib/admin/media", () => ({ MEDIA_BUCKET: "portfolio-media" }));
vi.mock("@/lib/admin/media-upload-config", () => ({ getMediaUploadConfigSummary: mocks.media }));
vi.mock("@/lib/content/navigation", () => ({ NAVIGATION_DESTINATION_KEYS: ["home", "bio"] }));
vi.mock("@/lib/admin/home-editor", () => ({ parseHomeEditorSnapshot: (value: unknown) => Boolean(value && typeof value === "object" && "valid" in value) }));
vi.mock("@/lib/admin/music-editor", () => ({ parseMusicEditorSnapshot: (value: unknown) => Boolean(value && typeof value === "object" && "valid" in value) }));
vi.mock("@/lib/admin/bio-editor", () => ({ parseBioEditorSnapshot: (value: unknown) => Boolean(value && typeof value === "object" && "valid" in value) }));
vi.mock("@/lib/admin/gallery-editor", () => ({ parseGalleryEditorSnapshot: (value: unknown) => Boolean(value && typeof value === "object" && "valid" in value) }));
vi.mock("@/lib/admin/showreel-editor", () => ({ parseShowreelEditorSnapshot: (value: unknown) => Boolean(value && typeof value === "object" && "valid" in value) }));
vi.mock("@/lib/admin/contact-editor", () => ({ parseContactEditorSnapshot: (value: unknown) => Boolean(value && typeof value === "object" && "valid" in value) }));
vi.mock("@/lib/admin/navbar-social-links-editor", () => ({ parseNavbarSocialLinksSnapshot: (value: unknown) => Boolean(value && typeof value === "object" && "valid" in value) }));

function response(data: unknown) { return { data, error: null }; }
function read(name: string) {
  const builder = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
    abortSignal: vi.fn((signal: AbortSignal) => { mocks.signals.push(signal); return Promise.resolve(mocks.results.get(name) ?? response([])); }),
  };
  return builder;
}
function check(result: Awaited<ReturnType<typeof getProductionReadiness>>, id: string) {
  const found = result.checks.find(item => item.id === id);
  expect(found, `Missing readiness check ${id}`).toBeDefined();
  return found!;
}

beforeEach(() => {
  vi.resetAllMocks(); mocks.results.clear(); mocks.signals.length = 0;
  vi.stubGlobal("fetch", mocks.fetch);
  for (const name of ["RESEND_API_KEY", "BOOKING_TO_EMAIL", "BOOKING_FROM_EMAIL"]) vi.stubEnv(name, "configured-test-value");
  for (const name of ["RESEND_WEBHOOK_SECRET", "CRON_SECRET", "HEALTHCHECK_SECRET", "NEXT_PUBLIC_TURNSTILE_SITE_KEY", "MEDIA_PROCESSOR_URL", "MEDIA_PROCESSOR_SECRET"]) vi.stubEnv(name, "");
  mocks.serviceConfigured.mockReturnValue(true); mocks.browserConfigured.mockReturnValue(true);
  mocks.secret.mockReturnValue(true); mocks.siteUrl.mockReturnValue(true);
  mocks.media.mockReturnValue({ provider: "supabase", isAvailable: true, imagekit: { endpoint: false }, r2: { endpoint: false } });
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ disable_signup: true }) });
  mocks.from.mockImplementation(read); mocks.rpc.mockImplementation(read);
  mocks.bucket.mockResolvedValue(response({ name: "portfolio-media" }));
  mocks.service.mockReturnValue({ from: mocks.from, rpc: mocks.rpc, storage: { getBucket: mocks.bucket } });
  mocks.results.set("site_settings", response([{ id: "main", footer_content: DEFAULT_FOOTER_CONTENT }]));
  mocks.results.set("admin_profiles", response([{ user_id: "owner-id" }]));
  mocks.results.set("is_admin_session_active", response(false));
  mocks.results.set("get_site_navigation_v2_snapshot", response({ items: [{ destination_key: "home", is_visible: true }, { destination_key: "bio", is_visible: false }] }));
  for (const name of ["get_navbar_social_links_v2_snapshot", "get_home_page_v2_snapshot", "get_music_page_v2_snapshot", "get_bio_page_v2_snapshot", "get_gallery_page_v2_snapshot", "get_showreel_page_v2_snapshot", "get_contact_page_v2_snapshot"]) mocks.results.set(name, response({ valid: true }));
  mocks.results.set("get_media_pipeline_v1_snapshot", { data: null, error: { code: "23503" } });
});

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Read-only production readiness", () => {
  it("preserves ok and totals while separating confirmed failures from unknown checks", async () => {
    const result = await getProductionReadiness();
    expect(result.ready).toBe(true);
    expect(result.criticalFailures).toBe(0); expect(result.criticalUnknown).toBe(0);
    expect(result.total).toBe(result.checks.length);
    expect(result.passed).toBe(result.checks.filter(item => item.status === "pass").length);
    expect(result.checks.every(item => item.ok === (item.status === "pass"))).toBe(true);
    expect(check(result, "rate-limit").detail).toContain("write RPC was not called or tested");
    expect(check(result, "database-schema").detail).toContain("0039");
    expect(check(result, "database-schema").detail).toContain("0040");
  });

  it("does not call any save, upload, rate-limit consumption or session-revocation RPC", async () => {
    await getProductionReadiness();
    expect(mocks.rpc.mock.calls.every(([name]) => name.startsWith("get_") || name === "is_admin_session_active")).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("get_media_library_v2_usage");
    expect(mocks.rpc).toHaveBeenCalledWith("is_admin_session_active", { p_user_id: "00000000-0000-4000-8000-000000000000", p_session_id: "00000000-0000-4000-8000-000000000000" });
    expect(mocks.bucket).toHaveBeenCalledWith("portfolio-media");
    expect(mocks.signals.length).toBeGreaterThan(0);
    expect(mocks.signals.every(signal => signal instanceof AbortSignal)).toBe(true);
  });

  it("skips duplicated content/schema reads on Overview but still checks external dependencies", async () => {
    const result = await getProductionReadiness({ includeSchema: false });
    expect(result.checks.some(item => item.id === "database-schema")).toBe(false);
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual(["is_admin_session_active"]);
    expect(mocks.from.mock.calls.map(([name]) => name).sort()).toEqual(["admin_profiles", "security_rate_limits"]);
    expect(mocks.fetch).toHaveBeenCalledOnce(); expect(mocks.bucket).toHaveBeenCalledOnce();
  });

  it.each(["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"])("reports missing database interfaces (%s) as confirmed failures", async code => {
    mocks.results.set("get_media_library_v2_usage", { data: null, error: { code } });
    const result = await getProductionReadiness();
    expect(check(result, "database-schema").status).toBe("fail");
    expect(result.criticalFailures).toBe(1); expect(result.ready).toBe(false);
  });

  it.each(["42501", "PGRST301", "08006", "READINESS_UNAVAILABLE"])("does not tell the owner to apply migrations after an unverified read (%s)", async code => {
    mocks.results.set("get_music_page_v2_snapshot", { data: null, error: { code, message: "private-error-and-secret" } });
    const result = await getProductionReadiness();
    expect(check(result, "database-schema").status).toBe("unknown");
    expect(check(result, "database-schema").detail).toContain("does not prove");
    expect(result.criticalUnknown).toBe(1); expect(result.criticalFailures).toBe(0); expect(result.ready).toBe(false);
    expect(JSON.stringify(result)).not.toContain("private-error-and-secret");
  });

  it.each([null, [], {}, "unexpected"])("treats malformed editor snapshots as unknown: %j", async data => {
    mocks.results.set("get_music_page_v2_snapshot", response(data));
    expect(check(await getProductionReadiness(), "database-schema").status).toBe("unknown");
  });

  it("does not accept a malformed footer or media usage result as healthy", async () => {
    mocks.results.set("site_settings", response([{ id: "main", footer_content: null }]));
    expect(check(await getProductionReadiness(), "database-schema").status).toBe("unknown");
    mocks.results.set("site_settings", response([{ id: "main", footer_content: {} }]));
    expect(check(await getProductionReadiness(), "database-schema").status).toBe("unknown");
    mocks.results.set("site_settings", response([{ id: "main", footer_content: DEFAULT_FOOTER_CONTENT }]));
    mocks.results.set("get_media_library_v2_usage", response([{ asset_id: "id", reference_count: 1 }]));
    expect(check(await getProductionReadiness(), "database-schema").status).toBe("unknown");
  });

  it("distinguishes an absent main configuration from an unverified query", async () => {
    mocks.results.set("site_settings", response([]));
    expect(check(await getProductionReadiness(), "database-schema").status).toBe("fail");
  });

  it("distinguishes an incomplete navigation catalog from a malformed response", async () => {
    mocks.results.set("get_site_navigation_v2_snapshot", response({ items: [] }));
    expect(check(await getProductionReadiness(), "database-schema").status).toBe("fail");
    mocks.results.set("get_site_navigation_v2_snapshot", response({ items: [{ destination_key: "home", is_visible: "yes" }] }));
    expect(check(await getProductionReadiness(), "database-schema").status).toBe("unknown");
  });

  it("reports explicitly enabled public signup as a failure", async () => {
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ disable_signup: false }) });
    const result = await getProductionReadiness();
    expect(check(result, "public-signup").status).toBe("fail");
    expect(check(result, "public-signup").detail).toContain("registration is enabled");
  });

  it.each([{}, { disable_signup: null }, { disable_signup: "true" }, null])("treats malformed auth settings as unknown: %j", async body => {
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => body });
    expect(check(await getProductionReadiness(), "public-signup").status).toBe("unknown");
  });

  it("does not interpret an auth HTTP failure or timeout as signup enabled", async () => {
    mocks.fetch.mockResolvedValue({ ok: false });
    expect(check(await getProductionReadiness(), "public-signup").status).toBe("unknown");
    mocks.fetch.mockRejectedValue(new Error("Timeout with private details"));
    const result = await getProductionReadiness();
    expect(check(result, "public-signup").status).toBe("unknown");
    expect(JSON.stringify(result)).not.toContain("private details");
    expect(check(result, "media-storage").status).toBe("pass");
  });

  it.each([{ status: 404 }, { statusCode: "404" }, { code: "NoSuchBucket" }])("recognizes a confirmed missing bucket: %j", async error => {
    mocks.bucket.mockResolvedValue({ data: null, error });
    expect(check(await getProductionReadiness(), "media-storage").status).toBe("fail");
  });

  it.each([{ status: 403 }, { status: 500 }, { message: "network" }])("treats unavailable bucket information as unknown: %j", async error => {
    mocks.bucket.mockResolvedValue({ data: null, error });
    expect(check(await getProductionReadiness(), "media-storage").status).toBe("unknown");
  });

  it("isolates rejected storage reads from otherwise healthy configuration", async () => {
    mocks.bucket.mockRejectedValue(new Error("network"));
    const result = await getProductionReadiness();
    expect(check(result, "media-storage").status).toBe("unknown");
    expect(check(result, "database-schema").status).toBe("pass");
    expect(check(result, "admin-access").status).toBe("pass");
  });

  it("bounds a stuck dependency without losing successful checks", async () => {
    vi.useFakeTimers();
    mocks.bucket.mockReturnValue(new Promise(() => {}));
    const pending = getProductionReadiness();
    await vi.advanceTimersByTimeAsync(5001);
    const result = await pending;
    expect(check(result, "media-storage").status).toBe("unknown");
    expect(check(result, "database-schema").status).toBe("pass");
  });

  it("reports an empty owner result as fail but unavailable ownership as unknown", async () => {
    mocks.results.set("admin_profiles", response([]));
    expect(check(await getProductionReadiness(), "admin-access").status).toBe("fail");
    mocks.results.set("admin_profiles", { data: null, error: { code: "42501" } });
    expect(check(await getProductionReadiness(), "admin-access").status).toBe("unknown");
  });

  it("does not fabricate backend failures when the service client cannot be created", async () => {
    mocks.serviceConfigured.mockReturnValue(false); mocks.service.mockReturnValue(null);
    const result = await getProductionReadiness();
    expect(check(result, "service-key").status).toBe("fail");
    for (const id of ["database-schema", "media-storage", "admin-access", "session-boundary", "rate-limit"]) expect(check(result, id).status).toBe("unknown");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("handles an invalid client configuration without exposing configuration values", async () => {
    mocks.service.mockImplementation(() => { throw new Error("invalid-private-url"); });
    const result = await getProductionReadiness();
    expect(check(result, "database-schema").status).toBe("unknown");
    expect(JSON.stringify(result)).not.toContain("invalid-private-url");
  });

  it("keeps optional missing configuration separate from critical failures", async () => {
    const result = await getProductionReadiness();
    expect(check(result, "media-processor").status).toBe("fail");
    expect(check(result, "media-processor").critical).toBe(false);
    expect(result.ready).toBe(true);
    expect(check(result, "email").detail).toContain("has not been tested");
  });
});
