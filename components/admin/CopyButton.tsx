"use client";

import { useState } from "react";

export default function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copyValue() {
    if (!value) return;

    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button
      className="inline-flex h-10 items-center justify-center rounded-2xl border border-white/12 bg-white/[0.06] px-4 text-xs font-semibold text-white/75 transition duration-300 hover:border-white/22 hover:bg-white/[0.12] hover:text-white"
      onClick={copyValue}
      type="button"
    >
      {copied ? "Copied" : "Copy URL"}
    </button>
  );
}
