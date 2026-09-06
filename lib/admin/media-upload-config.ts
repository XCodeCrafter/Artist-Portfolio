import "server-only";

const R2_ACCOUNT_ID_PATTERN = /^[a-f0-9]{32}$/i;
const R2_BUCKET_NAME_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/;
const R2_ACCESS_KEY_ID_PATTERN = /^[a-f0-9]{32}$/i;
const R2_SECRET_ACCESS_KEY_PATTERN = /^[a-f0-9]{64}$/i;
const DNS_LABEL_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const IMAGEKIT_PUBLIC_KEY_PATTERN =
  /^public_[A-Za-z0-9+/_-]{8,192}={0,2}$/;
const IMAGEKIT_PRIVATE_KEY_PATTERN =
  /^private_[A-Za-z0-9+/_-]{8,192}={0,2}$/;
const IMAGEKIT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export type MediaUploadProvider = "supabase" | "r2" | "imagekit";

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

export type ImageKitMediaUploadReadiness = Readonly<{
  hasValidPublicKey: boolean;
  hasValidPrivateKey: boolean;
  hasValidUrlEndpoint: boolean;
}>;

export type ImageKitMediaUploadConfigIssue =
  | "invalid-public-key"
  | "invalid-private-key"
  | "invalid-url-endpoint";

