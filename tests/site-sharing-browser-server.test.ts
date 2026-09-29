import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createSharingFixtureHandler, sharingFixtureImages, sharingFixtureOrigin } from "../scripts/site-sharing-browser.mjs";
import { INITIAL_SHARING_SAVE_STATE } from "@/lib/admin/site-sharing-editor";
import { readSharingFixture, saveSiteSharingV2, setSharingFixtureMode } from "./fixtures/site-sharing-actions";

function request(url = "/", method = "GET", headers: Record<string, string | undefined> = {}) {
  const response = { statusCode: 0, headers: {} as Record<string, string>, body: undefined as string | Buffer | undefined,
    setHeader(key: string, value: string) { this.headers[key] = value; },
    writeHead(status: number, headers: Record<string, string>) { this.statusCode = status; Object.assign(this.headers, headers); },
    end(body?: string | Buffer) { this.body = body; },
  };
  createSharingFixtureHandler(new Map<string, { type: string; body: string | Buffer }>([
    ["/", { type: "text/html", body: "<h1>Isolated sharing</h1>" }],
    ["/fixture.js", { type: "text/javascript", body: "/* isolated */" }],
    ["/fixture.css", { type: "text/css", body: "body{}" }],
    ...sharingFixtureImages.map((path: string) => [path, { type: "image/jpeg", body: Buffer.alloc(20) }] as const),
  ]))({ url, method, headers: { host: "127.0.0.1:3110", ...headers } }, response);
  return response;
}
describe("Sharing isolated browser fixture", () => {
  it("serves only the actual-component bundle and explicitly allowlisted public artwork", () => {
    expect(sharingFixtureOrigin).toBe("http://127.0.0.1:3110");
    for (const path of ["/", "/fixture.js", "/fixture.css", ...sharingFixtureImages]) {
      const result = request(path);
      expect(result.statusCode).toBe(200); expect(result.headers["Cache-Control"]).toBe("no-store");
      for (const rule of ["connect-src 'none'", "form-action 'none'", "font-src 'none'", "frame-ancestors 'none'"]) expect(result.headers["Content-Security-Policy"]).toContain(rule);
      expect(request(path, "HEAD").body).toBeUndefined();
    }
  });
  it.each(["/.env.local", "/../../.git/config", "/%2e%2e/.env", "/api/admin", "/@vite/client", "/fixture.js?x=1", "/images/not-listed.jpg"])("rejects unknown resource %s", resource => {
    expect(request(resource).statusCode).toBe(404);
  });
  it.each(["POST", "PUT", "PATCH", "DELETE", "OPTIONS"])("denies network mutation %s", method => {
    expect(request("/", method).statusCode).toBe(405);
  });
  it.each([{ host: "localhost:3110" }, { host: undefined }, { origin: "null" }, { origin: "https://example.com" }, { "sec-fetch-site": "cross-site" }])("rejects ambiguous request headers %j", headers => {
    expect(request("/", "GET", headers).statusCode).toBe(403);
  });
  it("uses production CSS and blocks backend modules in the build", () => {
    const source = readFileSync(new URL("../scripts/site-sharing-browser.mjs", import.meta.url), "utf8");
    expect(source).toContain("optimize: true"); expect(source).toContain("envDir: false");
    expect(source).toContain("Backend module blocked"); expect(source).toContain("Missing isolated Sharing action stub");
  });
  it("validates and saves in memory with CAS, conflict and lost-response scenarios", async () => {
    const old = readSharingFixture();
    const form = new FormData(); form.set("payload", JSON.stringify({ ...old.draft, title: " New share title " })); form.set("versions", JSON.stringify(old.versions));
    const result = await saveSiteSharingV2(INITIAL_SHARING_SAVE_STATE, form);
    expect(result.status).toBe("saved"); expect(readSharingFixture().draft.title).toBe("New share title");
    expect(readSharingFixture().versions.updatedAt).not.toBe(old.versions.updatedAt);
    expect((await saveSiteSharingV2(INITIAL_SHARING_SAVE_STATE, form)).status).toBe("conflict");
    form.set("versions", JSON.stringify(readSharingFixture().versions));
    setSharingFixtureMode("conflict");
    try { expect((await saveSiteSharingV2(INITIAL_SHARING_SAVE_STATE, form)).status).toBe("conflict"); }
    finally { setSharingFixtureMode("success"); }
    setSharingFixtureMode("lost");
    try { await expect(saveSiteSharingV2(INITIAL_SHARING_SAVE_STATE, form)).rejects.toThrow("Synthetic lost response"); }
    finally { setSharingFixtureMode("success"); }
  });
});
