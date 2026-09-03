import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  new URL(
    "../supabase/migrations/0032_showreel_page_editor.sql",
    import.meta.url
  ),
  "utf8"
);
const publicPage = readFileSync(
  new URL("../app/video/page.tsx", import.meta.url),
  "utf8"
);
const publicContentLoader = readFileSync(
  new URL("../lib/content/index.ts", import.meta.url),
  "utf8"
);
const sharedView = readFileSync(
  new URL("../components/video/ShowreelPageView.tsx", import.meta.url),
  "utf8"
);
const showreelWorks = readFileSync(
  new URL("../components/ShowreelWorks.tsx", import.meta.url),
  "utf8"
);
const previewFrame = readFileSync(
  new URL("../components/admin/v2/ShowreelPreviewFrame.tsx", import.meta.url),
  "utf8"
);
const previewRuntime = readFileSync(
  new URL(
    "../components/admin/v2/ShowreelPreviewRuntime.tsx",
    import.meta.url
  ),
  "utf8"
);
const proxySource = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");
const editor = readFileSync(
  new URL("../components/admin/v2/ShowreelEditor.tsx", import.meta.url),
  "utf8"
);
const adminPage = readFileSync(
  new URL("../app/admin/v2/pages/showreel/page.tsx", import.meta.url),
  "utf8"
);
const overview = readFileSync(
  new URL("../app/admin/v2/page.tsx", import.meta.url),
  "utf8"
);
const shell = readFileSync(
  new URL("../lib/admin/v2-shell.ts", import.meta.url),
  "utf8"
);
const classicMediaActions = readFileSync(
  new URL("../app/admin/media/actions.ts", import.meta.url),
  "utf8"
);
const classicContentActions = readFileSync(
  new URL("../app/admin/content/actions.ts", import.meta.url),
  "utf8"
);
const classicMediaPage = readFileSync(
  new URL("../app/admin/media/page.tsx", import.meta.url),
  "utf8"
);
const classicMediaManager = readFileSync(
  new URL("../components/admin/MediaManager.tsx", import.meta.url),
  "utf8"
);

describe("Batch 6C Showreel migration contract", () => {
  it("snapshots every video, including hidden legacy music-video rows", () => {
    expect(migrationSql).toContain("from public.videos as video");
    expect(migrationSql).toContain("'videoType', video.video_type");
    expect(migrationSql).toContain("'isPublished', video.is_published");
    expect(migrationSql).toContain("'music_video'");

    const snapshotStart = migrationSql.indexOf(
      "create or replace function public.get_showreel_page_v2_snapshot"
    );
    const snapshotEnd = migrationSql.indexOf(
      "create or replace function public.save_showreel_hero_v2"
    );
    const snapshot = migrationSql.slice(snapshotStart, snapshotEnd);
    expect(snapshot).not.toMatch(
      /from public[.]videos[\s\S]*where video[.]is_published = true/i
    );
  });

  it("requires exact current versions and rejects omission rather than deleting", () => {
    expect(migrationSql).toContain("lock table public.videos");
    expect(migrationSql).toContain("jsonb_object_keys(p_expected_versions)");
    expect(migrationSql).toContain("not (p_expected_versions ? current_video.id)");
    expect(migrationSql).toContain(
      "(p_expected_versions ->> current_video.id)::timestamptz"
    );
    expect(migrationSql).toContain(
      "where not exists (\n      select 1\n      from pg_catalog.jsonb_array_elements(v_works)"
    );
    expect(migrationSql).toContain("showreel_works_changed");
    expect(migrationSql).toContain("using errcode = '40001'");
    expect(migrationSql).toContain("on conflict (id) do update set");
    expect(migrationSql).not.toMatch(/delete\s+from\s+public[.]videos/i);
  });

  it("validates duplicate ids, featured uniqueness, providers, and uploads", () => {
    expect(migrationSql).toContain("count(distinct submitted.item ->> 'id')");
    expect(migrationSql).toContain("'isFeatured')::boolean");
    expect(migrationSql).toContain("youtube-nocookie[.]com");
    expect(migrationSql).toContain("player[.]vimeo[.]com");
    expect(migrationSql).toContain("asset.media_type = 'video'");
    expect(migrationSql).toContain("for share;");
    expect(migrationSql).toContain(
      "v_work_count > pg_catalog.greatest(120, v_current_count)"
    );
    expect(migrationSql).toContain("set is_featured = false");
  });

  it("updates only public presentation keys and preserves legacy metadata", () => {
    expect(migrationSql).toContain(
      "set metadata = metadata || pg_catalog.jsonb_build_object("
    );
    expect(migrationSql).toContain("'featuredLabel'");
    expect(migrationSql).toContain("'featuredFallback'");
    expect(migrationSql).toContain("'libraryEyebrow'");
    expect(migrationSql).toContain("'libraryTitle'");
  });

  it("exposes only four service-role RPCs with locked search paths", () => {
    for (const name of [
      "get_showreel_page_v2_snapshot",
      "save_showreel_hero_v2",
      "save_showreel_introduction_v2",
      "save_showreel_works_v2",
    ]) {
      expect(migrationSql).toContain(`function public.${name}`);
    }
    expect(migrationSql.match(/security definer/g)).toHaveLength(4);
    expect(migrationSql.match(/set search_path = ''/g)).toHaveLength(4);
    expect(migrationSql.match(/to service_role;/g)).toHaveLength(4);
    expect(migrationSql).toContain(
      "from public, anon, authenticated, service_role;"
    );
  });
});

