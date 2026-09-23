import { describe, expect, it } from "vitest";
import {
  imageKitAssetId,
  imageKitFinalizeRequestSchema,
  imageKitIntentRequestSchema,
  parseImageKitClaimSnapshot,
  parseImageKitFinalizedSnapshot,
  parseImageKitUploadSnapshot,
  prepareImageKitRequestSchema,
  toImageKitUploadStatus,
} from "@/lib/admin/imagekit-lifecycle-contracts";

const intentId = "123e4567-e89b-42d3-a456-426614174000";
const otherIntentId = "223e4567-e89b-42d3-a456-426614174000";
const physicalObjectId = "323e4567-e89b-42d3-a456-426614174000";
const sourceVariantId = "423e4567-e89b-42d3-a456-426614174000";
const storageContainer = "artistportfolio";
const assetId = imageKitAssetId(intentId);
const checksum = "a".repeat(64);
const expected = { intentId, storageContainer };
const validRequest = {
  intentId, label: "Portrait", alt: "An artist on stage", usageKey: "hero",
  sortOrder: 0, isPublished: true, mimeType: "image/png", sizeBytes: 8,
  checksumSha256: checksum,
};
const media = [
  ["image/avif", "avif", 10_485_760],
  ["image/gif", "gif", 10_485_760],
  ["image/jpeg", "jpg", 10_485_760],
  ["image/png", "png", 10_485_760],
  ["image/webp", "webp", 10_485_760],
  ["video/mp4", "mp4", 95_000_000],
  ["video/quicktime", "mov", 95_000_000],
  ["video/webm", "webm", 95_000_000],
] as const;

function snapshot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    intentId, assetId, physicalObjectId, storageProvider: "imagekit", storageContainer,
    objectKey: `media/source/${assetId}/${intentId}.png`, mediaType: "image", mimeType: "image/png",
    expectedByteSize: 8, expectedChecksumSha256: checksum, expiresAt: "2026-09-22T12:10:00.123456+00:00",
    status: "prepared", issuedAt: null, authorityExpiresAt: null,
    fileId: null, versionId: null, versionToken: null, sourceVariantId: null,
    cleanupState: "not_needed", ...overrides,
  };
}
const issued = { issuedAt: "2026-09-22T12:00:00+00:00", authorityExpiresAt: "2026-09-22T12:05:00+00:00" };
const consumed = {
  ...issued, status: "consumed", fileId: "file-one", versionId: "version-one",
  versionToken: "original.version_1", sourceVariantId,
};

