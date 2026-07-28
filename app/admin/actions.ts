"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import {
  getCurrentAdminCandidate,
  isAdminEmailApproved,
  isAllowedAdmin,
} from "@/lib/admin/auth";
import {
  verifyAdminActionOrigin,
  verifyPublicAuthActionOrigin,
} from "@/lib/admin/action-security";
import { enforceAuthRateLimit } from "@/lib/admin/auth-rate-limit";
import { writeAuditLog } from "@/lib/admin/audit";
import { consumeAdminRecoveryChallenge } from "@/lib/admin/recovery";
import { getSiteUrl } from "@/lib/site-url";
import { hasSupabaseBrowserEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

const LoginSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(512),
  captchaToken: z.string().max(2048).optional(),
});

const ResetRequestSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  captchaToken: z.string().max(2048).optional(),
});

const NewPasswordSchema = z
  .object({
    password: z.string().min(12).max(512),
    confirmPassword: z.string().min(1).max(512),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export type LoginState = {
  ok: boolean;
  message: string;
};

export type PasswordResetState = {
  ok: boolean;
  message: string;
};

const GENERIC_LOGIN_ERROR = "Invalid admin credentials.";
const GENERIC_RESET_SUCCESS = {
  ok: true,
  message:
    "If this address belongs to an approved admin, a reset link is on its way. Check your spam folder too.",
};

async function keepResetResponseUniform(startedAt: number) {
  const floorMs = 1000 + Math.floor(Math.random() * 250);
  const remaining = floorMs - (Date.now() - startedAt);
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}

export async function loginAdmin(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  if (!hasSupabaseBrowserEnv()) {
    return {
      ok: false,
      message: "Supabase auth is not configured.",
    };
  }

  if (!(await verifyPublicAuthActionOrigin("login"))) {
    return {
      ok: false,
      message: "The security check failed. Refresh and try again.",
    };
  }

  const parsedLogin = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    captchaToken: String(formData.get("captchaToken") || "") || undefined,
  });

  if (!parsedLogin.success) {
    return {
      ok: false,
      message: "Enter a valid email and password.",
    };
  }

  const { captchaToken, email, password } = parsedLogin.data;
  const rateLimit = await enforceAuthRateLimit("login", email);

  if (!rateLimit.allowed) {
    if (rateLimit.firstDenied) {
      await writeAuditLog({
        action: "security_admin_login_rate_limited",
        tableName: "security_events",
        recordId: "admin-login",
        metadata: {
          ...rateLimit.auditMetadata,
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        },
      });
    }

    return {
      ok: false,
      message: rateLimit.configured
        ? "Too many sign-in attempts. Wait a few minutes and try again."
        : "Admin sign-in security is not configured.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
    options: captchaToken ? { captchaToken } : undefined,
  });

  if (error || !data.user) {
    await writeAuditLog({
      action: "admin_login_failed",
      metadata: rateLimit.auditMetadata,
    });

    return {
      ok: false,
      message: GENERIC_LOGIN_ERROR,
    };
  }

  if (!(await isAllowedAdmin(data.user))) {
    await supabase.auth.signOut();
    await writeAuditLog({
      actorId: data.user.id,
      action: "admin_login_denied",
      metadata: rateLimit.auditMetadata,
    });

    return {
      ok: false,
      message: GENERIC_LOGIN_ERROR,
    };
  }

  await writeAuditLog({
    actorId: data.user.id,
    action: "admin_login_password_success",
    metadata: rateLimit.auditMetadata,
  });

  const { data: assurance } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  redirect(assurance?.currentLevel === "aal2" ? "/admin" : "/admin/mfa");
}

