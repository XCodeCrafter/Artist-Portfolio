import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHomeFixtureHandler, fixtureImagePaths, fixtureOrigin, fixtureVideoPath } from "../scripts/home-editorial-browser.mjs";
import { createFullHomeFixtureDraft, createHomeFixture, readFixtureHome, saveHomeSectionV2, setFixtureConflict } from "./fixtures/home-editorial-actions";
import { INITIAL_HOME_SAVE_STATE, parseHomeEditorSnapshot } from "@/lib/admin/home-editor";

function request(url = "/", method = "GET", headers: Record<string, string | undefined> = {}) {
  const response = {
    statusCode: 0, headers: {} as Record<string, string>, body: undefined as string | Buffer | undefined,
    setHeader(key: string, value: string) { this.headers[key] = value; },
    writeHead(status: number, headers: Record<string, string>) { this.statusCode = status; Object.assign(this.headers, headers); },
    end(body?: string | Buffer) { this.body = body; },
  };
  createHomeFixtureHandler(new Map([
    ["/", { type: "text/html", body: "<h1>Synthetic fixture</h1>" }],
    ["/admin/v2-preview/home", { type: "text/html", body: "<h1>Isolated iframe runtime</h1>" }],
    ["/fixture.js", { type: "text/javascript", body: "/* fixture script */" }],
    ["/fixture.css", { type: "text/css", body: "body{}" }],
    ["/fixture-audio.wav", { type: "audio/wav", body: Buffer.alloc(20, 0) }],
    [fixtureVideoPath, { type: "video/mp4", body: Buffer.alloc(20, 0) }],
    ...fixtureImagePaths.map((path: string) => [path, { type: path.endsWith(".webp") ? "image/webp" : path.endsWith(".png") ? "image/png" : "image/jpeg", body: Buffer.alloc(20, 0) }] as const),
  ]))({ url, method, headers: { host: "127.0.0.1:3107", ...headers } }, response);
  return response;
}