describe("Showreel shared public and preview contract", () => {
  it("renders the public page and editor preview through one page view", () => {
    expect(publicPage).toContain(
      'from "@/components/video/ShowreelPageView"'
    );
    expect(publicPage).toContain("<ShowreelPageView data={data} />");
    expect(previewRuntime).toContain("<ShowreelPageView");
    expect(sharedView).toContain(
      '<AdaptiveHero {...data.hero} staticPreview={mode === "preview"} />'
    );
    expect(sharedView).toContain("<ShowreelWorks");
    expect(sharedView).toContain("<NewsletterBlock {...data.footer} />");
  });

  it("exposes the three click and keyboard edit regions", () => {
    expect(sharedView).toContain('data-showreel-preview-section="hero"');
    expect(showreelWorks).toContain(
      "data-showreel-preview-section={section}"
    );
    expect(sharedView).toContain("aria-pressed={selected}");
    expect(showreelWorks).toContain("aria-pressed={selected}");
    expect(sharedView).toContain("SHOWREEL_PREVIEW_SELECTION_MESSAGE");
    expect(previewRuntime).toContain("scrollIntoView");
    expect(previewFrame).toContain("focusRequestId");
    expect(sharedView).toContain("itemId?: string");
    expect(showreelWorks).toContain('onSelectSection?.("works", item.id)');
    expect(previewFrame).toContain(
      "onSelectSectionRef.current(event.data.section, event.data.itemId)"
    );
  });

  it("keeps visitor playback and links inert in preview", () => {
    expect(sharedView).toContain('mode?: "public" | "preview"');
    expect(sharedView).toContain('className="pointer-events-none" inert');
    expect(sharedView).toContain('aria-hidden={mode === "preview" ? "true"');
    expect(showreelWorks).toContain('disabled={mode === "preview"}');
    expect(showreelWorks).toContain('interactive={mode === "public"}');
    expect(showreelWorks).toContain('mode === "public" && activeItem');
    expect(showreelWorks).toContain(
      'referrerPolicy="strict-origin-when-cross-origin"'
    );
  });

  it("synchronizes only with the same-origin parent frame", () => {
    expect(previewRuntime).toContain("event.origin !== window.location.origin");
    expect(previewRuntime).toContain("event.source !== window.parent");
    expect(previewFrame).toContain("event.origin !== window.location.origin");
    expect(previewFrame).toContain(
      "event.source !== frameRef.current?.contentWindow"
    );
    expect(previewFrame).toContain("window.location.origin");
    expect(proxySource).toContain('"/admin/v2-preview/showreel"');
    expect(proxySource).toContain('"/admin/v2-preview/showreel/"');
  });

  it("uses deterministic public video ordering and keeps music_video compatible", () => {
    const queryStart = publicContentLoader.indexOf('.from("videos")');
    const queryEnd = publicContentLoader.indexOf(
      '.from("actor_resume")',
      queryStart
    );
    const query = publicContentLoader.slice(queryStart, queryEnd);
    const mapperStart = publicContentLoader.indexOf("function mapVideos");
    const mapperEnd = publicContentLoader.indexOf(
      "\nfunction normalizeVideoType",
      mapperStart
    );
    const mapper = publicContentLoader.slice(mapperStart, mapperEnd);

    expect(queryStart).toBeGreaterThanOrEqual(0);
    expect(query).toContain('.eq("is_published", true)');
    expect(query).toContain('.order("sort_order", { ascending: true })');
    expect(query).toContain('.order("id", { ascending: true })');
    expect(mapper).toContain("videoType: normalizeVideoType(row.video_type)");
    expect(publicContentLoader).toContain(': "music_video";');
  });
});

