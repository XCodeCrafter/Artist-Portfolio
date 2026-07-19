import { redirect } from "next/navigation";
import AdminAuthShell from "@/components/admin/AdminAuthShell";
import ForgotPasswordForm from "@/components/admin/ForgotPasswordForm";
import { getCurrentAdmin } from "@/lib/admin/auth";
import { getPortfolioContent } from "@/lib/content";

export const metadata = {
  title: "Reset Admin Password",
};

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [admin, content, params] = await Promise.all([
    getCurrentAdmin(),
    getPortfolioContent(),
    searchParams,
  ]);

  if (admin) {
    redirect("/admin");
  }

  const homeHero = content.heroes.home;
  const imageSrc =
    homeHero.mediaType === "image"
      ? homeHero.backgroundSrc || "/images/hero.jpg"
      : homeHero.posterSrc || "/images/hero.jpg";

  return (
    <AdminAuthShell
      brandName={content.settings.artistName}
      description="Enter your approved admin email and we’ll send a secure link to choose a new password."
      eyebrow="Account recovery"
      imageSrc={imageSrc}
      title="Reset your password."
    >
      <ForgotPasswordForm
        initialError={
          params.error === "invalid-link"
            ? "This reset link is invalid or has expired. Request a new one below."
            : undefined
        }
      />
    </AdminAuthShell>
  );
}
