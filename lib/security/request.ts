import "server-only";

import { keyedDigest } from "@/lib/admin/security-secret";

type HeaderReader = {
  get(name: string): string | null;
};

function firstForwardedValue(value: string | null) {
  return value?.split(",")[0]?.trim() || "";
}

/**
 * Vercel provides x-vercel-forwarded-for independently from user-controlled
 * forwarding headers. The remaining headers keep self-hosted deployments
 * functional behind a trusted reverse proxy.
 */
export function getClientIp(headerStore: HeaderReader) {
  const candidate =
    firstForwardedValue(headerStore.get("x-vercel-forwarded-for")) ||
    firstForwardedValue(headerStore.get("x-forwarded-for")) ||
    headerStore.get("x-real-ip")?.trim() ||
    "unknown";

  return (
    candidate
      .replace(/[^\w:.-]/g, "")
      .slice(0, 80)
      .toLowerCase() || "unknown"
  );
}

export function getPseudonymousIpKey(
  headerStore: HeaderReader,
  context = "public-client-ip"
) {
  return keyedDigest(context, getClientIp(headerStore));
}
