"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { FaSpinner } from "react-icons/fa";

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  pendingLabel?: string;
};

export default function ActionButton({
  children,
  disabled,
  pendingLabel = "Working...",
  ...props
}: ActionButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      {...props}
      aria-busy={pending}
      disabled={disabled || pending}
      type="submit"
    >
      {pending ? <FaSpinner aria-hidden="true" className="animate-spin" /> : null}
      {pending ? pendingLabel : children}
    </button>
  );
}
