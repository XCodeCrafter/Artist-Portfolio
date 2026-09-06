import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createImageKitUploadAuthority,
  IMAGEKIT_UPLOAD_AUTH_TTL_SECONDS,
  IMAGEKIT_UPLOAD_ENDPOINT,
} from "@/lib/admin/imagekit-upload";

const credentials = {
  publicKey: "public_abcdefghijklmnop",
  privateKey: "private_abcdefghijklmnop",
  urlEndpoint: "https://ik.imagekit.io/artistportfolio",
  imageKitId: "artistportfolio",
};
const intentId = "123e4567-e89b-42d3-a456-426614174000";
const assetId = "pilot-image";
const nowSeconds = 1_800_000_000;

function createAuthority(
  overrides: Partial<Parameters<typeof createImageKitUploadAuthority>[0]> = {}
) {
  return createImageKitUploadAuthority({
    credentials,
    intentId,
    assetId,
    objectKey: `media/source/${assetId}/${intentId}.webp`,
    mimeType: "image/webp",
    expectedByteSize: 1024,
    intentExpiresAt: new Date((nowSeconds + 600) * 1000).toISOString(),
    nowSeconds,
    ...overrides,
  });
}

function decodeJsonPart(tokenPart: string) {
  return JSON.parse(Buffer.from(tokenPart, "base64url").toString("utf8"));
}

describe("ImageKit V2 upload authority", () => {
  it("binds the exact target, file policy, and expiry into an HS256 JWT", () => {
    const result = createAuthority();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [encodedHeader, encodedPayload, signature] =
      result.authority.token.split(".");
    const expiresAt = nowSeconds + IMAGEKIT_UPLOAD_AUTH_TTL_SECONDS;

    expect(decodeJsonPart(encodedHeader)).toEqual({
      alg: "HS256",
      typ: "JWT",
      kid: credentials.publicKey,
    });
    expect(decodeJsonPart(encodedPayload)).toEqual({
      fileName: `${intentId}.webp`,
      folder: `/media/source/${assetId}`,
      useUniqueFileName: "false",
      overwriteFile: "false",
      isPrivateFile: "false",
      isPublished: "true",
      checks: '"file.size" = 1024 AND "file.mime" = "image/webp"',
      iat: nowSeconds,
      exp: expiresAt,
    });
    expect(signature).toBe(
      createHmac("sha256", credentials.privateKey)
        .update(`${encodedHeader}.${encodedPayload}`)
        .digest("base64url")
    );
    expect(result.authority).toMatchObject({
      uploadEndpoint: IMAGEKIT_UPLOAD_ENDPOINT,
      expiresAt,
      uploadParams: {
        fileName: `${intentId}.webp`,
        folder: `/media/source/${assetId}`,
        useUniqueFileName: "false",
        overwriteFile: "false",
        isPrivateFile: "false",
        isPublished: "true",
      },
    });
    expect(JSON.stringify(result)).not.toContain(credentials.privateKey);
    expect(result.authority.uploadParams).not.toHaveProperty("file");
    expect(result.authority.uploadParams).not.toHaveProperty("token");
    expect(result.authority.uploadParams).not.toHaveProperty("publicKey");
    expect(result.authority.uploadParams).not.toHaveProperty("signature");
  });

  it("never outlives the database intent", () => {
    expect(
      createAuthority({
        intentExpiresAt: new Date((nowSeconds + 90) * 1000).toISOString(),
      })
    ).toMatchObject({
      ok: true,
      authority: { expiresAt: nowSeconds + 88 },
    });
  });

  it("binds a retry to a new intent and therefore a new one-shot token", () => {
    const retryIntentId = "123e4567-e89b-42d3-a456-426614174001";
    const first = createAuthority();
    const retry = createAuthority({
      intentId: retryIntentId,
      objectKey: `media/source/${assetId}/${retryIntentId}.webp`,
    });

    expect(first.ok).toBe(true);
    expect(retry.ok).toBe(true);
    if (!first.ok || !retry.ok) return;

    expect(retry.authority.token).not.toBe(first.authority.token);
    expect(retry.authority.uploadParams.fileName).toBe(`${retryIntentId}.webp`);
  });

  it("requires the canonical extension for the allowlisted MIME type", () => {
    expect(
      createAuthority({
        objectKey: `media/source/${assetId}/${intentId}.mov`,
        mimeType: "video/quicktime",
        expectedByteSize: 10_000,
      })
    ).toMatchObject({
      ok: true,
      authority: {
        uploadParams: {
          fileName: `${intentId}.mov`,
          checks: '"file.size" = 10000 AND "file.mime" = "video/quicktime"',
        },
      },
    });

    for (const input of [
      { objectKey: `media/source/${assetId}/${intentId}` },
      { objectKey: `media/source/${assetId}/${intentId}.mp4` },
      { objectKey: `media/source/${assetId}/${intentId}.webp.exe` },
      { objectKey: `media/source/another-asset/${intentId}.webp` },
      { objectKey: `/media/source/${assetId}/${intentId}.webp` },
    ]) {
      expect(createAuthority(input), input.objectKey).toEqual({
        ok: false,
        reason: "invalid-target",
      });
    }
  });

  it("rejects malformed identity, media, size, and expiry inputs", () => {
    expect(createAuthority({ intentId: "not-a-uuid" })).toEqual({
      ok: false,
      reason: "invalid-target",
    });
    expect(createAuthority({ assetId: "Pilot Image" })).toEqual({
      ok: false,
      reason: "invalid-target",
    });
    expect(createAuthority({ mimeType: "image/svg+xml" })).toEqual({
      ok: false,
      reason: "invalid-media",
    });
    expect(createAuthority({ expectedByteSize: 0 })).toEqual({
      ok: false,
      reason: "invalid-media",
    });
    expect(
      createAuthority({ expectedByteSize: 10 * 1024 * 1024 + 1 })
    ).toEqual({
      ok: false,
      reason: "invalid-media",
    });
    expect(createAuthority({ intentExpiresAt: "not-a-date" })).toEqual({
      ok: false,
      reason: "invalid-expiry",
    });
    expect(
      createAuthority({
        intentExpiresAt: new Date((nowSeconds + 20) * 1000).toISOString(),
      })
    ).toEqual({ ok: false, reason: "intent-expired" });
  });
});
