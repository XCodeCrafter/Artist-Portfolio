import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAdminNavigationData } from "@/lib/admin/navigation";

const mocks = vi.hoisted(() => ({ client: vi.fn(), requireAdmin: vi.fn(async () => ({ id: "admin" })) }));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/admin/service", () => ({ createAdminServiceClient: mocks.client, hasAdminServiceEnv: () => true }));

function client(settings: Record<string, unknown>, settingsError: unknown = null) {
  return {
    rpc: vi.fn(async () => ({ data: { artistName: "Franky", portfolioType: "musician", configVersion: 0, items: [] }, error: null })),
    from: vi.fn((table: string) => {
      const value = table === "site_settings" ? { data: settings, error: settingsError } : { count: 2, error: null };
      const query = {
        select: vi.fn(() => query), eq: vi.fn(() => query),
        maybeSingle: vi.fn(async () => value),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(value).then(resolve),
      };
      return query;
    }),
  };
}

beforeEach(() => vi.clearAllMocks());

describe("admin navbar Bio visibility availability", () => {
  it("marks the resume anchor unavailable even when saved resume and credits exist", async () => {
    mocks.client.mockReturnValue(client({ bio_resume_credits_enabled: false }));
    const result = await getAdminNavigationData();
    expect(result.availability.hasResumeContent).toBe(false);
    expect(result.availability.hasPublishedCncPrograms).toBe(true);
  });

  it.each([{}, { bio_resume_credits_enabled: true }])("preserves legacy or explicitly enabled availability %#", async settings => {
    mocks.client.mockReturnValue(client(settings));
    expect((await getAdminNavigationData()).availability.hasResumeContent).toBe(true);
  });

  it("does not advertise a resume anchor on an unconfirmed settings read", async () => {
    mocks.client.mockReturnValue(client({}, { code: "XX000" }));
    expect((await getAdminNavigationData()).availability.hasResumeContent).toBe(false);
  });
});
