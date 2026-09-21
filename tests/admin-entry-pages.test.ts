import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminLoginPage from "@/app/admin/login/page";
import AdminMfaPage from "@/app/admin/mfa/page";
import ForgotPasswordPage from "@/app/admin/forgot-password/page";

const mocks = vi.hoisted(() => ({
  getCurrentAdmin: vi.fn(), getCurrentAdminCandidate: vi.fn(), createClient: vi.fn(),
}));
vi.mock("@/lib/admin/auth", () => ({
  getCurrentAdmin: mocks.getCurrentAdmin,
  getCurrentAdminCandidate: mocks.getCurrentAdminCandidate,
}));
vi.mock("@/lib/content", () => ({ getPortfolioContent: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/components/admin/AdminAuthShell", () => ({ default: () => null }));
vi.mock("@/components/admin/LoginForm", () => ({ default: () => null }));
vi.mock("@/components/admin/MfaForm", () => ({ default: () => null }));
vi.mock("@/components/admin/LogoutButton", () => ({ default: () => null }));
vi.mock("@/components/admin/ForgotPasswordForm", () => ({ default: () => null }));
vi.mock("next/navigation", () => ({
  redirect: (destination: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { destination }); },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentAdmin.mockResolvedValue({ id: "approved-aal2-admin" });
  mocks.getCurrentAdminCandidate.mockResolvedValue({ id: "approved-admin-candidate" });
});

describe("existing fully authorized sessions enter V2", () => {
  it("routes the login page to V2", async () => {
    await expect(AdminLoginPage({ searchParams: Promise.resolve({}) })).rejects.toMatchObject({ destination: "/admin/v2" });
  });
  it("routes the MFA page to V2 without starting another enrollment", async () => {
    await expect(AdminMfaPage()).rejects.toMatchObject({ destination: "/admin/v2" });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it("routes the forgot-password page to V2 only for an already authorized session", async () => {
    await expect(ForgotPasswordPage({ searchParams: Promise.resolve({}) })).rejects.toMatchObject({ destination: "/admin/v2" });
  });
  it("still routes an approved candidate without AAL2 to MFA", async () => {
    mocks.getCurrentAdmin.mockResolvedValue(null);
    await expect(AdminLoginPage({ searchParams: Promise.resolve({}) })).rejects.toMatchObject({ destination: "/admin/mfa" });
  });
  it("still routes a missing candidate to login, not V2", async () => {
    mocks.getCurrentAdmin.mockResolvedValue(null);
    mocks.getCurrentAdminCandidate.mockResolvedValue(null);
    await expect(AdminMfaPage()).rejects.toMatchObject({ destination: "/admin/login" });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
