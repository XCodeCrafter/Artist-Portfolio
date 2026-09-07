"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import useUnsavedChangesGuard from "@/components/admin/useUnsavedChangesGuard";

type NavbarEditorSource = "navigation" | "shortcuts";

type NavbarUnsavedChangesContextValue = {
  clearSourceDirty: (
    source: NavbarEditorSource,
    afterCompaction?: () => void
  ) => void;
  confirmDiscard: (afterDiscard?: () => void) => boolean;
  markSourceDirty: (source: NavbarEditorSource) => void;
};

const NavbarUnsavedChangesContext =
  createContext<NavbarUnsavedChangesContextValue | null>(null);

export function NavbarUnsavedChangesProvider({
  children,
}: {
  children: ReactNode;
}) {
  const dirtySourcesRef = useRef(new Set<NavbarEditorSource>());
  const {
    clearDirty: clearGlobalDirty,
    confirmDiscard: confirmGlobalDiscard,
    markDirty: markGlobalDirty,
  } = useUnsavedChangesGuard(
    "You have unsaved navbar or platform shortcut changes. Leave and discard them?",
    true
  );

  const markSourceDirty = useCallback(
    (source: NavbarEditorSource) => {
      dirtySourcesRef.current.add(source);
      markGlobalDirty();
    },
    [markGlobalDirty]
  );

  const clearSourceDirty = useCallback(
    (source: NavbarEditorSource, afterCompaction?: () => void) => {
      dirtySourcesRef.current.delete(source);
      if (!dirtySourcesRef.current.size) {
        clearGlobalDirty(afterCompaction);
      } else {
        afterCompaction?.();
      }
    },
    [clearGlobalDirty]
  );

  const confirmDiscard = useCallback((afterDiscard?: () => void) => {
    return confirmGlobalDiscard(() => {
      dirtySourcesRef.current.clear();
      afterDiscard?.();
    });
  }, [confirmGlobalDiscard]);

  const value = useMemo(
    () => ({ clearSourceDirty, confirmDiscard, markSourceDirty }),
    [clearSourceDirty, confirmDiscard, markSourceDirty]
  );

  return (
    <NavbarUnsavedChangesContext.Provider value={value}>
      {children}
    </NavbarUnsavedChangesContext.Provider>
  );
}

export function useNavbarUnsavedChanges(source: NavbarEditorSource) {
  const context = useContext(NavbarUnsavedChangesContext);
  if (!context) {
    throw new Error(
      "Navbar editors must be rendered inside NavbarUnsavedChangesProvider."
    );
  }

  useEffect(
    () => () => context.clearSourceDirty(source),
    [context, source]
  );

  return useMemo(
    () => ({
      clearDirty: (afterCompaction?: () => void) =>
        context.clearSourceDirty(source, afterCompaction),
      confirmDiscard: context.confirmDiscard,
      markDirty: () => context.markSourceDirty(source),
    }),
    [context, source]
  );
}
