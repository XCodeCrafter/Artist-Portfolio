import { redirect } from "next/navigation";
import AdminAuthShell from "@/components/admin/AdminAuthShell";
import MfaForm from "@/components/admin/MfaForm";
import LogoutButton from "@/components/admin/LogoutButton";
import {
  getCurrentAdmin,
  getCurrentAdminCandidate,
} from "@/lib/admin/auth";
import { getPortfolioContent } from "@/lib/content";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Admin verification" };
export const dynamic = "force-dynamic";

export default async function AdminMfaPage() {
  const [admin, candidate, content] = await Promise.all([
    getCurrentAdmin(),
    getCurrentAdminCandidate(),
    getPortfolioContent(),
  ]);

  if (admin) redirect("/admin");
  if (!candidate) redirect("/admin/login");

  const supabase = await createClient();
  const factors = await supabase.auth.mfa.listFactors();
  const verifiedFactorId = factors.data?.totp[0]?.id;
  const homeHero = content.heroes.home;
  const imageSrc =
    homeHero.mediaType === "image"
      ? homeHero.backgroundSrc || "/images/hero.jpg"
      : homeHero.posterSrc || "/images/hero.jpg";

  return (
    <AdminAuthShell
      brandName={content.settings.artistName}
      description="A second factor is required for every administrator session."
      eyebrow="Secure verification"
      imageSrc={imageSrc}
      title={verifiedFactorId ? "Enter your security code." : "Set up two-factor authentication."}
    >
      {factors.error ? (
        <div className="mt-9 rounded-2xl border border-red-300/16 bg-red-500/[0.08] px-4 py-3.5 text-sm text-red-100/85">
          Authenticator factors could not be loaded. Sign out and try again.
        </div>
      ) : (
        <MfaForm verifiedFactorId={verifiedFactorId} />
      )}
      <div className="mt-5 border-t border-white/8 pt-5">
        <LogoutButton />
      </div>
    </AdminAuthShell>
  );
}
