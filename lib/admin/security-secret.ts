import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

function getBaseSecret() {
  const dedicatedSecret = process.env.AUTH_SECURITY_SECRET || "";
  const secret =
    dedicatedSecret ||
    (process.env.NODE_ENV !== "production"
      ? process.env.SUPABASE_SECRET_KEY ||
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        ""
      : "");

  if (process.env.NODE_ENV === "production" && secret.length < 32) {
    return "";
  }

  return secret;
}

export function hasAuthSecuritySecret() {
  return getBaseSecret().length >= 32;
}

export function keyedDigest(context: string, value: string) {
  const secret = getBaseSecret();
  if (!secret) return "";

  return createHmac("sha256", secret)
    .update(`${context}\u0000${value}`)
    .digest("hex");
}

export function safeDigestEqual(left: string, right: string) {
  if (!left || !right || left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
}
