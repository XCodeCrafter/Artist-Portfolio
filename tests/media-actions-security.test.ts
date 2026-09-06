import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mediaActions = readFileSync(
  new URL("../app/admin/media/actions.ts", import.meta.url),
  "utf8"
);

describe("media action error handling", () => {
  it("keeps media insert details server-side and returns a generic client error", () => {
    const finalizeAction = mediaActions.slice(
      mediaActions.indexOf("export async function finalizeMediaUpload"),
      mediaActions.indexOf("export async function updateMediaAsset")
    );

    expect(finalizeAction).toContain(
      'console.error("Media asset insert failed after upload verification.", {'
    );
    expect(finalizeAction).toContain(
      'error: "Uploaded media could not be added to the library."'
    );
    expect(finalizeAction).not.toContain(
      "error: insertResult.error.message"
    );
  });
});
