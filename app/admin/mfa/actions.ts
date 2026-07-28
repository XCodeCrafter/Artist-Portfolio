"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { verifyAdminActionOrigin } from "@/lib/admin/action-security";
import { enforceAuthRateLimit } from "@/lib/admin/auth-rate-limit";
import { getCurrentAdminCandidate } from "@/lib/admin/auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { createClient } from "@/lib/supabase/server";

const TotpSchema = z.object({
  factorId: z.string().uuid(),
  code: z.string().trim().regex(/^\d{6}$/),
});

export type MfaState = {
  ok: boolean;
  message: string;
  enrollment?: {
    factorId: string;
    qrCode: string;
    secret: string;
  };
};

async function getMfaCandidate() {
  const admin = await getCurrentAdminCandidate();
  if (!admin) return null;

  if (!(await verifyAdminActionOrigin(admin.id, "mfa"))) {
    return null;
  }

  return admin;
}

export async function startMfaEnrollment(
  _previousState: MfaState,
  _formData: FormData
): Promise<MfaState> {
  void _previousState;
  void _formData;
  const admin = await getMfaCandidate();
  if (!admin) {
    return { ok: false, message: "Your sign-in session expired. Sign in again." };
  }

  const supabase = await createClient();
  const factors = await supabase.auth.mfa.listFactors();
  if (factors.error) {
    return { ok: false, message: "Authenticator setup could not be started." };
  }

  if (factors.data.totp.length > 0) {
    return {
      ok: false,
      message: "An authenticator is already enrolled. Refresh this page.",
    };
  }

  for (const factor of factors.data.all) {
    if (factor.factor_type === "totp" && factor.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }

  const enrollment = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "Portfolio admin",
  });

  if (enrollment.error || enrollment.data.type !== "totp") {
    return { ok: false, message: "Authenticator setup could not be started." };
  }

  const qrCode = enrollment.data.totp.qr_code.trim();
  const secret = enrollment.data.totp.secret.trim();

  if (!qrCode.startsWith("data:image/svg+xml") || !secret) {
    await supabase.auth.mfa.unenroll({ factorId: enrollment.data.id });
    return { ok: false, message: "Authenticator setup could not be started." };
  }

  await writeAuditLog({
    actorId: admin.id,
    action: "admin_mfa_enrollment_started",
    tableName: "auth",
    recordId: admin.id,
  });

  return {
    ok: true,
    message: "Scan the QR code and confirm the six-digit code.",
    enrollment: {
      factorId: enrollment.data.id,
      qrCode,
      secret,
    },
  };
}

export async function verifyMfaCode(
  _previousState: MfaState,
  formData: FormData
): Promise<MfaState> {
  const admin = await getMfaCandidate();
  if (!admin) {
    return { ok: false, message: "Your sign-in session expired. Sign in again." };
  }

  const parsed = TotpSchema.safeParse({
    factorId: formData.get("factorId"),
    code: formData.get("code"),
  });
  if (!parsed.success) {
    return { ok: false, message: "Enter the six-digit authenticator code." };
  }

  const rateLimit = await enforceAuthRateLimit("mfa", admin.email);
  if (!rateLimit.allowed) {
    if (rateLimit.firstDenied) {
      await writeAuditLog({
        actorId: admin.id,
        action: "security_admin_mfa_rate_limited",
        tableName: "security_events",
        recordId: admin.id,
        metadata: {
          ...rateLimit.auditMetadata,
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        },
      });
    }

    return {
      ok: false,
      message: rateLimit.configured
        ? "Too many verification attempts. Wait a few minutes and try again."
        : "Admin verification security is not configured.",
    };
  }

  const supabase = await createClient();
  const result = await supabase.auth.mfa.challengeAndVerify(parsed.data);
  if (result.error) {
    await writeAuditLog({
      actorId: admin.id,
      action: "admin_mfa_verification_failed",
      tableName: "auth",
      recordId: admin.id,
      metadata: rateLimit.auditMetadata,
    });
    return { ok: false, message: "That code is invalid or has expired." };
  }

  const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance.error || assurance.data.currentLevel !== "aal2") {
    return { ok: false, message: "Verification did not complete. Try again." };
  }

  await writeAuditLog({
    actorId: admin.id,
    action: "admin_mfa_verified",
    tableName: "auth",
    recordId: admin.id,
    metadata: rateLimit.auditMetadata,
  });

  redirect("/admin");
}
