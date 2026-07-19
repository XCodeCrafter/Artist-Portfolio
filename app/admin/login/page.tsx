import { redirect } from "next/navigation";
import AdminAuthShell from "@/components/admin/AdminAuthShell";
import LoginForm from "@/components/admin/LoginForm";
import {
  getCurrentAdmin,
  getCurrentAdminCandidate,
} from "@/lib/admin/auth";
import { getPortfolioContent } from "@/lib/content";
import { hasSupabaseBrowserEnv } from "@/lib/supabase/env";

export const metadata = {
  title: "Admin Login",
};

export const dynamic = "force-dynamic";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ password?: string }>;
}) {
  const [admin, candidate, content, params] = await Promise.all([
    getCurrentAdmin(),
    getCurrentAdminCandidate(),
    getPortfolioContent(),
    searchParams,
  ]);

  if (admin) {
    redirect("/admin");
  }
  if (candidate) {
    redirect("/admin/mfa");
  }

  const isConfigured = hasSupabaseBrowserEnv();
  const homeHero = content.heroes.home;
  const imageSrc =
    homeHero.mediaType === "image"
      ? homeHero.backgroundSrc || "/images/hero.jpg"
      : homeHero.posterSrc || "/images/hero.jpg";

  return (
    <AdminAuthShell
      brandName={content.settings.artistName}
      description="Sign in with your approved admin account to manage the portfolio."
      eyebrow="Admin access"
      imageSrc={imageSrc}
      title="Welcome back."
    >
      {!isConfigured ? (
        <div className="mt-9 rounded-2xl border border-red-300/16 bg-red-500/[0.08] px-4 py-3.5 text-sm leading-6 text-red-100/85">
          Supabase Auth is not configured. Add the public Supabase URL and
          publishable key to enable admin access.
        </div>
      ) : (
        <LoginForm
          successMessage={
            params.password === "updated"
              ? "Password updated. Sign in with your new password."
              : undefined
          }
        />
      )}
    </AdminAuthShell>
  );
}
