// Actual UI, synthetic local operations only. No Next app, .env loading,
// hosted database, ImageKit request, media access or browser mutation endpoint.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
export const fixtureOrigin = "http://127.0.0.1:3105";
const resourcePaths = new Set(["/", "/fixture.js", "/fixture.css"]);
const clientAdminFiles = new Set([
  "media-library-editor.ts", "imagekit-operations-types.ts", "imagekit-reconciliation-overview-types.ts",
  "imagekit-operations-display.ts", "imagekit-reconciliation-overview-contracts.ts",
]);

export function assertOperationsFixtureModules(moduleIds) {
  for (const moduleId of moduleIds) {
    const id = moduleId.replaceAll("\\", "/").split("?")[0];
    if (id.startsWith("node:") || id.includes("__vite-browser-external") || /\/node_modules\/(?:server-only|@supabase)\//.test(id) || id.includes("/lib/supabase/") ||
      id.includes("/app/") || (id.includes("/lib/admin/") && !clientAdminFiles.has(id.split("/").at(-1)))) {
      throw new Error("A backend module entered the isolated operations fixture.");
    }
  }
}

export function fixtureCompilerOptions() {
  return {
    root, configFile: false, envDir: false, publicDir: false, logLevel: "error",
    resolve: { alias: [
      { find: "@/lib/admin/imagekit-operations-actions", replacement: path.join(root, "tests/fixtures/imagekit-operations-actions.ts") },
      { find: "@", replacement: root },
    ] },
    define: { "process.env.NODE_ENV": JSON.stringify("production"), "process.env": "{}" },
    oxc: { jsx: { runtime: "automatic" } },
    plugins: [{ name: "isolated-operations-backend-guard", enforce: "pre", load(id) { assertOperationsFixtureModules([id]); return null; } }],
    build: {
      write: false, emptyOutDir: false, sourcemap: false, minify: false,
      lib: { entry: path.join(root, "tests/fixtures/imagekit-operations-browser.tsx"), name: "ImageKitOperationsFixture", formats: ["iife"] },
    },
  };
}

export async function buildOperationsFixture() {
  const [{ build }, { default: postcss }, { default: tailwind }] = await Promise.all([
    import("vite"), import("postcss"), import("@tailwindcss/postcss"),
  ]);
  const bundled = await build(fixtureCompilerOptions());
  const outputs = (Array.isArray(bundled) ? bundled : [bundled]).flatMap(result => result.output ?? []);
  if (outputs.length !== 1 || outputs[0].type !== "chunk") throw new Error("Fixture must contain exactly one in-memory script.");
  const moduleIds = Object.keys(outputs[0].modules);
  assertOperationsFixtureModules(moduleIds);
  if (!moduleIds.some(id => id.replaceAll("\\", "/").endsWith("/tests/fixtures/imagekit-operations-actions.ts"))) {
    throw new Error("The isolated action stub must be present in the browser bundle.");
  }
  const filename = path.join(root, "styles/globals.css");
  const { css } = await postcss([tailwind({ base: root, optimize: false })])
    .process(await readFile(filename, "utf8"), { from: filename, map: false });
  const shellCss = `
    .fixture-shell{max-width:1250px;margin:auto;padding:24px;min-width:0}
    .fixture-intro{font-family:system-ui,sans-serif;margin-bottom:20px}
    .fixture-intro h1{font:600 25px/1.3 system-ui,sans-serif;margin:0 0 12px}
    .fixture-intro p{font-size:13px;line-height:1.7;color:#b8b8c1;max-width:1000px}
    .fixture-controls{min-width:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;border:1px solid #45454f;border-radius:18px;padding:16px;background:#15151a;margin-bottom:16px}
    .fixture-controls label,.fixture-draft label{display:block;font:12px/1.5 system-ui,sans-serif;color:#c8c8d1;min-width:0}
    .fixture-controls select,.fixture-draft input{display:block;width:100%;min-width:0;margin-top:5px;padding:10px;border:1px solid #555560;border-radius:8px;background:#08080c;color:white;font:14px/1.4 system-ui,sans-serif}
    .fixture-controls button{min-height:44px;padding:10px 18px;border:1px solid #bdbdc9;border-radius:10px;background:#e5e5eb;color:#101015;font:600 13px/1.4 system-ui,sans-serif;cursor:pointer}
    .fixture-controls .fixture-wide{grid-column:1/-1;display:flex;flex-wrap:wrap;align-items:center;gap:14px}
    .fixture-check{display:flex!important;gap:8px;align-items:center}
    .fixture-counters{display:block;white-space:pre-wrap;font:13px/1.6 monospace;color:#dbddf0}
    .fixture-draft{border:1px dashed #646473;border-radius:16px;padding:16px;margin:16px 0 22px;background:#101018}
    .fixture-draft p{font:12px/1.6 system-ui,sans-serif;color:#aaaaba;margin:8px 0 0}
    @media(max-width:800px){.fixture-controls{grid-template-columns:minmax(0,1fr)}}
    @media(max-width:639px){.fixture-shell{padding:12px}.fixture-controls{padding:12px}.fixture-intro h1{font-size:21px}}
  `;
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ImageKit operations · isolated QA</title><link rel="stylesheet" href="/fixture.css"></head><body><div id="fixture-root"></div><script src="/fixture.js" defer></script></body></html>';
  return {
    moduleIds,
    resources: new Map([
      ["/", { type: "text/html; charset=utf-8", body: html }],
      ["/fixture.css", { type: "text/css; charset=utf-8", body: css + shellCss }],
      ["/fixture.js", { type: "text/javascript; charset=utf-8", body: outputs[0].code }],
    ]),
  };
}

export function createOperationsFixtureHandler(resources) {
  return (request, response) => {
    response.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'none'; connect-src 'none'; media-src 'none'; font-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    const finish = (status, body, type = "text/plain; charset=utf-8") => {
      response.statusCode = status;
      response.setHeader("Content-Type", type);
      response.end(request.method === "HEAD" ? undefined : body);
    };
    if (request.headers.host !== "127.0.0.1:3105" ||
      (request.headers.origin !== undefined && request.headers.origin !== fixtureOrigin) ||
      request.headers["sec-fetch-site"] === "cross-site") return finish(403, "Local fixture requests only.");
    if (!["GET", "HEAD"].includes(request.method)) {
      response.setHeader("Allow", "GET, HEAD");
      return finish(405, "No backend operations are available in this fixture.");
    }
    if (!resourcePaths.has(request.url)) return finish(404, "Unknown fixture resource.");
    const resource = resources.get(request.url);
    return resource ? finish(200, resource.body, resource.type) : finish(404, "Unknown fixture resource.");
  };
}

async function main() {
  if (process.argv.length !== 2) throw new Error("Usage: node scripts/imagekit-operations-browser.mjs");
  const { resources } = await buildOperationsFixture();
  const server = createServer(createOperationsFixtureHandler(resources));
  server.on("error", () => { console.error("Could not start fixture on 127.0.0.1:3105. No other server was stopped."); process.exitCode = 1; });
  server.listen(3105, "127.0.0.1", () => {
    console.log(`Isolated ImageKit operations fixture: ${fixtureOrigin}/`);
    console.log(`PID ${process.pid}. Actual component and CSS; synthetic counters and outcomes, no credentials, database, provider or save endpoint.`);
  });
  const stop = () => { server.closeAllConnections(); server.close(); };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error("Could not build isolated operations fixture:", error.message); process.exitCode = 1; });
}
