import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ service: vi.fn(), limit: vi.fn(), digest: vi.fn(), audit: vi.fn(), insert: vi.fn() }));
vi.mock("@/lib/admin/service", () => ({ createAdminServiceClient: mocks.service }));
vi.mock("@/lib/security/rate-limit", () => ({ consumeDatabaseRateLimit: mocks.limit }));
vi.mock("@/lib/admin/security-secret", () => ({ keyedDigest: mocks.digest }));
vi.mock("@/lib/admin/audit", () => ({ writeAuditLog: mocks.audit }));
import { POST } from "@/app/api/analytics/route";
import { serializeConsentCookie } from "@/lib/privacy/consent";

function request(payload: Record<string, unknown> = {}, cookie = serializeConsentCookie({ analytics: true, externalMedia: false }, false)) {
  return new Request("https://portfolio.example/api/analytics", {
    method: "POST", headers: { "content-type": "application/json", origin: "https://portfolio.example", referer: "https://portfolio.example/music", "user-agent": "Mozilla/5.0 Chrome/120", cookie },
    body: JSON.stringify({ eventName: "page_view", pagePath: "/music", sessionId: "00000000-0000-4000-8000-000000000001", metadata: { landingReferrer: "https://instagram.com/private?secret=1" }, ...payload }),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("VERCEL_ENV", "production"); vi.stubEnv("SITE_URL", "https://portfolio.example"); vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://portfolio.example");
  mocks.service.mockReturnValue({ from: () => ({ insert: mocks.insert }) });
  mocks.insert.mockResolvedValue({ error: null });
  mocks.limit.mockResolvedValue({ allowed: true }); mocks.digest.mockReturnValue("digest");
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("consent-first analytics ingestion", () => {
  it.each(["", "portfolio_privacy_v1=broken"])("does no identifier, logging or database work without valid permission: %s", async (cookie) => {
    expect((await POST(request({}, cookie))).status).toBe(200);
    expect(mocks.limit).not.toHaveBeenCalled(); expect(mocks.digest).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled(); expect(mocks.service).not.toHaveBeenCalled();
  });
  it("treats refusal as a normal preference, not suspicious activity", async () => {
    await POST(request({}, serializeConsentCookie({ analytics: false, externalMedia: true }, false)));
    expect(mocks.insert).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled(); expect(mocks.limit).not.toHaveBeenCalled();
  });
  it.each(["preview", "development"])("excludes %s deployments even after permission", async (environment) => {
    vi.stubEnv("VERCEL_ENV", environment); await POST(request()); expect(mocks.limit).not.toHaveBeenCalled();
  });
  it("uses sanitized landing attribution, not the same-origin API Referer", async () => {
    expect((await POST(request())).status).toBe(200);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ acquisitionSource: "Instagram", collectionVersion: 2, consentVersion: 1 }) }));
    expect(JSON.stringify(mocks.insert.mock.calls)).not.toContain("private"); expect(JSON.stringify(mocks.insert.mock.calls)).not.toContain("secret");
  });
  it("gives allowlisted campaign source priority", async () => {
    await POST(request({ metadata: { landingReferrer: "https://google.com", campaignSource: "spotify" } }));
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ acquisitionSource: "Spotify" }) }));
  });
  it("normalizes destination identity and strips private URL components", async () => {
    await POST(request({ eventName: "outbound_click", targetLabel: "My newest song", targetUrl: "https://open.spotify.com/artist/123?token=secret", metadata: {} }));
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ target_url: "https://open.spotify.com", metadata: expect.objectContaining({ destination: "Spotify" }) }));
  });
  it.each([{ pagePath: "/admin/v2" }, { eventName: "web_vital", metadata: { name: "CLS", value: 0.1, rating: "good" } }, { eventName: "booking_submit" }, { sessionId: "bad" }, { metadata: { campaignSource: "personal@example.com" } }])("rejects invalid, essential-only or unsupported events: %j", async (payload) => {
    expect((await POST(request(payload))).status).toBe(400); expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("surfaces a persistence failure rather than claiming ingestion succeeded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {}); mocks.insert.mockResolvedValue({ error: { code: "XX000", message: "private database details" } });
    expect((await POST(request())).status).toBe(503);
    expect(console.error).toHaveBeenCalledWith("Analytics event persistence failed", { code: "XX000" });
  });
});
