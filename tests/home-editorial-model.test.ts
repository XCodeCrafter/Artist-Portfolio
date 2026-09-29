import { describe, expect, it } from "vitest";
import { createHomeEditorialDefaults, getHomePlaybackEmbedUrl, homePressSchema, homeReleaseSchema, homeWorkSchema, isSafeEditorialHref, isSafeEditorialHttpsUrl, isSafeHomePlayback } from "@/lib/admin/home-editorial";
import { createFallbackHomeEditorSnapshot, parseHomeEditorDraft, parseHomeEditorSnapshot, parseHomePreviewUpdateMessage, parseHomeSectionSubmission, HOME_PREVIEW_UPDATE_MESSAGE } from "@/lib/admin/home-editor";
import { createContentSecurityPolicy } from "@/lib/security/csp";

describe("Home editorial playback boundaries", () => {
  it.each([
    "https:cdn.example.org/song.mp3", "https:/cdn.example.org/song.mp3", "https:///cdn.example.org/song.mp3",
    "https:////cdn.example.org/song.mp3", "https://cdn.example.org:/song.mp3", "https://cdn.example.org:0443/song.mp3",
    "https://cdn.example.org:000443/song.mp3", "https://[::1]/song.mp3",
  ])("rejects browser-repaired HTTPS syntax that cannot pass the database boundary: %s", url => {
    expect(isSafeEditorialHttpsUrl(url)).toBe(false);
    expect(isSafeEditorialHref(url)).toBe(false);
    expect(isSafeHomePlayback({ kind: "audio", url })).toBe(false);
    const { release } = createHomeEditorialDefaults();
    expect(homeReleaseSchema.safeParse({ ...release, primaryHref: url }).success).toBe(false);
  });
  it.each(["https://example.org", "HTTPS://EXAMPLE.ORG:443/release?source=home#listen", "https://example.org/a%20b"])("retains supported explicit HTTPS destinations: %s", url => {
    expect(isSafeEditorialHttpsUrl(url)).toBe(true);
    expect(isSafeEditorialHref(url)).toBe(true);
  });
  it.each(["https://cdn.example.org/song.mp3", "/media/song.ogg", "https://cdn.example.org/song.m4a?token=example", "https://cdn.example.org/song.WAV"])("accepts a direct media file %s", url => {
    expect(isSafeHomePlayback({ kind: "audio", url })).toBe(true);
  });
  it.each(["http://cdn.example.org/song.mp3", "https://user:pass@cdn.example/song.mp3", "https://cdn.example:8080/song.mp3", "//cdn.example/song.mp3", "javascript:alert(1)", "https://open.spotify.com/track/123", "https://cdn.example/song.mp3/file", "/\\bad.mp3"])("rejects unsafe or non-media audio %s", url => {
    expect(isSafeHomePlayback({ kind: "audio", url })).toBe(false);
  });
  it("canonicalizes provider links without accepting arbitrary iframe origins", () => {
    expect(getHomePlaybackEmbedUrl({ kind: "spotify", url: "https://open.spotify.com/intl-cs/track/1234567890123456789012?si=tracking" })).toBe("https://open.spotify.com/embed/track/1234567890123456789012");
    expect(getHomePlaybackEmbedUrl({ kind: "youtube", url: "https://youtu.be/abcdefghijk?t=123" })).toBe("https://www.youtube-nocookie.com/embed/abcdefghijk");
    expect(getHomePlaybackEmbedUrl({ kind: "youtube", url: "https://www.youtube.com/watch?v=abcdefghijk" })).toBe("https://www.youtube-nocookie.com/embed/abcdefghijk");
    for (const url of ["https://open.spotify.com.evil.test/track/1234567890123456789012", "https://evil.test/embed/track/1234567890123456789012", "https://open.spotify.com/artist/1234567890123456789012"]) expect(getHomePlaybackEmbedUrl({ kind: "spotify", url })).toBeNull();
    expect(isSafeHomePlayback({ kind: "none", url: "https://example.test/song.mp3" })).toBe(false);
    const release = createHomeEditorialDefaults().release;
    const canonical = homeReleaseSchema.parse({ ...release, playback: { kind: "spotify", url: "HTTPS://OPEN.SPOTIFY.COM:443/track/1234567890123456789012" } });
    expect(canonical.playback.url).toBe("https://open.spotify.com/track/1234567890123456789012");
    expect(isSafeHomePlayback({ kind: "youtube", url: "https://youtube.com/watch?v=bad&v=abcdefghijk" })).toBe(false);
  });
  it.each([
    ["https://www.youtube.com/watch?%76=abcdefghijk", "https://www.youtube.com/watch?v=abcdefghijk"],
    ["https://www.youtube.com/watch?v=%61bcdefghijk", "https://www.youtube.com/watch?v=abcdefghijk"],
    ["https://www.youtube.com/watch?%76=abcdefghijk&v=wrong&t=20", "https://www.youtube.com/watch?v=abcdefghijk&t=20"],
  ])("serializes the same YouTube ID validated by the browser for the database: %s", (url, canonical) => {
    const { release } = createHomeEditorialDefaults();
    const parsed = homeReleaseSchema.parse({ ...release, playback: { kind: "youtube", url } });
    expect(parsed.playback.url).toBe(canonical);
    expect(getHomePlaybackEmbedUrl(parsed.playback)).toBe("https://www.youtube-nocookie.com/embed/abcdefghijk");
    expect(homeReleaseSchema.parse(parsed)).toEqual(parsed);
  });
  it("never canonicalizes a later valid YouTube ID over an invalid first one", () => {
    const { release } = createHomeEditorialDefaults();
    for (const url of [
      "https://www.youtube.com/watch?%76=wrong&v=abcdefghijk",
      "https://www.youtube.com/watch?v=wrong&%76=abcdefghijk",
      "https://www.youtube.com/watch?v=abcdefghijk%0A",
    ]) {
      expect(homeReleaseSchema.safeParse({ ...release, playback: { kind: "youtube", url } }).success).toBe(false);
    }
  });
  it("widens only media-src for admin-authored HTTPS audio", () => {
    const csp = createContentSecurityPolicy("test");
    expect(csp.split(";").find(value => value.trim().startsWith("media-src"))).toContain(" https:");
    for (const directive of ["script-src", "connect-src", "frame-src", "img-src"]) expect(csp.split(";").find(value => value.trim().startsWith(`${directive} `))).not.toMatch(/(?:^| )https:(?: |$)/);
  });
});

