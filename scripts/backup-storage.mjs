#!/usr/bin/env node
/**
 * Read-only backup of the Supabase Storage media bucket to a local folder.
 *
 * Usage (from the project root):
 *   node --env-file=.env.local scripts/backup-storage.mjs "C:\path\outside\the\repo"
 *
 * It only lists and downloads objects; it never uploads, moves or deletes.
 * Files already present with the same size are skipped, so a run can be resumed.
 * The target folder must be outside this repository so backups (which may hold
 * personal data) can never be committed by accident.
 */
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { createClient } from "@supabase/supabase-js";

const PAGE_SIZE = 1000;
const CONCURRENCY = 4;

function fail(message) {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

const target = process.argv[2];
if (!target) fail('Missing target folder. Example: node --env-file=.env.local scripts/backup-storage.mjs "C:\\Backups\\franky\\2026-10-30\\storage"');
if (!isAbsolute(target)) fail("Use an absolute target path.");

const outDir = resolve(target);
const repoRoot = resolve(process.cwd());
const fromRepo = relative(repoRoot, outDir);
if (!fromRepo.startsWith("..") && !isAbsolute(fromRepo)) {
  fail(`Target ${outDir} is inside the repository. Choose a folder outside ${repoRoot}.`);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SUPABASE_MEDIA_BUCKET || "portfolio-media";
if (!url) fail("NEXT_PUBLIC_SUPABASE_URL is not set (did you pass --env-file=.env.local?).");
if (!key) fail("SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is not set.");

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Recursively lists every object path in the bucket with its size. */
async function listAll(prefix = "") {
  const files = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(prefix, { limit: PAGE_SIZE, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`Listing "${prefix || "/"}" failed: ${error.message}`);
    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) files.push(...(await listAll(path)));
      else files.push({ path, size: Number(entry.metadata?.size ?? -1) });
    }
    if (data.length < PAGE_SIZE) break;
  }
  return files;
}

async function sameSizeExists(file, size) {
  try {
    return size >= 0 && (await stat(file)).size === size;
  } catch {
    return false;
  }
}

async function main() {
  console.log(`Project: ${new URL(url).host}`);
  console.log(`Bucket:  ${bucket}`);
  console.log(`Target:  ${outDir}\n`);

  const files = await listAll();
  const totalMb = files.reduce((sum, f) => sum + Math.max(f.size, 0), 0) / 1048576;
  console.log(`Found ${files.length} files, ${totalMb.toFixed(1)} MB.\n`);

  let downloaded = 0;
  let skipped = 0;
  const failed = [];
  let next = 0;

  async function worker() {
    while (next < files.length) {
      const { path, size } = files[next++];
      const destination = join(outDir, ...path.split("/"));
      if (!destination.startsWith(outDir + sep)) {
        failed.push(`${path} (unsafe path)`);
        continue;
      }
      if (await sameSizeExists(destination, size)) {
        skipped++;
        continue;
      }
      const { data, error } = await supabase.storage.from(bucket).download(path);
      if (error || !data) {
        failed.push(`${path} (${error?.message ?? "empty response"})`);
        continue;
      }
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, Buffer.from(await data.arrayBuffer()));
      downloaded++;
      process.stdout.write(`\r${downloaded + skipped}/${files.length} done`);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log(`\n\nDownloaded ${downloaded}, skipped ${skipped} (already backed up), failed ${failed.length}.`);
  if (failed.length) {
    console.log("Failed files:\n  " + failed.join("\n  "));
    process.exit(1);
  }
}

main().catch((error) => fail(error.message));
