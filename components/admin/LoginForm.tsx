"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FaArrowRight, FaEnvelope, FaSpinner } from "react-icons/fa";
import { loginAdmin, type LoginState } from "@/app/admin/actions";
import PasswordField from "@/components/admin/PasswordField";
import TurnstileWidget from "@/components/admin/TurnstileWidget";

const initialState: LoginState = {
  ok: false,
  message: "",
};

export default function LoginForm({
  successMessage,
}: {
  successMessage?: string;
}) {
  const [state, formAction, pending] = useActionState(loginAdmin, initialState);

  return (
    <form
      action={formAction}
      aria-busy={pending}
      className="mt-9 grid gap-5"
    >
      {successMessage ? (
        <div
          className="rounded-2xl border border-emerald-300/16 bg-emerald-400/[0.075] px-4 py-3.5 text-sm leading-5 text-emerald-100/85"
          role="status"
        >
          {successMessage}
        </div>
      ) : null}

      <div className="grid gap-2">
        <label className="text-xs font-semibold text-white/68" htmlFor="email">
          Email address
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

      <PasswordField
        autoComplete="current-password"
        id="password"
        label="Password"
        labelAction={
          <Link
            className="font-ui text-[11px] font-semibold text-white/43 underline decoration-white/18 underline-offset-4 transition hover:text-white"
            href="/admin/forgot-password"
          >
            Forgot password?
          </Link>
        }
        name="password"
      />

      <TurnstileWidget />

      <button
        type="submit"
        disabled={pending}
        className="group mt-1 inline-flex h-13 items-center justify-center gap-2.5 rounded-2xl bg-white px-5 text-sm font-bold text-black shadow-[0_16px_44px_rgba(255,255,255,0.09)] transition duration-300 hover:-translate-y-0.5 hover:bg-[#f0f0f0] hover:shadow-[0_20px_52px_rgba(255,255,255,0.13)] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55"
      >
        {pending ? <FaSpinner aria-hidden="true" className="animate-spin" /> : null}
        {pending ? "Signing in..." : "Enter workspace"}
        {!pending ? (
          <FaArrowRight
            aria-hidden="true"
            className="text-[11px] transition-transform duration-300 group-hover:translate-x-0.5"
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

      <p className="mt-1 text-center text-[11px] leading-5 text-white/30">
        Access is limited to approved administrator accounts.
      </p>
    </form>
  );
}
