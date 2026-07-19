"use client";

import { useEffect, useId, useRef, useState } from "react";

type TurnstileApi = {
  remove(widgetId: string): void;
  render(
    container: HTMLElement,
    options: {
      callback(token: string): void;
      "error-callback"(): void;
      "expired-callback"(): void;
      sitekey: string;
      theme: "dark";
    }
  ): string;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export default function TurnstileWidget() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const reactId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [token, setToken] = useState("");

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;

    let cancelled = false;
    const render = () => {
      if (
        cancelled ||
        !window.turnstile ||
        !containerRef.current ||
        widgetIdRef.current
      ) {
        return;
      }

      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme: "dark",
        callback: setToken,
        "error-callback": () => setToken(""),
        "expired-callback": () => setToken(""),
      });
    };

    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-admin-turnstile="true"]'
    );
    if (existing) {
      if (window.turnstile) render();
      else existing.addEventListener("load", render, { once: true });
    } else {
      const script = document.createElement("script");
      script.async = true;
      script.defer = true;
      script.dataset.adminTurnstile = "true";
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.addEventListener("load", render, { once: true });
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
    };
  }, [siteKey, reactId]);

  if (!siteKey) return null;

  return (
    <div className="min-h-[65px] overflow-hidden rounded-2xl border border-white/8 bg-white/[0.025] p-2">
      <div ref={containerRef} />
      <input name="captchaToken" type="hidden" value={token} />
    </div>
  );
}
