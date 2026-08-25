import { NextResponse } from "next/server";
import { createAdminServiceClient } from "@/lib/admin/service";
import { MEDIA_BUCKET } from "@/lib/admin/media";
import { hasValidBearerToken } from "@/lib/security/bearer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type HealthState = "ok" | "degraded";
type DependencyHealth = {
  database: HealthState;
  storage: HealthState;
  latencyMs: number;
};

const DEPENDENCY_TIMEOUT_MS = 5000;
const DEEP_CACHE_MS = 15_000;
let cachedDeepHealth:
  | { expiresAt: number; value: DependencyHealth }
  | undefined;

function version() {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ||
    process.env.npm_package_version ||
    "development"
  );
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("health check timeout")),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function inspectDependencies(): Promise<DependencyHealth> {
  if (cachedDeepHealth && cachedDeepHealth.expiresAt > Date.now()) {
    return cachedDeepHealth.value;
  }

  const startedAt = Date.now();
  const supabase = createAdminServiceClient();
  if (!supabase) {
    return {
      database: "degraded",
      storage: "degraded",
      latencyMs: Date.now() - startedAt,
    };
  }

  let value: DependencyHealth;
  try {
    const [databaseResult, storageResult] = await withTimeout(
      Promise.all([
        supabase.from("site_settings").select("id").limit(1),
        supabase.storage.listBuckets(),
      ]),
      DEPENDENCY_TIMEOUT_MS
    );
    value = {
      database: databaseResult.error ? "degraded" : "ok",
      storage:
        !storageResult.error &&
        storageResult.data?.some((bucket) => bucket.name === MEDIA_BUCKET)
          ? "ok"
          : "degraded",
      latencyMs: Date.now() - startedAt,
    };
  } catch {
    value = {
      database: "degraded",
      storage: "degraded",
      latencyMs: Date.now() - startedAt,
    };
  }

  cachedDeepHealth = { expiresAt: Date.now() + DEEP_CACHE_MS, value };
  return value;
}

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization");
  const healthSecret = process.env.HEALTHCHECK_SECRET;

  if (authorization && !hasValidBearerToken(authorization, healthSecret)) {
    return NextResponse.json({ status: "unauthorized" }, { status: 401 });
  }

  if (!hasValidBearerToken(authorization, healthSecret)) {
    return NextResponse.json(
      {
        status: "ok",
        check: "liveness",
        timestamp: new Date().toISOString(),
        version: version(),
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=30",
        },
      }
    );
  }

  const checks = await inspectDependencies();
  const healthy = checks.database === "ok" && checks.storage === "ok";

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      check: "dependencies",
      checks,
      timestamp: new Date().toISOString(),
      version: version(),
    },
    {
      status: healthy ? 200 : 503,
      headers: { "Cache-Control": "private, no-store" },
    }
  );
}
