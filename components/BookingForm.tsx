// artist-portfolio/components/BookingForm.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { getMixedPublicCopy } from "@/lib/content/public-copy";

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
};

export default function BookingForm({
  contactBlurb,
  location = "EU / Worldwide",
}: Props) {
  const [state, setState] = useState<FormState>({ status: "idle" });
  const startedAtRef = useRef<number>(0);
  const description = getMixedPublicCopy(
    contactBlurb,
    "For acting, music, productions, bookings, and creative collaborations."
  );

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
      inquiryIntent: safeTrim(fd.get("inquiryIntent")),
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
        message: data.message || "Message sent. Thanks - I will reply soon.",
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
            CONTACT
          </div>
          <h2 className="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight">
            Let&apos;s work together
          </h2>

          <div className="mt-6 space-y-3 text-white/75">
            <div>
              <span className="text-white/50">Collaboration:</span>{" "}
              {description}
            </div>
            <div>
              <span className="text-white/50">Based in:</span>{" "}
              {location}
            </div>
          </div>

          <a
            href="#contact-form"
            className="mt-8 inline-flex rounded-full border border-white/15 bg-black/30 px-5 py-2 text-sm text-white/80 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            Open contact form -&gt;
          </a>
        </div>

        <form
          aria-busy={state.status === "sending"}
          aria-labelledby="contact-form-title"
          className="scroll-mt-28 rounded-3xl border border-white/10 bg-white/5 p-8"
          id="contact-form"
          onFocusCapture={markFormStarted}
          onPointerDown={markFormStarted}
          onSubmit={onSubmit}
        >
          <div className="text-xs tracking-[0.35em] text-white/55">FORM</div>
          <h2
            className="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight"
            id="contact-form-title"
          >
            Send a message
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
            <fieldset>
              <legend className="mb-3 text-xs uppercase tracking-[0.2em] text-white/55">
                What is this about?
              </legend>
              <div className="grid grid-cols-3 gap-2">
                {[
                  ["music", "Music"],
                  ["acting", "Acting"],
                  ["general", "General"],
                ].map(([value, label]) => (
                  <label className="cursor-pointer" key={value}>
                    <input
                      className="peer sr-only"
                      name="inquiryIntent"
                      required
                      type="radio"
                      value={value}
                    />
                    <span className="flex min-h-11 items-center justify-center rounded-xl border border-white/15 bg-black/30 px-3 text-sm text-white/65 transition hover:border-white/30 hover:text-white peer-checked:border-[var(--accent)] peer-checked:bg-[#ff3b1f]/15 peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-white/60">
                      {label}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label>
              <span className="sr-only">Your name</span>
              <input
                name="name"
                className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-sm text-white/80 placeholder:text-white/35 outline-none focus:border-white/30 focus-visible:ring-2 focus-visible:ring-white/65"
                placeholder="Your name"
                required
                minLength={2}
                maxLength={80}
                autoComplete="name"
              />
            </label>
            <label>
              <span className="sr-only">Email address</span>
              <input
                name="email"
                type="email"
                className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-sm text-white/80 placeholder:text-white/35 outline-none focus:border-white/30 focus-visible:ring-2 focus-visible:ring-white/65"
                placeholder="Email"
                required
                maxLength={200}
                autoComplete="email"
              />
            </label>
            <label>
              <span className="sr-only">Message</span>
              <textarea
                name="message"
                className="min-h-[140px] w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-sm text-white/80 placeholder:text-white/35 outline-none focus:border-white/30 focus-visible:ring-2 focus-visible:ring-white/65"
                placeholder="Message"
                required
                minLength={10}
                maxLength={4000}
              />
            </label>

            <button
              className="rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/75 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:opacity-60"
              type="submit"
              disabled={state.status === "sending"}
            >
              {state.status === "sending" ? "Sending..." : "Send message ->"}
            </button>

            <div
              aria-atomic="true"
              aria-live={state.status === "error" ? "assertive" : "polite"}
              id="contact-form-status"
              role={state.status === "error" ? "alert" : "status"}
            >
              {state.status === "sending" ? (
                <span className="sr-only">Sending message.</span>
              ) : null}
              {state.status === "success" ? (
                <div className="text-sm text-white/80">
                  Success: {state.message}
                </div>
              ) : null}
              {state.status === "error" ? (
                <div className="text-sm text-red-300">Error: {state.message}</div>
              ) : null}
            </div>
          </div>
        </form>
      </div>
    </section>
  );
}
