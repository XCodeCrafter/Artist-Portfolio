import { createHash } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateAcceptanceImages } from "../scripts/acceptance/workspace.mjs";
import { SOCIAL_CARD_BACKGROUND, SOCIAL_IMAGE_SIZE } from "../lib/site-sharing-preview";

const files = vi.hoisted(() => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  readFile: vi.fn(() => { throw new Error("Fixture generation must not read owner media."); }),
  copyFile: vi.fn(() => { throw new Error("Fixture generation must not copy owner media."); }),
}));

vi.mock("node:fs/promises", async (importOriginal) => ({
  ...await importOriginal<typeof import("node:fs/promises")>(),
  ...files,
}));

beforeEach(() => { vi.clearAllMocks(); });

describe("generated acceptance media", () => {
  it("supplies real synthetic JPEG artwork for the sharing route without reading or copying owner media", async () => {
    const appRoot = path.resolve("synthetic-shadow-app");
    await generateAcceptanceImages(appRoot);
    const socialPath = path.join(appRoot, "public", SOCIAL_CARD_BACKGROUND.slice(1));
    const socialWrite = files.writeFile.mock.calls.find(([target]) => target === socialPath);
    expect(socialWrite).toBeDefined();
    const bytes = socialWrite![1] as Buffer;
    expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    expect(await sharp(bytes).metadata()).toMatchObject({ format: "jpeg", ...SOCIAL_IMAGE_SIZE });
    const pixel = await sharp(bytes).extract({ left: 100, top: 100, width: 1, height: 1 }).raw().toBuffer();
    for (const [channel, expected] of [55, 109, 122].entries()) {
      expect(Math.abs(pixel[channel] - expected)).toBeLessThanOrEqual(3);
    }
    expect(files.readFile).not.toHaveBeenCalled();
    expect(files.copyFile).not.toHaveBeenCalled();
  });

  it("includes every generated file in manifest integrity hashes and uses exclusive writes", async () => {
    const appRoot = path.resolve("synthetic-shadow-app");
    const hashes = await generateAcceptanceImages(appRoot);
    expect(files.writeFile).toHaveBeenCalledTimes(6);
    expect(hashes[`app/public${SOCIAL_CARD_BACKGROUND}`]).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.keys(hashes)).toHaveLength(files.writeFile.mock.calls.length);
    for (const [target, bytes, options] of files.writeFile.mock.calls) {
      const relative = path.relative(appRoot, target as string).replaceAll("\\", "/");
      expect(options).toEqual({ flag: "wx" });
      expect(hashes[`app/${relative}`]).toBe(createHash("sha256").update(bytes as Buffer).digest("hex"));
      expect((await sharp(bytes as Buffer).metadata()).format).toBe(relative.endsWith(".jpg") ? "jpeg" : "png");
    }
  });
});
