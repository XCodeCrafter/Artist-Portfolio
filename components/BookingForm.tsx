// artist-portfolio/components/BookingForm.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import type { PortfolioType } from "@/lib/content";

type FormState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

function safeTrim(v: unknown) {
  return String(v ?? "").trim();
}

type Props = {
  contactBlurb?: string;
  location?: string;
  portfolioType?: PortfolioType;
};

export default function BookingForm({
  contactBlurb = "Use the form for direct booking and inquiries.",
  location = "EU / Worldwide",
  portfolioType = "musician",
}: Props) {
  const [state, setState] = useState<FormState>({ status: "idle" });
  const startedAtRef = useRef<number>(0);
  const isActor = portfolioType === "actor";
  const copy = isActor
    ? {
        eyebrow: "CONTACT",
        title: "Let's Work Together",
        formTitle: "Send a message",
        description:
          contactBlurb ||
          "Interested in working together? Send a short message and I will get back to you.",
        contactLabel: "Collaboration",
        locationLabel: "Based in",
        button: "Let's work together",
        success: "Message sent. Thanks - I will reply soon.",
      }
    : {
        eyebrow: "CONTACT",
        title: "Booking & inquiries",
        formTitle: "Quick message",
        description: contactBlurb,
        contactLabel: "Contact",
        locationLabel: "Location",
        button: "Send",
        success: "Message sent. Thanks - I'll reply soon.",
      };

  const markFormStarted = () => {
    if (startedAtRef.current === 0) {
      startedAtRef.current = Date.now();
    }
  };

  useEffect(() => {
    startedAtRef.current = Date.now();
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state.status === "sending") return;

    const now = Date.now();
    if (startedAtRef.current === 0) {
      startedAtRef.current = now;
    }

    const form = e.currentTarget;
    const fd = new FormData(form);

    const payload = {
      name: safeTrim(fd.get("name")),
      email: safeTrim(fd.get("email")),
      message: safeTrim(fd.get("message")),
      company: safeTrim(fd.get("company")),
      website: safeTrim(fd.get("website")),
      portfolioType,
      inquiryType: isActor ? "collaboration" : "booking",
      startedAt: startedAtRef.current,
      submittedAt: now,
    };

    setState({ status: "sending" });

    try {
      const res = await fetch("/api/booking", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json().catch(() => null)) as
        | { ok: true; message?: string }
        | { ok: false; error?: string }
        | null;

      const errorMessage =
        data && typeof data === "object" && "error" in data
          ? data.error
          : undefined;

      if (!res.ok || !data || data.ok !== true) {
        setState({
          status: "error",
          message: errorMessage || "Server returned an unexpected response.",
        });
        return;
      }

      setState({
        status: "success",
        message: data.message || copy.success,
      });

      form.reset();
      startedAtRef.current = Date.now();
    } catch {
      setState({
        status: "error",
        message: "Network error. Please try again in a moment.",
      });
    }
  }

  return (
    <section className="mx-auto max-w-[1400px] px-5 sm:px-8 pb-24">
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
          <div className="text-xs tracking-[0.35em] text-white/55">
            {copy.eyebrow}
          </div>
          <h2 className="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight">
            {copy.title}
          </h2>

          <div className="mt-6 space-y-3 text-white/75">
            <div>
              <span className="text-white/50">{copy.contactLabel}:</span>{" "}
              {copy.description}
            </div>
            <div>
              <span className="text-white/50">{copy.locationLabel}:</span>{" "}
              {location}
            </div>
          </div>

          <a
            href="#form"
            className="mt-8 inline-flex rounded-full border border-white/15 bg-black/30 px-5 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white transition"
          >
            Open form -&gt;
          </a>
        </div>

        <form
          className="rounded-3xl border border-white/10 bg-white/5 p-8"
          onFocusCapture={markFormStarted}
          onPointerDown={markFormStarted}
          onSubmit={onSubmit}
        >
          <div className="text-xs tracking-[0.35em] text-white/55">FORM</div>
          <h2 className="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight">
            {copy.formTitle}
          </h2>

          <div className="hidden" aria-hidden="true">
            <label>
              Company
              <input name="company" tabIndex={-1} autoComplete="off" />
            </label>
          </div>

          <div
            aria-hidden="true"
            className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden"
          >
            <label>
              Website
              <input name="website" tabIndex={-1} autoComplete="off" />
            </label>
          </div>

          <div className="mt-6 grid gap-4">
            <input
              name="name"
              className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-sm text-white/80 placeholder:text-white/35 outline-none focus:border-white/30"
              placeholder="Your name"
              required
              minLength={2}
              maxLength={80}
              autoComplete="name"
            />
            <input
              name="email"
              type="email"
              className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-sm text-white/80 placeholder:text-white/35 outline-none focus:border-white/30"
              placeholder="Email"
              required
              maxLength={200}
              autoComplete="email"
            />
            <textarea
              name="message"
              className="min-h-[140px] w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-sm text-white/80 placeholder:text-white/35 outline-none focus:border-white/30"
              placeholder="Message"
              required
              minLength={10}
              maxLength={4000}
            />

            <button
              className="rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-black hover:opacity-90 transition disabled:opacity-60"
              type="submit"
              disabled={state.status === "sending"}
            >
              {state.status === "sending" ? "Sending..." : `${copy.button} ->`}
            </button>

            {state.status === "success" && (
              <div className="text-sm text-white/80">Success: {state.message}</div>
            )}
            {state.status === "error" && (
              <div className="text-sm text-red-300">Error: {state.message}</div>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}
