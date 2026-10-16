import { useSyncExternalStore } from "react";
import type { WxtStorageItem } from "#imports";

/**
 * Mirrors an extension storage item in memory so React can read it
 * synchronously. `load()` must finish before the first render; after that,
 * changes from any extension page (or the page script) re-render.
 */
export function createStorageStore<Stored, Value>(
  item: WxtStorageItem<Stored, Record<string, unknown>>,
  parse: (stored: Stored) => Value,
) {
  let loaded = false;
  let current: Value;
  const listeners = new Set<() => void>();

  function notify(value: Value) {
    current = value;
    loaded = true;
    for (const listener of listeners) listener();
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function snapshot() {
    if (!loaded) throw new Error("Load the storage store before rendering");
    return current;
  }

  return {
    async load() {
      notify(parse(await item.getValue()));
      item.watch((stored) => notify(parse(stored)));
    },
    useValue() {
      return useSyncExternalStore(subscribe, snapshot);
    },
    get: snapshot,
    async set(stored: Stored) {
      notify(parse(stored));
      await item.setValue(stored);
    },
  };
}
