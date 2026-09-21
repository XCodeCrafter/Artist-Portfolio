import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const sharedActions = source("lib/admin/media-upload-actions.ts");
const classicActions = source("app/admin/media/actions.ts");
const v2Upload = source("components/admin/v2/MediaLibraryUpload.tsx");
const classicUpload = source("components/admin/MediaManager.tsx");

describe("route-neutral Media upload cutover", () => {
  it("uses the same server actions from both upload interfaces", () => {
    expect(sharedActions).toMatch(/^"use server";/);
    for (const upload of [v2Upload, classicUpload]) {
      expect(upload).toContain('import { prepareMediaUpload, finalizeMediaUpload } from "@/lib/admin/media-upload-actions"');
    }
    expect(v2Upload).not.toContain("@/app/admin/media/actions");
    expect(sharedActions).not.toMatch(/from ["']@\/app\//);
    expect(sharedActions).not.toContain('from "next/navigation"');
  });

  it("keeps only thin compatibility delegates in Classic", () => {
    expect(classicActions).toMatch(/export async function prepareMediaUpload\(value: unknown\)\s*\{\s*return prepareSharedMediaUpload\(value\);\s*\}/);
    expect(classicActions).toMatch(/export async function finalizeMediaUpload\(input: unknown\)\s*\{\s*return finalizeSharedMediaUpload\(input\);\s*\}/);
    for (const helper of ["prepareUploadSchema", "finalizeUploadSchema", "inspectStoredMedia", "uploadProof(", "createSignedUploadUrl("]) {
      expect(sharedActions).toContain(helper);
      expect(classicActions).not.toContain(helper);
    }
  });

  it("shares metadata validation and invalidation without duplicating upload authority", () => {
    for (const actions of [classicActions, sharedActions]) {
      expect(actions).toContain('from "@/lib/admin/media-action-shared"');
      expect(actions).not.toContain("const mediaMetadataSchema");
      expect(actions).not.toContain("const REVALIDATE_PATHS");
    }
    expect(source("lib/admin/media-action-shared.ts")).toContain('"/admin/v2/media"');
    expect(source("lib/admin/media-action-shared.ts")).toContain('"/admin/media"');
  });
});
