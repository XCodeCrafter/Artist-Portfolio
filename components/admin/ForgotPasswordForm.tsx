"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  FaArrowLeft,
  FaArrowRight,
  FaCheck,
  FaEnvelope,
  FaSpinner,
} from "react-icons/fa";
import {
  requestPasswordReset,
  type PasswordResetState,
} from "@/app/admin/actions";
import TurnstileWidget from "@/components/admin/TurnstileWidget";

const initialState: PasswordResetState = {
  ok: false,
  message: "",
};

export default function ForgotPasswordForm({
  initialError,
}: {
  initialError?: string;
}) {
  const [state, formAction, pending] = useActionState(
    requestPasswordReset,
    initialState
  );

  if (state.ok) {
    return (
      <div className="mt-9">
        <div className="rounded-[26px] border border-emerald-300/16 bg-emerald-400/[0.07] p-5 sm:p-6">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-emerald-300 text-[#07150d]">
            <FaCheck aria-hidden="true" className="text-xs" />
          </span>
          <h2 className="heading-ui mt-5 text-xl font-semibold text-white">
            Check your inbox
          </h2>
          <p className="mt-2 text-sm leading-6 text-white/55">
            {state.message}
          </p>
        </div>

        <Link
          className="group mt-5 inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-white/52 transition hover:text-white"
          href="/admin/login"
        >
          <FaArrowLeft
            aria-hidden="true"
            className="text-[10px] transition-transform group-hover:-translate-x-0.5"
          />
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      aria-busy={pending}
      className="mt-9 grid gap-5"
    >
      {initialError ? (
        <div
          className="rounded-2xl border border-amber-300/16 bg-amber-400/[0.07] px-4 py-3.5 text-sm leading-5 text-amber-100/80"
          role="alert"
        >
          {initialError}
        </div>
      ) : null}

      <div className="grid gap-2">
        <label className="text-xs font-semibold text-white/68" htmlFor="email">
          Admin email address
        </label>
        <div className="group relative">
          <FaEnvelope
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[11px] text-white/28 transition-colors group-focus-within:text-white/58"
          />
          <input
            autoComplete="email"
            className="h-13 w-full rounded-2xl border border-white/12 bg-white/[0.045] px-11 text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] outline-none transition duration-300 placeholder:text-white/25 hover:border-white/18 focus:border-white/30 focus:bg-white/[0.065] focus:ring-4 focus:ring-white/[0.035]"
            id="email"
            maxLength={254}
            name="email"
            placeholder="name@example.com"
            required
            type="email"
          />
        </div>
      </div>

      <TurnstileWidget />

      <button
        className="group mt-1 inline-flex h-13 items-center justify-center gap-2.5 rounded-2xl bg-white px-5 text-sm font-bold text-black shadow-[0_16px_44px_rgba(255,255,255,0.09)] transition duration-300 hover:-translate-y-0.5 hover:bg-[#f0f0f0] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55"
        disabled={pending}
        type="submit"
      >
        {pending ? <FaSpinner aria-hidden="true" className="animate-spin" /> : null}
        {pending ? "Sending secure link..." : "Send reset link"}
        {!pending ? (
          <FaArrowRight
            aria-hidden="true"
            className="text-[11px] transition-transform group-hover:translate-x-0.5"
          />
        ) : null}
      </button>

      {state.message ? (
        <div
          className="rounded-2xl border border-red-300/16 bg-red-500/[0.08] px-4 py-3.5 text-sm leading-5 text-red-100/85"
          role="alert"
        >
          {state.message}
        </div>
      ) : null}

      <div className="flex items-start gap-3 border-t border-white/8 pt-5 text-[11px] leading-5 text-white/32">
        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-white/35" />
        For privacy, the confirmation looks the same whether or not the address
        is registered.
      </div>

      <Link
        className="group inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-white/52 transition hover:text-white"
        href="/admin/login"
      >
        <FaArrowLeft
          aria-hidden="true"
          className="text-[10px] transition-transform group-hover:-translate-x-0.5"
        />
        Back to sign in
      </Link>
    </form>
  );
}
