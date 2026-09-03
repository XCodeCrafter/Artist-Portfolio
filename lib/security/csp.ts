const isDev = process.env.NODE_ENV !== "production";

function getHttpsOrigin(value?: string) {
  if (!value) return "";

  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.origin : "";
  } catch {
    return "";
  }
}

export function createContentSecurityPolicy(
  nonce: string,
  options: { allowSameOriginFraming?: boolean } = {}
) {
  const supabaseOrigin = getHttpsOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    "https://challenges.cloudflare.com",
    ...(isDev ? ["'unsafe-eval'"] : []),
  ].join(" ");
  const connectSrc = [
    "'self'",
    "https://open.spotify.com",
    "https://open.spotifycdn.com",
    "https://*.scdn.co",
    "https://api.soundcloud.com",
    "https://w.soundcloud.com",
    "https://challenges.cloudflare.com",
    ...(supabaseOrigin ? [supabaseOrigin] : []),
    ...(isDev
      ? [
          "http://localhost:*",
          "http://127.0.0.1:*",
          "ws://localhost:*",
          "ws://127.0.0.1:*",
        ]
      : []),
  ].join(" ");
  const assetSrc = [
    "'self'",
    "data:",
    "blob:",
    ...(supabaseOrigin ? [supabaseOrigin] : []),
  ].join(" ");
  const frameSrc = [
    "'self'",
    "https://open.spotify.com",
    "https://w.soundcloud.com",
    "https://www.youtube.com",
    "https://www.youtube-nocookie.com",
    "https://player.vimeo.com",
    "https://challenges.cloudflare.com",
  ].join(" ");

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    `frame-ancestors ${
      options.allowSameOriginFraming ? "'self'" : "'none'"
    }`,
    "form-action 'self'",
    `frame-src ${frameSrc}`,
    `child-src ${frameSrc}`,
    `img-src ${assetSrc}`,
    "font-src 'self' data: https://fonts.gstatic.com",
    `media-src ${assetSrc}`,
    `script-src ${scriptSrc}`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    `connect-src ${connectSrc}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}
