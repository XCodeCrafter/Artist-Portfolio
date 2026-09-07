"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState } from "react";
import {
  FaArrowRight,
  FaChartLine,
  FaEnvelope,
  FaHome,
  FaImages,
  FaInbox,
  FaListUl,
  FaMusic,
  FaPalette,
  FaSearch,
  FaShieldAlt,
  FaTimes,
  FaUserAlt,
  FaVideo,
} from "react-icons/fa";
import {
  filterAdminV2Destinations,
  type AdminV2Destination,
} from "@/lib/admin/v2-destinations";

const SUGGESTIONS = [
  { label: "Hero video", query: "hero video" },
  { label: "CV & credits", query: "cv credits" },
  { label: "Spotify", query: "spotify" },
  { label: "New messages", query: "messages" },
  { label: "Logo & fonts", query: "logo fonts" },
] as const;

function destinationIcon(id: string) {
  switch (id) {
    case "home":
      return <FaHome />;
    case "bio":
      return <FaUserAlt />;
    case "gallery":
      return <FaImages />;
    case "showreel":
      return <FaVideo />;
    case "music":
      return <FaMusic />;
    case "contact":
      return <FaEnvelope />;
    case "inbox":
      return <FaInbox />;
    case "insights":
      return <FaChartLine />;
    case "navbar":
      return <FaListUl />;
    case "brand":
      return <FaPalette />;
    default:
      return <FaShieldAlt />;
  }
}

function ResultLink({
  destination,
  newInquiryCount,
}: {
  destination: AdminV2Destination;
  newInquiryCount: number | null;
}) {
  const inboxBadge =
    destination.id === "inbox" && newInquiryCount !== null
      ? `${newInquiryCount} new`
      : null;

  return (
    <li>
      <Link
        className="group flex min-h-[68px] items-center gap-3 rounded-2xl border border-white/8 bg-black/22 px-3.5 py-3 outline-none transition hover:border-white/18 hover:bg-white/[0.065] focus-visible:ring-2 focus-visible:ring-white/70 sm:px-4"
        href={destination.href}
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/9 bg-white/[0.05] text-sm text-white/56 transition group-hover:text-white">
          {destinationIcon(destination.id)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-white">
              {destination.label}
            </span>
            {inboxBadge ? (
              <span className="rounded-full border border-[#ff674f]/24 bg-[#ff3b1f]/12 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#ff806c]">
                {inboxBadge}
              </span>
            ) : destination.badge ? (
              <span className="rounded-full border border-white/9 px-2 py-0.5 text-[9px] uppercase tracking-[0.12em] text-white/38">
                {destination.badge}
              </span>
            ) : null}
          </span>
          <span className="mt-1 block truncate text-[11px] text-white/38">
            {destination.description}
          </span>
        </span>
        <span className="hidden text-[9px] uppercase tracking-[0.14em] text-white/24 md:block">
          {destination.group}
        </span>
        <FaArrowRight className="shrink-0 text-[11px] text-white/24 transition group-hover:translate-x-0.5 group-hover:text-white/72" />
      </Link>
    </li>
  );
}

export default function DashboardDestinationFinder({
  newInquiryCount,
}: {
  newInquiryCount: number | null;
}) {
  const router = useRouter();
  const inputId = useId();
  const resultsId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const results = useMemo(
    () => filterAdminV2Destinations(query).slice(0, 8),
    [query]
  );
  const hasQuery = query.trim().length > 0;

  function updateQuery(value: string) {
    setQuery(value);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  return (
    <section
      className="relative overflow-hidden rounded-[26px] border border-[#ff6249]/20 bg-[radial-gradient(circle_at_92%_8%,rgba(255,59,31,0.2),transparent_36%),#101012] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.32)] sm:p-5"
      data-dashboard-destination-finder
    >
      <div className="relative">
        <label
          className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#ff806c]"
          htmlFor={inputId}
        >
          What do you want to change?
        </label>
        <p className="mt-1.5 text-xs leading-5 text-white/38">
          Describe the thing you recognize. The dashboard will find its editor.
        </p>

        <form
          className="relative mt-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (results[0]) router.push(results[0].href);
          }}
          role="search"
        >
          <FaSearch
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-white/32"
          />
          <input
            aria-controls={resultsId}
            aria-describedby={`${inputId}-help`}
            autoComplete="off"
            className="h-14 w-full rounded-2xl border border-white/11 bg-black/34 pl-11 pr-12 text-sm text-white outline-none transition placeholder:text-white/25 hover:border-white/18 focus:border-[#ff765f]/44 focus:ring-2 focus:ring-[#ff3b1f]/18 [&::-webkit-search-cancel-button]:appearance-none"
            id={inputId}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Try “hero video”, “Spotify”, “new messages”, or “logo”…"
            ref={inputRef}
            type="search"
            value={query}
          />
          {query ? (
            <button
              aria-label="Clear destination search"
              className="absolute right-2.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-xl text-xs text-white/36 transition hover:bg-white/8 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              onClick={() => updateQuery("")}
              type="button"
            >
              <FaTimes />
            </button>
          ) : null}
          <span className="sr-only" id={`${inputId}-help`}>
            Press Enter to open the first matching editor, or choose a result
            below.
          </span>
        </form>

        <p aria-live="polite" className="sr-only">
          {hasQuery
            ? `${results.length} matching editor${results.length === 1 ? "" : "s"}.`
            : ""}
        </p>

        {!hasQuery ? (
          <div className="mt-3 flex flex-wrap gap-2" aria-label="Search examples">
            {SUGGESTIONS.map((suggestion) => (
              <button
                className="rounded-full border border-white/8 bg-black/20 px-3 py-1.5 text-[10px] text-white/42 transition hover:border-white/16 hover:text-white/76 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                key={suggestion.query}
                onClick={() => updateQuery(suggestion.query)}
                type="button"
              >
                {suggestion.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-3" id={resultsId}>
            {results.length ? (
              <ul aria-label="Matching admin destinations" className="grid gap-2">
                {results.map((destination) => (
                  <ResultLink
                    destination={destination}
                    key={destination.id}
                    newInquiryCount={newInquiryCount}
                  />
                ))}
              </ul>
            ) : (
              <p
                aria-live="polite"
                className="rounded-2xl border border-white/8 bg-black/22 px-4 py-4 text-xs leading-5 text-white/42"
              >
                No matching editor yet. Try a page name or words such as
                photo, video, booking, font, or password.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
