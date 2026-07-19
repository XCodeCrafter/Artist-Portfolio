import Link from "next/link";
import { FaArrowLeft, FaExclamationTriangle } from "react-icons/fa";
import AdminAuthShell from "@/components/admin/AdminAuthShell";
import ResetPasswordForm from "@/components/admin/ResetPasswordForm";
import { getCurrentAdminCandidate } from "@/lib/admin/auth";
import { hasValidAdminRecoveryChallenge } from "@/lib/admin/recovery";
import { getPortfolioContent } from "@/lib/content";

export const metadata = {
  title: "Choose New Admin Password",
};

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  const [admin, content] = await Promise.all([
    getCurrentAdminCandidate(),
    getPortfolioContent(),
  ]);
  const canReset = admin
    ? await hasValidAdminRecoveryChallenge(admin.id)
    : false;
  const homeHero = content.heroes.home;
  const imageSrc =
    homeHero.mediaType === "image"
      ? homeHero.backgroundSrc || "/images/hero.jpg"
      : homeHero.posterSrc || "/images/hero.jpg";

  return (
    <AdminAuthShell
      brandName={content.settings.artistName}
      description={
        canReset
          ? "Choose a strong, unique password for your admin account."
          : "For your security, password reset links are single-use and expire."
      }
      eyebrow="Account recovery"
      imageSrc={imageSrc}
      title={canReset ? "Choose a new password." : "Reset link unavailable."}
    >
      {canReset ? (
        <ResetPasswordForm />
      ) : (
        <div className="mt-9">
          <div className="rounded-[26px] border border-amber-300/16 bg-amber-400/[0.07] p-5 sm:p-6">
            <FaExclamationTriangle
              aria-hidden="true"
              className="text-lg text-amber-200/80"
            />
            <p className="mt-4 text-sm leading-6 text-white/55">
              The link may have expired, already been used, or does not belong
              to an approved administrator.
            </p>
          </div>
          <Link
            className="group mt-5 inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-white/52 transition hover:text-white"
            href="/admin/forgot-password"
          >
            <FaArrowLeft
              aria-hidden="true"
              className="text-[10px] transition-transform group-hover:-translate-x-0.5"
            />
            Request a new reset link
          </Link>
        </div>
      )}
    </AdminAuthShell>
  );
}