describe("Home editorial sections", () => {
  it("uses the microphone photo for the release background without changing the cover", () => {
    const { release } = createHomeEditorialDefaults();
    expect(release.background).toEqual({ src: "/images/home-editorial/press.webp", alt: "Illustrative microphone backstage", framing: null });
    expect(release.cover.src).toBe("/images/home-editorial/guitar.webp");
  });
  it("has no fictional published release, quotations or publications in defaults", () => {
    const { draft } = createFallbackHomeEditorSnapshot();
    expect(draft.release.releaseTitle).toBe("");
    expect(draft.press.items).toEqual([]);
    expect(draft.layout.filter(item => item.id === "release" || item.id === "press").every(item => !item.enabled)).toBe(true);
    expect(draft.layout.some(item => String(item.id) === "stories")).toBe(false);
  });
  it("requires an exact four-card collection and independently validates crops", () => {
    const { work } = createHomeEditorialDefaults();
    expect(homeWorkSchema.safeParse(work).success).toBe(true);
    work.cards[0].image.framing = { desktop: { fit: "cover", x: 20, y: 10, zoom: 1.4 }, mobile: { fit: "contain", x: 70, y: 30, zoom: 1 } };
    expect(homeWorkSchema.safeParse(work).success).toBe(true);
    expect(work.cards[1].image.framing?.desktop.x).toBe(75);
    expect(homeWorkSchema.safeParse({ ...work, cards: work.cards.slice(1) }).success).toBe(false);
    expect(homeWorkSchema.safeParse({ ...work, cards: [work.cards[0], work.cards[0], ...work.cards.slice(2)] }).success).toBe(false);
    expect(homeWorkSchema.safeParse({ ...work, background: { ...work.background, framing: { zoom: 999 } } }).success).toBe(false);
    expect(homeWorkSchema.safeParse({ ...work, background: { ...work.background, src: "https://unmanaged.example/photo.jpg" } }).success).toBe(false);
  });
  it("validates real dates, unique IDs, source attribution and featured visibility", () => {
    const { press } = createHomeEditorialDefaults();
    const entry = { id: "ca4cb646-5aa4-4098-b17e-7d64e08b90a1", kind: "review" as const, title: "Album review", quote: "An attributed short excerpt.", publication: "Example source", date: "2026-09-29", href: "https://example.org/review", image: { src: "", alt: "", framing: null }, visible: true };
    const valid = { ...press, featuredId: entry.id, items: [entry] };
    expect(homePressSchema.safeParse(valid).success).toBe(true);
    for (const date of ["2026-02-30", "2026-13-01", "2026-1-1", "0000-01-01", "invalid"]) expect(homePressSchema.safeParse({ ...valid, items: [{ ...entry, date }] }).success).toBe(false);
    expect(homePressSchema.safeParse({ ...valid, items: [entry, entry] }).success).toBe(false);
    expect(homePressSchema.safeParse({ ...valid, items: [{ ...entry, visible: false }] }).success).toBe(false);
    expect(homePressSchema.safeParse({ ...valid, items: [{ ...entry, publication: "" }] }).success).toBe(false);
  });
  it("keeps incomplete editor input previewable but disables unsafe navigation and playback", () => {
    const { draft } = createFallbackHomeEditorSnapshot();
    draft.release.playback = { kind: "audio", url: "https://still-typing" };
    draft.release.primaryHref = "javascript:alert(1)";
    draft.work.cards[0].href = "//evil.test";
    draft.work.cards[1].image.src = "data:image/svg+xml,bad";
    draft.press.items = [{ id: "ca4cb646-5aa4-4098-b17e-7d64e08b90a1", kind: "review", title: "", publication: "", quote: "typing", date: "2026-", href: "javascript:bad", image: { src: "", alt: "", framing: null }, visible: true }];
    const preview = parseHomePreviewUpdateMessage({ type: HOME_PREVIEW_UPDATE_MESSAGE, draft, selectedSection: "press", focusRequestId: 1 });
    expect(preview).not.toBeNull();
    expect(preview?.draft.release.playback).toEqual({ kind: "none", url: "" });
    expect(preview?.draft.release.primaryHref).toBe("");
    expect(preview?.draft.work.cards[0].href).toBe("");
    expect(preview?.draft.work.cards[1].image.src).toBe("");
    expect(preview?.draft.press.items[0].date).toBe("");
    expect(homeReleaseSchema.safeParse(draft.release).success).toBe(false);
    expect(draft.release.primaryHref).toBe("javascript:alert(1)");
  });
  it("upgrades only an exact old snapshot and rejects partial editorial rollouts", () => {
    const { draft, versions } = createFallbackHomeEditorSnapshot();
    const { release: _release, work: _work, press: _press, ...old } = draft;
    void _release; void _work; void _press;
    const predecessor = { ...old, layout: ["hero", "about", "cnc", "feature", "stories"].map(id => ({ id, enabled: id === "hero" })) };
    const upgraded = parseHomeEditorSnapshot({ draft: predecessor, versions });
    expect(upgraded?.editorialAvailable).toBeUndefined();
    expect(upgraded?.draft.layout.map(item => item.id)).toEqual(["hero", "about", "cnc", "feature", "release", "work", "press"]);
    expect(upgraded?.draft.about).toEqual(draft.about);
    expect(upgraded?.draft.layout.find(item => item.id === "about")?.enabled).toBe(false);
    expect(parseHomeEditorDraft({ ...predecessor, release: draft.release })).toBeNull();
    expect(parseHomeSectionSubmission("stories", draft.stories, versions).success).toBe(false);
    expect(parseHomeEditorSnapshot({ draft, versions })?.editorialAvailable).toBe(true);
  });
});
