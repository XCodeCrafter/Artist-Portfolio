import { describe, expect, it } from "vitest";
import { assertOperationsFixtureModules, buildOperationsFixture, createOperationsFixtureHandler, fixtureCompilerOptions, fixtureOrigin } from "../scripts/imagekit-operations-browser.mjs";

function request(url = "/", method = "GET", headers: Record<string, string | undefined> = {}) {
  const response = {
    statusCode: 0, headers: {} as Record<string, string>, body: undefined as string | undefined,
    setHeader(key: string, value: string) { this.headers[key] = value; },
    end(body?: string) { this.body = body; },
  };
  createOperationsFixtureHandler(new Map([
    ["/", { type: "text/html; charset=utf-8", body: "<h1>Synthetic fixture</h1>" }],
    ["/fixture.js", { type: "text/javascript; charset=utf-8", body: "/* synthetic bundle */" }],
    ["/fixture.css", { type: "text/css; charset=utf-8", body: "body{color:white}" }],
    ["/accidental-resource", { type: "text/plain", body: "Must never be served." }],
  ]))({ url, method, headers: { host: "127.0.0.1:3105", ...headers } }, response);
  return response;
}

describe("isolated ImageKit operations browser fixture", () => {
  it("disables environment/config/public loading and all disk build output", () => {
    const config = fixtureCompilerOptions();
    expect(config).toMatchObject({ configFile: false, envDir: false, publicDir: false,
      define: { "process.env": "{}", "process.env.NODE_ENV": '"production"' },
      build: { write: false, emptyOutDir: false, sourcemap: false, minify: false, lib: { formats: ["iife"] } },
    });
    expect(config.resolve.alias[0].find).toBe("@/lib/admin/imagekit-operations-actions");
    expect(config.resolve.alias[0].replacement.replaceAll("\\", "/")).toMatch(/\/tests\/fixtures\/imagekit-operations-actions\.ts$/);
    expect(config.resolve.alias[1].find).toBe("@");
  });

  it("serves exactly the shell, script and CSS while denying all external capabilities", () => {
    expect(fixtureOrigin).toBe("http://127.0.0.1:3105");
    for (const path of ["/", "/fixture.js", "/fixture.css"]) {
      const result = request(path);
      expect(result.statusCode).toBe(200);
      expect(result.headers["Cache-Control"]).toBe("no-store");
      expect(result.headers["X-Content-Type-Options"]).toBe("nosniff");
      expect(result.headers["Referrer-Policy"]).toBe("no-referrer");
      for (const rule of ["default-src 'none'", "script-src 'self'", "img-src 'none'", "connect-src 'none'", "media-src 'none'", "font-src 'none'", "form-action 'none'", "frame-ancestors 'none'"]) {
        expect(result.headers["Content-Security-Policy"]).toContain(rule);
      }
    }
    expect(request("/fixture.js").headers["Content-Type"]).toContain("text/javascript");
    expect(request("/fixture.css").headers["Content-Type"]).toContain("text/css");
    expect(request("/", "HEAD").body).toBeUndefined();
  });

  it.each(["POST", "PUT", "PATCH", "DELETE", "OPTIONS", "CONNECT", "TRACE"])("rejects %s; there is no operation endpoint", method => {
    const response = request("/", method);
    expect(response.statusCode).toBe(405);
    expect(response.headers.Allow).toBe("GET, HEAD");
  });

  it.each(["/favicon.ico", "/.env.local", "/../../.env.local", "/%2e%2e/.git/config", "/?scenario=available", "/fixture.js?x=1", "/admin/v2/media", "/accidental-resource", "https://example.test/", "/@vite/client"])("rejects non-allowlisted path %s", path => {
    expect(request(path).statusCode).toBe(404);
  });

  it.each([
    { host: "evil.example:3105" }, { host: "localhost:3105" }, { host: "127.0.0.1:3000" }, { host: undefined },
    { origin: "https://evil.example" }, { origin: "http://127.0.0.1:3105/" }, { origin: "null" }, { origin: "" },
    { "sec-fetch-site": "cross-site" },
  ])("rejects foreign or ambiguous request headers %j", headers => {
    expect(request("/", "GET", headers).statusCode).toBe(403);
  });

  it("accepts the exact same-origin header", () => {
    expect(request("/", "GET", { origin: fixtureOrigin, "sec-fetch-site": "same-origin" }).statusCode).toBe(200);
  });

  it.each([
    "C:/project/lib/admin/imagekit-operations-actions.ts", "C:/project/lib/admin/auth.ts",
    "C:/project/lib/admin/service.ts", "C:/project/lib/admin/imagekit-observation-entry.ts",
    "C:/project/lib/admin/imagekit-reconciliation-overview.ts", "C:/project/lib/admin/imagekit-operations-display-server.ts",
    "C:/project/lib/supabase/server.ts", "C:/project/node_modules/server-only/index.js",
    "C:/project/node_modules/@supabase/supabase-js/dist/index.js", "C:/project/app/admin/v2/media/page.tsx",
    "node:crypto", "__vite-browser-external:node:crypto",
  ])("fails the build if backend dependency %s enters it", moduleId => {
    expect(() => assertOperationsFixtureModules([moduleId])).toThrow("backend module");
    expect(() => assertOperationsFixtureModules([moduleId.replaceAll("/", "\\")])).toThrow("backend module");
  });

  it("allows only the two exact new pure display validators, not the privileged reader", () => {
    expect(() => assertOperationsFixtureModules([
      "C:/project/lib/admin/imagekit-operations-display.ts",
      "C:/project/lib/admin/imagekit-reconciliation-overview-contracts.ts",
    ])).not.toThrow();
    expect(() => assertOperationsFixtureModules(["C:/project/lib/admin/imagekit-reconciliation-overview.ts"])).toThrow("backend module");
  });

  it("bundles the actual React panel with the explicit synthetic action stub only", async () => {
    const { resources, moduleIds } = await buildOperationsFixture();
    expect([...resources.keys()]).toEqual(["/", "/fixture.css", "/fixture.js"]);
    const normalized = moduleIds.map((id: string) => id.replaceAll("\\", "/"));
    expect(normalized.some((id: string) => id.endsWith("/components/admin/v2/ImageKitOperationsPanel.tsx"))).toBe(true);
    expect(normalized.some((id: string) => id.endsWith("/tests/fixtures/imagekit-operations-actions.ts"))).toBe(true);
    expect(normalized.some((id: string) => id.endsWith("/lib/admin/imagekit-operations-display.ts"))).toBe(true);
    expect(normalized.some((id: string) => id.endsWith("/lib/admin/imagekit-reconciliation-overview-contracts.ts"))).toBe(true);
    expect(() => assertOperationsFixtureModules(moduleIds)).not.toThrow();
    const code = resources.get("/fixture.js")!.body;
    expect(code).toContain("Synthetic operations fixture requires injected");
    expect(code).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|IMAGEKIT_PRIVATE_KEY|api\.imagekit\.io|supabase\.co|node:crypto/);
    expect(resources.get("/")!.body).toContain('<script src="/fixture.js" defer>');
    expect(resources.get("/fixture.css")!.body).toContain(".fixture-controls");
  }, 60_000);
});
