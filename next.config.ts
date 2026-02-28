import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  async headers() {
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",

      // ✅ Embeds (Spotify/SoundCloud/YouTube)
      "frame-src 'self' https://open.spotify.com https://w.soundcloud.com https://www.youtube.com https://www.youtube-nocookie.com",
      "child-src 'self' https://open.spotify.com https://w.soundcloud.com https://www.youtube.com https://www.youtube-nocookie.com",

      // Assets
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https:",
      "media-src 'self' https: blob:",

      // Scripts / Styles (Next runtime compatibility)
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
      "style-src 'self' 'unsafe-inline' https:",

      // Allow embed internals (Spotify CDN etc.)
      "connect-src 'self' https://open.spotify.com https://open.spotifycdn.com https://*.scdn.co https:",

      "upgrade-insecure-requests",
    ].join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;