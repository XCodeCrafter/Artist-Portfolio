// Actual-component QA. Never read .env, call a backend or serve arbitrary files.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const port = 3110;
export const sharingFixtureOrigin = `http://127.0.0.1:${port}`;
export const sharingFixtureImages = Object.freeze(["/images/home-editorial/press-social.jpg", "/images/about.jpg"]);

export async function buildSharingFixture() {
  const [{ build }, { default: postcss }, { default: tailwind }] = await Promise.all([import("vite"), import("postcss"), import("@tailwindcss/postcss")]);
  const safeAdmin = new Set(["site-sharing-editor.ts", "editor-save-recovery.ts"]);
  const normalizedRoot = root.replaceAll("\\", "/").replace(/\/$/, "");
  const bundled = await build({
    root, configFile: false, envDir: false, publicDir: false, logLevel: "error",
    resolve: { alias: [
      { find: "@/app/admin/v2/settings/sharing/actions", replacement: path.join(root, "tests/fixtures/site-sharing-actions.ts") },
      { find: "@", replacement: root },
    ] },
    define: { "process.env.NODE_ENV": JSON.stringify("production"), "process.env": "{}" },
    oxc: { jsx: { runtime: "automatic" } },
    plugins: [{ name: "sharing-fixture-backend-guard", enforce: "pre", load(id) {
      const normalized = id.replaceAll("\\", "/");
      if (normalized.startsWith(`${normalizedRoot}/app/`) || normalized.includes("/lib/supabase/") || /\/node_modules\/(?:server-only|@supabase)\//.test(normalized) ||
        normalized.endsWith(".server.ts") || (normalized.includes("/lib/admin/") && !safeAdmin.has(path.basename(id)))) throw new Error(`Backend module blocked from Sharing fixture: ${path.basename(id)}`);
      return null;
    } }],
    build: { write: false, emptyOutDir: false, minify: false, sourcemap: false, lib: { entry: path.join(root, "tests/fixtures/site-sharing-browser.tsx"), name: "SharingFixture", formats: ["iife"] } },
  });
  const outputs = (Array.isArray(bundled) ? bundled : [bundled]).flatMap(result => result.output ?? []);
  const chunks = outputs.filter(item => item.type === "chunk");
  if (chunks.length !== 1 || !Object.keys(chunks[0].modules).some(id => id.replaceAll("\\", "/").endsWith("/tests/fixtures/site-sharing-actions.ts"))) throw new Error("Missing isolated Sharing action stub");
  const filename = path.join(root, "styles/globals.css");
  const { css } = await postcss([tailwind({ base: root, optimize: true })]).process(await readFile(filename, "utf8"), { from: filename, map: false });
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sharing &amp; SEO · isolated QA</title><link rel="stylesheet" href="/fixture.css"></head><body><div id="fixture-root"></div><script defer src="/fixture.js"></script></body></html>';
  const resources = new Map([
    ["/", { type: "text/html; charset=utf-8", body: html }],
    ["/fixture.css", { type: "text/css; charset=utf-8", body: css + "\nbody{font-family:Arial,sans-serif}" }],
    ["/fixture.js", { type: "text/javascript; charset=utf-8", body: chunks[0].code }],
  ]);
  for (const image of sharingFixtureImages) resources.set(image, { type: "image/jpeg", body: await readFile(path.join(root, "public", image.slice(1))) });
  return resources;
}

export function createSharingFixtureHandler(resources) {
  return (request, response) => {
    response.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; font-src 'none'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'");
    response.setHeader("Cache-Control", "no-store"); response.setHeader("X-Content-Type-Options", "nosniff"); response.setHeader("Referrer-Policy", "no-referrer");
    const finish = (status, body, type = "text/plain; charset=utf-8") => { response.writeHead(status, { "Content-Type": type }); response.end(request.method === "HEAD" ? undefined : body); };
    if (request.headers.host !== `127.0.0.1:${port}` || (request.headers.origin !== undefined && request.headers.origin !== sharingFixtureOrigin) || request.headers["sec-fetch-site"] === "cross-site") return finish(403, "Local fixture requests only.");
    if (!["GET", "HEAD"].includes(request.method)) { response.setHeader("Allow", "GET, HEAD"); return finish(405, "No network mutations in this fixture."); }
    if (request.url === "/favicon.ico") return finish(204, "");
    const resource = resources.get(request.url);
    return resource ? finish(200, resource.body, resource.type) : finish(404, "Unknown fixture resource.");
  };
}

async function main() {
  if (process.argv.length !== 2) throw new Error("Usage: node scripts/site-sharing-browser.mjs");
  const server = createServer(createSharingFixtureHandler(await buildSharingFixture()));
  server.on("error", () => { console.error("Sharing fixture port unavailable; no other server was stopped."); process.exitCode = 1; });
  server.listen(port, "127.0.0.1", () => console.log(`Isolated Sharing fixture: ${sharingFixtureOrigin}/ — PID ${process.pid}`));
  const stop = () => { server.closeAllConnections(); server.close(); };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error("Could not build Sharing fixture:", error.message); process.exitCode = 1; });
