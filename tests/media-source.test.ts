import { afterEach, describe, expect, it } from "vitest";
import {
  getConfiguredR2MediaOrigin,
  isConfiguredMediaLibrarySource,
  isConfiguredR2MediaSource,
  isConfiguredSupabaseMediaSource,
  isSafeLocalMediaPath,
  isSafeManagedMediaSource,
} from "@/lib/media-source";

const ORIGINAL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ORIGINAL_MEDIA_ORIGIN = process.env.NEXT_PUBLIC_MEDIA_ORIGIN;

afterEach(() => {
  if (ORIGINAL_SUPABASE_URL === undefined) {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  } else {
    process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_SUPABASE_URL;
  }

  if (ORIGINAL_MEDIA_ORIGIN === undefined) {
    delete process.env.NEXT_PUBLIC_MEDIA_ORIGIN;
  } else {
    process.env.NEXT_PUBLIC_MEDIA_ORIGIN = ORIGINAL_MEDIA_ORIGIN;
  }
});

describe("managed media sources", () => {
  it("accepts safe site-local paths and rejects protocol-relative paths", () => {
    expect(isSafeLocalMediaPath("/media/poster.webp")).toBe(true);
    expect(isSafeLocalMediaPath("//evil.example/poster.webp")).toBe(false);
    expect(isSafeLocalMediaPath("/media\\poster.webp")).toBe(false);
  });

  it("accepts only public-object URLs on the configured Supabase origin", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";

    expect(
      isConfiguredSupabaseMediaSource(
        "https://project.supabase.co/storage/v1/object/public/media/hero.mp4"
      )
    ).toBe(true);
    expect(
      isConfiguredSupabaseMediaSource(
        "https://project.supabase.co/rest/v1/private"
      )
    ).toBe(false);
    expect(
      isConfiguredSupabaseMediaSource(
        "https://project.supabase.co.evil.example/storage/v1/object/public/media/hero.mp4"
      )
    ).toBe(false);
  });

  it("accepts only trusted queryless paths on the exact R2 delivery origin", () => {
    process.env.NEXT_PUBLIC_MEDIA_ORIGIN = "https://media.example.com";

    expect(
      isConfiguredR2MediaSource(
        "https://media.example.com/media/hero-balanced-v1.mp4"
      )
    ).toBe(true);
    expect(getConfiguredR2MediaOrigin()).toBe("https://media.example.com");
    expect(isConfiguredR2MediaSource("https://media.example.com/")).toBe(false);
    expect(
      isConfiguredR2MediaSource("https://media.example.com/other/hero.mp4")
    ).toBe(false);
    expect(
      isConfiguredR2MediaSource(
        "https://media.example.com/media/hero.mp4?token=secret"
      )
    ).toBe(false);
    expect(
      isConfiguredR2MediaSource("https://media.example.com:444/media/hero.mp4")
    ).toBe(false);
    expect(
      isConfiguredR2MediaSource(
        "https://media.example.com.evil.example/media/hero.mp4"
      )
    ).toBe(false);
  });

  it("rejects an R2 origin configured with a path or unsafe scheme", () => {
    process.env.NEXT_PUBLIC_MEDIA_ORIGIN = "https://media.example.com/assets";
    expect(getConfiguredR2MediaOrigin()).toBeNull();

    process.env.NEXT_PUBLIC_MEDIA_ORIGIN = "http://media.example.com";
    expect(getConfiguredR2MediaOrigin()).toBeNull();
  });

  it("lets Supabase and R2 sources coexist during a reversible migration", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_MEDIA_ORIGIN = "https://media.example.com";

    expect(
      isConfiguredMediaLibrarySource(
        "https://project.supabase.co/storage/v1/object/public/media/old.webp"
      )
    ).toBe(true);
    expect(
      isSafeManagedMediaSource(
        "https://media.example.com/media/new-balanced.webp"
      )
    ).toBe(true);
    expect(isSafeManagedMediaSource("https://untrusted.example/new.webp")).toBe(
      false
    );
  });
});
