import { describe, expect, it } from "vitest";
import { createFixtureHandler, fixtureCompilerOptions, renderFixtureDocument } from "../scripts/imagekit-overview-browser.mjs";

function request(url = "/mixed", method = "GET", headers: Record<string, string | undefined> = {}) {
  const response = {
    statusCode: 0, headers: {} as Record<string, string>, body: undefined as string | undefined,
    setHeader(key: string, value: string) { this.headers[key] = value; },
    end(body?: string) { this.body = body; },
  };
  createFixtureHandler(new Map([["/mixed", "<h1>Synthetic fixture</h1>"]]), "body{color:white}")(
    { url, method, headers: { host: "127.0.0.1:3103", ...headers } }, response,
  );
  return response;
}

describe("Isolated ImageKit browser fixture server", () => {
  it("disables env loading, real public assets, dependency discovery and dev-server services", () => {
    expect(fixtureCompilerOptions()).toMatchObject({
      configFile: false, envDir: false, publicDir: false,
      optimizeDeps: { noDiscovery: true, include: [] },
      server: { middlewareMode: true, hmr: false, watch: null, ws: false },
    });
  });
  it("serves only synthetic documents and CSS with no active browser capabilities", () => {
    const page = request();
    expect(page.statusCode).toBe(200);
    expect(page.body).toBe("<h1>Synthetic fixture</h1>");
    expect(page.headers["Content-Security-Policy"]).toContain("script-src 'none'; connect-src 'none'");
    expect(page.headers["Content-Security-Policy"]).toContain("form-action 'none'");
    expect(page.headers["Cache-Control"]).toBe("no-store");
    expect(page.headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(request("/").body).toBe(page.body);
    expect(request("/fixture.css").headers["Content-Type"]).toContain("text/css");
  });
  it.each(["POST", "PUT", "PATCH", "DELETE", "OPTIONS"])("rejects %s without side effects", (method) => {
    expect(request("/mixed", method).statusCode).toBe(405);
  });
  it.each(["/.env.local", "/../../.env.local", "/%2e%2e/.git/config", "/mixed?file=.env", "/admin/v2/media", "https://example.com/"])("has no filesystem or proxy route for %s", (url) => {
    expect(request(url).statusCode).toBe(404);
  });
  it.each([
    { host: "attacker.example:3103" }, { host: "localhost:3103" },
    { origin: "https://attacker.example" }, { "sec-fetch-site": "cross-site" },
  ])("rejects foreign Host/Origin/site headers: %j", (headers) => {
    expect(request("/mixed", "GET", headers).statusCode).toBe(403);
  });
  it("supports HEAD and an empty favicon without loading any external media", () => {
    expect(request("/mixed", "HEAD").body).toBeUndefined();
    expect(request("/favicon.ico").statusCode).toBe(204);
  });
  it("labels the standalone fixture honestly and escapes its navigation labels", () => {
    const fixture = { id: "mixed", title: '<img src="fake">' };
    const html = renderFixtureDocument(fixture, [fixture], "<section>Real rendered component</section>");
    expect(html).toContain("Synthetic data only");
    expect(html).toContain("not the Media editor");
    expect(html).toContain("&lt;img src=&quot;fake&quot;&gt;");
    expect(html).toContain('<section>Real rendered component</section>');
    expect(html).not.toMatch(/<script|<form|<img\b/);
  });
});