export type MediaUploadConfigSummary =
  | Readonly<{
      status: "available";
      isAvailable: true;
      provider: "supabase";
      r2: R2MediaUploadReadiness;
      imagekit: ImageKitMediaUploadReadiness;
    }>
  | Readonly<{
      status: "available";
      isAvailable: true;
      provider: "r2";
      r2: R2MediaUploadReadiness;
      imagekit: ImageKitMediaUploadReadiness;
    }>
  | Readonly<{
      status: "unavailable";
      isAvailable: false;
      provider: "r2";
      reason: "invalid-r2-configuration";
      issues: readonly R2MediaUploadConfigIssue[];
      r2: R2MediaUploadReadiness;
      imagekit: ImageKitMediaUploadReadiness;
    }>
  | Readonly<{
      status: "available";
      isAvailable: true;
      provider: "imagekit";
      r2: R2MediaUploadReadiness;
      imagekit: ImageKitMediaUploadReadiness;
    }>
  | Readonly<{
      status: "unavailable";
      isAvailable: false;
      provider: "imagekit";
      reason: "invalid-imagekit-configuration";
      issues: readonly ImageKitMediaUploadConfigIssue[];
      r2: R2MediaUploadReadiness;
      imagekit: ImageKitMediaUploadReadiness;
    }>
  | Readonly<{
      status: "unavailable";
      isAvailable: false;
      provider: null;
      reason: "unsupported-provider";
      issues: readonly ["invalid-provider"];
      r2: R2MediaUploadReadiness;
      imagekit: ImageKitMediaUploadReadiness;
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

export type ImageKitMediaUploadCredentials = Readonly<{
  publicKey: string;
  privateKey: string;
  urlEndpoint: string;
  imageKitId: string;
}>;

export type ImageKitMediaUploadCredentialResult =
  | Readonly<{
      status: "available";
      isAvailable: true;
      credentials: ImageKitMediaUploadCredentials;
    }>
  | Readonly<{
      status: "unavailable";
      isAvailable: false;
      reason:
        | "provider-not-imagekit"
        | "invalid-imagekit-configuration";
      issues: readonly ImageKitMediaUploadConfigIssue[];
    }>;

type R2Environment = Readonly<{
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  mediaOrigin: string;
}>;

type ImageKitEnvironment = Readonly<{
  publicKey: string;
  privateKey: string;
  urlEndpoint: string;
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

function readImageKitEnvironment(): ImageKitEnvironment {
  return {
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY ?? "",
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY ?? "",
    urlEndpoint: process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT ?? "",
  };
}

function parseImageKitUrlEndpoint(value: string) {
  try {
    const url = new URL(value);
    const pathMatch = url.pathname.match(/^\/([A-Za-z0-9_-]{1,128})$/);

    if (
      url.protocol !== "https:" ||
      url.hostname.toLowerCase() !== "ik.imagekit.io" ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !pathMatch ||
      value !== `${url.origin}${url.pathname}` ||
      !IMAGEKIT_ID_PATTERN.test(pathMatch[1])
    ) {
      return null;
    }

    return {
      imageKitId: pathMatch[1],
      urlEndpoint: `${url.origin}${url.pathname}`,
    };
  } catch {
    return null;
  }
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

function getImageKitReadiness(
  environment: ImageKitEnvironment
): ImageKitMediaUploadReadiness {
  return {
    hasValidPublicKey: IMAGEKIT_PUBLIC_KEY_PATTERN.test(environment.publicKey),
    hasValidPrivateKey: IMAGEKIT_PRIVATE_KEY_PATTERN.test(
      environment.privateKey
    ),
    hasValidUrlEndpoint: Boolean(
      parseImageKitUrlEndpoint(environment.urlEndpoint)
    ),
  };
}

function getImageKitIssues(readiness: ImageKitMediaUploadReadiness) {
  const issues: ImageKitMediaUploadConfigIssue[] = [];

  if (!readiness.hasValidPublicKey) issues.push("invalid-public-key");
  if (!readiness.hasValidPrivateKey) issues.push("invalid-private-key");
  if (!readiness.hasValidUrlEndpoint) issues.push("invalid-url-endpoint");

  return issues;
}

function getRequestedProvider() {
  const configured = process.env.MEDIA_UPLOAD_PROVIDER;
  return configured === undefined || configured === "" ? "supabase" : configured;
}

/**
 * Safe for readiness responses: this summary contains validation booleans and
 * issue codes only. It never contains R2 or ImageKit credential values.
 */
export function getMediaUploadConfigSummary(): MediaUploadConfigSummary {
  const r2Environment = readR2Environment();
  const imageKitEnvironment = readImageKitEnvironment();
  const r2 = getR2Readiness(r2Environment);
  const imagekit = getImageKitReadiness(imageKitEnvironment);
  const provider = getRequestedProvider();

  if (provider === "supabase") {
    return {
      status: "available",
      isAvailable: true,
      provider,
      r2,
      imagekit,
    };
  }

  if (provider === "r2") {
    const issues = getR2Issues(r2);
    if (issues.length > 0) {
      return {
        status: "unavailable",
        isAvailable: false,
        provider,
        reason: "invalid-r2-configuration",
        issues,
        r2,
        imagekit,
      };
    }

    return {
      status: "available",
      isAvailable: true,
      provider,
      r2,
      imagekit,
    };
  }

  if (provider === "imagekit") {
    const issues = getImageKitIssues(imagekit);
    if (issues.length > 0) {
      return {
        status: "unavailable",
        isAvailable: false,
        provider,
        reason: "invalid-imagekit-configuration",
        issues,
        r2,
        imagekit,
      };
    }

    return {
      status: "available",
      isAvailable: true,
      provider,
      r2,
      imagekit,
    };
  }

  return {
    status: "unavailable",
    isAvailable: false,
    provider: null,
    reason: "unsupported-provider",
    issues: ["invalid-provider"],
    r2,
    imagekit,
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

/**
 * @internal Server-only accessor for the future ImageKit upload adapter. Never
 * pass the private key to a Client Component, API response, readiness payload,
 * audit record, or log.
 */
export function getImageKitMediaUploadCredentials(): ImageKitMediaUploadCredentialResult {
  const summary = getMediaUploadConfigSummary();
  if (summary.provider !== "imagekit") {
    return {
      status: "unavailable",
      isAvailable: false,
      reason: "provider-not-imagekit",
      issues: [],
    };
  }

  if (!summary.isAvailable) {
    return {
      status: "unavailable",
      isAvailable: false,
      reason: "invalid-imagekit-configuration",
      issues: summary.issues,
    };
  }

  const environment = readImageKitEnvironment();
  const endpoint = parseImageKitUrlEndpoint(environment.urlEndpoint);
  if (!endpoint) {
    return {
      status: "unavailable",
      isAvailable: false,
      reason: "invalid-imagekit-configuration",
      issues: ["invalid-url-endpoint"],
    };
  }

  return {
    status: "available",
    isAvailable: true,
    credentials: {
      publicKey: environment.publicKey,
      privateKey: environment.privateKey,
      urlEndpoint: endpoint.urlEndpoint,
      imageKitId: endpoint.imageKitId,
    },
  };
}
