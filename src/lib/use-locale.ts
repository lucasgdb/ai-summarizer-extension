import { getDictionary, isLocale, type Locale, localeItem } from "./i18n";
import { createStorageStore } from "./storage-store";

const store = createStorageStore(localeItem, (stored) =>
  isLocale(stored) ? stored : ("en" satisfies Locale),
);

/** Await before the first render, so the panel never flashes the wrong language */
export const loadLocale = store.load;

export const useLocale = store.useValue;

export function useDictionary() {
  return getDictionary(useLocale());
}

export const setLocale = store.set;
