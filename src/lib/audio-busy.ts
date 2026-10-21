import { useSyncExternalStore } from "react";

/**
 * Audio being generated right now, anywhere in the panel: while it is, the
 * other paid actions (summarize, translate) wait, so two charges and two
 * long requests don't race each other
 */
const jobs = new Set<symbol>();
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

/** Marks one generation as running; call the result when it's over */
export function startAudioJob() {
  const job = Symbol("audio");
  jobs.add(job);
  notify();
  return () => {
    if (jobs.delete(job)) notify();
  };
}

export function useAudioGenerating() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => jobs.size > 0,
  );
}
