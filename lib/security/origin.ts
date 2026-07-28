import "server-only";

type HeaderReader = {
  get(name: string): string | null;
};

function parseWebOrigin(value?: string | null) {
  if (!value) return "";

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    if (url.username || url.password) return "";
    return url.origin;
  } catch {
    return "";
  }
}

function parseVercelOrigin(value?: string | null) {
  if (!value) return "";
  return parseConfiguredOrigin(
    value.includes("://") ? value : `https://${value}`
  );
}

function isLoopbackHostname(hostname: string) {
  const normalized = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");

  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "::1" ||
    /^127(?:\.\d{1,3}){3}$/.test(normalized) ||
    normalized.startsWith("::ffff:127.")
  );
}

function parseConfiguredOrigin(value?: string | null) {
  const origin = parseWebOrigin(value);
  if (!origin || process.env.NODE_ENV !== "production") return origin;

  const url = new URL(origin);
  if (url.protocol !== "https:" || isLoopbackHostname(url.hostname)) return "";
  return origin;
}

function getConfiguredOrigins() {
  const origins = new Set<string>();

  for (const value of [process.env.SITE_URL, process.env.NEXT_PUBLIC_SITE_URL]) {
    const origin = parseConfiguredOrigin(value);
    if (origin) origins.add(origin);
  }

  for (const value of [
    process.env.VERCEL_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
  ]) {
    const origin = parseVercelOrigin(value);
    if (origin) origins.add(origin);
  }

  return origins;
}

function isDevelopmentLoopback(origin: string) {
  if (process.env.NODE_ENV === "production") return false;

  try {
    const url = new URL(origin);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      isLoopbackHostname(url.hostname)
    );
  } catch {
    return false;
  }
}

/**
 * Validates browser requests against server configuration only. In
 * particular, Host and forwarding headers never expand this allowlist.
 */
export function hasAllowedRequestOrigin(headerStore: HeaderReader) {
  const rawOrigin = headerStore.get("origin");
  const candidate = rawOrigin
    ? parseWebOrigin(rawOrigin)
    : parseWebOrigin(headerStore.get("referer"));

  if (!candidate) return false;
  if (isDevelopmentLoopback(candidate)) return true;

  return getConfiguredOrigins().has(candidate);
}
