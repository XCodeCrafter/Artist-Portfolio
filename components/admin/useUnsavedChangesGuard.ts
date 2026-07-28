"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_MESSAGE =
  "You have unsaved changes. Leave this editor and discard them?";

export default function useUnsavedChangesGuard(
  message = DEFAULT_MESSAGE
) {
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const dirtyRef = useRef(false);
  const historyGuardActiveRef = useRef(false);
  const restoringHistoryRef = useRef(false);

  const markDirty = useCallback(() => {
    if (!historyGuardActiveRef.current) {
      const currentState =
        window.history.state && typeof window.history.state === "object"
          ? window.history.state
          : {};
      window.history.pushState(
        { ...currentState, __portfolioEditorGuard: true },
        "",
        window.location.href
      );
      historyGuardActiveRef.current = true;
    }

    dirtyRef.current = true;
    setHasUnsavedChanges(true);
  }, []);

  const clearDirty = useCallback(() => {
    dirtyRef.current = false;
    historyGuardActiveRef.current = false;
    setHasUnsavedChanges(false);
  }, []);

  const confirmDiscard = useCallback(() => {
    if (!dirtyRef.current) return true;
    if (!window.confirm(message)) return false;
    clearDirty();
    return true;
  }, [clearDirty, message]);

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    }

    function onPopState(event: PopStateEvent) {
      if (!historyGuardActiveRef.current) return;

      if (restoringHistoryRef.current) {
        restoringHistoryRef.current = false;
        return;
      }

      event.stopImmediatePropagation();

      if (!dirtyRef.current) {
        historyGuardActiveRef.current = false;
        window.setTimeout(() => window.history.back(), 0);
        return;
      }

      if (!window.confirm(message)) {
        restoringHistoryRef.current = true;
        window.setTimeout(() => window.history.forward(), 0);
        return;
      }

      clearDirty();
      historyGuardActiveRef.current = false;
      window.setTimeout(() => window.history.back(), 0);
    }

    function onDocumentClick(event: MouseEvent) {
      if (!dirtyRef.current) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href") || "";
      if (!href) return;

      const destination = new URL(anchor.href, window.location.href);
      const sameDestination =
        destination.pathname === window.location.pathname &&
        destination.search === window.location.search &&
        destination.hash === window.location.hash;
      if (sameDestination) return;

      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      clearDirty();
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("popstate", onPopState);
    document.addEventListener("click", onDocumentClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("click", onDocumentClick, true);
    };
  }, [clearDirty, message]);

  return {
    clearDirty,
    confirmDiscard,
    hasUnsavedChanges,
    markDirty,
  };
}