export async function requestPasswordReset(
  _prevState: PasswordResetState,
  formData: FormData
): Promise<PasswordResetState> {
  const startedAt = Date.now();

  if (!hasSupabaseBrowserEnv()) {
    return {
      ok: false,
      message: "Password recovery is not configured.",
    };
  }

  if (!(await verifyPublicAuthActionOrigin("password-reset"))) {
    await keepResetResponseUniform(startedAt);
    return GENERIC_RESET_SUCCESS;
  }

  const parsedRequest = ResetRequestSchema.safeParse({
    email: formData.get("email"),
    captchaToken: String(formData.get("captchaToken") || "") || undefined,
  });

  if (!parsedRequest.success) {
    return {
      ok: false,
      message: "Enter a valid admin email address.",
    };
  }

  const { captchaToken, email } = parsedRequest.data;
  const rateLimit = await enforceAuthRateLimit("password-reset", email);
  if (!rateLimit.allowed) {
    if (rateLimit.firstDenied) {
      await writeAuditLog({
        action: "security_admin_password_reset_rate_limited",
        tableName: "security_events",
        recordId: "password-recovery",
        metadata: {
          ...rateLimit.auditMetadata,
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        },
      });
    }

    await keepResetResponseUniform(startedAt);
    return GENERIC_RESET_SUCCESS;
  }

  const callbackUrl = new URL("/admin/auth/callback", getSiteUrl());
  const supabase = await createClient();
  const approved = await isAdminEmailApproved(email);
  const { error } = approved
    ? await supabase.auth.resetPasswordForEmail(email, {
        captchaToken,
        redirectTo: callbackUrl.toString(),
      })
    : { error: null };

  if (error) {
    await writeAuditLog({
      action: "admin_password_reset_request_failed",
      tableName: "auth",
      recordId: "password-recovery",
      metadata: { ...rateLimit.auditMetadata, reason: error.name },
    });
  } else if (approved) {
    await writeAuditLog({
      action: "admin_password_reset_requested",
      tableName: "auth",
      recordId: "password-recovery",
      metadata: rateLimit.auditMetadata,
    });
  }

  await keepResetResponseUniform(startedAt);
  return GENERIC_RESET_SUCCESS;
}

export async function updateAdminPassword(
  _prevState: PasswordResetState,
  formData: FormData
): Promise<PasswordResetState> {
  if (!hasSupabaseBrowserEnv()) {
    return {
      ok: false,
      message: "Password recovery is not configured.",
    };
  }

  const parsedPassword = NewPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsedPassword.success) {
    const mismatch = parsedPassword.error.issues.some(
      (issue) => issue.path[0] === "confirmPassword"
    );

    return {
      ok: false,
      message: mismatch
        ? "The passwords do not match."
        : "Use a password with at least 12 characters.",
    };
  }

  const admin = await getCurrentAdminCandidate();
  if (!admin) {
    return {
      ok: false,
      message: "This reset link is invalid or has expired. Request a new one.",
    };
  }

  if (!(await verifyAdminActionOrigin(admin.id, "password-recovery"))) {
    return {
      ok: false,
      message: "The security check failed. Refresh the page and try again.",
    };
  }

  if (!(await consumeAdminRecoveryChallenge(admin.id))) {
    return {
      ok: false,
      message: "This reset link is invalid or has expired. Request a new one.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsedPassword.data.password,
  });

  if (error) {
    await writeAuditLog({
      actorId: admin.id,
      action: "admin_password_update_failed",
      tableName: "auth",
      recordId: admin.id,
      metadata: { email: admin.email, reason: error.name },
    });

    return {
      ok: false,
      message: "The password could not be updated. Request a new reset link.",
    };
  }

  await writeAuditLog({
    actorId: admin.id,
    action: "admin_password_updated",
    tableName: "auth",
    recordId: admin.id,
    metadata: { email: admin.email },
  });

  await supabase.auth.signOut();
  redirect("/admin/login?password=updated");
}

export async function logoutAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && !(await verifyAdminActionOrigin(user.id, "logout"))) {
    redirect("/admin");
  }

  await supabase.auth.signOut();
  await writeAuditLog({
    actorId: user?.id,
    action: "admin_logout",
    metadata: { email: user?.email },
  });

  redirect("/admin/login");
}
