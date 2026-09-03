import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/0030_bio_page_editor.sql", import.meta.url),
  "utf8"
);

function migrationFunction(name: string) {
  const start = migration.indexOf(`create or replace function public.${name}`);
  const next = migration.indexOf("create or replace function public.", start + 1);
  const grants = migration.indexOf("revoke all on function", start + 1);
  expect(start).toBeGreaterThanOrEqual(0);
  const endCandidates = [next, grants].filter((index) => index >= 0);
  const end = endCandidates.length ? Math.min(...endCandidates) : undefined;
  return migration.slice(start, end);
}

describe("Batch 6A Bio migration contract", () => {
  it("does not seed or alter public content merely by applying the migration", () => {
    const prelude = migration.slice(
      0,
      migration.indexOf("create or replace function public.")
    );

    expect(prelude).not.toMatch(/insert\s+into\s+public[.]/i);
    expect(prelude).not.toMatch(/update\s+public[.]/i);
    expect(prelude).not.toMatch(/delete\s+from\s+public[.]/i);
  });

  it("returns one service snapshot with every saved Bio collection row", () => {
    const sql = migrationFunction("get_bio_page_v2_snapshot");

    expect(sql).toContain("cross join public.page_heroes as hero");
    expect(sql).toContain("from public.bio_gallery_images as image");
    expect(sql).toContain("from public.bio_paragraphs as paragraph");
    expect(sql).toContain("from public.actor_credits as credit");
    expect(sql).toContain("cross join public.actor_resume as resume");
    expect(sql).toContain("'hasResumeDetails', true");
    expect(sql).not.toMatch(/image[.]is_published\s*=\s*true/i);
    expect(sql).not.toMatch(/paragraph[.]is_published\s*=\s*true/i);
    expect(sql).not.toMatch(/credit[.]is_published\s*=\s*true/i);
  });

  it("saves profile, portraits, and paragraphs atomically without deletion", () => {
    const sql = migrationFunction("save_bio_biography_v2");

    expect(sql).toContain("v_gallery_count > 32");
    expect(sql).toContain("v_paragraph_count > 50");
    expect(sql).toContain(
      "lock table public.bio_gallery_images in share row exclusive mode"
    );
    expect(sql).toContain(
      "lock table public.bio_paragraphs in share row exclusive mode"
    );
    expect(sql).toContain("update public.bio_profile");
    expect(sql).toContain("insert into public.bio_gallery_images");
    expect(sql).toContain("insert into public.bio_paragraphs");
    expect(sql).toContain("on conflict (id) do update");
    expect(sql).toContain("submitted.item ->> 'id' = current_image.id");
    expect(sql).toContain("submitted.item ->> 'id' = current_paragraph.id");
    expect(sql).toContain("using errcode = '40001'");
    expect(sql).toContain("'galleryItems', v_gallery_versions");
    expect(sql).toContain("'paragraphItems', v_paragraph_versions");
    expect(sql).not.toMatch(/delete\s+from\s+public[.]/i);
  });

  it("supports credit growth, reorder, hide, and restore but no hard deletion", () => {
    const sql = migrationFunction("save_bio_credits_v2");

    expect(sql).toContain("v_credit_count > 100");
    expect(sql).toContain("lock table public.actor_credits");
    expect(sql).toContain("insert into public.actor_credits");
    expect(sql).toContain("on conflict (id) do update");
    expect(sql).toContain("is_published = excluded.is_published");
    expect(sql).toContain("submitted.item ->> 'id' = current_credit.id");
    expect(sql).toContain("using errcode = '40001'");
    expect(sql).not.toMatch(/delete\s+from\s+public[.]actor_credits/i);
  });

  it("keeps actor resume a versioned singleton without inventing publication state", () => {
    const sql = migrationFunction("save_bio_resume_v2");

    expect(sql).toContain("from public.actor_resume as resume");
    expect(sql).toContain("for update");
    expect(sql).toContain("bio_resume_changed");
    expect(sql).toContain("update public.actor_resume");
    expect(sql).not.toContain("is_published");
  });

  it("grants every Batch 6A RPC only to service_role", () => {
    for (const [name, signature] of [
      ["get_bio_page_v2_snapshot", "text"],
      ["save_bio_hero_v2", "text, timestamptz, jsonb"],
      [
        "save_bio_biography_v2",
        "text, timestamptz, jsonb, jsonb, jsonb",
      ],
      ["save_bio_resume_v2", "text, timestamptz, jsonb"],
      ["save_bio_credits_v2", "text, jsonb, jsonb"],
    ]) {
      const escapedSignature = signature.replaceAll(" ", "\\s*");
      expect(migration).toMatch(
        new RegExp(
          `revoke all on function public[.]${name}[(]${escapedSignature}[)]\\s*from public, anon, authenticated, service_role;`,
          "i"
        )
      );
      expect(migration).toMatch(
        new RegExp(
          `grant execute on function public[.]${name}[(]${escapedSignature}[)]\\s*to service_role;`,
          "i"
        )
      );
    }
  });
});