describe("ImageKit reservation request contracts", () => {
  it("derives a stable namespace without accepting an asset ID from the browser", () => {
    expect(assetId).toBe(`imagekit-${intentId}`);
    expect(imageKitAssetId(intentId)).toBe(assetId);
    expect(prepareImageKitRequestSchema.safeParse({ ...validRequest, assetId }).success).toBe(false);
  });

  it("normalizes metadata whitespace but keeps optional text genuinely optional", () => {
    const parsed = prepareImageKitRequestSchema.parse({ ...validRequest, label: "  Portrait  ", alt: "  ", usageKey: "  hero  " });
    expect(parsed).toEqual({ ...validRequest, label: "Portrait", alt: "", usageKey: "hero" });
  });

  it.each(media)("accepts the exact %s cap and rejects one additional byte", (mimeType, _extension, cap) => {
    expect(prepareImageKitRequestSchema.safeParse({ ...validRequest, mimeType, sizeBytes: cap }).success).toBe(true);
    expect(prepareImageKitRequestSchema.safeParse({ ...validRequest, mimeType, sizeBytes: cap + 1 }).success).toBe(false);
  });

  it.each([
    ["intentId", intentId.toUpperCase()], ["intentId", "123e4567-e89b-12d3-a456-426614174000"],
    ["intentId", ` ${intentId}`], ["intentId", "123e4567-e89b-42d3-7456-426614174000"],
    ["label", " "], ["label", "x".repeat(221)], ["label", "Portrait\n"], ["label", "\tPortrait"],
    ["alt", "x".repeat(221)], ["alt", "an\u0000artist"], ["alt", "an\u0085artist"],
    ["usageKey", "x".repeat(121)], ["usageKey", "hero\u007f"],
    ["sortOrder", "1"], ["sortOrder", 1.5], ["sortOrder", -1], ["sortOrder", 10000],
    ["isPublished", "false"], ["isPublished", 1], ["mimeType", "image/svg+xml"],
    ["mimeType", "image/jpg"], ["mimeType", "image/PNG"], ["mimeType", "image/png "],
    ["sizeBytes", "8"], ["sizeBytes", 0], ["sizeBytes", -1], ["sizeBytes", 1.5],
    ["sizeBytes", NaN], ["sizeBytes", Infinity], ["sizeBytes", Number.MAX_SAFE_INTEGER + 1],
    ["checksumSha256", checksum.toUpperCase()], ["checksumSha256", "a".repeat(63)],
    ["checksumSha256", "a".repeat(65)], ["checksumSha256", "g".repeat(64)],
  ])("rejects malformed %s input %j without coercion", (key, value) => {
    expect(prepareImageKitRequestSchema.safeParse({ ...validRequest, [key]: value }).success).toBe(false);
  });

  it("accepts maximum metadata lengths and sort order", () => {
    expect(prepareImageKitRequestSchema.safeParse({ ...validRequest, label: "x".repeat(220), alt: "x".repeat(220),
      usageKey: "x".repeat(120), sortOrder: 9999, isPublished: false }).success).toBe(true);
  });

  it.each(["actorId", "storageContainer", "objectKey", "fileId", "provider", "evidence", "token"])(
    "rejects browser-controlled %s", (key) => {
      expect(prepareImageKitRequestSchema.safeParse({ ...validRequest, [key]: "injected" }).success).toBe(false);
    },
  );

  it("requires every request field and an exact resolve/cancel payload", () => {
    for (const key of Object.keys(validRequest)) {
      const value: Record<string, unknown> = { ...validRequest };
      delete value[key];
      expect(prepareImageKitRequestSchema.safeParse(value).success, key).toBe(false);
    }
    expect(imageKitIntentRequestSchema.parse({ intentId })).toEqual({ intentId });
    for (const value of [null, [], intentId, { intentId: intentId.toUpperCase() }, { intentId, status: "consumed" }]) {
      expect(imageKitIntentRequestSchema.safeParse(value).success).toBe(false);
    }
  });
});

describe("ImageKit finalization request contract", () => {
  it.each(["a", "file-one", "File_1", "x".repeat(128)])("accepts a canonical file ID %s", (fileId) => {
    expect(imageKitFinalizeRequestSchema.parse({ intentId, fileId })).toEqual({ intentId, fileId });
  });

  it.each(["", "x".repeat(129), "file/name", "file?x", " file", "file\n", "file.one", 1, null])(
    "rejects malformed provider IDs %j without normalization", (fileId) => {
      expect(imageKitFinalizeRequestSchema.safeParse({ intentId, fileId }).success).toBe(false);
    },
  );

  it.each([null, [], intentId, {}, { intentId }, { fileId: "file-one" },
    { intentId: intentId.toUpperCase(), fileId: "file-one" }])("requires exact finalization fields %j", (input) => {
    expect(imageKitFinalizeRequestSchema.safeParse(input).success).toBe(false);
  });

  it.each(["actorId", "assetId", "storageContainer", "objectKey", "deliveryUrl", "evidence", "versionId", "versionToken", "token"])(
    "never accepts browser-supplied %s", (key) => {
      expect(imageKitFinalizeRequestSchema.safeParse({ intentId, fileId: "file-one", [key]: "injected" }).success).toBe(false);
    },
  );
});

