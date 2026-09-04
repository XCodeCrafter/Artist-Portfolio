import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getMediaUploadConfigSummary,
  getR2MediaUploadCredentials,
} from "@/lib/admin/media-upload-config";

const ENV_KEYS = [
  "MEDIA_UPLOAD_PROVIDER",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "NEXT_PUBLIC_MEDIA_ORIGIN",
] as const;

const originalEnvironment = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]])
);

function clearMediaUploadEnvironment() {
  for (const key of ENV_KEYS) delete process.env[key];
}

function configureValidR2Environment() {
  process.env.MEDIA_UPLOAD_PROVIDER = "r2";
  process.env.R2_ACCOUNT_ID = "0123456789abcdef0123456789abcdef";
  process.env.R2_ACCESS_KEY_ID = "abcdef0123456789abcdef0123456789";
  process.env.R2_SECRET_ACCESS_KEY = "a".repeat(64);
  process.env.R2_BUCKET_NAME = "artist-portfolio-media-prod";
  process.env.NEXT_PUBLIC_MEDIA_ORIGIN = "https://media.example.com";
}

beforeEach(clearMediaUploadEnvironment);

afterEach(() => {
  clearMediaUploadEnvironment();
  for (const key of ENV_KEYS) {
    const value = originalEnvironment[key];
    if (value !== undefined) process.env[key] = value;
  }
});

describe("media upload provider configuration", () => {
  it("defaults to the existing Supabase provider", () => {
    expect(getMediaUploadConfigSummary()).toMatchObject({
      status: "available",
      isAvailable: true,
      provider: "supabase",
    });
    expect(getR2MediaUploadCredentials()).toEqual({
      status: "unavailable",
      isAvailable: false,
      reason: "provider-not-r2",
      issues: [],
    });
  });

  it("returns a safe ready summary for a complete R2 configuration", () => {
    configureValidR2Environment();

    const summary = getMediaUploadConfigSummary();
    expect(summary).toEqual({
      status: "available",
      isAvailable: true,
      provider: "r2",
      r2: {
        hasValidAccountId: true,
        hasValidBucketName: true,
        hasValidAccessKeyId: true,
        hasValidSecretAccessKey: true,
        hasValidMediaOrigin: true,
      },
    });

    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain(process.env.R2_ACCOUNT_ID);
    expect(serialized).not.toContain(process.env.R2_ACCESS_KEY_ID);
    expect(serialized).not.toContain(process.env.R2_SECRET_ACCESS_KEY);
    expect(serialized).not.toContain(process.env.R2_BUCKET_NAME);
  });

  it("builds only the default-jurisdiction S3 endpoint internally", () => {
    configureValidR2Environment();

    expect(getR2MediaUploadCredentials()).toEqual({
      status: "available",
      isAvailable: true,
      credentials: {
        accountId: "0123456789abcdef0123456789abcdef",
        accessKeyId: "abcdef0123456789abcdef0123456789",
        secretAccessKey: "a".repeat(64),
        bucketName: "artist-portfolio-media-prod",
        mediaOrigin: "https://media.example.com",
        endpoint:
          "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com",
        region: "auto",
      },
    });
  });

  it("fails closed instead of falling back when explicit R2 config is invalid", () => {
    process.env.MEDIA_UPLOAD_PROVIDER = "r2";
    process.env.R2_ACCOUNT_ID = "not-an-account";
    process.env.R2_ACCESS_KEY_ID = "too-short";
    process.env.R2_SECRET_ACCESS_KEY = "also-too-short";
    process.env.R2_BUCKET_NAME = "Invalid_Bucket";
    process.env.NEXT_PUBLIC_MEDIA_ORIGIN = "https://media.example.com/path";

    expect(getMediaUploadConfigSummary()).toEqual({
      status: "unavailable",
      isAvailable: false,
      provider: "r2",
      reason: "invalid-r2-configuration",
      issues: [
        "invalid-account-id",
        "invalid-bucket-name",
        "invalid-access-key-id",
        "invalid-secret-access-key",
        "invalid-media-origin",
      ],
      r2: {
        hasValidAccountId: false,
        hasValidBucketName: false,
        hasValidAccessKeyId: false,
        hasValidSecretAccessKey: false,
        hasValidMediaOrigin: false,
      },
    });
    expect(getR2MediaUploadCredentials()).toMatchObject({
      status: "unavailable",
      isAvailable: false,
      reason: "invalid-r2-configuration",
    });
  });

  it("strictly validates bucket, account, credentials, and the exact custom origin", () => {
    const invalidCases: Array<[keyof NodeJS.ProcessEnv, string]> = [
      ["R2_ACCOUNT_ID", "0123456789abcdef0123456789abcdeg"],
      ["R2_BUCKET_NAME", "ab"],
      ["R2_BUCKET_NAME", "artist--media-"],
      ["R2_ACCESS_KEY_ID", "g".repeat(32)],
      ["R2_SECRET_ACCESS_KEY", "z".repeat(64)],
      ["NEXT_PUBLIC_MEDIA_ORIGIN", "https://media.example.com/"],
      ["NEXT_PUBLIC_MEDIA_ORIGIN", "http://media.example.com"],
      ["NEXT_PUBLIC_MEDIA_ORIGIN", "https://bucket.r2.dev"],
      [
        "NEXT_PUBLIC_MEDIA_ORIGIN",
        "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com",
      ],
    ];

    for (const [key, value] of invalidCases) {
      configureValidR2Environment();
      process.env[key] = value;
      expect(getMediaUploadConfigSummary(), `${key}=${value}`).toMatchObject({
        status: "unavailable",
        isAvailable: false,
        provider: "r2",
      });
    }
  });

  it("rejects unsupported provider values instead of guessing", () => {
    process.env.MEDIA_UPLOAD_PROVIDER = "R2";

    expect(getMediaUploadConfigSummary()).toMatchObject({
      status: "unavailable",
      isAvailable: false,
      provider: null,
      reason: "unsupported-provider",
    });
  });
});
