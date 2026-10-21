import { formatDate, getDictionary, hostname, type Locale } from "./i18n";

type Exportable = {
  title: string;
  /** Markdown, without the title (the API never sends an H1) */
  content: string;
  source_url: string | null;
  source_title: string | null;
  created_at: string;
};

/**
 * "go-linguagem-compilada" from "Go: linguagem compilada", for the file name
 * (the Markdown export and the audio's)
 */
export function slug(title: string) {
  const base = title
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return base || "summary";
}

/** The summary as a standalone .md: title, where it came from, then the text */
export function toMarkdown(summary: Exportable, locale: Locale) {
  const dict = getDictionary(locale);
  const label =
    summary.source_title || hostname(summary.source_url) || summary.source_url;
  const source =
    summary.source_url && label
      ? `[${label.replace(/[[\]]/g, "\\$&")}](${summary.source_url})`
      : label;
  const origin = [
    source && `${dict.exportSource}: ${source}`,
    formatDate(locale, summary.created_at),
  ]
    .filter(Boolean)
    .join(" · ");

  return `# ${summary.title}\n\n> ${origin}\n\n${summary.content.trim()}\n`;
}

/**
 * Saves it as a file, straight from the panel: the text is already here, so
 * no API call and no "downloads" permission (a link with `download` is enough)
 */
export function downloadMarkdown(summary: Exportable, locale: Locale) {
  const blob = new Blob([toMarkdown(summary, locale)], {
    type: "text/markdown;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slug(summary.title)}.md`;
  link.click();
  // After the click has started the download
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
