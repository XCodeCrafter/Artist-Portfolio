"use client";

import { useState } from "react";

// A refreshed server prop is not an acknowledgement of this form's draft.
// Keep the editable values and their CAS version together until an explicit reload.
export default function useVersionedFormSnapshot<T extends { updatedAt?: string }>(latest: T) {
  const [state, setState] = useState(() => ({ snapshot: latest, revision: 0 }));

  return {
    snapshot: state.snapshot,
    revision: state.revision,
    hasNewVersion: state.snapshot.updatedAt !== latest.updatedAt,
    loadLatest: () => setState((current) => ({ snapshot: latest, revision: current.revision + 1 })),
  };
}
