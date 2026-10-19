import { useId } from "react";
import { Badge } from "@/components/ui/badge";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatNumber, getDictionary } from "@/lib/i18n";
import type { PickedContent } from "@/lib/messages";
import type { PdfPages } from "@/lib/page";
import { pdfFileName } from "@/lib/pdf";
import { useLocale } from "@/lib/use-locale";
import { cn } from "@/lib/utils";

// Rough estimate (~4 chars per token): the real count only exists after the
// model runs, and the price in credits is on the Summarize button
const estimateTokens = (text: string) => Math.ceil(text.length / 4);

// About four lines of the panel: enough to recognize the selection
const excerptLength = 280;

/**
 * The text goes to the API as light Markdown (lib/bridge/to-markdown); the
 * preview is for reading, so the marks go: fences, "#", "- ", "> ", table
 * pipes and inline backticks
 */
function plain(markdown: string) {
  return markdown
    .replace(/^`{3,}.*$/gm, "")
    .replace(/^\s*(?:#{1,6}|[-*]|\d+\.|>)\s+/gm, "")
    .replace(/^\|\s?|\s?\|$/gm, "")
    .replace(/\s\|\s/g, " · ")
    .replace(/`([^`\n]+)`/g, "$1");
}

/**
 * Page text is full of short lines (menus, headings, captions); shown as-is
 * they eat the visible lines and the cut lands anywhere. Flow them into one
 * paragraph and stop at a word boundary instead.
 */
/**
 * The prose, when there is some: headings, lists, tables, quotes and code run
 * together into one line read like a word salad ("…2026 Sumário: O Node.js é
 * single-threaded? Tarefas…"). A pick that's all list (or all code) has no
 * prose, so it keeps everything
 */
function prose(markdown: string) {
  const paragraphs: string[] = [];
  let inCode = false;
  for (const line of markdown.split("\n")) {
    if (/^\s*`{3,}/.test(line)) {
      inCode = !inCode;
      continue;
    }
    if (inCode || !line.trim()) continue;
    if (/^\s*(?:#{1,6}\s|[-*]\s|\d+\.\s|>|\|)/.test(line)) continue;
    // Bylines, dates, captions: too short to say what the text is about, or
    // a run of "·"-separated facts ("By … · 10 Sep 2024 · Updated …")
    if (line.trim().length < 60 || /\s·\s.*\s·\s/.test(line)) continue;
    paragraphs.push(line);
  }
  return paragraphs.length > 0 ? paragraphs.join("\n") : markdown;
}

function excerpt(text: string) {
  const flat = plain(prose(text)).replace(/\s+/g, " ").trim();
  if (flat.length <= excerptLength) return flat;
  const cut = flat.slice(0, excerptLength);
  // Back up to the last word, unless that throws away too much (long URLs)
  const lastSpace = cut.lastIndexOf(" ");
  const words = lastSpace > excerptLength * 0.6 ? cut.slice(0, lastSpace) : cut;
  // "word, …" and "word. …" read worse than "word…"
  return `${words.replace(/[\s,.;:–-]+$/, "")}…`;
}

type PdfChoice = {
  pageCount: number;
  pages: PdfPages;
  onChange: (pages: PdfPages) => void;
};

export function Selection({
  content,
  pdf,
}: {
  content: PickedContent;
  /** A PDF: which pages to summarize, changeable without reading it again */
  pdf?: PdfChoice;
}) {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const id = useId();
  const host = URL.canParse(content.url) ? new URL(content.url).hostname : "";
  const source =
    content.source === "page"
      ? dict.wholePageLabel
      : content.source === "pdf"
        ? pdfFileName(content.url)
        : content.label;

  return (
    <section className="space-y-3">
      <h2 className="font-medium tracking-tight">{dict.selection}</h2>
      <div className="flex flex-wrap gap-1.5">
        {host && <Badge variant="secondary">{host}</Badge>}
        {/* Monospace only for what's code: the picked element's selector */}
        <Badge
          variant="outline"
          className={cn(
            "max-w-full",
            content.source === "element" && "font-mono",
          )}
        >
          <span className="truncate">{source}</span>
        </Badge>
        {pdf && (
          <Badge variant="outline" className="tabular-nums">
            {dict.pdf.pageCount(
              pdf.pageCount,
              formatNumber(locale, pdf.pageCount),
            )}
          </Badge>
        )}
        <Badge variant="outline" className="tabular-nums">
          {dict.tokens(formatNumber(locale, estimateTokens(content.text)))}
        </Badge>
      </div>
      {pdf && pdf.pageCount > 1 && (
        <Field className="pt-1">
          <FieldLabel htmlFor={`${id}-pages`}>{dict.pdf.pages}</FieldLabel>
          <Select
            value={String(pdf.pages)}
            onValueChange={(value) =>
              pdf.onChange(value === "all" ? "all" : Number(value))
            }
          >
            <SelectTrigger id={`${id}-pages`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {dict.pdf.allPages(formatNumber(locale, pdf.pageCount))}
              </SelectItem>
              {Array.from({ length: pdf.pageCount }, (_, index) => {
                const number = index + 1;
                return (
                  <SelectItem key={number} value={String(number)}>
                    {dict.pdf.page(formatNumber(locale, number))}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </Field>
      )}
      <blockquote className="border-l-2 pl-3 text-sm leading-relaxed text-pretty text-muted-foreground line-clamp-4">
        {excerpt(content.text)}
      </blockquote>
      {content.truncated && (
        <p className="text-sm text-muted-foreground">
          {/* A long PDF has a way out: send one page instead */}
          {pdf && pdf.pages === "all" ? dict.pdf.longHint : dict.truncated}
        </p>
      )}
    </section>
  );
}
