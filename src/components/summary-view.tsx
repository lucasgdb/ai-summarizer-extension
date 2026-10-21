import {
  ArrowUpRightIcon,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { Hint } from "@/components/hint";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { downloadMarkdown } from "@/lib/export-markdown";
import { formatCredits, formatDate, getDictionary, hostname } from "@/lib/i18n";
import { useOptions } from "@/lib/queries";
import type { SummaryRecord } from "@/lib/summaries";
import { useDictionary, useLocale } from "@/lib/use-locale";
import { useElapsedSeconds } from "./elapsed-seconds";
import { Markdown } from "./markdown";
import { SourceBadge } from "./source-badge";
import { TextSkeleton } from "./text-skeleton";

/**
 * The shape every summary has (styles vary, but all start this way): an intro
 * paragraph, a "## Key points" heading and a few bullets.
 */
export function ContentSkeleton() {
  return (
    <div className="space-y-5" aria-hidden="true">
      <div className="space-y-2">
        <Skeleton className="h-3.5" />
        <Skeleton className="h-3.5 w-11/12" />
        <Skeleton className="h-3.5 w-3/5" />
      </div>
      <Skeleton className="h-4 w-2/5" />
      <ul className="space-y-2.5">
        {["w-4/5", "w-3/4", "w-2/3"].map((width) => (
          <li key={width} className="flex items-center gap-2.5">
            <Skeleton className="size-1.5 shrink-0 rounded-full" />
            <Skeleton className={`h-3.5 ${width}`} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function CopyButton({ text, disabled }: { text: string; disabled?: boolean }) {
  const dict = useDictionary();
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-muted-foreground"
      disabled={disabled}
      onClick={copy}
    >
      {copied ? (
        <CheckIcon data-icon="inline-start" />
      ) : (
        <CopyIcon data-icon="inline-start" />
      )}
      {copied ? dict.copied : dict.copy}
    </Button>
  );
}

/** Downloads what's on screen (the original or a translation) as a .md file */
function ExportButton({
  summary,
  disabled,
}: {
  summary: SummaryShape;
  disabled?: boolean;
}) {
  const locale = useLocale();
  const dict = getDictionary(locale);

  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-muted-foreground"
      disabled={disabled}
      onClick={() => downloadMarkdown(summary, locale)}
    >
      <DownloadIcon data-icon="inline-start" />
      {dict.export}
    </Button>
  );
}

/** What a summary screen needs: a saved record, or one still streaming in */
export type SummaryShape = Pick<
  SummaryRecord,
  | "title"
  | "content"
  | "source_url"
  | "source_title"
  | "model"
  | "effort"
  | "credits"
  | "created_at"
> &
  // Known once saved: the "TXT"/"PDF"/"Selection" badge, and the site even
  // when the API kept no URL (it only stores http, https and file ones)
  Partial<
    Pick<SummaryRecord, "source_type" | "file_extension" | "source_host">
  >;

/**
 * A summary as the API stores it, or one being written (`streaming`): the
 * title shows up once complete, the Markdown is formatted as it arrives. While
 * only the history row is known (`content` empty), the body is a skeleton.
 */
export function SummaryView({
  summary,
  streaming = false,
  actions,
}: {
  summary: SummaryShape;
  streaming?: boolean;
  actions?: ReactNode;
}) {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const host = summary.source_host ?? hostname(summary.source_url);
  const hasContent = summary.content !== "";
  const meta = useSummaryMeta(summary);

  return (
    <article className="space-y-4" aria-busy={streaming || !hasContent}>
      <header className="space-y-1.5">
        {summary.title ? (
          <h2 className="title text-lg leading-snug font-semibold tracking-tight">
            {summary.title}
          </h2>
        ) : streaming && summary.source_title ? (
          // The model writes its title after the text: until then, the page's
          // own title, dimmed so it doesn't read as the final one
          <h2 className="title line-clamp-2 text-lg leading-snug font-semibold tracking-tight text-muted-foreground/70">
            {summary.source_title}
          </h2>
        ) : (
          <Skeleton className="h-6 w-3/4" />
        )}
        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground tabular-nums">
          <time dateTime={summary.created_at}>
            {formatDate(locale, summary.created_at)}
          </time>
          {host && (
            <>
              <span aria-hidden="true">·</span>
              {summary.source_url ? (
                <Hint label={summary.source_title}>
                  <a
                    href={summary.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 transition-colors hover:text-foreground"
                  >
                    {host}
                    <ArrowUpRightIcon className="size-3" />
                  </a>
                </Hint>
              ) : (
                // No URL kept: the site, but nothing to open
                <Hint label={summary.source_title}>
                  <span>{host}</span>
                </Hint>
              )}
            </>
          )}
          {summary.source_type && (
            <SourceBadge
              summary={{
                source_type: summary.source_type,
                file_extension: summary.file_extension ?? null,
              }}
            />
          )}
        </p>
      </header>

      {hasContent ? (
        <Markdown streaming={streaming}>{summary.content}</Markdown>
      ) : streaming ? (
        <Thinking since={summary.created_at} />
      ) : (
        <ContentSkeleton />
      )}

      {/* The actions move to a line of their own when the meta wouldn't fit
          beside them (a narrow panel), instead of cutting it short */}
      <footer className="flex min-h-9 flex-wrap items-center gap-x-2 gap-y-1 border-t pt-2">
        <p className="min-w-48 flex-1 truncate text-xs text-muted-foreground tabular-nums">
          {meta ?? <TextSkeleton className="w-36" />}
        </p>
        {streaming ? (
          // While thinking, the counter above already says so
          hasContent && (
            <p className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
              <Spinner className="size-3" aria-hidden="true" />
              {dict.writing}
            </p>
          )
        ) : (
          // Still loading from the history: same buttons, nothing to copy yet
          <div className="-mr-2 ml-auto flex shrink-0 items-center">
            <CopyButton text={summary.content} disabled={!hasContent} />
            <ExportButton summary={summary} disabled={!hasContent} />
            {actions}
          </div>
        )}
      </footer>
    </article>
  );
}

/**
 * Between the charge and the first text the model is reasoning, and the API
 * has nothing to show (seconds with high effort, more with Sol/Astra): a
 * running counter tells the user it's working, not stuck.
 */
function Thinking({ since }: { since: string }) {
  const dict = useDictionary();
  const seconds = useElapsedSeconds(since);

  return (
    <div className="space-y-4">
      {/* No live region: a screen reader would read the counter every second */}
      <p className="flex items-center gap-2 text-sm text-muted-foreground tabular-nums">
        <Spinner aria-hidden="true" />
        {dict.thinkingFor(seconds)}
      </p>
      <ContentSkeleton />
    </div>
  );
}

/**
 * "GPT-6 Luna · Fast · 2 credits": model name from /summaries/options (the
 * record only has its id), effort label, cost. Parts not known yet are left
 * out. null while the options load, for a skeleton instead of a raw id.
 */
export function useSummaryMeta(
  summary: Pick<SummaryRecord, "model" | "effort" | "credits">,
  /** Off in the history list: the cost only matters once a summary is open */
  { credits = true }: { credits?: boolean } = {},
) {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const options = useOptions();
  if (options.isPending && summary.model) return null;
  const models = options.data?.models;
  const model =
    models?.find((option) => option.id === summary.model)?.name ??
    summary.model;
  return [
    model,
    summary.effort && (dict.options.efforts[summary.effort] ?? summary.effort),
    credits && summary.credits > 0 && formatCredits(locale, summary.credits),
  ]
    .filter(Boolean)
    .join(" · ");
}
