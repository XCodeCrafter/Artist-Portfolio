"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_MESSAGE =
  "You have unsaved changes. Leave this editor and discard them?";
const HISTORY_GUARD_KEY = "__portfolioEditorGuard";

function getHistoryState() {
  const state = window.history.state;
  return state && typeof state === "object" && !Array.isArray(state)
    ? (state as Record<string, unknown>)
    : {};
}

export default function useUnsavedChangesGuard(
  message = DEFAULT_MESSAGE,
  guardOtherFormSubmissions = false
) {
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const dirtyRef = useRef(false);
  const historyGuardActiveRef = useRef(false);
  const historyGuardIdRef = useRef<string | null>(null);
  const restoringHistoryRef = useRef(false);

  const removeCurrentHistoryMarker = useCallback(() => {
    const guardId = historyGuardIdRef.current;
    if (!guardId) return;

    const currentState = getHistoryState();
    if (currentState[HISTORY_GUARD_KEY] !== guardId) return;

    const nextState = { ...currentState };
    delete nextState[HISTORY_GUARD_KEY];
    window.history.replaceState(nextState, "", window.location.href);
  }, []);

  const markDirty = useCallback(() => {
    if (!historyGuardActiveRef.current) {
      const currentState = getHistoryState();
      const guardId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      historyGuardIdRef.current = guardId;
      window.history.pushState(
        { ...currentState, [HISTORY_GUARD_KEY]: guardId },
        "",
        window.location.href
      );
      historyGuardActiveRef.current = true;
    }

    dirtyRef.current = true;
    setHasUnsavedChanges(true);
  }, []);

  const clearDirty = useCallback(() => {
    removeCurrentHistoryMarker();
    dirtyRef.current = false;
    historyGuardActiveRef.current = false;
    historyGuardIdRef.current = null;
    restoringHistoryRef.current = false;
    setHasUnsavedChanges(false);
  }, [removeCurrentHistoryMarker]);

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

    function onDocumentSubmit(event: SubmitEvent) {
      if (!guardOtherFormSubmissions || !dirtyRef.current) return;
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.dataset.unsavedGuardBypass === "true") return;

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
    document.addEventListener("submit", onDocumentSubmit, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("click", onDocumentClick, true);
      document.removeEventListener("submit", onDocumentSubmit, true);
    };
  }, [clearDirty, guardOtherFormSubmissions, message]);

  return {
    clearDirty,
    confirmDiscard,
    hasUnsavedChanges,
    markDirty,
  };
}
