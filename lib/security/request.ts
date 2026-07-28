import "server-only";

import { isIP } from "node:net";
import { keyedDigest } from "@/lib/admin/security-secret";

type HeaderReader = {
  get(name: string): string | null;
};

function firstForwardedValue(value: string | null) {
  return value?.split(",")[0]?.trim() || "";
}

/**
 * Vercel's platform header is trusted only while running on Vercel.
 * Self-hosted deployments may set TRUSTED_PROXY=true only when direct access
 * is blocked and their reverse proxy replaces (rather than appends to)
 * incoming x-forwarded-for and x-real-ip headers.
 */
export function getClientIp(headerStore: HeaderReader) {
  let candidate = "";

  if (process.env.VERCEL === "1") {
    candidate = firstForwardedValue(
      headerStore.get("x-vercel-forwarded-for")
    );
  } else if (process.env.TRUSTED_PROXY?.toLowerCase() === "true") {
    candidate =
      firstForwardedValue(headerStore.get("x-forwarded-for")) ||
      headerStore.get("x-real-ip")?.trim() ||
      "";
  }

  return isIP(candidate) ? candidate.toLowerCase() : "unknown";
}

/** Returns an absolute referrer without query parameters, fragments or auth. */
export function getReferrerWithoutQuery(headerStore: HeaderReader) {
  const value = headerStore.get("referer");
  if (!value) return "";

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    return `${url.origin}${url.pathname}`.slice(0, 500);
  } catch {
    return "";
  }
}

export function getPseudonymousIpKey(
  headerStore: HeaderReader,
  context = "public-client-ip"
) {
  return keyedDigest(context, getClientIp(headerStore));
}
