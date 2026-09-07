"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_MESSAGE =
  "You have unsaved changes. Leave this editor and discard them?";
const HISTORY_GUARD_KEY = "__portfolioEditorGuard";
const HISTORY_GUARD_BASE_KEY = "__portfolioEditorGuardBase";
const FORM_RESUBMITTING_KEY = "unsavedGuardResubmitting";

export type GuardedFormSubmitter =
  | HTMLButtonElement
  | HTMLInputElement
  | undefined;

export function getGuardedFormSubmitter(event: Event): GuardedFormSubmitter {
  const submitter = (event as SubmitEvent).submitter;
  return submitter instanceof HTMLButtonElement ||
    submitter instanceof HTMLInputElement
    ? submitter
    : undefined;
}

export function isGuardedFormResubmission(form: HTMLFormElement) {
  return form.dataset[FORM_RESUBMITTING_KEY] === "true";
}

type HistoryCompaction = {
  afterCompaction?: () => void;
  guardId: string;
  rearmDirty: boolean;
  targetUrl: string;
};

function getHistoryState() {
  const state = window.history.state;
  return state && typeof state === "object" && !Array.isArray(state)
    ? (state as Record<string, unknown>)
    : {};
}

function withoutHistoryGuardKeys(state: Record<string, unknown>) {
  const nextState = { ...state };
  delete nextState[HISTORY_GUARD_KEY];
  delete nextState[HISTORY_GUARD_BASE_KEY];
  return nextState;
}

