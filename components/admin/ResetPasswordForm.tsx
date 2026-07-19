"use client";

import { useActionState } from "react";
import { FaArrowRight, FaCheck, FaSpinner } from "react-icons/fa";
import {
  updateAdminPassword,
  type PasswordResetState,
} from "@/app/admin/actions";
import PasswordField from "@/components/admin/PasswordField";

const initialState: PasswordResetState = {
  ok: false,
  message: "",
};

export default function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(
    updateAdminPassword,
    initialState
  );

  return (
    <form
      action={formAction}
      aria-busy={pending}
      className="mt-9 grid gap-5"
    >
      <PasswordField
        autoComplete="new-password"
        descriptionId="password-requirements"
        id="new-password"
        label="New password"
        name="password"
      />

      <PasswordField
        autoComplete="new-password"
        id="confirm-password"
        label="Confirm new password"
        name="confirmPassword"
      />

      <div
        className="grid gap-2 rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-3.5 text-[11px] text-white/40"
        id="password-requirements"
      >
        <span className="flex items-center gap-2">
          <FaCheck aria-hidden="true" className="text-[9px] text-emerald-300/75" />
          Use at least 12 characters
        </span>
        <span className="flex items-center gap-2">
          <FaCheck aria-hidden="true" className="text-[9px] text-emerald-300/75" />
          A unique passphrase is easiest to remember
        </span>
      </div>

      <button
        className="group mt-1 inline-flex h-13 items-center justify-center gap-2.5 rounded-2xl bg-white px-5 text-sm font-bold text-black shadow-[0_16px_44px_rgba(255,255,255,0.09)] transition duration-300 hover:-translate-y-0.5 hover:bg-[#f0f0f0] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55"
        disabled={pending}
        type="submit"
      >
        {pending ? <FaSpinner aria-hidden="true" className="animate-spin" /> : null}
        {pending ? "Updating password..." : "Save new password"}
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

      <p className="mt-1 text-center text-[11px] leading-5 text-white/30">
        You will be asked to sign in again after the password is changed.
      </p>
    </form>
  );
}
