import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readinessSource = readFileSync(
  new URL("../lib/admin/readiness.ts", import.meta.url),
  "utf8"
);
const exampleEnv = readFileSync(
  new URL("../.env.example", import.meta.url),
  "utf8"
);

describe("Batch 7A media configuration readiness", () => {
  it("probes the additive media-pipeline schema without reading private tables", () => {
    expect(readinessSource).toContain(
      'supabase.rpc("get_media_pipeline_v1_snapshot", {'
    );
    expect(readinessSource).toContain('p_asset_id: "~schema-probe"');
    expect(readinessSource).toContain(
      'mediaPipelineResult.error.code === "23503"'
    );
    expect(readinessSource).toContain(
      '"Apply all current Supabase migrations through 0035."'
    );
    expect(readinessSource).not.toContain(
      '.from("media_physical_objects")'
    );
    expect(readinessSource).not.toContain('.from("media_asset_variants")');
    expect(readinessSource).not.toContain(
      '.from("media_optimization_jobs")'
    );
  });

  it("publishes only readiness booleans for the documented R2 contract", () => {
    expect(exampleEnv).toContain("MEDIA_UPLOAD_PROVIDER=supabase");
    expect(exampleEnv).toContain("NEXT_PUBLIC_MEDIA_ORIGIN=");
    expect(readinessSource).toContain("getMediaUploadConfigSummary()");

    for (const key of [
      "R2_ACCOUNT_ID",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_BUCKET_NAME",
    ]) {
      expect(exampleEnv).toContain(`${key}=`);
      expect(readinessSource).not.toContain(`process.env.${key}`);
    }

    for (const key of ["MEDIA_PROCESSOR_URL", "MEDIA_PROCESSOR_SECRET"]) {
      expect(exampleEnv).toContain(`${key}=`);
      expect(readinessSource).toContain(`process.env.${key}`);
    }

    expect(readinessSource).toContain('id: "r2-delivery"');
    expect(readinessSource).toContain('id: "media-processor"');
    expect(readinessSource).not.toContain("R2 credentials:");
    expect(readinessSource).not.toContain("MEDIA_PROCESSOR_SECRET,");
  });
});