describe("Admin V2 Showreel UI and V1 handoff contract", () => {
  it("is reachable from the V2 overview and sidebar", () => {
    expect(overview).toContain('href="/admin/v2/pages/showreel"');
    expect(shell).toContain('href: "/admin/v2/pages/showreel"');
    expect(adminPage).toContain("<ShowreelEditor");
  });

  it("authenticates before loading the snapshot and Media Library", () => {
    expect(adminPage.indexOf("await requireAdmin()"))
      .toBeLessThan(adminPage.indexOf("getAdminShowreelEditorData()"));
    expect(adminPage).toContain("getMediaAssets()");
    expect(adminPage).toContain("showreel.migrationRequired");
  });

  it("submits only the active section with optimistic versions", () => {
    expect(editor).toContain(
      "getShowreelSectionPayload(draft, activeSection)"
    );
    expect(editor).toContain(
      "getShowreelSectionVersions(versions, activeSection)"
    );
    expect(editor).toContain("saveShowreelSectionV2(previousState, formData)");
    expect(editor).toContain("requireExactCollectionVersions: true");
    expect(editor).toContain("useUnsavedChangesGuard(");
    expect(editor).toContain('data-unsaved-guard-bypass="true"');
  });

  it("keeps music videos editable and saved videos recoverable", () => {
    expect(editor).toContain('music_video: "Music video"');
    expect(editor).toContain("VIDEO_TYPES.map");
    expect(editor).toContain("isPublished: !item.isPublished");
    expect(editor).toContain(
      "if (id in versionsRef.current.works.items) return;"
    );
    expect(editor).toContain("Saved videos stay recoverable when hidden.");
    expect(editor).toContain("moveShowreelEditorItem");
    expect(editor).not.toContain("deleteShowreelVideo");
  });

  it("locks every classic Showreel write once migration 0032 exists", () => {
    expect(classicMediaActions).toContain("handOffLegacyShowreelWrite");
    expect(classicMediaActions).toContain(
      'redirect("/admin/v2/pages/showreel?from=classic")'
    );
    expect(
      classicMediaActions.match(/await handOffLegacyShowreelWrite\(supabase\);/g)
    ).toHaveLength(4);
    expect(classicMediaPage).toContain("showreelV2Enabled={");
    expect(classicMediaManager).toContain(
      "disabled={contentDisabled || showreelV2Enabled}"
    );
    expect(classicMediaManager).toContain("Open Showreel V2");
    expect(classicContentActions).toContain(
      'if (parsed.data.pageSlug === "video")'
    );
    expect(classicContentActions).toContain(
      "await handOffLegacyShowreelWrite(supabase);"
    );
  });
});
