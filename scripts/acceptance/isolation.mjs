// No dotenv, filesystem reads, or inherited provider configuration belongs here.
export const ACCEPTANCE_APP_ORIGIN = "http://127.0.0.1:3101";
export const ACCEPTANCE_API_ORIGIN = "http://127.0.0.1:55431";
export const ACCEPTANCE_PROJECT_ID = "artist-portfolio-acceptance";
export const ACCEPTANCE_MEDIA_BUCKET = "portfolio-acceptance-media";
export const ACCEPTANCE_ADMIN_EMAIL = "owner@portfolio.test";

export const ACCEPTANCE_TARGET = Object.freeze({
  appOrigin: ACCEPTANCE_APP_ORIGIN,
  apiOrigin: ACCEPTANCE_API_ORIGIN,
  projectId: ACCEPTANCE_PROJECT_ID,
});

/** Exact matches deliberately reject URL normalization, aliases, and stale config. */
export function validateAcceptanceTarget(target) {
  if (!target || typeof target !== "object" || Array.isArray(target)) {
    throw new Error("An explicit local acceptance target is required.");
  }
  for (const [name, expected] of Object.entries(ACCEPTANCE_TARGET)) {
    if (target[name] !== expected) {
      throw new Error(`Unsafe acceptance target: ${name} does not match the dedicated local configuration.`);
    }
  }
  return ACCEPTANCE_TARGET;
}

function decodeJwtPart(part) {
  if (!/^[A-Za-z0-9_-]+$/.test(part)) throw new Error("Invalid local acceptance credentials.");
  const bytes = Buffer.from(part, "base64url");
  if (bytes.toString("base64url") !== part) throw new Error("Invalid local acceptance credentials.");
  const value = JSON.parse(bytes.toString("utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid local acceptance credentials.");
  }
  return value;
}

function validateLocalJwt(key, expectedRole) {
  try {
    if (typeof key !== "string" || key.length > 8192) throw new Error();
    const parts = key.split(".");
    if (parts.length !== 3 || !/^[A-Za-z0-9_-]+$/.test(parts[2])) throw new Error();
    const header = decodeJwtPart(parts[0]);
    const claims = decodeJwtPart(parts[1]);
    if (header.alg !== "HS256" || (header.typ !== undefined && header.typ !== "JWT")) throw new Error();
    if (claims.iss !== "supabase-demo" || claims.role !== expectedRole) throw new Error();
    if (claims.ref !== undefined && claims.ref !== ACCEPTANCE_PROJECT_ID) throw new Error();
    if (claims.project_id !== undefined && claims.project_id !== ACCEPTANCE_PROJECT_ID) throw new Error();
    if (claims.exp !== undefined && (!Number.isSafeInteger(claims.exp) || claims.exp <= Date.now() / 1000)) throw new Error();
  } catch {
    // Never echo tokens or parsed values, even when the caller supplied a hosted key.
    throw new Error(`Invalid local acceptance ${expectedRole} credential metadata.`);
  }
}

/**
 * Structural fail-closed checks, NOT signature verification or proof of origin.
 * The launcher must obtain keys from the dedicated local CLI status and verify
 * the local endpoint/project identity before any fixture mutation.
 */
export function validateLocalAcceptanceCredentials(credentials) {
  if (!credentials || typeof credentials !== "object" || Array.isArray(credentials)) {
    throw new Error("Explicit local acceptance credentials are required.");
  }
  validateLocalJwt(credentials.anonKey, "anon");
  validateLocalJwt(credentials.serviceRoleKey, "service_role");
  if (credentials.anonKey === credentials.serviceRoleKey) {
    throw new Error("Local acceptance key roles must be distinct.");
  }
  return { anonKey: credentials.anonKey, serviceRoleKey: credentials.serviceRoleKey };
}

const OS_ENV_ALLOWLIST = new Set([
  "PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP",
  "USERPROFILE", "APPDATA", "LOCALAPPDATA",
]);

/**
 * The child MUST run in the filtered shadow workspace, not the source repo:
 * Next loads .env files independently of the process environment.
 */
export function buildAcceptanceChildEnv({ parentEnv, target, credentials, authSecuritySecret }) {
  validateAcceptanceTarget(target);
  const localKeys = validateLocalAcceptanceCredentials(credentials);
  if (typeof authSecuritySecret !== "string" || !/^[A-Za-z0-9_-]{32,256}$/.test(authSecuritySecret)) {
    throw new Error("A dedicated random acceptance security secret is required.");
  }
  if (!parentEnv || typeof parentEnv !== "object" || Array.isArray(parentEnv)) {
    throw new Error("An explicit parent OS environment is required.");
  }

  const environment = {};
  for (const [key, value] of Object.entries(parentEnv)) {
    const canonicalKey = key.toUpperCase();
    if (OS_ENV_ALLOWLIST.has(canonicalKey) && typeof value === "string" && !value.includes("\0")) {
      // Canonicalize Windows' Path/PATH aliases instead of creating duplicate keys.
      environment[canonicalKey] = value;
    }
  }
  return {
    ...environment,
    NODE_ENV: "development",
    NEXT_TELEMETRY_DISABLED: "1",
    SITE_URL: ACCEPTANCE_APP_ORIGIN,
    NEXT_PUBLIC_SITE_URL: ACCEPTANCE_APP_ORIGIN,
    NEXT_PUBLIC_SUPABASE_URL: ACCEPTANCE_API_ORIGIN,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: localKeys.anonKey,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: localKeys.anonKey,
    SUPABASE_SECRET_KEY: localKeys.serviceRoleKey,
    SUPABASE_SERVICE_ROLE_KEY: localKeys.serviceRoleKey,
    SUPABASE_MEDIA_BUCKET: ACCEPTANCE_MEDIA_BUCKET,
    MEDIA_UPLOAD_PROVIDER: "supabase",
    IMAGEKIT_PILOT_UPLOAD_ENABLED: "false",
    AUTH_SECURITY_SECRET: authSecuritySecret,
    ADMIN_EMAILS: ACCEPTANCE_ADMIN_EMAIL,
  };
}

const SHADOW_ROOT_FILES = new Set([
  "package.json", "package-lock.json", "next.config.ts", "next-env.d.ts",
  "tsconfig.json", "postcss.config.mjs", "proxy.ts",
]);
const SHADOW_ROOT_DIRECTORIES = new Set(["app", "components", "lib", "styles", "public"]);

/** Copy only app inputs. The copier must separately reject symlinks/junctions. */
export function shouldCopyAcceptancePath(relativePath) {
  if (typeof relativePath !== "string" || !relativePath || /[\0-\x1f\x7f:]/.test(relativePath)) return false;
  const path = relativePath.replaceAll("\\", "/");
  if (path.startsWith("/")) return false;
  const segments = path.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return false;
  const lower = segments.map((segment) => segment.toLowerCase());
  if (lower.some((segment) => segment.startsWith(".env") || segment.startsWith(".next") ||
    [".git", ".vercel", "node_modules", ".acceptance", ".temp"].includes(segment))) return false;
  if (/\.(?:pem|key|crt|pfx|p12)$/i.test(path)) return false;
  return segments.length === 1
    ? SHADOW_ROOT_FILES.has(path) || SHADOW_ROOT_DIRECTORIES.has(path)
    : SHADOW_ROOT_DIRECTORIES.has(segments[0]);
}
