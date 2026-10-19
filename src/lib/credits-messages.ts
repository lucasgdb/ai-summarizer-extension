import { type Dictionary, formatCredits, type Locale } from "./i18n";

/**
 * "This costs X and your balance is Y…", or, below zero (a reversed purchase
 * took back credits already spent), why nothing fits until a purchase
 */
export function insufficientMessage(
  dict: Dictionary,
  locale: Locale,
  price: number,
  balance: number,
) {
  return balance < 0
    ? dict.credits.negativeBody
    : dict.credits.insufficient(
        formatCredits(locale, price),
        formatCredits(locale, balance),
      );
}
