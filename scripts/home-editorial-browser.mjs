// Isolated actual-component QA. No .env reads, credentials, backend imports or network saves.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const port = 3107;
export const fixtureOrigin = `http://127.0.0.1:${port}`;

// Exact public assets only: never map a requested path to arbitrary disk files.
export const fixtureImagePaths = Object.freeze([
  "/images/home-editorial/guitar.webp", "/images/home-editorial/studio.webp",
  "/images/home-editorial/press.webp", "/images/home-editorial/live.webp",
  "/images/hero.jpg", "/images/about.jpg", "/images/video-hero.jpg",
  "/images/parallax/depth-1.png", "/images/parallax/depth-2.png", "/images/parallax/depth-3.png",
]);
export const fixtureVideoPath = "/media/hero-loop.mp4";
const rangedMediaPaths = new Set(["/fixture-audio.wav", fixtureVideoPath]);

function silentWav() {
  const sampleRate = 8000;
  const length = sampleRate * 8 * 2;
  const buffer = Buffer.alloc(44 + length);
  buffer.write("RIFF", 0); buffer.writeUInt32LE(36 + length, 4); buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34); buffer.write("data", 36); buffer.writeUInt32LE(length, 40);
  return buffer;
}

export async function buildHomeFixture() {
  const [{ build }, { default: postcss }, { default: tailwind }] = await Promise.all([
    import("vite"), import("postcss"), import("@tailwindcss/postcss"),
  ]);
  const safeAdmin = new Set(["home-editor.ts", "home-editorial.ts", "editor-save-recovery.ts", "hero-framing-geometry.ts"]);
  const normalizedRoot = root.replaceAll("\\", "/").replace(/\/$/, "");
  const bundled = await build({
    root, configFile: false, envDir: false, publicDir: false, logLevel: "error",
    resolve: { alias: [
      { find: "@/app/admin/v2/pages/home/actions", replacement: path.join(root, "tests/fixtures/home-editorial-actions.ts") },
      { find: "@", replacement: root },
    ] },
    define: { "process.env.NODE_ENV": JSON.stringify("production"), "process.env": "{}" },
    oxc: { jsx: { runtime: "automatic" } },
    plugins: [{ name: "home-fixture-backend-guard", enforce: "pre", load(id) {
      const normalized = id.replaceAll("\\", "/");
      if (normalized.startsWith(`${normalizedRoot}/app/`) || normalized.includes("/lib/supabase/") || /\/node_modules\/(?:server-only|@supabase)\//.test(normalized) ||
        normalized.endsWith(".server.ts") || (normalized.includes("/lib/admin/") && !safeAdmin.has(path.basename(id)))) throw new Error(`Backend module blocked from Home fixture: ${path.basename(id)}`);
      return null;
    } }],
    build: { write: false, emptyOutDir: false, minify: false, sourcemap: false,
      lib: { entry: path.join(root, "tests/fixtures/home-editorial-browser.tsx"), name: "HomeEditorialFixture", formats: ["iife"] } },
  });
  const outputs = (Array.isArray(bundled) ? bundled : [bundled]).flatMap(result => result.output ?? []);
  const chunks = outputs.filter(item => item.type === "chunk");
  if (chunks.length !== 1 || !Object.keys(chunks[0].modules).some(id => id.replaceAll("\\", "/").endsWith("/tests/fixtures/home-editorial-actions.ts"))) throw new Error("Missing isolated Home action stub");
  const filename = path.join(root, "styles/globals.css");
  // Match production CSS optimization: unoptimized CSS can hide layout changes
  // caused by folding independent transforms into the transform shorthand.
  const { css } = await postcss([tailwind({ base: root, optimize: true })]).process(await readFile(filename, "utf8"), { from: filename, map: false });
  const privacyCss = await readFile(path.join(root, "styles/privacy.css"), "utf8");
  const componentCss = outputs.filter(item => item.type === "asset" && item.fileName.endsWith(".css")).map(item => item.source).join("\n");
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Home editorial · isolated QA</title><link rel="stylesheet" href="/fixture.css"></head><body><div id="fixture-root"></div><script defer src="/fixture.js"></script></body></html>';
  const resources = new Map([
    ["/", { type: "text/html; charset=utf-8", body: html }],
    ["/admin/v2-preview/home", { type: "text/html; charset=utf-8", body: html }],
    ["/fixture.css", { type: "text/css; charset=utf-8", body: css + "\n" + privacyCss + "\n" + componentCss + "\n.fixture-controls{font-family:Arial,sans-serif}.fixture-public{max-width:1800px;margin:auto}.fixture-qa-disclosure{position:fixed;right:1rem;bottom:1rem;z-index:110;width:min(44rem,calc(100vw - 2rem));font:12px/1.5 Arial,sans-serif;pointer-events:none}.fixture-qa-disclosure>summary{margin-left:auto;width:max-content;max-width:100%;padding:.5rem .75rem;background:#111;border:1px solid #ffffff40;border-radius:8px;color:#ddd;cursor:pointer;pointer-events:auto}.fixture-qa-disclosure[open]{max-height:80dvh;overflow:auto;pointer-events:auto}.fixture-qa-disclosure .fixture-controls{margin-top:.5rem}" }],
    ["/fixture.js", { type: "text/javascript; charset=utf-8", body: chunks[0].code }],
    ["/fixture-audio.wav", { type: "audio/wav", body: silentWav() }],
  ]);
  for (const asset of fixtureImagePaths) {
    const type = asset.endsWith(".webp") ? "image/webp" : asset.endsWith(".png") ? "image/png" : "image/jpeg";
    resources.set(asset, { type, body: await readFile(path.join(root, "public", asset.slice(1))) });
  }
  resources.set(fixtureVideoPath, { type: "video/mp4", body: await readFile(path.join(root, "public", fixtureVideoPath.slice(1))) });
  return resources;
}

