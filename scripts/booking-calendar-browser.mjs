// Isolated real-component browser QA. Never reads .env or imports a backend.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const port = 3106;
const origin = `http://127.0.0.1:${port}`;
const [{ build }, { default: postcss }, { default: tailwind }] = await Promise.all([
  import("vite"), import("postcss"), import("@tailwindcss/postcss"),
]);
const bundled = await build({
  root, configFile: false, envDir: false, publicDir: false, logLevel: "error",
  resolve: { alias: [
    { find: "@/app/admin/v2/pages/events/actions", replacement: path.join(root, "tests/fixtures/booking-calendar-actions.ts") },
    { find: "@", replacement: root },
  ] },
  define: { "process.env.NODE_ENV": JSON.stringify("production"), "process.env": "{}" },
  oxc: { jsx: { runtime: "automatic" } },
  plugins: [{ name: "calendar-fixture-backend-guard", enforce: "pre", load(id) {
    const normalized = id.replaceAll("\\", "/");
    if (normalized.includes("/app/") || normalized.includes("/lib/supabase/") || normalized.includes("/lib/booking-calendar-data") || /\/node_modules\/(?:server-only|@supabase)\//.test(normalized) ||
      (normalized.includes("/lib/admin/") && !normalized.endsWith("/editor-save-recovery.ts"))) throw new Error("Backend module blocked from fixture");
    return null;
  } }],
  build: { write: false, emptyOutDir: false, minify: false, sourcemap: false,
    lib: { entry: path.join(root, "tests/fixtures/booking-calendar-browser.tsx"), name: "BookingCalendarFixture", formats: ["iife"] } },
});
const outputs = (Array.isArray(bundled) ? bundled : [bundled]).flatMap(result => result.output ?? []);
const chunks = outputs.filter(item => item.type === "chunk");
if (chunks.length !== 1 || !Object.keys(chunks[0].modules).some(id => id.replaceAll("\\", "/").endsWith("/tests/fixtures/booking-calendar-actions.ts"))) throw new Error("Missing isolated action stub");
const filename = path.join(root, "styles/globals.css");
const { css } = await postcss([tailwind({ base: root, optimize: false })]).process(await readFile(filename, "utf8"), { from: filename, map: false });
const componentCss = outputs.filter(item => item.type === "asset" && item.fileName.endsWith(".css")).map(item => item.source).join("\n");
const resources = new Map([
  ["/", ["text/html; charset=utf-8", '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Events · isolated QA</title><link rel="stylesheet" href="/fixture.css"></head><body><div id="fixture-root"></div><script defer src="/fixture.js"></script></body></html>']],
  ["/fixture.css", ["text/css; charset=utf-8", css + "\n" + componentCss]],
  ["/fixture.js", ["text/javascript; charset=utf-8", chunks[0].code]],
]);
const server = createServer((request, response) => {
  response.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'none'; connect-src 'none'; font-src 'none'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  if (request.headers.host !== `127.0.0.1:${port}` || (request.headers.origin && request.headers.origin !== origin) || request.headers["sec-fetch-site"] === "cross-site") { response.writeHead(403); response.end(); return; }
  if (!["GET", "HEAD"].includes(request.method)) { response.writeHead(405); response.end(); return; }
  const resource = resources.get(request.url);
  response.writeHead(resource ? 200 : 404, { "Content-Type": resource?.[0] ?? "text/plain" });
  response.end(request.method === "HEAD" ? undefined : resource?.[1]);
});
server.on("error", () => { console.error("Calendar fixture port unavailable; no other server was stopped."); process.exitCode = 1; });
server.listen(port, "127.0.0.1", () => console.log(`Isolated calendar fixture: ${origin}/`));
const stop = () => { server.closeAllConnections(); server.close(); };
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