describe("ImageKit claim and finalization outcomes", () => {
  const states = [
    ["unissued", snapshot()],
    ["issued", snapshot(issued)],
    ["consumed", snapshot(consumed)],
    ["expired-unissued", snapshot({ status: "expired" })],
    ["cancelled-unissued", snapshot({ status: "cancelled" })],
    ["failed-unissued", snapshot({ status: "failed" })],
    ["expired-issued", snapshot({ status: "expired", ...issued, cleanupState: "pending" })],
    ["cancelled-issued", snapshot({ status: "cancelled", ...issued, cleanupState: "leased" })],
    ["failed-issued", snapshot({ status: "failed", ...issued, cleanupState: "attention" })],
  ] as const;

  it.each(states)("checks every claim outcome against the %s lifecycle state", (state, base) => {
    for (const outcome of ["issued", "already_issued", "terminal", "too_late"]) {
      const valid = outcome === "issued" || outcome === "already_issued"
        ? state === "issued"
        : outcome === "terminal" ? !["unissued", "issued"].includes(state) : state === "cancelled-unissued";
      const input = { ...base, outcome };
      expect(parseImageKitClaimSnapshot(input, expected), `${state}/${outcome}`).toEqual(valid ? input : null);
    }
  });

  it.each(states)("accepts finalization outcomes only for consumed state, not %s", (state, base) => {
    for (const outcome of ["consumed", "already_consumed"]) {
      const input = { ...base, outcome };
      expect(parseImageKitFinalizedSnapshot(input, expected), `${state}/${outcome}`).toEqual(state === "consumed" ? input : null);
    }
  });

  it.each([
    ["claim", parseImageKitClaimSnapshot, snapshot({ ...issued, outcome: "issued" })],
    ["finalization", parseImageKitFinalizedSnapshot, snapshot({ ...consumed, outcome: "consumed" })],
  ] as const)("retains every strict base field for %s results", (_name, parse, valid) => {
    expect(parse(valid, expected)).toEqual(valid);
    expect(parse(valid, expected)).not.toBe(valid);
    for (const key of Object.keys(valid)) {
      const input = { ...valid }; delete input[key];
      expect(parse(input, expected), `missing ${key}`).toBeNull();
    }
    for (const key of ["actorId", "token", "unexpected", "leaseId", "leaseExpiresAt"]) {
      expect(parse({ ...valid, [key]: "injected" }, expected), `extra ${key}`).toBeNull();
    }
    for (const outcome of [undefined, null, true, 1, "", "ready", "Issued", "consumed ", "lease_acquired"]) {
      expect(parse({ ...valid, outcome }, expected), `invalid outcome ${outcome}`).toBeNull();
    }
    for (const invalid of [null, [], [valid], "{}", true, 1]) expect(parse(invalid, expected)).toBeNull();
    expect(parse({ ...valid, intentId: otherIntentId }, expected)).toBeNull();
    expect(parse({ ...valid, storageContainer: "anotheraccount" }, expected)).toBeNull();
    expect(parse({ ...valid, objectKey: `media/source/${assetId}/${intentId}` }, expected)).toBeNull();
    expect(parse({ ...valid, authorityExpiresAt: "2026-09-22T12:05:01Z" }, expected)).toBeNull();
    expect(parse(valid, { ...expected, intentId: otherIntentId })).toBeNull();
    expect(parseImageKitUploadSnapshot(valid, expected)).toBeNull();
  });

  it("does not accept one RPC's outcomes through the other parser", () => {
    for (const outcome of ["consumed", "already_consumed"]) {
      expect(parseImageKitClaimSnapshot(snapshot({ ...consumed, outcome }), expected)).toBeNull();
    }
    for (const outcome of ["issued", "already_issued", "terminal", "too_late"]) {
      expect(parseImageKitFinalizedSnapshot(snapshot({ ...consumed, outcome }), expected)).toBeNull();
    }
  });

  it("never accepts incomplete provider bindings or a cleanup-queued consumed response", () => {
    for (const outcome of ["consumed", "already_consumed"]) {
      for (const key of ["issuedAt", "authorityExpiresAt", "fileId", "versionId", "versionToken", "sourceVariantId"]) {
        expect(parseImageKitFinalizedSnapshot(snapshot({ ...consumed, outcome, [key]: null }), expected), key).toBeNull();
      }
      expect(parseImageKitFinalizedSnapshot(snapshot({ ...consumed, outcome, cleanupState: "pending" }), expected)).toBeNull();
    }
  });
});

