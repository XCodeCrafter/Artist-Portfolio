import type { NextConfig } from "next";

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

const supabaseStorageOrigin = getHttpsOrigin(
  process.env.NEXT_PUBLIC_SUPABASE_URL
);
const supabaseStorageHostname = supabaseStorageOrigin
  ? new URL(supabaseStorageOrigin).hostname
  : "";

const remotePatterns: NonNullable<NextConfig["images"]>["remotePatterns"] =
  supabaseStorageHostname
    ? [
        {
          protocol: "https",
          hostname: supabaseStorageHostname,
          pathname: "/storage/v1/object/public/**",
        },
      ]
    : [];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  images: {
    remotePatterns,
  },

  async headers() {
    const commonHeaders = [
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-DNS-Prefetch-Control", value: "off" },
      { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
      { key: "Origin-Agent-Cluster", value: "?1" },
      {
        key: "Permissions-Policy",
        value:
          "accelerometer=(), browsing-topics=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
      },
      ...(isDev
        ? []
        : [
            {
              key: "Strict-Transport-Security",
              value: "max-age=31536000; includeSubDomains; preload",
            },
          ]),
    ];

    const privateHeaders = [
      { key: "Cache-Control", value: "no-store, max-age=0" },
      { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
    ];

    return [
      {
        source: "/(.*)",
        headers: commonHeaders,
      },
      {
        source: "/admin/:path*",
        headers: privateHeaders,
      },
      {
        source: "/api/:path*",
        headers: privateHeaders,
      },
    ];
  },
};

export default nextConfig;
