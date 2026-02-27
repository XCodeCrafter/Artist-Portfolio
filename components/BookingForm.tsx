//artist-portfolio/components/BookingForm.tsx
"use client";

import { useRef, useState } from "react";

type FormState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

function safeTrim(v: unknown) {
  return String(v ?? "").trim();
}

export default function BookingForm() {
  const [state, setState] = useState<FormState>({ status: "idle" });

  // ✅ No Date.now() during render. We'll capture "startedAt" on first user submit.
  const startedAtRef = useRef<number>(0);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state.status === "sending") return;

    const now = Date.now(); // ✅ allowed (event handler)
    if (startedAtRef.current === 0) {
      startedAtRef.current = now;
    }

    const form = e.currentTarget;
    const fd = new FormData(form);

    const payload = {
      name: safeTrim(fd.get("name")),
      email: safeTrim(fd.get("email")),
      message: safeTrim(fd.get("message")),
      // honeypot (must stay empty)
      company: safeTrim(fd.get("company")),
      startedAt: startedAtRef.current,
      submittedAt: now, // optional extra signal (server can use it if you want)
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
        message: data.message || "Message sent. I’ll get back to you soon.",
      });

      form.reset();
      // keep startedAtRef as-is (fine), or reset it if you want:
      // startedAtRef.current = 0;
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
          <div className="text-xs tracking-[0.35em] text-white/55">CONTACT</div>
          <h2 className="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight">
            Booking & inquiries
          </h2>

          <div className="mt-6 space-y-3 text-white/75">
            <div>
              <span className="text-white/50">Email:</span> hello@example.com
            </div>
            <div>
              <span className="text-white/50">Management:</span>{" "}
              management@example.com
            </div>
            <div>
              <span className="text-white/50">Location:</span> EU / Worldwide
            </div>
          </div>

          <a
            href="mailto:hello@example.com"
            className="mt-8 inline-flex rounded-full border border-white/15 bg-black/30 px-5 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white transition"
          >
            Email now →
          </a>
        </div>

        <form
          className="rounded-3xl border border-white/10 bg-white/5 p-8"
          onSubmit={onSubmit}
        >
          <div className="text-xs tracking-[0.35em] text-white/55">FORM</div>
          <h2 className="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight">
            Quick message
          </h2>

          {/* Honeypot (hidden) */}
          <div className="hidden" aria-hidden="true">
            <label>
              Company
              <input name="company" tabIndex={-1} autoComplete="off" />
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
              {state.status === "sending" ? "Sending…" : "Send →"}
            </button>

            {state.status === "success" && (
              <div className="text-sm text-white/80">✅ {state.message}</div>
            )}
            {state.status === "error" && (
              <div className="text-sm text-red-300">⚠️ {state.message}</div>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}