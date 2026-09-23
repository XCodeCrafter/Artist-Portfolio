// Synthetic component QA only. No app routes, environment files, credentials,
// database, provider requests, upload handlers, or directory-serving middleware.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
export const fixtureOrigin = "http://127.0.0.1:3104";

export async function buildPhotoFixture() {
  const [{ build }, { default: postcss }, { default: tailwind }] = await Promise.all([
    import("vite"), import("postcss"), import("@tailwindcss/postcss"),
  ]);
  const bundled = await build({
    root, configFile: false, envDir: false, publicDir: false, logLevel: "error",
    resolve: { alias: { "@": root } },
    define: { "process.env.NODE_ENV": JSON.stringify("production"), "process.env": "{}" },
    oxc: { jsx: { runtime: "automatic" } },
    build: {
      write: false, emptyOutDir: false, sourcemap: false, minify: false,
      lib: { entry: path.join(root, "tests/fixtures/photo-framing-browser.tsx"), name: "PhotoFramingFixture", formats: ["iife"] },
    },
  });
  const outputs = (Array.isArray(bundled) ? bundled : [bundled]).flatMap(result => result.output ?? []);
  if (outputs.length !== 1 || outputs[0].type !== "chunk") throw new Error("Fixture must contain exactly one in-memory script.");
  const filename = path.join(root, "styles/globals.css");
  const { css } = await postcss([tailwind({ base: root, optimize: false })])
    .process(await readFile(filename, "utf8"), { from: filename, map: false });
  const shellCss = `
    .fixture-shell{max-width:1300px;margin:0 auto;padding:24px;min-width:0}
    .fixture-intro{margin-bottom:24px;font-family:system-ui,sans-serif}
    .fixture-intro h1{font-family:inherit;font-size:24px;line-height:1.3;margin:0 0 10px}
    .fixture-intro p{max-width:1000px;color:#aaaab5;font-size:14px;line-height:1.6;margin-top:8px}
    .fixture-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;align-items:start}
    .fixture-placement{min-width:0;border:1px solid #33333a;border-radius:24px;padding:20px;background:#101012}
    .fixture-placement h2{font-family:system-ui,sans-serif;font-size:18px;line-height:1.5;margin-bottom:8px}
    .fixture-caption{font-family:system-ui,sans-serif;font-size:12px;line-height:1.6;color:#9999a5;margin:12px 0}
    .fixture-image{position:relative;overflow:hidden;background:black;border:1px solid #404048;border-radius:12px;max-width:450px;margin:0 auto}
    .fixture-responsive{aspect-ratio:4/5}
    .fixture-json{display:block;white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.55 monospace;border:1px solid #44444a;padding:12px;border-radius:10px;background:#08080a}
    @media(max-width:800px){.fixture-grid{grid-template-columns:minmax(0,1fr)}}
    @media(max-width:639px){.fixture-responsive{aspect-ratio:5/4}.fixture-shell{padding:12px}.fixture-placement{padding:14px}}
  `;
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Photo positioning · isolated QA</title><link rel="stylesheet" href="/fixture.css"></head><body><div id="fixture-root"></div><script src="/fixture.js" defer></script></body></html>';
  return new Map([
    ["/", { type: "text/html; charset=utf-8", body: html }],
    ["/fixture.css", { type: "text/css; charset=utf-8", body: css + shellCss }],
    ["/fixture.js", { type: "text/javascript; charset=utf-8", body: outputs[0].code }],
    ["/images/about.jpg", { type: "image/jpeg", body: await readFile(path.join(root, "public/images/about.jpg")) }],
  ]);
}

export function createPhotoFixtureHandler(resources) {
  return (request, response) => {
    response.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; media-src 'none'; font-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    const finish = (status, body, type = "text/plain; charset=utf-8") => {
      response.statusCode = status;
      response.setHeader("Content-Type", type);
      response.end(request.method === "HEAD" ? undefined : body);
    };
    if (request.headers.host !== "127.0.0.1:3104" ||
      (request.headers.origin && request.headers.origin !== fixtureOrigin) ||
      request.headers["sec-fetch-site"] === "cross-site") return finish(403, "Local fixture requests only.");
    if (!["GET", "HEAD"].includes(request.method)) {
      response.setHeader("Allow", "GET, HEAD");
      return finish(405, "No mutations are available in this fixture.");
    }
    if (request.url === "/favicon.ico") return finish(204, "");
    const resource = resources.get(request.url);
    return resource ? finish(200, resource.body, resource.type) : finish(404, "Unknown fixture resource.");
  };
}

async function main() {
  if (process.argv.length !== 2) throw new Error("Usage: node scripts/photo-framing-browser.mjs");
  const resources = await buildPhotoFixture();
  const server = createServer(createPhotoFixtureHandler(resources));
  server.on("error", () => { console.error("Could not start fixture on 127.0.0.1:3104. No other server was stopped."); process.exitCode = 1; });
  server.listen(3104, "127.0.0.1", () => {
    console.log(`Isolated photo framing fixture: ${fixtureOrigin}/`);
    console.log(`PID ${process.pid}. Actual components and CSS; synthetic local state, one allowlisted bundled photo, no external requests or save endpoint.`);
  });
  const stop = () => { server.closeAllConnections(); server.close(); };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error("Could not build isolated photo fixture:", error.message); process.exitCode = 1; });
}