export function createHomeFixtureHandler(resources) {
  return (request, response) => {
    response.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'; frame-src 'self'; connect-src 'none'; font-src 'none'; form-action 'none'; frame-ancestors 'self'; base-uri 'none'");
    response.setHeader("Cache-Control", "no-store"); response.setHeader("X-Content-Type-Options", "nosniff"); response.setHeader("Referrer-Policy", "no-referrer");
    const finish = (status, body, type = "text/plain; charset=utf-8") => { response.writeHead(status, { "Content-Type": type }); response.end(request.method === "HEAD" ? undefined : body); };
    if (request.headers.host !== `127.0.0.1:${port}` || (request.headers.origin !== undefined && request.headers.origin !== fixtureOrigin) || request.headers["sec-fetch-site"] === "cross-site") return finish(403, "Local fixture requests only.");
    if (!["GET", "HEAD"].includes(request.method)) { response.setHeader("Allow", "GET, HEAD"); return finish(405, "No network mutations in this fixture."); }
    if (request.url === "/favicon.ico") return finish(204, "");
    const resource = resources.get(request.url);
    if (!resource) return finish(404, "Unknown fixture resource.");
    if (rangedMediaPaths.has(request.url)) response.setHeader("Accept-Ranges", "bytes");
    if (rangedMediaPaths.has(request.url) && request.headers.range) {
      const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range);
      const start = Number(range?.[1]); const end = range?.[2] ? Number(range[2]) : resource.body.length - 1;
      if (!range || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || end >= resource.body.length) {
        response.setHeader("Content-Range", `bytes */${resource.body.length}`);
        return finish(416, "Invalid range.");
      }
      response.setHeader("Content-Range", `bytes ${start}-${end}/${resource.body.length}`);
      response.setHeader("Content-Length", String(end - start + 1));
      return finish(206, resource.body.subarray(start, end + 1), resource.type);
    }
    if (rangedMediaPaths.has(request.url)) response.setHeader("Content-Length", String(resource.body.length));
    return finish(200, resource.body, resource.type);
  };
}

async function main() {
  if (process.argv.length !== 2) throw new Error("Usage: node scripts/home-editorial-browser.mjs");
  const resources = await buildHomeFixture();
  const server = createServer(createHomeFixtureHandler(resources));
  server.on("error", () => { console.error("Home fixture port unavailable; no other server was stopped."); process.exitCode = 1; });
  server.listen(port, "127.0.0.1", () => console.log(`Isolated Home fixture: ${fixtureOrigin}/ — PID ${process.pid}`));
  const stop = () => { server.closeAllConnections(); server.close(); };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error("Could not build isolated Home fixture:", error.message); process.exitCode = 1; });
}
