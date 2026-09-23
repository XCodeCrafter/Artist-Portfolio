import { describe, expect, it } from "vitest";
import {
  parseImageKitCleanupFinished,
  parseImageKitCleanupLease,
  type ImageKitCleanupLease,
} from "@/lib/admin/imagekit-reconciliation-contracts";

const intentId = "123e4567-e89b-42d3-a456-426614174000";
const otherIntentId = "223e4567-e89b-42d3-a456-426614174000";
const physicalObjectId = "323e4567-e89b-42d3-a456-426614174000";
const leaseId = "423e4567-e89b-42d3-a456-426614174000";
const storageContainer = "isolated_artist";
const assetId = `imagekit-${intentId}`;
const now = Date.parse("2026-09-22T13:10:00Z");
const expected = { storageContainer };

function lease(overrides: Record<string, unknown> = {}): ImageKitCleanupLease {
  return {
    intentId, assetId, physicalObjectId, storageProvider: "imagekit", storageContainer,
    objectKey: `media/source/${assetId}/${intentId}.png`, mediaType: "image", mimeType: "image/png",
    expectedByteSize: 1024, expectedChecksumSha256: "a".repeat(64),
    expiresAt: "2026-09-22T12:10:00Z", status: "expired",
    issuedAt: "2026-09-22T12:00:00Z", authorityExpiresAt: "2026-09-22T12:05:00Z",
    fileId: null, versionId: null, versionToken: null, sourceVariantId: null,
    cleanupState: "leased", leaseId, leaseExpiresAt: "2026-09-22T13:15:00Z",
    ...overrides,
  } as ImageKitCleanupLease;
}

function finished(overrides: Record<string, unknown> = {}) {
  const result: Record<string, unknown> = { ...lease(), cleanupState: "pending", ...overrides };
  delete result.leaseId;
  delete result.leaseExpiresAt;
  return result;
}

