// The website (lucasbittencourt.dev): the footer link and the uninstall
// survey. WXT_PORTFOLIO_URL points them at a local copy in development
// (http://localhost:3000); unset, a build links to the real site
import type { Locale } from "./i18n";

export const portfolioUrl = (
  import.meta.env.WXT_PORTFOLIO_URL || "https://lucasbittencourt.dev"
).replace(/\/+$/, "");

/** A page of the website, in the extension's language: "/tools" → …/pt-br/tools */
export function portfolioPage(path: string, locale: Locale) {
  const prefix = locale === "pt-br" ? "/pt-br" : "";
  return `${portfolioUrl}${prefix}${path === "/" && prefix ? "" : path}`;
}
