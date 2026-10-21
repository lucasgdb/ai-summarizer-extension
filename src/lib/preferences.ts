import { storage } from "#imports";
import type { Locale } from "./i18n";
import { type Generation, type SummaryOptions, uiLanguage } from "./summaries";

/**
 * The user's last choices, kept across sessions. Nothing saved means the
 * API's `defaults` (GET /summaries/options), not values fixed here.
 */
export type Preferences = Generation;

const fallback: Preferences = { instructions: "" };

export const preferencesItem = storage.defineItem<Partial<Preferences>>(
  "local:summary-preferences",
  { fallback },
);

export function parsePreferences(stored: Partial<Preferences> | null) {
  return { ...fallback, ...stored };
}

function pick(value: string | undefined, allowed: string[], fallback: string) {
  return value && allowed.includes(value) ? value : fallback;
}

/**
 * What is actually sent. Saved choices the API no longer offers fall back to
 * its defaults instead of a 400. Without the options, only what was saved is
 * sent; the API fills in the rest. Never a model: the API picks it (the
 * cheapest, with a fallback), and a model saved before is just left out
 */
export function resolveGeneration(
  preferences: Preferences,
  options: SummaryOptions | undefined,
  locale: Locale,
): Generation {
  const instructions = preferences.instructions.trim();
  if (!options) {
    return {
      effort: preferences.effort || undefined,
      style: preferences.style || undefined,
      length: preferences.length || undefined,
      language: preferences.language || uiLanguage(locale),
      instructions,
    };
  }

  const { defaults } = options;
  return {
    // A saved choice, else the UI's language, else the API's default
    language: pick(
      preferences.language,
      options.languages,
      pick(uiLanguage(locale), options.languages, defaults.language),
    ),
    effort: pick(preferences.effort, options.efforts, defaults.effort),
    style: pick(preferences.style, options.styles, defaults.style),
    length: pick(preferences.length, options.lengths, defaults.length),
    instructions: instructions.slice(0, options.max_instructions_length),
  };
}
