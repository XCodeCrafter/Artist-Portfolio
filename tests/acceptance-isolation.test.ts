import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACCEPTANCE_ADMIN_EMAIL, ACCEPTANCE_API_ORIGIN, ACCEPTANCE_APP_ORIGIN,
  ACCEPTANCE_MEDIA_BUCKET, ACCEPTANCE_PROJECT_ID, ACCEPTANCE_TARGET,
  buildAcceptanceChildEnv, shouldCopyAcceptancePath,
  validateAcceptanceTarget, validateLocalAcceptanceCredentials,
} from "../scripts/acceptance/isolation.mjs";

function jwt(role: string, overrides: Record<string, unknown> = {}, header = { alg: "HS256", typ: "JWT" }) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode(header)}.${encode({ iss: "supabase-demo", role, ...overrides })}.fake_signature`;
}

const credentials = { anonKey: jwt("anon"), serviceRoleKey: jwt("service_role") };
const secret = "isolated_test_secret_".repeat(3);

describe("acceptance target isolation", () => {
  it("pins the distinct local project and endpoints", () => {
    expect(ACCEPTANCE_APP_ORIGIN).toBe("http://127.0.0.1:3101");
    expect(ACCEPTANCE_API_ORIGIN).toBe("http://127.0.0.1:55431");
    expect(ACCEPTANCE_PROJECT_ID).toBe("artist-portfolio-acceptance");
    expect(ACCEPTANCE_ADMIN_EMAIL).toBe("owner@portfolio.test");
    expect(validateAcceptanceTarget({ ...ACCEPTANCE_TARGET })).toBe(ACCEPTANCE_TARGET);
    expect(Object.isFrozen(ACCEPTANCE_TARGET)).toBe(true);
  });

  it.each([
    "http://localhost:3101", "http://127.0.0.1:3000", "http://127.0.0.1:3001",
    "http://127.0.0.1:3101/", "http://127.0.0.1:3101/path", "http://127.1:3101",
    "http://2130706433:3101", "http://127.0.0.1:3101?next=https://hosted.test",
    "http://user:password@127.0.0.1:3101", "https://portfolio.vercel.app",
  ])("rejects noncanonical or reserved app target %s", (appOrigin) => {
    expect(() => validateAcceptanceTarget({ ...ACCEPTANCE_TARGET, appOrigin })).toThrow("Unsafe acceptance target");
  });

  it.each(["https://hosted.supabase.co", "http://127.0.0.1:54321", "http://localhost:55431", "http://127.0.0.1:55431/"])(
    "rejects a hosted, default, or aliased API target %s", (apiOrigin) => {
      expect(() => validateAcceptanceTarget({ ...ACCEPTANCE_TARGET, apiOrigin })).toThrow("Unsafe acceptance target");
    },
  );

  it("rejects omitted and stale project metadata", () => {
    expect(() => validateAcceptanceTarget(undefined)).toThrow();
    expect(() => validateAcceptanceTarget({ ...ACCEPTANCE_TARGET, projectId: "artist-portfolio" })).toThrow();
    expect(() => validateAcceptanceTarget({ appOrigin: ACCEPTANCE_APP_ORIGIN })).toThrow();
  });
});

describe("acceptance credential metadata guard", () => {
  it("accepts only structurally local roles, without claiming signature verification", () => {
    expect(validateLocalAcceptanceCredentials(credentials)).toEqual(credentials);
    const source = readFileSync("scripts/acceptance/isolation.mjs", "utf8");
    expect(source).toContain("NOT signature verification or proof of origin");
  });

  it.each([
    { anonKey: jwt("authenticated") }, { anonKey: jwt("anon", { iss: "supabase" }) },
    { anonKey: jwt("anon", { ref: "hosted-project" }) },
    { anonKey: jwt("anon", { project_id: "artist-portfolio" }) },
    { anonKey: jwt("anon", { exp: 1 }) }, { anonKey: jwt("anon", { exp: "later" }) },
    { anonKey: jwt("anon", {}, { alg: "none", typ: "JWT" }) },
    { anonKey: "sb_publishable_hosted" }, { serviceRoleKey: jwt("anon") },
    { serviceRoleKey: "sb_secret_hosted" }, { serviceRoleKey: credentials.anonKey },
  ])("rejects swapped, hosted, stale, or unsupported key metadata without leaking it", (override) => {
    const unsafe = { ...credentials, ...override };
    expect(() => validateLocalAcceptanceCredentials(unsafe)).toThrow("credential metadata");
    try { validateLocalAcceptanceCredentials(unsafe); } catch (error) {
      const message = String(error);
      expect(message).not.toContain(unsafe.anonKey);
      expect(message).not.toContain(unsafe.serviceRoleKey);
    }
  });
});

describe("acceptance child environment", () => {
  it("strips every unapproved inherited provider, execution, and deployment value", () => {
    const parentEnv = {
      Path: "C:\\node", SystemRoot: "C:\\Windows", TEMP: "C:\\Temp",
      NEXT_PUBLIC_SUPABASE_URL: "https://hosted.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "hosted-public",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "hosted-anon",
      SUPABASE_SECRET_KEY: "hosted-secret", SUPABASE_SERVICE_ROLE_KEY: "hosted-service",
      SITE_URL: "https://portfolio.example", NEXT_PUBLIC_SITE_URL: "https://portfolio.example",
      AUTH_SECURITY_SECRET: "hosted-auth", ADMIN_EMAILS: "real-owner@example.com",
      NODE_OPTIONS: "--require hosted-hook.js", NODE_EXTRA_CA_CERTS: "hosted.pem",
      HTTP_PROXY: "http://proxy", HTTPS_PROXY: "http://proxy", ALL_PROXY: "http://proxy",
      VERCEL: "1", VERCEL_ENV: "production", VERCEL_URL: "hosted.vercel.app",
      TRUSTED_PROXY: "true", RESEND_API_KEY: "re_real", BOOKING_TO_EMAIL: "owner@example.com",
      BOOKING_FROM_EMAIL: "owner@example.com", RESEND_WEBHOOK_SECRET: "real-webhook",
      R2_ACCOUNT_ID: "real-r2", R2_ACCESS_KEY_ID: "real-r2-key", R2_SECRET_ACCESS_KEY: "real-r2-secret",
      IMAGEKIT_PRIVATE_KEY: "real-imagekit", IMAGEKIT_PUBLIC_KEY: "real-imagekit-public",
      NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT: "https://ik.imagekit.io/real",
      NEXT_PUBLIC_MEDIA_ORIGIN: "https://media.example", IMAGEKIT_PILOT_UPLOAD_ENABLED: "true",
      MEDIA_UPLOAD_PROVIDER: "imagekit", MEDIA_PROCESSOR_URL: "https://processor.example",
      MEDIA_PROCESSOR_SECRET: "real-processor", NEXT_PUBLIC_TURNSTILE_SITE_KEY: "real-captcha",
      CRON_SECRET: "real-cron", HEALTHCHECK_SECRET: "real-health", npm_config_registry: "https://evil.test",
      __NEXT_PROCESSED_ENV: "true", UNKNOWN_FUTURE_PROVIDER_SECRET: "must-not-inherit",
    };
    const snapshot = { ...parentEnv };
    const env = buildAcceptanceChildEnv({ parentEnv, target: ACCEPTANCE_TARGET, credentials, authSecuritySecret: secret });
    expect(parentEnv).toEqual(snapshot);
    expect(env).toEqual({
      PATH: "C:\\node", SYSTEMROOT: "C:\\Windows", TEMP: "C:\\Temp",
      NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1",
      SITE_URL: ACCEPTANCE_APP_ORIGIN, NEXT_PUBLIC_SITE_URL: ACCEPTANCE_APP_ORIGIN,
      NEXT_PUBLIC_SUPABASE_URL: ACCEPTANCE_API_ORIGIN,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: credentials.anonKey,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: credentials.anonKey,
      SUPABASE_SECRET_KEY: credentials.serviceRoleKey, SUPABASE_SERVICE_ROLE_KEY: credentials.serviceRoleKey,
      SUPABASE_MEDIA_BUCKET: ACCEPTANCE_MEDIA_BUCKET, MEDIA_UPLOAD_PROVIDER: "supabase",
      IMAGEKIT_PILOT_UPLOAD_ENABLED: "false", AUTH_SECURITY_SECRET: secret, ADMIN_EMAILS: ACCEPTANCE_ADMIN_EMAIL,
    });
  });

  it("refuses missing context or a weak secret", () => {
    const options = { parentEnv: {}, target: ACCEPTANCE_TARGET, credentials, authSecuritySecret: secret };
    expect(() => buildAcceptanceChildEnv({ ...options, authSecuritySecret: "short" })).toThrow();
    expect(() => buildAcceptanceChildEnv({ ...options, authSecuritySecret: `${secret}\n` })).toThrow();
    expect(() => buildAcceptanceChildEnv({ ...options, parentEnv: undefined })).toThrow();
    expect(() => buildAcceptanceChildEnv({ ...options, target: undefined })).toThrow();
  });
});

describe("shadow app copy allowlist", () => {
  it.each(["app", "app/layout.tsx", "components/admin/v2/HomeEditor.tsx", "lib/supabase/server.ts", "styles/globals.css", "public/images/test.jpg", "next.config.ts", "package.json", "tsconfig.json", "proxy.ts"])(
    "allows required application inputs %s", (path) => expect(shouldCopyAcceptancePath(path)).toBe(true),
  );
  it.each([
    ".env", ".env.local", ".env.development.local", "app/.env.local", "public/.ENV.production",
    ".git/config", ".next/server/app.js", "app/.next/cache", ".vercel/project.json",
    "node_modules/dotenv", "supabase/.temp/project-ref", "supabase/config.toml",
    "scripts/acceptance/secrets.json", "public/certificate.key", "public/cert.PEM",
    "/app/page.tsx", "C:\\app\\page.tsx", "..\\app\\page.tsx", "app/../../.env.local",
    "app//page.tsx", "app/./page.tsx", "public/../.env", "public/file\0.jpg",
  ])("never copies environment, stale build, credentials, or escaping path %s", (path) => {
    expect(shouldCopyAcceptancePath(path)).toBe(false);
  });
});
