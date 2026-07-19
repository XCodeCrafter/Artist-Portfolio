"use client";

import { useState, type ReactNode } from "react";
import { FaEye, FaEyeSlash, FaLock } from "react-icons/fa";

type PasswordFieldProps = {
  id: string;
  name: string;
  label: string;
  autoComplete: "current-password" | "new-password";
  labelAction?: ReactNode;
  descriptionId?: string;
};

export default function PasswordField({
  id,
  name,
  label,
  autoComplete,
  labelAction,
  descriptionId,
}: PasswordFieldProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="grid gap-2">
      <div className="flex min-h-5 items-center justify-between gap-4">
        <label className="text-xs font-semibold text-white/68" htmlFor={id}>
          {label}
        </label>
        {labelAction}
      </div>

      <div className="group relative">
        <FaLock
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[11px] text-white/28 transition-colors group-focus-within:text-white/58"
        />
        <input
          aria-describedby={descriptionId}
          autoComplete={autoComplete}
          className="h-13 w-full rounded-2xl border border-white/12 bg-white/[0.045] px-11 pr-13 text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] outline-none transition duration-300 placeholder:text-white/25 hover:border-white/18 focus:border-white/30 focus:bg-white/[0.065] focus:ring-4 focus:ring-white/[0.035]"
          id={id}
          maxLength={512}
          minLength={autoComplete === "new-password" ? 12 : undefined}
          name={name}
          placeholder="Enter your password"
          required
          type={isVisible ? "text" : "password"}
        />
        <button
          aria-label={isVisible ? "Hide password" : "Show password"}
          aria-pressed={isVisible}
          className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-xl text-white/34 transition hover:bg-white/[0.07] hover:text-white/80 focus-visible:text-white"
          onClick={() => setIsVisible((visible) => !visible)}
          title={isVisible ? "Hide password" : "Show password"}
          type="button"
        >
          {isVisible ? (
            <FaEyeSlash aria-hidden="true" className="text-sm" />
          ) : (
            <FaEye aria-hidden="true" className="text-sm" />
          )}
        </button>
      </div>
    </div>
  );
}
