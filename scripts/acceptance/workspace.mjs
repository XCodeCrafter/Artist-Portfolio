import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFile, lstat, mkdir, readFile, readdir, realpath, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { ACCEPTANCE_BOOTSTRAP_SQL, ACCEPTANCE_SEED_SQL } from "./fixtures.mjs";
import { ACCEPTANCE_PROJECT_ID, ACCEPTANCE_TARGET, shouldCopyAcceptancePath, validateAcceptanceTarget } from "./isolation.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const isUuid = (value) => typeof value === "string" && value.length === 36 && UUID.test(value);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function acceptanceBase(repoRoot) {
  return path.join(os.tmpdir(), `portfolio-acceptance-${digest(path.resolve(repoRoot)).slice(0, 12)}`);
}

export function assertWorkspaceLocation(workspace, repoRoot) {
  const resolved = path.resolve(workspace);
  if (path.dirname(resolved) !== acceptanceBase(repoRoot) || !isUuid(path.basename(resolved))) {
    throw new Error("Use a freshly generated acceptance workspace, not a repository or arbitrary directory.");
  }
  return resolved;
}

async function assertNoLinks(base, relativePath) {
  if (!relativePath || path.isAbsolute(relativePath) || relativePath.split(/[\\/]/).some((part) => !part || part === "." || part === "..") || relativePath.includes(":")) {
    throw new Error("Unsafe workspace-relative path.");
  }
  let current = base;
  for (const part of relativePath.split(/[\\/]/)) {
    current = path.join(current, part);
    if ((await lstat(current)).isSymbolicLink()) throw new Error("Linked files are not accepted as workspace inputs.");
  }
  return current;
}

/** Only COPIES are renamed; real migrations and CLI history are never edited. */
export function buildMigrationPlan(filenames) {
  const names = [...filenames].sort();
  if (!names.length || !names[0].startsWith("0001_") || new Set(names).size !== names.length ||
      names.some((name) => !/^\d{4}_[a-z0-9_]+\.sql$/.test(name)) ||
      new Set(names.map((name) => name.slice(0, 4))).size !== names.length) {
    throw new Error("Expected unique, ordered source migrations starting at 0001.");
  }
  const ordered = [names[0], null, ...names.slice(1)];
  return ordered.map((source, index) => ({
    source,
    // Stable local-only timestamps, one second apart, with an extra bootstrap.
    generated: `${new Date(Date.UTC(2020, 0, 1, 0, 0, index)).toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}_${source ?? "acceptance_bootstrap.sql"}`,
  }));
}

export function buildIdentitySql(id) {
  if (!isUuid(id)) throw new Error("Invalid acceptance workspace identity.");
  return `
begin;
create table public.acceptance_environment (
  id uuid primary key,
  project_id text not null check (project_id = '${ACCEPTANCE_PROJECT_ID}')
);
alter table public.acceptance_environment enable row level security;
revoke all on table public.acceptance_environment from public, anon, authenticated;
grant select on table public.acceptance_environment to service_role;
insert into public.acceptance_environment values ('${id}', '${ACCEPTANCE_PROJECT_ID}');
commit;
`;
}