describe("strict ImageKit database snapshots", () => {
  it("accepts an unissued reservation without exposing the input object by reference", () => {
    const input = snapshot();
    const parsed = parseImageKitUploadSnapshot(input, expected);
    expect(parsed).toEqual(input);
    expect(parsed).not.toBe(input);
  });

  it.each(media)("checks the exact %s key, media kind and cap", (mimeType, extension, cap) => {
    const input = snapshot({ mimeType, mediaType: mimeType.startsWith("image/") ? "image" : "video",
      objectKey: `media/source/${assetId}/${intentId}.${extension}`, expectedByteSize: cap });
    expect(parseImageKitUploadSnapshot(input, expected)).not.toBeNull();
    expect(parseImageKitUploadSnapshot({ ...input, expectedByteSize: cap + 1 }, expected)).toBeNull();
  });

  it("rejects every missing field and every extra field, including RPC outcome", () => {
    for (const key of Object.keys(snapshot())) {
      const input = snapshot(); delete input[key];
      expect(parseImageKitUploadSnapshot(input, expected), key).toBeNull();
    }
    for (const key of ["outcome", "token", "actorId", "unexpected"]) {
      expect(parseImageKitUploadSnapshot(snapshot({ [key]: "issued" }), expected), key).toBeNull();
    }
  });

  it.each([null, [], [snapshot()], "{}", true, 1])("rejects non-object results %j", (input) => {
    expect(parseImageKitUploadSnapshot(input, expected)).toBeNull();
  });

  it.each([
    ["intentId", otherIntentId], ["intentId", intentId.toUpperCase()], ["assetId", "existing-asset"],
    ["storageContainer", "anotheraccount"], ["storageProvider", "supabase"],
    ["physicalObjectId", "not-a-uuid"], ["physicalObjectId", physicalObjectId.toUpperCase()],
    ["objectKey", `media/source/${assetId}/${intentId}`],
    ["objectKey", `media/source/${assetId}/${intentId}.jpg`],
    ["objectKey", `media/source/${assetId}/${intentId}.png?tr=w-1`],
    ["objectKey", `/media/source/${assetId}/${intentId}.png`],
    ["mediaType", "video"], ["mimeType", "image/svg+xml"],
    ["expectedByteSize", "8"], ["expectedByteSize", 0], ["expectedByteSize", 8.5],
    ["expectedChecksumSha256", checksum.toUpperCase()],
    ["expiresAt", "2026-09-22"], ["expiresAt", "2026-09-22T12:00:00"],
    ["expiresAt", "2026-02-30T00:00:00Z"], ["expiresAt", 1800000000],
    ["status", "ready"], ["cleanupState", "complete"], ["issuedAt", undefined],
  ])("rejects inconsistent snapshot %s=%j", (key, value) => {
    expect(parseImageKitUploadSnapshot(snapshot({ [key]: value }), expected)).toBeNull();
  });

  it("validates expected identity as well as database identity", () => {
    for (const identity of [
      { intentId: intentId.toUpperCase(), storageContainer },
      { intentId, storageContainer: "account/alias" },
      { intentId: otherIntentId, storageContainer },
      { intentId, storageContainer: "anotheraccount" },
    ]) expect(parseImageKitUploadSnapshot(snapshot(), identity)).toBeNull();
  });

  it("cannot adopt a different internally consistent asset namespace", () => {
    expect(parseImageKitUploadSnapshot(snapshot({ assetId: "legacy-asset",
      objectKey: `media/source/legacy-asset/${intentId}.png` }), expected)).toBeNull();
  });

  it("accepts persisted integer-second issuance with UTC and offset representations", () => {
    expect(parseImageKitUploadSnapshot(snapshot(issued), expected)).not.toBeNull();
    expect(parseImageKitUploadSnapshot(snapshot({ issuedAt: "2026-09-22T14:00:00.000000+02:00",
      authorityExpiresAt: "2026-09-22T14:05:00.000000+02:00" }), expected)).not.toBeNull();
  });

  it("accepts the last useful thirty-second authority, capped before intent expiry", () => {
    const input = snapshot({ expiresAt: "2026-09-22T12:00:32.999999Z", issuedAt: "2026-09-22T12:00:00Z",
      authorityExpiresAt: "2026-09-22T12:00:30Z" });
    expect(parseImageKitUploadSnapshot(input, expected)).not.toBeNull();
    expect(parseImageKitUploadSnapshot({ ...input, expiresAt: "2026-09-22T12:00:31Z",
      authorityExpiresAt: "2026-09-22T12:00:29Z" }, expected)).toBeNull();
  });

  it.each([
    { issuedAt: issued.issuedAt }, { authorityExpiresAt: issued.authorityExpiresAt },
    { ...issued, authorityExpiresAt: "2026-09-22T12:05:01Z" },
    { ...issued, authorityExpiresAt: "2026-09-22T12:04:59Z" },
    { ...issued, authorityExpiresAt: issued.issuedAt },
    { ...issued, issuedAt: "2026-09-22T12:00:00.000001Z" },
    { ...issued, authorityExpiresAt: "2026-09-22T12:05:00.000001Z" },
    { ...issued, expiresAt: "2026-09-22T12:05:01Z" },
    { ...issued, expiresAt: "2026-09-22T11:59:59Z" },
  ])("rejects an invalid issuance pair %j", (overrides) => {
    expect(parseImageKitUploadSnapshot(snapshot(overrides), expected)).toBeNull();
  });

  it("accepts only completely bound consumed snapshots", () => {
    expect(parseImageKitUploadSnapshot(snapshot(consumed), expected)).not.toBeNull();
    for (const key of ["issuedAt", "authorityExpiresAt", "fileId", "versionId", "versionToken", "sourceVariantId"]) {
      expect(parseImageKitUploadSnapshot(snapshot({ ...consumed, [key]: null }), expected), key).toBeNull();
    }
    for (const key of ["fileId", "versionId", "versionToken", "sourceVariantId"]) {
      expect(parseImageKitUploadSnapshot(snapshot({ [key]: consumed[key as keyof typeof consumed] }), expected), key).toBeNull();
    }
  });

  it.each([
    ["fileId", ""], ["fileId", "x".repeat(129)], ["fileId", "foreign/file"],
    ["versionId", ""], ["versionId", "x".repeat(129)], ["versionId", "version?one"],
    ["versionToken", ""], ["versionToken", "x".repeat(257)], ["versionToken", "one/two"],
    ["sourceVariantId", "123e4567-e89b-12d3-a456-426614174000"],
  ])("rejects malformed consumed %s=%j", (key, value) => {
    expect(parseImageKitUploadSnapshot(snapshot({ ...consumed, [key]: value }), expected)).toBeNull();
  });

  it("accepts exact provider identity and version token boundaries", () => {
    expect(parseImageKitUploadSnapshot(snapshot({ ...consumed, fileId: "x".repeat(128),
      versionId: "x".repeat(128), versionToken: "x".repeat(256) }), expected)).not.toBeNull();
  });

  it.each(["expired", "cancelled", "failed"])("validates cleanup invariants for %s", (status) => {
    expect(parseImageKitUploadSnapshot(snapshot({ status }), expected)).not.toBeNull();
    expect(parseImageKitUploadSnapshot(snapshot({ status, ...issued }), expected)).toBeNull();
    expect(parseImageKitUploadSnapshot(snapshot({ status, cleanupState: "pending" }), expected)).toBeNull();
    for (const cleanupState of ["pending", "leased", "attention"]) {
      expect(parseImageKitUploadSnapshot(snapshot({ status, ...issued, cleanupState }), expected)).not.toBeNull();
      expect(parseImageKitUploadSnapshot(snapshot({ ...consumed, status, cleanupState }), expected)).toBeNull();
    }
  });

  it.each(["pending", "leased", "attention"])("never accepts %s cleanup for prepared/consumed uploads", (cleanupState) => {
    expect(parseImageKitUploadSnapshot(snapshot({ ...issued, cleanupState }), expected)).toBeNull();
    expect(parseImageKitUploadSnapshot(snapshot({ ...consumed, cleanupState }), expected)).toBeNull();
  });

  it("does not conflate parsing with a current-time validity/ownership check", () => {
    // A resolver can cross the deadline immediately after its transaction.
    // Later operations must still revalidate status/expiry under database locks.
    expect(parseImageKitUploadSnapshot(snapshot({ expiresAt: "2000-01-01T00:00:00Z" }), expected)).not.toBeNull();
  });

  it("projects exactly six public fields, without provider/evidence/authority internals", () => {
    const parsed = parseImageKitUploadSnapshot(snapshot(consumed), expected)!;
    expect(toImageKitUploadStatus(parsed)).toEqual({ intentId, assetId, status: "consumed",
      expiresAt: "2026-09-22T12:10:00.123456+00:00", issued: true, cleanupPending: false });
    for (const cleanupState of ["pending", "leased", "attention"]) {
      const terminal = parseImageKitUploadSnapshot(snapshot({ ...issued, status: "expired", cleanupState }), expected)!;
      expect(toImageKitUploadStatus(terminal).cleanupPending).toBe(true);
    }
    expect(toImageKitUploadStatus(parseImageKitUploadSnapshot(snapshot(), expected)!).issued).toBe(false);
  });
});
