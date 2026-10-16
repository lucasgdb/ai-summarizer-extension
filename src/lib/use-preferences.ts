import {
  type Preferences,
  parsePreferences,
  preferencesItem,
} from "./preferences";
import { createStorageStore } from "./storage-store";

const store = createStorageStore(preferencesItem, parsePreferences);

export const loadPreferences = store.load;

export const usePreferences = store.useValue;

export function updatePreferences(change: Partial<Preferences>) {
  return store.set({ ...store.get(), ...change });
}
