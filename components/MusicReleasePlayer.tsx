"use client";

import SpotifyEmbed from "@/components/SpotifyEmbed";
import ExternalMediaGate from "@/components/privacy/ExternalMediaGate";
import {
  deriveSoundcloudPlaylistEmbedUrl,
  normalizeSoundcloudPlaylistUrl,
} from "@/lib/music-embeds";
import { deriveSpotifyEmbedUrl, getSpotifyOpenUrl } from "@/lib/spotify";

type MusicReleasePlayerProps = {
  provider?: "spotify" | "soundcloud";
  embedUrl: string;
  artistUrl: string;
  soundcloudPlaylistUrl?: string;
  interactionMode?: "public" | "preview";
};

export default function MusicReleasePlayer({
  provider = "spotify",
  embedUrl,
  artistUrl,
  soundcloudPlaylistUrl = "",
  interactionMode = "public",
}: MusicReleasePlayerProps) {
  const soundcloudUrl = normalizeSoundcloudPlaylistUrl(soundcloudPlaylistUrl);
  const providerLabel = provider === "soundcloud" ? "SoundCloud" : "Spotify";

  // Editing must never contact streaming services, even if the owner has
  // already consented to external media on the public site.
  if (interactionMode === "preview") {
    const configured = provider === "soundcloud"
      ? Boolean(soundcloudUrl)
      : Boolean(deriveSpotifyEmbedUrl(embedUrl) || getSpotifyOpenUrl(embedUrl, artistUrl));
    return (
      <div
        aria-label={`${providerLabel} release player preview`}
        className="flex h-[352px] flex-col items-center justify-center gap-4 overflow-hidden rounded-3xl border border-white/10 bg-white/5 px-6 text-center sm:h-[520px]"
      >
        <svg
          aria-hidden="true"
          className="h-10 w-10 text-white/45"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          viewBox="0 0 24 24"
        >
          <path d="M9 18V5l12-2v13M9 8l12-2" />
          <ellipse cx="6" cy="18" rx="3" ry="2" />
          <ellipse cx="18" cy="16" rx="3" ry="2" />
        </svg>
        <span className="font-ui text-[11px] uppercase tracking-[0.22em] text-[#ff806c]">
          {providerLabel}
        </span>
        <p className="text-sm leading-relaxed text-white/60">
          {configured
            ? "Player preview. External players stay off while editing."
            : `Add a ${providerLabel} link to preview this player.`}
        </p>
      </div>
    );
  }

  if (provider !== "soundcloud") {
    return (
      <SpotifyEmbed
        embedUrl={embedUrl}
        openUrl={artistUrl}
        title="Spotify Releases"
        heightMobile={352}
        heightDesktop={520}
      />
    );
  }

  const soundcloudEmbedUrl = deriveSoundcloudPlaylistEmbedUrl(soundcloudPlaylistUrl);
  if (!soundcloudUrl || !soundcloudEmbedUrl) return null;

  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
      <div className="relative h-[352px] sm:h-[520px]">
        <ExternalMediaGate provider="SoundCloud">
          <iframe
            className="absolute inset-0 h-full w-full border-0"
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            src={soundcloudEmbedUrl}
            title="SoundCloud Releases"
          />
        </ExternalMediaGate>
      </div>
      <div className="flex justify-end border-t border-white/10 px-5 py-3">
        <a
          className="inline-flex min-h-11 items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/70 transition hover:text-white focus-visible:outline-2 focus-visible:outline-white"
          href={soundcloudUrl}
          rel="noopener noreferrer"
          target="_blank"
        >
          Open on SoundCloud <span aria-hidden="true">↗</span>
        </a>
      </div>
    </div>
  );
}