describe("ImageKit cleanup observation lease contract", () => {
  it.each(["expired", "cancelled", "failed"])("accepts an issued, unbound %s lease", (status) => {
    const input = lease({ status });
    expect(parseImageKitCleanupLease(input, expected, now)).toEqual(input);
    expect(parseImageKitCleanupLease(input, expected, now)).not.toBe(input);
  });

  it.each(["prepared", "consumed", "ready", "deleted", "Expired"])("refuses lifecycle state %s", (status) => {
    expect(parseImageKitCleanupLease(lease({ status }), expected, now)).toBeNull();
  });

  it.each(["not_needed", "pending", "attention", "complete", null])("requires leased cleanup, not %j", (cleanupState) => {
    expect(parseImageKitCleanupLease(lease({ cleanupState }), expected, now)).toBeNull();
  });

  it.each([null, undefined, [], [lease()], "{}", true, 1])("rejects non-object payload %j", (input) => {
    expect(parseImageKitCleanupLease(input, expected, now)).toBeNull();
  });

  it("requires every base and lease field without allowing unknown RPC fields", () => {
    for (const key of Object.keys(lease())) {
      const input: Record<string, unknown> = { ...lease() };
      delete input[key];
      expect(parseImageKitCleanupLease(input, expected, now), `missing ${key}`).toBeNull();
    }
    for (const key of ["workerId", "actorId", "outcome", "token", "deliveryUrl", "cleanupAttempts"]) {
      expect(parseImageKitCleanupLease(lease({ [key]: "injected" }), expected, now), `extra ${key}`).toBeNull();
    }
  });

  it.each([
    ["intentId", intentId.toUpperCase()], ["intentId", "123e4567-e89b-12d3-a456-426614174000"],
    ["intentId", null], ["assetId", "existing-asset"], ["storageProvider", "supabase"],
    ["storageContainer", "another_artist"], ["storageContainer", "isolated/artist"],
    ["physicalObjectId", "not-a-uuid"], ["physicalObjectId", physicalObjectId.toUpperCase()],
    ["objectKey", `media/source/${assetId}/${intentId}.png?tr=w-1`],
    ["objectKey", `media/source/${assetId}/${otherIntentId}.png`],
    ["mediaType", "video"], ["mimeType", "image/jpg"],
    ["expectedByteSize", "1024"], ["expectedByteSize", 0], ["expectedByteSize", 10_485_761],
    ["expectedChecksumSha256", "A".repeat(64)], ["expectedChecksumSha256", "a".repeat(63)],
    ["expiresAt", "2026-09-22"], ["expiresAt", "2026-02-30T00:00:00Z"],
    ["leaseId", null], ["leaseId", ""], ["leaseId", leaseId.toUpperCase()],
    ["leaseId", "423e4567-e89b-12d3-a456-426614174000"],
    ["leaseId", "423e4567-e89b-42d3-7456-426614174000"], ["leaseId", ` ${leaseId}`],
    ["leaseExpiresAt", null], ["leaseExpiresAt", "2026-09-22"],
    ["leaseExpiresAt", "2026-09-22T13:15:00"], ["leaseExpiresAt", "2026-02-30T00:00:00Z"],
    ["leaseExpiresAt", 1790082900000],
  ])("retains strict base/lease validation for %s=%j", (key, value) => {
    expect(parseImageKitCleanupLease(lease({ [key]: value }), expected, now)).toBeNull();
  });

  it("cannot adopt a different internally consistent namespace", () => {
    expect(parseImageKitCleanupLease(lease({ assetId: "legacy-asset",
      objectKey: `media/source/legacy-asset/${intentId}.png` }), expected, now)).toBeNull();
  });

  it("accepts other valid reserved intent IDs in the same account", () => {
    const input = lease({ intentId: otherIntentId, assetId: `imagekit-${otherIntentId}`,
      objectKey: `media/source/imagekit-${otherIntentId}/${otherIntentId}.png` });
    expect(parseImageKitCleanupLease(input, expected, now)).toEqual(input);
  });

  it.each([
    ["image/avif", "avif", 10_485_760], ["image/gif", "gif", 10_485_760],
    ["image/jpeg", "jpg", 10_485_760], ["image/png", "png", 10_485_760],
    ["image/webp", "webp", 10_485_760], ["video/mp4", "mp4", 95_000_000],
    ["video/quicktime", "mov", 95_000_000], ["video/webm", "webm", 95_000_000],
  ] as const)("retains the reserved %s media contract", (mimeType, extension, expectedByteSize) => {
    const input = lease({ mimeType, expectedByteSize, mediaType: mimeType.startsWith("image/") ? "image" : "video",
      objectKey: `media/source/${assetId}/${intentId}.${extension}` });
    expect(parseImageKitCleanupLease(input, expected, now)).toEqual(input);
    expect(parseImageKitCleanupLease({ ...input, expectedByteSize: expectedByteSize + 1 }, expected, now)).toBeNull();
  });

  it.each(["", "isolated/artist", "isolated_artist\n", "another_artist"])("validates expected account %j", (storageContainer) => {
    expect(parseImageKitCleanupLease(lease(), { storageContainer }, now)).toBeNull();
  });

  it.each(["issuedAt", "authorityExpiresAt"])("requires the complete issuance pair: %s", (key) => {
    expect(parseImageKitCleanupLease(lease({ [key]: null }), expected, now)).toBeNull();
    expect(parseImageKitCleanupLease(lease({ issuedAt: null, authorityExpiresAt: null }), expected, now)).toBeNull();
  });

  it.each([
    { issuedAt: "2026-09-22T12:00:00.000001Z" },
    { authorityExpiresAt: "2026-09-22T12:04:59Z" },
    { authorityExpiresAt: "2026-09-22T12:05:01Z" },
    { issuedAt: "2026-09-22T12:00:00Z", authorityExpiresAt: "2026-09-22T12:00:20Z" },
  ])("retains exact persisted authority validation %j", (overrides) => {
    expect(parseImageKitCleanupLease(lease(overrides), expected, now)).toBeNull();
  });

  it.each([
    ["fileId", "provider-file"], ["versionId", "provider-version"],
    ["versionToken", "version.one"], ["sourceVariantId", otherIntentId],
  ])("never observes an upload already bound through %s", (key, value) => {
    expect(parseImageKitCleanupLease(lease({ [key]: value }), expected, now)).toBeNull();
  });

  it("rejects a fully consumed source even if lease fields are grafted onto it", () => {
    expect(parseImageKitCleanupLease(lease({ status: "consumed", cleanupState: "not_needed",
      fileId: "provider-file", versionId: "provider-version", versionToken: "version.one",
      sourceVariantId: otherIntentId }), expected, now)).toBeNull();
  });

  it.each([NaN, Infinity, -Infinity, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])("refuses invalid clock %j", (invalidNow) => {
    expect(parseImageKitCleanupLease(lease(), expected, invalidNow)).toBeNull();
  });

  it("requires the full one-hour wait after the intent expiry", () => {
    expect(parseImageKitCleanupLease(lease(), expected, now)).not.toBeNull();
    expect(parseImageKitCleanupLease(lease(), expected, now - 1)).toBeNull();
    expect(parseImageKitCleanupLease(lease({ expiresAt: "2026-09-22T12:10:00.001Z" }), expected, now)).toBeNull();
    expect(parseImageKitCleanupLease(lease({ expiresAt: "2026-09-22T13:10:00Z" }), expected, now)).toBeNull();
  });

  it.each([
    [0, false], [-1, false], [29_999, false], [30_000, false], [30_001, true],
    [299_999, true], [300_000, true], [305_000, true], [305_001, false], [600_000, false],
  ])("checks remaining lease lifetime %i ms", (remaining, accepted) => {
    const input = lease({ leaseExpiresAt: new Date(now + remaining).toISOString() });
    expect(parseImageKitCleanupLease(input, expected, now) !== null).toBe(accepted);
  });

  it("accepts valid timezone offsets without changing their serialized values", () => {
    const input = lease({ issuedAt: "2026-09-22T14:00:00.000000+02:00",
      authorityExpiresAt: "2026-09-22T14:05:00.000000+02:00",
      expiresAt: "2026-09-22T14:10:00+02:00", leaseExpiresAt: "2026-09-22T15:15:00+02:00" });
    expect(parseImageKitCleanupLease(input, expected, now)).toEqual(input);
  });
});