export default function useUnsavedChangesGuard(
  message = DEFAULT_MESSAGE,
  guardOtherFormSubmissions = false
) {
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const dirtyRef = useRef(false);
  const historyGuardActiveRef = useRef(false);
  const historyGuardIdRef = useRef<string | null>(null);
  const historyCompactionRef = useRef<HistoryCompaction | null>(null);
  const restoringHistoryGuardIdRef = useRef<string | null>(null);

  const removeCurrentHistoryMarker = useCallback(() => {
    const guardId = historyGuardIdRef.current;
    if (!guardId) return false;

    const currentState = getHistoryState();
    if (currentState[HISTORY_GUARD_KEY] !== guardId) return false;

    window.history.replaceState(
      withoutHistoryGuardKeys(currentState),
      "",
      window.location.href
    );
    return true;
  }, []);

  const resetDirtyState = useCallback(() => {
    dirtyRef.current = false;
    historyGuardActiveRef.current = false;
    historyGuardIdRef.current = null;
    restoringHistoryGuardIdRef.current = null;
    setHasUnsavedChanges(false);
  }, []);

  const armHistoryGuard = useCallback(() => {
    if (historyGuardActiveRef.current) return;

    const guardId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const baseState = {
      ...withoutHistoryGuardKeys(getHistoryState()),
      [HISTORY_GUARD_BASE_KEY]: guardId,
    };
    historyGuardIdRef.current = guardId;
    window.history.replaceState(baseState, "", window.location.href);
    window.history.pushState(
      { ...baseState, [HISTORY_GUARD_KEY]: guardId },
      "",
      window.location.href
    );
    historyGuardActiveRef.current = true;
  }, []);

  const markDirty = useCallback(() => {
    const historyCompaction = historyCompactionRef.current;
    if (historyCompaction) {
      historyCompaction.rearmDirty = true;
    } else {
      armHistoryGuard();
    }

    dirtyRef.current = true;
    setHasUnsavedChanges(true);
  }, [armHistoryGuard]);

  const clearDirty = useCallback((afterCompaction?: () => void) => {
    const pendingCompaction = historyCompactionRef.current;
    if (pendingCompaction) {
      pendingCompaction.rearmDirty = false;
      if (afterCompaction && !pendingCompaction.afterCompaction) {
        pendingCompaction.afterCompaction = afterCompaction;
      }
      resetDirtyState();
      return;
    }

    const guardId = historyGuardIdRef.current;
    const shouldCompactHistory = removeCurrentHistoryMarker();
    resetDirtyState();

    if (!guardId || !shouldCompactHistory) {
      afterCompaction?.();
      return;
    }

    historyCompactionRef.current = {
      afterCompaction,
      guardId,
      rearmDirty: false,
      targetUrl: window.location.href,
    };
    window.history.back();
  }, [removeCurrentHistoryMarker, resetDirtyState]);

  const confirmDiscard = useCallback((afterDiscard?: () => void) => {
    if (!dirtyRef.current) {
      const pendingCompaction = historyCompactionRef.current;
      if (pendingCompaction) {
        if (afterDiscard && !pendingCompaction.afterCompaction) {
          pendingCompaction.afterCompaction = afterDiscard;
        }
        return true;
      }
      afterDiscard?.();
      return true;
    }
    if (!window.confirm(message)) return false;
    clearDirty(afterDiscard);
    return true;
  }, [clearDirty, message]);

  const prepareFormSubmission = useCallback(
    (form: HTMLFormElement, submitter?: GuardedFormSubmitter) => {
      if (isGuardedFormResubmission(form)) return true;
      if (
        !dirtyRef.current &&
        !historyGuardActiveRef.current &&
        !historyCompactionRef.current
      ) {
        return true;
      }

      clearDirty(() => {
        window.setTimeout(() => {
          if (!form.isConnected) return;
          form.dataset[FORM_RESUBMITTING_KEY] = "true";
          try {
            form.requestSubmit(
              submitter?.form === form ? submitter : undefined
            );
          } finally {
            delete form.dataset[FORM_RESUBMITTING_KEY];
          }
        }, 0);
      });
      return false;
    },
    [clearDirty]
  );

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    }

    function onPopState(event: PopStateEvent) {
      const historyCompaction = historyCompactionRef.current;
      if (historyCompaction) {
        const currentState = getHistoryState();
        if (
          currentState[HISTORY_GUARD_BASE_KEY] !== historyCompaction.guardId
        ) {
          historyCompactionRef.current = null;
          if (historyCompaction.rearmDirty && dirtyRef.current) {
            armHistoryGuard();
          }
          return;
        }

        historyCompactionRef.current = null;
        event.stopImmediatePropagation();
        window.history.replaceState(
          withoutHistoryGuardKeys(currentState),
          "",
          historyCompaction.targetUrl
        );
        const shouldRearmDirty =
          historyCompaction.rearmDirty && dirtyRef.current;
        if (shouldRearmDirty) {
          armHistoryGuard();
        } else {
          historyCompaction.afterCompaction?.();
        }
        return;
      }

      if (!historyGuardActiveRef.current) return;

      const restoringGuardId = restoringHistoryGuardIdRef.current;
      if (restoringGuardId) {
        const currentState = getHistoryState();
        if (
          currentState[HISTORY_GUARD_KEY] === restoringGuardId &&
          currentState[HISTORY_GUARD_BASE_KEY] === restoringGuardId
        ) {
          restoringHistoryGuardIdRef.current = null;
          event.stopImmediatePropagation();
          return;
        }
        restoringHistoryGuardIdRef.current = null;
      }

      const guardId = historyGuardIdRef.current;
      const currentState = getHistoryState();
      if (
        !guardId ||
        currentState[HISTORY_GUARD_BASE_KEY] !== guardId
      ) {
        return;
      }

      event.stopImmediatePropagation();

      if (!dirtyRef.current) {
        window.history.replaceState(
          withoutHistoryGuardKeys(currentState),
          "",
          window.location.href
        );
        resetDirtyState();
        window.history.back();
        return;
      }

      if (!window.confirm(message)) {
        restoringHistoryGuardIdRef.current = guardId;
        window.history.forward();
        return;
      }

      window.history.replaceState(
        withoutHistoryGuardKeys(currentState),
        "",
        window.location.href
      );
      resetDirtyState();
      window.history.back();
    }

    function onDocumentClick(event: MouseEvent) {
      if (!dirtyRef.current && !historyCompactionRef.current) return;
      if (
        event.button !== 0 ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      ) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (
        (anchor.target && anchor.target !== "_self") ||
        anchor.hasAttribute("download")
      ) {
        return;
      }

      const href = anchor.getAttribute("href") || "";
      if (!href) return;

      const destination = new URL(anchor.href, window.location.href);
      const sameDestination =
        destination.pathname === window.location.pathname &&
        destination.search === window.location.search &&
        destination.hash === window.location.hash;
      if (sameDestination) return;

      if (dirtyRef.current && !window.confirm(message)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      clearDirty(() => window.location.assign(destination.href));
    }

    function onDocumentSubmit(event: SubmitEvent) {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (isGuardedFormResubmission(form)) return;

      if (
        !guardOtherFormSubmissions ||
        (!dirtyRef.current && !historyCompactionRef.current)
      ) {
        return;
      }
      if (form.dataset.unsavedGuardBypass === "true") return;

      if (dirtyRef.current && !window.confirm(message)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      prepareFormSubmission(form, getGuardedFormSubmitter(event));
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
  }, [
    armHistoryGuard,
    clearDirty,
    guardOtherFormSubmissions,
    message,
    prepareFormSubmission,
    resetDirtyState,
  ]);

  return {
    clearDirty,
    confirmDiscard,
    hasUnsavedChanges,
    markDirty,
    prepareFormSubmission,
  };
}
