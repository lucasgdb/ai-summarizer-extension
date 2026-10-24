// The summarize and fill sections stay mounted while hidden (a summary or a
// half-answered form survives a look elsewhere), but a pick must not: the
// page would keep its picker under a section that's no longer on screen.
// The app calls cancelPicks() when the section changes; each section that's
// picking goes back to its start
const listeners = new Set<() => void>();

export function cancelPicks() {
  for (const listener of listeners) listener();
}

/** Calls `cancel` when the panel leaves the section; returns the unsubscribe */
export function onCancelPicks(cancel: () => void) {
  listeners.add(cancel);
  return () => {
    listeners.delete(cancel);
  };
}