describe("isolated Home editorial browser fixture", () => {
  it("runs the production CSS optimizer so browser QA catches transform folding", () => {
    const builder = readFileSync(new URL("../scripts/home-editorial-browser.mjs", import.meta.url), "utf8");
    expect(builder).toMatch(/tailwind\(\{\s*base:\s*root,\s*optimize:\s*true\s*\}\)/);
  });
  it("keeps Home and footer direct siblings under the production Home styling boundary", () => {
    const fixture = readFileSync(new URL("./fixtures/home-editorial-browser.tsx", import.meta.url), "utf8");
    // .home-page > footer must apply just as it does to the production route.
    expect(fixture).toMatch(/<div className="home-page relative z-10">\s*<HomePageView\b[^]*?\/>\s*<GalleryFooter\b[^]*?\/>\s*<\/div>/);
    expect(fixture.match(/className="home-page\b/g)).toHaveLength(1);
  });
  it("allows the actual preview iframe and local media without opening external capabilities", () => {
    expect(fixtureOrigin).toBe("http://127.0.0.1:3107");
    for (const path of ["/", "/admin/v2-preview/home", "/fixture.js", "/fixture.css", "/fixture-audio.wav", "/images/home-editorial/guitar.webp", fixtureVideoPath]) {
      const result = request(path);
      expect(result.statusCode).toBe(200);
      expect(result.headers["Cache-Control"]).toBe("no-store");
      for (const rule of ["default-src 'none'", "connect-src 'none'", "frame-src 'self'", "frame-ancestors 'self'", "media-src 'self'", "form-action 'none'", "font-src 'none'"]) {
        expect(result.headers["Content-Security-Policy"]).toContain(rule);
      }
    }
    expect(request("/", "HEAD").body).toBeUndefined();
  });
  it("serves only the explicit local images needed for full Home, including existing hero and About", () => {
    expect(fixtureImagePaths).toContain("/images/hero.jpg");
    expect(fixtureImagePaths).toContain("/images/about.jpg");
    expect(fixtureImagePaths).toContain("/images/video-hero.jpg");
    expect(new Set(fixtureImagePaths).size).toBe(fixtureImagePaths.length);
    for (const asset of fixtureImagePaths) {
      const result = request(asset);
      expect(result.statusCode).toBe(200);
      expect(result.headers["Content-Type"]).toMatch(/^image\/(webp|png|jpeg)$/);
      expect(request(asset, "HEAD").body).toBeUndefined();
      expect(request(`${asset}?download=1`).statusCode).toBe(404);
    }
  });
  it("serves only the original local Interlude video and never arbitrary media files", () => {
    expect(fixtureVideoPath).toBe("/media/hero-loop.mp4");
    const video = request(fixtureVideoPath);
    expect(video.statusCode).toBe(200);
    expect(video.headers["Content-Type"]).toBe("video/mp4");
    expect(video.headers["Content-Length"]).toBe("20");
    expect(video.headers["Accept-Ranges"]).toBe("bytes");
    expect(request(fixtureVideoPath, "HEAD").body).toBeUndefined();
    for (const path of ["/media/another.mp4", "/media/../.env.local", `${fixtureVideoPath}?download=1`]) {
      expect(request(path).statusCode).toBe(404);
    }
  });
  it.each(["POST", "PUT", "PATCH", "DELETE", "OPTIONS"])("denies %s — saves use no HTTP endpoint", method => {
    const response = request("/", method);
    expect(response.statusCode).toBe(405); expect(response.headers.Allow).toBe("GET, HEAD");
  });
  it.each(["/.env.local", "/../../.git/config", "/%2e%2e/.env", "/admin/v2/pages/home", "/api/admin", "/@vite/client", "/fixture.js?x=1", "/images/not-listed.jpg", "/images/../.env.local"])("does not serve unknown path %s", path => {
    expect(request(path).statusCode).toBe(404);
  });
  it("shows the proposed full-page order without changing saved visibility, order, About copy or media", () => {
    const snapshot = createHomeFixture();
    const original = structuredClone(snapshot);
    const full = createFullHomeFixtureDraft(snapshot.draft);
    expect(full.layout.map(item => item.id)).toEqual(["hero", "release", "about", "work", "cnc", "feature", "press"]);
    expect(full.layout.filter(item => item.enabled).map(item => item.id)).toEqual(["hero", "release", "about", "work", "feature", "press"]);
    expect(full.about.body).toBe(snapshot.draft.about.body);
    expect(full.hero.backgroundSrc).toBe("/images/hero.jpg");
    expect(full.about.imageSrc).toBe("/images/about.jpg");
    expect(parseHomeEditorSnapshot({ ...snapshot, draft: full })).not.toBeNull();
    full.work.title = "Changed isolated copy";
    expect(snapshot).toEqual(original);
  });
  it.each([
    { host: "evil.example:3107" }, { host: "localhost:3107" }, { host: undefined },
    { origin: "" }, { origin: "null" }, { origin: "https://example.com" }, { "sec-fetch-site": "cross-site" },
  ])("rejects foreign or ambiguous request headers %j", headers => {
    expect(request("/", "GET", headers).statusCode).toBe(403);
  });
  it.each(["/fixture-audio.wav", fixtureVideoPath])("serves bounded local ranges for %s and rejects malformed or excessive ranges", path => {
    const response = request(path, "GET", { range: "bytes=2-9" });
    expect(response.statusCode).toBe(206); expect(response.headers["Content-Range"]).toBe("bytes 2-9/20");
    expect(response.headers["Content-Length"]).toBe("8");
    expect(response.headers["Accept-Ranges"]).toBe("bytes");
    expect(response.body).toHaveLength(8);
    expect(request(path, "HEAD", { range: "bytes=2-9" }).body).toBeUndefined();
    const tail = request(path, "GET", { range: "bytes=17-" });
    expect(tail.statusCode).toBe(206);
    expect(tail.headers["Content-Range"]).toBe("bytes 17-19/20");
    expect(tail.body).toHaveLength(3);
    for (const range of ["bytes=-2", "bytes=3-30", "bytes=10-2", "bytes=0-1,3-4", "bytes=9007199254740993-"]) {
      const invalid = request(path, "GET", { range });
      expect(invalid.statusCode).toBe(416);
      expect(invalid.headers["Content-Range"]).toBe("bytes */20");
    }
  });
  it("uses validated synthetic data, never a real review or external audio host", () => {
    const snapshot = createHomeFixture();
    expect(parseHomeEditorSnapshot(snapshot)).not.toBeNull();
    expect(snapshot.draft.release.playback).toEqual({ kind: "audio", url: "/fixture-audio.wav" });
    expect(snapshot.draft.release.title).toBe("DEMO RELEASE");
    expect(snapshot.draft.feature.videoSrc).toBe(fixtureVideoPath);
    expect(snapshot.draft.feature.posterSrc).toBe("/images/video-hero.jpg");
    expect(createFullHomeFixtureDraft(snapshot.draft).feature).toEqual(snapshot.draft.feature);
    expect(snapshot.draft.press.items.every(item => item.publication.startsWith("SYNTHETIC QA"))).toBe(true);
    expect(snapshot.draft.press.items.some(item => !item.visible)).toBe(true);
  });
  it("saves only canonical validated sections in memory and enforces CAS", async () => {
    const snapshot = readFixtureHome();
    const form = new FormData();
    form.set("section", "work"); form.set("payload", JSON.stringify({ ...snapshot.draft.work, title: "  Canonical QA heading  " })); form.set("versions", JSON.stringify(snapshot.versions));
    const result = await saveHomeSectionV2(INITIAL_HOME_SAVE_STATE, form);
    expect(result.status).toBe("saved");
    expect(readFixtureHome().draft.work.title).toBe("Canonical QA heading");
    expect(readFixtureHome().draft.release).toEqual(snapshot.draft.release);
    expect(readFixtureHome().versions.updatedAt).not.toBe(snapshot.versions.updatedAt);
    expect((await saveHomeSectionV2(INITIAL_HOME_SAVE_STATE, form)).status).toBe("conflict");
    form.set("payload", "not JSON");
    expect((await saveHomeSectionV2(INITIAL_HOME_SAVE_STATE, form)).status).toBe("invalid");
    form.set("payload", JSON.stringify(snapshot.draft.work)); form.set("versions", JSON.stringify(readFixtureHome().versions));
    setFixtureConflict(true);
    try { expect((await saveHomeSectionV2(INITIAL_HOME_SAVE_STATE, form)).status).toBe("conflict"); }
    finally { setFixtureConflict(false); }
  });
});
