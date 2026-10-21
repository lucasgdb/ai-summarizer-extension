import { storage } from "#imports";
import type { FillChoices } from "./forms";
import { createStorageStore } from "./storage-store";

/**
 * The last choices on the fill screen. The context itself isn't kept: it's
 * about one form, and may be personal
 */
export type FillPreferences = FillChoices;

const fallback: FillPreferences = { only_empty: true };

const item = storage.defineItem<Partial<FillPreferences>>(
  "local:fill-preferences",
  { fallback },
);

const store = createStorageStore(item, (stored) => ({
  ...fallback,
  ...stored,
}));

export const loadFillPreferences = store.load;

export const useFillPreferences = store.useValue;

export function updateFillPreferences(change: Partial<FillPreferences>) {
  return store.set({ ...store.get(), ...change });
}
