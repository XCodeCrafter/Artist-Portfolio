// Local component QA only. No Next routes, credentials, database or provider calls.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const root = fileURLToPath(new URL("..", import.meta.url));
export const fixtureOrigin = "http://127.0.0.1:3103";

export function fixtureCompilerOptions() {
  return {
    root, configFile: false, envDir: false, publicDir: false, appType: "custom", logLevel: "error",
    resolve: { alias: { "@": root } },
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, watch: null, ws: false },
  };
}

function escape(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export function renderFixtureDocument(fixture, cases, markup) {
  const links = cases.map(({ id, title }) => `<a href="/${escape(id)}"${id === fixture.id ? ' aria-current="page"' : ""}>${escape(title)}</a>`).join(" ");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ImageKit QA · ${escape(fixture.title)}</title><link rel="stylesheet" href="/fixture.css"></head><body><main class="fixture-shell"><header class="fixture-intro"><h1>ImageKit overview · isolated component QA</h1><p>Synthetic data only. This is not your dashboard; no database or ImageKit connection.</p><nav aria-label="Fixture scenarios">${links}</nav><h2>${escape(fixture.title)}</h2></header>${markup}<section class="fixture-draft" aria-label="QA-only draft control"><label for="fixture-draft">Local draft check (not the Media editor)</label><input id="fixture-draft" type="text" autocomplete="off" placeholder="Nothing here can be saved"><p>Opening and closing the overview must not clear this field. Scenario links navigate to a fresh fixture.</p></section></main></body></html>`;
}

// Serve only pre-rendered strings. Never map a URL to the filesystem or proxy it.
export function createFixtureHandler(pages, css) {
  return (request, response) => {
    response.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'self'; script-src 'none'; connect-src 'none'; img-src 'none'; font-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    const finish = (status, body, type = "text/plain; charset=utf-8") => {
      response.statusCode = status;
      response.setHeader("Content-Type", type);
      response.end(request.method === "HEAD" ? undefined : body);
    };
    if (request.headers.host !== "127.0.0.1:3103" ||
        (request.headers.origin && request.headers.origin !== fixtureOrigin) ||
        request.headers["sec-fetch-site"] === "cross-site") {
      return finish(403, "Local fixture requests only.");
    }
    if (!["GET", "HEAD"].includes(request.method)) {
      response.setHeader("Allow", "GET, HEAD");
      return finish(405, "Read-only fixture.");
    }
    if (request.url === "/favicon.ico") return finish(204, "");
    if (request.url === "/fixture.css") return finish(200, css, "text/css; charset=utf-8");
    const page = pages.get(request.url === "/" ? "/mixed" : request.url);
    return page ? finish(200, page, "text/html; charset=utf-8") : finish(404, "Unknown fixture.");
  };
}

export async function buildFixtures() {
  // Vite is the existing Vitest compiler. Disable env loading, HMR, watchers and
  // network listening; it only imports the pure component and synthetic fixtures.
  const [{ createServer: createCompiler }, { default: postcss }, { default: tailwind }] = await Promise.all([
    import("vite"), import("postcss"), import("@tailwindcss/postcss"),
  ]);
  const compiler = await createCompiler(fixtureCompilerOptions());
  let pages;
  try {
    const [{ default: Overview }, { imageKitOverviewBrowserFixtures: cases }] = await Promise.all([
      compiler.ssrLoadModule("/components/admin/v2/ImageKitReconciliationOverview.tsx"),
      compiler.ssrLoadModule("/tests/fixtures/imagekit-overview-browser.ts"),
    ]);
    pages = new Map(cases.map((fixture) => [`/${fixture.id}`,
      renderFixtureDocument(fixture, cases, renderToStaticMarkup(createElement(Overview, { data: fixture.data }))),
    ]));
  } finally {
    await compiler.close();
  }
  // Use the project's actual global styles/utilities, without remote fonts/media.
  const filename = path.join(root, "styles/globals.css");
  const { css } = await postcss([tailwind({ base: root, optimize: false })])
    .process(await readFile(filename, "utf8"), { from: filename, map: false });
  const shellCss = `
    .fixture-shell{max-width:1100px;margin:0 auto;padding:24px;min-width:0}
    .fixture-intro{margin-bottom:20px;font-family:system-ui,sans-serif}
    .fixture-intro h1{font-family:inherit;font-size:24px;margin:0 0 8px}
    .fixture-intro h2{font-family:inherit;font-size:18px;margin:16px 0 0}
    .fixture-intro p,.fixture-draft p{font-size:14px;line-height:1.6;color:#b8b8bc}
    .fixture-intro nav{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}
    .fixture-intro a{border:1px solid #555;border-radius:8px;padding:6px 10px;font-size:13px}
    .fixture-intro a[aria-current]{background:#762813;border-color:#fd7050}
    .fixture-draft{margin-top:24px;padding:20px;border:1px solid #555;border-radius:16px}
    .fixture-draft label{display:block;margin-bottom:8px}
    .fixture-draft input{width:100%;min-width:0;padding:10px;border:1px solid #888;border-radius:8px}
    @media(max-width:480px){.fixture-shell{padding:12px}}
  `;
  return { pages, css: css + shellCss };
}

async function main() {
  if (process.argv.length !== 2) throw new Error("Usage: node scripts/imagekit-overview-browser.mjs");
  const { pages, css } = await buildFixtures();
  const server = createServer(createFixtureHandler(pages, css));
  server.on("error", () => {
    console.error("Could not start the local fixture on 127.0.0.1:3103. No other server was stopped.");
    process.exitCode = 1;
  });
  server.listen(3103, "127.0.0.1", () => {
    console.log(`Isolated ImageKit component fixtures: ${fixtureOrigin}/mixed`);
    console.log(`${pages.size} synthetic scenarios. No credentials, database, provider or application routes. Ctrl+C stops this server.`);
  });
  const stop = () => { server.closeAllConnections(); server.close(); };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error("Could not build isolated component fixtures."); process.exitCode = 1; });
}
