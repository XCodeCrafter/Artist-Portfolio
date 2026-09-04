import "server-only";

const R2_ACCOUNT_ID_PATTERN = /^[a-f0-9]{32}$/i;
const R2_BUCKET_NAME_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/;
const R2_ACCESS_KEY_ID_PATTERN = /^[a-f0-9]{32}$/i;
const R2_SECRET_ACCESS_KEY_PATTERN = /^[a-f0-9]{64}$/i;
const DNS_LABEL_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export type MediaUploadProvider = "supabase" | "r2";

export type R2MediaUploadReadiness = Readonly<{
  hasValidAccountId: boolean;
  hasValidBucketName: boolean;
  hasValidAccessKeyId: boolean;
  hasValidSecretAccessKey: boolean;
  hasValidMediaOrigin: boolean;
}>;

export type R2MediaUploadConfigIssue =
  | "invalid-account-id"
  | "invalid-bucket-name"
  | "invalid-access-key-id"
  | "invalid-secret-access-key"
  | "invalid-media-origin";

export type MediaUploadConfigSummary =
  | Readonly<{
      status: "available";
      isAvailable: true;
      provider: "supabase";
      r2: R2MediaUploadReadiness;
    }>
  | Readonly<{
      status: "available";
      isAvailable: true;
      provider: "r2";
      r2: R2MediaUploadReadiness;
    }>
  | Readonly<{
      status: "unavailable";
      isAvailable: false;
      provider: "r2";
      reason: "invalid-r2-configuration";
      issues: readonly R2MediaUploadConfigIssue[];
      r2: R2MediaUploadReadiness;
    }>
  | Readonly<{
      status: "unavailable";
      isAvailable: false;
      provider: null;
      reason: "unsupported-provider";
      issues: readonly ["invalid-provider"];
      r2: R2MediaUploadReadiness;
    }>;

export type R2MediaUploadCredentials = Readonly<{
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  mediaOrigin: string;
  endpoint: string;
  region: "auto";
}>;

export type R2MediaUploadCredentialResult =
  | Readonly<{
      status: "available";
      isAvailable: true;
      credentials: R2MediaUploadCredentials;
    }>
  | Readonly<{
      status: "unavailable";
      isAvailable: false;
      reason: "provider-not-r2" | "invalid-r2-configuration";
      issues: readonly R2MediaUploadConfigIssue[];
    }>;

type R2Environment = Readonly<{
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  mediaOrigin: string;
}>;

function readR2Environment(): R2Environment {
  return {
    accountId: process.env.R2_ACCOUNT_ID ?? "",
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
    bucketName: process.env.R2_BUCKET_NAME ?? "",
    mediaOrigin: process.env.NEXT_PUBLIC_MEDIA_ORIGIN ?? "",
  };
}

function isValidCustomMediaOrigin(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const labels = hostname.split(".");

    return (
      value === url.origin &&
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      labels.length >= 2 &&
      hostname.length <= 253 &&
      labels.every((label) => DNS_LABEL_PATTERN.test(label)) &&
      hostname !== "r2.dev" &&
      !hostname.endsWith(".r2.dev") &&
      hostname !== "r2.cloudflarestorage.com" &&
      !hostname.endsWith(".r2.cloudflarestorage.com")
    );
  } catch {
    return false;
  }
}

function getR2Readiness(environment: R2Environment): R2MediaUploadReadiness {
  return {
    hasValidAccountId: R2_ACCOUNT_ID_PATTERN.test(environment.accountId),
    hasValidBucketName: R2_BUCKET_NAME_PATTERN.test(environment.bucketName),
    hasValidAccessKeyId: R2_ACCESS_KEY_ID_PATTERN.test(
      environment.accessKeyId
    ),
    hasValidSecretAccessKey: R2_SECRET_ACCESS_KEY_PATTERN.test(
      environment.secretAccessKey
    ),
    hasValidMediaOrigin: isValidCustomMediaOrigin(environment.mediaOrigin),
  };
}

function getR2Issues(readiness: R2MediaUploadReadiness) {
  const issues: R2MediaUploadConfigIssue[] = [];

  if (!readiness.hasValidAccountId) issues.push("invalid-account-id");
  if (!readiness.hasValidBucketName) issues.push("invalid-bucket-name");
  if (!readiness.hasValidAccessKeyId) issues.push("invalid-access-key-id");
  if (!readiness.hasValidSecretAccessKey) {
    issues.push("invalid-secret-access-key");
  }
  if (!readiness.hasValidMediaOrigin) issues.push("invalid-media-origin");

  return issues;
}

function getRequestedProvider() {
  const configured = process.env.MEDIA_UPLOAD_PROVIDER;
  return configured === undefined || configured === "" ? "supabase" : configured;
}

/**
 * Safe for readiness responses: this summary contains validation booleans and
 * issue codes only. It never contains R2 credential values.
 */
export function getMediaUploadConfigSummary(): MediaUploadConfigSummary {
  const environment = readR2Environment();
  const r2 = getR2Readiness(environment);
  const provider = getRequestedProvider();

  if (provider === "supabase") {
    return {
      status: "available",
      isAvailable: true,
      provider,
      r2,
    };
  }

  if (provider !== "r2") {
    return {
      status: "unavailable",
      isAvailable: false,
      provider: null,
      reason: "unsupported-provider",
      issues: ["invalid-provider"],
      r2,
    };
  }

  const issues = getR2Issues(r2);
  if (issues.length > 0) {
    return {
      status: "unavailable",
      isAvailable: false,
      provider,
      reason: "invalid-r2-configuration",
      issues,
      r2,
    };
  }

  return {
    status: "available",
    isAvailable: true,
    provider,
    r2,
  };
}

/**
 * @internal Server-only accessor for the future R2 upload adapter. Never pass
 * this result to a Client Component, API response, readiness payload, or log.
 */
export function getR2MediaUploadCredentials(): R2MediaUploadCredentialResult {
  const summary = getMediaUploadConfigSummary();
  if (summary.provider !== "r2") {
    return {
      status: "unavailable",
      isAvailable: false,
      reason: "provider-not-r2",
      issues: [],
    };
  }

  if (!summary.isAvailable) {
    return {
      status: "unavailable",
      isAvailable: false,
      reason: "invalid-r2-configuration",
      issues: summary.issues,
    };
  }

  const environment = readR2Environment();
  return {
    status: "available",
    isAvailable: true,
    credentials: {
      accountId: environment.accountId,
      accessKeyId: environment.accessKeyId,
      secretAccessKey: environment.secretAccessKey,
      bucketName: environment.bucketName,
      mediaOrigin: environment.mediaOrigin,
      endpoint: `https://${environment.accountId}.r2.cloudflarestorage.com`,
      region: "auto",
    },
  };
}