async function generateImages(appRoot) {
  const definitions = [
    ["acceptance-fixtures/portrait.png", 480, 800, "#ad514d"],
    ["acceptance-fixtures/landscape.png", 1200, 675, "#376d7a"],
    ...[1, 2, 3].map((layer) => [`images/parallax/depth-${layer}.png`, 200, 200, "#151719"]),
  ];
  for (const [relative, width, height, color] of definitions) {
    const target = path.join(appRoot, "public", relative);
    await mkdir(path.dirname(target), { recursive: true });
    // Geometric fiducials make framing/drag checks visible without owner media.
    const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="${color}"/><circle cx="${width / 2}" cy="${height / 4}" r="${Math.min(width, height) / 8}" fill="#e9cd7a"/><path d="M0 ${height / 2}H${width}M${width / 2} 0V${height}" stroke="#fff" stroke-width="6"/><rect x="15" y="15" width="${width - 30}" height="${height - 30}" fill="none" stroke="#ffffff" stroke-width="5"/></svg>`;
    await sharp(Buffer.from(svg)).png().toFile(target);
  }
}

/** No remote calls, SQL execution, account creation, or production env loading. */
export async function prepareAcceptanceWorkspace(repoRoot) {
  repoRoot = await realpath(repoRoot);
  const base = acceptanceBase(repoRoot);
  await mkdir(base, { recursive: true });
  if ((await lstat(base)).isSymbolicLink()) throw new Error("Acceptance base must not be a link.");
  const id = randomUUID();
  const workspace = path.join(base, id);
  await mkdir(workspace); // No reuse, reset, removal or overwrite of previous runs.
  await mkdir(path.join(workspace, "app"));
  await mkdir(path.join(workspace, "supabase", "migrations"), { recursive: true });
  const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: repoRoot, encoding: "utf8" }).split("\0");
  // Next regenerates next-env.d.ts for its own dev build output. Never copy/hash
  // the production-generated declaration, which would prevent a second start.
  const appInputs = tracked.filter((name) => shouldCopyAcceptancePath(name) && !name.startsWith("public/") && name !== "next-env.d.ts");
  if (!appInputs.includes("package.json") || !appInputs.includes("app/layout.tsx")) throw new Error("Missing application source files.");
  const hashes = {};
  for (const name of appInputs) {
    const source = await assertNoLinks(repoRoot, name);
    if (!(await lstat(source)).isFile()) throw new Error("Expected a regular tracked source file.");
    const target = path.join(workspace, "app", name);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(source, target);
    hashes[`app/${name}`] = digest(await readFile(target));
  }
  // node_modules is the only intentional link; it is checked again at launch.
  const dependencies = path.join(repoRoot, "node_modules");
  if ((await lstat(dependencies)).isSymbolicLink() || !(await lstat(dependencies)).isDirectory()) {
    throw new Error("Install dependencies in this repository before preparing acceptance.");
  }
  await symlink(dependencies, path.join(workspace, "app", "node_modules"), process.platform === "win32" ? "junction" : "dir");
  await generateImages(path.join(workspace, "app"));
  const migrationRoot = path.join(repoRoot, "supabase", "migrations");
  const plan = buildMigrationPlan((await readdir(migrationRoot)).filter((name) => name.endsWith(".sql")));
  for (const step of plan) {
    const bytes = step.source
      ? await readFile(await assertNoLinks(repoRoot, `supabase/migrations/${step.source}`))
      : Buffer.from(ACCEPTANCE_BOOTSTRAP_SQL + buildIdentitySql(id));
    const relative = `supabase/migrations/${step.generated}`;
    await writeFile(path.join(workspace, relative), bytes, { flag: "wx" });
    hashes[relative] = digest(bytes);
  }
  const config = await readFile(new URL("./config.toml", import.meta.url));
  for (const [name, bytes] of [["supabase/config.toml", config], ["supabase/seed.sql", ACCEPTANCE_SEED_SQL]]) {
    await writeFile(path.join(workspace, name), bytes, { flag: "wx" });
    hashes[name] = digest(bytes);
  }
  const manifest = { version: 1, id, repoRoot, target: ACCEPTANCE_TARGET, migrations: plan, hashes };
  await writeFile(path.join(workspace, "acceptance-manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
  return { workspace, id, sourceMigrations: plan.length - 1, sourceFiles: appInputs.length };
}

export async function verifyAcceptanceWorkspace(workspace, repoRoot) {
  repoRoot = await realpath(repoRoot);
  workspace = assertWorkspaceLocation(workspace, repoRoot);
  for (const directory of [acceptanceBase(repoRoot), workspace, path.join(workspace, "app"), path.join(workspace, "supabase")]) {
    if ((await lstat(directory)).isSymbolicLink()) throw new Error("Acceptance directory must not be a link.");
  }
  const manifest = JSON.parse(await readFile(await assertNoLinks(workspace, "acceptance-manifest.json"), "utf8"));
  if (manifest.version !== 1 || manifest.id !== path.basename(workspace) || manifest.repoRoot !== repoRoot) {
    throw new Error("Acceptance manifest does not match this generated workspace.");
  }
  validateAcceptanceTarget(manifest.target);
  if (!manifest.hashes || !Object.keys(manifest.hashes).length || !manifest.hashes["supabase/config.toml"]) {
    throw new Error("Missing acceptance integrity manifest.");
  }
  for (const [relative, expected] of Object.entries(manifest.hashes)) {
    if (digest(await readFile(await assertNoLinks(workspace, relative))) !== expected) {
      throw new Error("Acceptance inputs changed. Prepare a fresh workspace; do not reuse altered files.");
    }
  }
  const appEntries = await readdir(path.join(workspace, "app"));
  if (appEntries.some((name) => name.toLowerCase().startsWith(".env"))) throw new Error("Remove environment files from the shadow app or prepare a fresh workspace.");
  if (await realpath(path.join(workspace, "app", "node_modules")) !== await realpath(path.join(repoRoot, "node_modules"))) {
    throw new Error("Acceptance dependencies do not match this repository.");
  }
  // A linked hosted project must never be introduced into this local workspace.
  try {
    await lstat(path.join(workspace, "supabase", ".temp", "project-ref"));
  } catch (error) {
    if (error.code === "ENOENT") return manifest;
    throw error;
  }
  throw new Error("A linked project reference is forbidden in the acceptance workspace.");
}
