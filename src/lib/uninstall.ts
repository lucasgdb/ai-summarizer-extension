// The page Chrome (or Edge) opens after the extension is uninstalled: an
// optional survey on the website, whose answers go to ai-summarizer-api.
// Set ahead of time (nothing of ours runs once the extension is removed),
// so it's set again on every worker start and when the language changes.
// Only what isn't personal goes in the URL: the extension's version and the
// browser. No id, account or token
import { browser } from "#imports";
import { getLocale, type Locale } from "./i18n";
import { portfolioPage } from "./portfolio";

/**
 * The browser, for the survey: Firefox and Opera say so in their user agent,
 * Edge in its brands (or its user agent), Brave in navigator.brave. The
 * survey keeps the values its API knows (today chrome and edge) and drops
 * the rest
 */
function browserName() {
  const agent = navigator.userAgent;
  if (/\bFirefox\//.test(agent)) return "firefox";
  const data = (
    navigator as Navigator & {
      userAgentData?: { brands?: { brand: string }[] };
    }
  ).userAgentData;
  const brand = (name: string) =>
    data?.brands?.some((b) => b.brand === name) ?? false;
  if (brand("Opera") || /\bOPR\//.test(agent)) return "opera";
  if (brand("Microsoft Edge") || /\bEdg\//.test(agent)) return "edge";
  if ("brave" in navigator) return "brave";
  return "chrome";
}

export function uninstallUrl(locale: Locale) {
  const url = new URL(portfolioPage("/tool/ai-summarizer/uninstall", locale));
  url.searchParams.set("v", browser.runtime.getManifest().version);
  url.searchParams.set("browser", browserName());
  return url.href;
}

export async function applyUninstallUrl(locale?: Locale) {
  await browser.runtime.setUninstallURL(
    uninstallUrl(locale ?? (await getLocale())),
  );
}
