const LOCAL_SITE_URL = "http://localhost:3000";

function normalizeHttpUrl(value?: string) {
  if (!value) return "";

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.origin;
  } catch {
    return "";
  }
}

export function getSiteUrl() {
  return (
    normalizeHttpUrl(process.env.SITE_URL) ||
    normalizeHttpUrl(process.env.NEXT_PUBLIC_SITE_URL) ||
    normalizeHttpUrl(
      process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : ""
    ) ||
    LOCAL_SITE_URL
  );
}

export function hasProductionSiteUrl() {
  const configured =
    normalizeHttpUrl(process.env.SITE_URL) ||
    normalizeHttpUrl(process.env.NEXT_PUBLIC_SITE_URL);

  return Boolean(configured && new URL(configured).protocol === "https:");
}
