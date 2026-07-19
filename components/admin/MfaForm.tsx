"use client";

import Image from "next/image";
import { useActionState } from "react";
import {
  FaArrowRight,
  FaKey,
  FaMobileAlt,
  FaShieldAlt,
  FaSpinner,
} from "react-icons/fa";
import {
  startMfaEnrollment,
  verifyMfaCode,
  type MfaState,
} from "@/app/admin/mfa/actions";

const initialState: MfaState = { ok: false, message: "" };

function CodeForm({ factorId }: { factorId: string }) {
  const [state, action, pending] = useActionState(verifyMfaCode, initialState);

  return (
    <form action={action} aria-busy={pending} className="mt-6 grid gap-5">
      <input name="factorId" type="hidden" value={factorId} />
      <div className="grid gap-2">
        <label className="text-xs font-semibold text-white/68" htmlFor="code">
          Six-digit code
        </label>
        <div className="group relative">
          <FaKey
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[11px] text-white/28"
          />
          <input
            autoComplete="one-time-code"
            className="h-13 w-full rounded-2xl border border-white/12 bg-white/[0.045] px-11 font-mono text-lg tracking-[0.38em] text-white outline-none transition focus:border-white/30 focus:ring-4 focus:ring-white/[0.035]"
            id="code"
            inputMode="numeric"
            maxLength={6}
            name="code"
            pattern="[0-9]{6}"
            placeholder="000000"
            required
          />
        </div>
      </div>
      <button
        className="group inline-flex h-13 items-center justify-center gap-2.5 rounded-2xl bg-white px-5 text-sm font-bold text-black transition hover:-translate-y-0.5 hover:bg-[#f0f0f0] disabled:cursor-not-allowed disabled:opacity-55"
        disabled={pending}
        type="submit"
      >
        {pending ? <FaSpinner aria-hidden="true" className="animate-spin" /> : <FaShieldAlt />}
        {pending ? "Verifying..." : "Verify and continue"}
        {!pending ? <FaArrowRight aria-hidden="true" className="text-[11px]" /> : null}
      </button>
      {state.message ? (
        <div className="rounded-2xl border border-red-300/16 bg-red-500/[0.08] px-4 py-3.5 text-sm text-red-100/85" role="alert">
          {state.message}
        </div>
      ) : null}
    </form>
  );
}

export default function MfaForm({
  verifiedFactorId,
}: {
  verifiedFactorId?: string;
}) {
  const [enrollment, startEnrollment, pending] = useActionState(
    startMfaEnrollment,
    initialState
  );

  if (verifiedFactorId) {
    return (
      <div className="mt-9">
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-4 text-sm leading-6 text-white/55">
          Open your authenticator app and enter the current code.
        </div>
        <CodeForm factorId={verifiedFactorId} />
      </div>
    );
  }

  if (enrollment.enrollment) {
    return (
      <div className="mt-9">
        <div className="rounded-[26px] border border-white/12 bg-white/[0.045] p-5 text-center sm:p-6">
          <Image
            alt="Authenticator enrollment QR code"
            className="mx-auto rounded-2xl bg-white p-3"
            height={220}
            src={enrollment.enrollment.qrCode.trimEnd()}
            unoptimized
            width={220}
          />
          <p className="mt-5 text-xs leading-5 text-white/45">
            Cannot scan it? Enter this setup key manually:
          </p>
          <code className="mt-2 block break-all rounded-xl bg-black/40 px-3 py-2 text-xs text-white/70">
            {enrollment.enrollment.secret}
          </code>
        </div>
        <CodeForm factorId={enrollment.enrollment.factorId} />
      </div>
    );
  }

  return (
    <form action={startEnrollment} className="mt-9 grid gap-5">
      <div className="rounded-[26px] border border-white/12 bg-white/[0.04] p-5 sm:p-6">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-black">
          <FaMobileAlt aria-hidden="true" />
        </span>
        <h2 className="heading-ui mt-5 text-xl font-semibold text-white">
          Protect this admin account
        </h2>
        <p className="mt-2 text-sm leading-6 text-white/52">
          Use Google Authenticator, Microsoft Authenticator, 1Password, Authy,
          or another TOTP-compatible app.
        </p>
      </div>
      <button
        className="inline-flex h-13 items-center justify-center gap-2.5 rounded-2xl bg-white px-5 text-sm font-bold text-black transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-55"
        disabled={pending}
        type="submit"
      >
        {pending ? <FaSpinner aria-hidden="true" className="animate-spin" /> : <FaMobileAlt />}
        {pending ? "Preparing..." : "Set up authenticator"}
      </button>
      {enrollment.message && !enrollment.ok ? (
        <div className="rounded-2xl border border-red-300/16 bg-red-500/[0.08] px-4 py-3.5 text-sm text-red-100/85" role="alert">
          {enrollment.message}
        </div>
      ) : null}
    </form>
  );
}
