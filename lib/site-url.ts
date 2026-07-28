const LOCAL_SITE_URL = "http://localhost:3000";

function normalizeHttpUrl(value?: string, requireHttps = false) {
  if (!value) return "";

  try {
    const trimmed = value.trim();
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
      return "";
    }

    const candidate = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    if (requireHttps && url.protocol !== "https:") return "";
    return url.origin;
  } catch {
    return "";
  }
}

function isLoopbackUrl(value: string) {
  try {
    const hostname = new URL(value).hostname
      .toLowerCase()
      .replace(/^\[|\]$/g, "");

    return (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "127.0.0.1" ||
      hostname === "::1"
    );
  } catch {
    return false;
  }
}

export function isNonProductionVercelDeployment() {
  return Boolean(
    process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production"
  );
}

export function getSiteUrl() {
  const requireHttps = process.env.NODE_ENV === "production";
  const isVercelDeployment = process.env.VERCEL === "1";
  const configuredCandidates = [
    normalizeHttpUrl(process.env.SITE_URL),
    normalizeHttpUrl(process.env.NEXT_PUBLIC_SITE_URL),
  ].filter(Boolean);

  if (
    isVercelDeployment &&
    configuredCandidates.some((value) => isLoopbackUrl(value))
  ) {
    throw new Error(
      "Vercel deployments cannot use a loopback SITE_URL or NEXT_PUBLIC_SITE_URL."
    );
  }

  if (requireHttps) {
    const insecurePublicUrl = configuredCandidates.find(
      (value) => new URL(value).protocol !== "https:" && !isLoopbackUrl(value)
    );

    if (insecurePublicUrl) {
      throw new Error(
        "Production SITE_URL and NEXT_PUBLIC_SITE_URL must use HTTPS unless they target loopback."
      );
    }
  }

  const configured = requireHttps
    ? configuredCandidates.find(
        (value) =>
          new URL(value).protocol === "https:" && !isLoopbackUrl(value)
      ) || configuredCandidates[0]
    : configuredCandidates[0];
  const productionDeployment = normalizeHttpUrl(
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    true
  );
  const previewDeployment = normalizeHttpUrl(process.env.VERCEL_URL, true);

  if (configured) return configured;
  if (productionDeployment) return productionDeployment;

  // Vercel must always emit an HTTPS origin. The preview URL is only a final
  // fallback when the stable production hostname is unavailable.
  if (process.env.VERCEL && previewDeployment) return previewDeployment;
  if (process.env.VERCEL && requireHttps) {
    throw new Error(
      "A canonical HTTPS SITE_URL or VERCEL_PROJECT_PRODUCTION_URL is required."
    );
  }

  return LOCAL_SITE_URL;
}

export function hasProductionSiteUrl() {
  const configured = [
    normalizeHttpUrl(process.env.SITE_URL, true),
    normalizeHttpUrl(process.env.NEXT_PUBLIC_SITE_URL, true),
    normalizeHttpUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL, true),
  ].filter(Boolean);

  return configured.some((value) => !isLoopbackUrl(value));
}