describe("ImageKit fenced cleanup observation result contract", () => {
  it.each(["expired", "cancelled", "failed"])("preserves the %s terminal status", (status) => {
    for (const observation of ["absent", "retry", "unsafe"] as const) {
      for (const cleanupState of ["pending", "attention"]) {
        const result = finished({ status, cleanupState });
        expect(parseImageKitCleanupFinished(result, lease({ status }), observation))
          .toEqual(observation === "unsafe" && cleanupState === "pending" ? null : result);
      }
    }
  });

  it("returns only the copied base snapshot, never lease fields or a completion promise", () => {
    const result = finished();
    const parsed = parseImageKitCleanupFinished(result, lease(), "absent");
    expect(parsed).toEqual(result);
    expect(parsed).not.toBe(result);
    expect(parsed).not.toHaveProperty("leaseId");
    expect(parsed).not.toHaveProperty("leaseExpiresAt");
    expect(parsed?.cleanupState).toBe("pending");
  });

  it.each([null, undefined, [], [finished()], "{}", true, 1])("rejects malformed finish payload %j", (input) => {
    expect(parseImageKitCleanupFinished(input, lease(), "retry")).toBeNull();
  });

  it("requires the exact finish response without lease or outcome extras", () => {
    for (const key of Object.keys(finished())) {
      const input = finished(); delete input[key];
      expect(parseImageKitCleanupFinished(input, lease(), "absent"), `missing ${key}`).toBeNull();
    }
    for (const key of ["leaseId", "leaseExpiresAt", "outcome", "deleted", "workerId", "token"]) {
      expect(parseImageKitCleanupFinished({ ...finished(), [key]: "extra" }, lease(), "absent"), `extra ${key}`).toBeNull();
    }
  });

  it.each(["not_needed", "leased", "complete", "deleted", null])("never treats %j as a committed observation", (cleanupState) => {
    expect(parseImageKitCleanupFinished(finished({ cleanupState }), lease(), "absent")).toBeNull();
  });

  it.each([
    ["intentId", otherIntentId], ["assetId", `imagekit-${otherIntentId}`],
    ["physicalObjectId", otherIntentId], ["storageProvider", "supabase"],
    ["storageContainer", "another_artist"], ["objectKey", `media/source/${assetId}/${intentId}.jpg`],
    ["mediaType", "video"], ["mimeType", "image/jpeg"],
    ["expectedByteSize", 2048], ["expectedChecksumSha256", "b".repeat(64)],
    ["expiresAt", "2026-09-22T12:10:01Z"], ["status", "cancelled"],
    ["issuedAt", "2026-09-22T14:00:00+02:00"],
    ["authorityExpiresAt", "2026-09-22T14:05:00+02:00"],
    ["fileId", "file-one"], ["versionId", "version-one"],
    ["versionToken", "version.one"], ["sourceVariantId", otherIntentId],
  ])("refuses immutable result drift in %s", (key, value) => {
    expect(parseImageKitCleanupFinished(finished({ [key]: value }), lease(), "retry")).toBeNull();
  });

  it("rejects independently valid but different issuance and media facts", () => {
    expect(parseImageKitCleanupFinished(finished({ issuedAt: "2026-09-22T12:01:00Z",
      authorityExpiresAt: "2026-09-22T12:06:00Z" }), lease(), "retry")).toBeNull();
    expect(parseImageKitCleanupFinished(finished({ mimeType: "image/jpeg",
      objectKey: `media/source/${assetId}/${intentId}.jpg` }), lease(), "retry")).toBeNull();
  });

  it.each(["absent ", "deleted", "success", "", null, undefined, true, 1])("rejects unknown observation %j", (observation) => {
    expect(parseImageKitCleanupFinished(finished(), lease(), observation as "absent")).toBeNull();
  });

  it.each([
    { leaseId: "invalid" }, { leaseExpiresAt: "invalid" }, { cleanupState: "pending" },
    { status: "prepared" }, { issuedAt: null, authorityExpiresAt: null },
    { outcome: "issued" }, { fileId: "already-bound" },
  ])("revalidates supplied lease shape %j", (overrides) => {
    expect(parseImageKitCleanupFinished(finished(), lease(overrides), "retry")).toBeNull();
  });

  it.each([null, undefined, [], "{}", true, 1])("refuses a non-object supplied lease %j", (invalidLease) => {
    expect(parseImageKitCleanupFinished(finished(), invalidLease as unknown as ImageKitCleanupLease, "retry")).toBeNull();
  });

  it("does not replace the database's atomic lease fence with an application clock check", () => {
    // A committed response can arrive after lease expiry. The SQL finish RPC,
    // not parsing a returned snapshot, proves the current worker held the lease.
    expect(parseImageKitCleanupFinished(finished(), lease({ leaseExpiresAt: "2026-09-22T13:10:00Z" }), "retry"))
      .toEqual(finished());
  });
});
