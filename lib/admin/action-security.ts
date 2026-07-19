import { headers } from "next/headers";
import { writeAuditLog } from "@/lib/admin/audit";

function safeOrigin(value?: string | null) {
  if (!value) return "";

  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function sanitizeHeaderValue(value?: string | null) {
  return (value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[\u0000-\u001f\u007f]+/g, "")
    .trim()
    .slice(0, 220);
}

type HeaderReader = {
  get(name: string): string | null;
};

function allowedOrigins(headerStore: HeaderReader) {
  const origins = new Set<string>();
  const host = headerStore.get("host");
  const forwardedProto = headerStore.get("x-forwarded-proto");
  const protocol =
    forwardedProto || (host?.startsWith("localhost") ? "http" : "https");

  if (host) {
    origins.add(`${protocol}://${host}`);
  }

  const configured = [
    process.env.SITE_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "",
  ];

  for (const value of configured) {
    const origin = safeOrigin(value);
    if (origin) origins.add(origin);
  }

  if (process.env.NODE_ENV !== "production") {
    origins.add("http://localhost:3000");
    origins.add("http://127.0.0.1:3000");
  }

  return origins;
}

export async function verifyAdminActionOrigin(
  actorId: string | undefined,
  recordId: string
) {
  const headerStore = await headers();
  const origin = safeOrigin(headerStore.get("origin"));
  const refererOrigin = safeOrigin(headerStore.get("referer"));
  const candidate = origin || refererOrigin;

  if (!candidate && process.env.NODE_ENV !== "production") return true;

  if (candidate && allowedOrigins(headerStore).has(candidate)) return true;

  await writeAuditLog({
    actorId,
    action: "security_admin_bad_origin",
    tableName: "security_events",
    recordId,
    metadata: {
      origin: sanitizeHeaderValue(headerStore.get("origin")),
      referer: sanitizeHeaderValue(headerStore.get("referer")),
      host: sanitizeHeaderValue(headerStore.get("host")),
    },
  });

  return false;
}

export async function verifyPublicAuthActionOrigin(recordId: string) {
  return verifyAdminActionOrigin(undefined, `auth:${recordId}`);
}
