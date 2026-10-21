import { HistoryIcon, LanguagesIcon, SearchXIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Hint } from "@/components/hint";
import { InfiniteList } from "@/components/infinite-list";
import { SourceBadge } from "@/components/source-badge";
import { useSummaryMeta } from "@/components/summary-view";
import { TextSkeleton } from "@/components/text-skeleton";
import { Button } from "@/components/ui/button";
import type { Session } from "@/lib/auth";
import {
  formatDate,
  formatList,
  getDictionary,
  hostname,
  languageLabel,
} from "@/lib/i18n";
import { useHistory } from "@/lib/queries";
import type { HistoryFilter, HistoryItem } from "@/lib/summaries";
import { useDictionary, useLocale } from "@/lib/use-locale";
import { cn } from "@/lib/utils";
import { HistoryRowsSkeleton } from "./skeletons";

/**
 * The summary's languages for the meta line: the original first, then its
 * translations ("PT · EN"), spelled out on hover and for screen readers
 */
function Languages({
  original,
  translations,
}: {
  original?: string;
  translations: string[];
}) {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const name = (language: string) => languageLabel(locale, language);
  const codes = [...(original ? [original] : []), ...translations];
  const description = [
    original && dict.translate.writtenIn(name(original)),
    translations.length > 0 &&
      dict.translate.translatedTo(formatList(locale, translations.map(name))),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Hint label={description}>
      <span className="inline-flex shrink-0 items-center gap-1 uppercase">
        <LanguagesIcon className="size-3.5" aria-hidden="true" />
        <span aria-hidden="true">{codes.join(" · ")}</span>
        <span className="sr-only">{description}</span>
      </span>
    </Hint>
  );
}

/** One piece of the meta line, with the "·" before it (see HistoryRow) */
function MetaPiece({
  children,
  truncate = false,
}: {
  children: ReactNode;
  /** A long host shrinks to "…" instead of taking a line */
  truncate?: boolean;
}) {
  return (
    <span
      className={cn(
        "relative pl-3 before:absolute before:left-[0.3rem] before:content-['·']",
        truncate ? "min-w-0 max-w-full truncate" : "whitespace-nowrap",
      )}
    >
      {children}
    </span>
  );
}

function HistoryRow({
  item,
  onOpen,
}: {
  item: HistoryItem;
  onOpen: (item: HistoryItem) => void;
}) {
  const locale = useLocale();
  const host = item.source_host ?? hostname(item.source_url);
  const meta = useSummaryMeta(item, { credits: false });

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className="-mx-2 block w-[calc(100%+1rem)] cursor-pointer rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
    >
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate font-medium tracking-tight">
          {item.title}
        </p>
        <SourceBadge summary={item} />
      </div>
      {item.preview && (
        <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
          {item.preview}
        </p>
      )}
      {/* Wraps on narrow panels (the virtualizer measures the real height).
          Each piece carries its "·" in its own left padding, and the pieces
          are pulled left by that padding inside a clipping box: a piece that
          starts a line has its dot cut off, so no line begins with "·" */}
      <p className="mt-1.5 overflow-hidden text-xs text-muted-foreground tabular-nums">
        <span className="-ml-3 flex flex-wrap">
          <MetaPiece>
            <time dateTime={item.created_at}>
              {formatDate(locale, item.created_at)}
            </time>
          </MetaPiece>
          {host && <MetaPiece truncate>{host}</MetaPiece>}
          {meta !== "" && (
            <MetaPiece>{meta ?? <TextSkeleton className="w-28" />}</MetaPiece>
          )}
          {(item.language || (item.translations?.length ?? 0) > 0) && (
            <MetaPiece>
              <Languages
                original={item.language}
                translations={item.translations ?? []}
              />
            </MetaPiece>
          )}
        </span>
      </p>
    </button>
  );
}

export function HistoryList({
  session,
  filter,
  filtering,
  searching,
  onClearFilters,
  onOpen,
  initialOffset,
}: {
  session: Session;
  filter: HistoryFilter;
  /** Some filter is set: "nothing found" rather than "no summaries yet" */
  filtering: boolean;
  /** A search typed but not sent yet (debounce): show the skeleton already */
  searching: boolean;
  onClearFilters: () => void;
  onOpen: (item: HistoryItem, scrollY: number) => void;
  /** Window scroll to restore when coming back from a summary */
  initialOffset: number;
}) {
  const dict = useDictionary();

  return (
    <InfiniteList
      query={useHistory(session, filter)}
      loading={searching}
      getKey={(item) => item.id}
      // py-2.5 + title (24) + meta (6 + 16), plus the two-line preview (2 + 40)
      estimateSize={(item) => (item.preview ? 108 : 66)}
      initialOffset={initialOffset}
      errorTitle={dict.history.loadError}
      skeleton={<HistoryRowsSkeleton />}
      empty={
        filtering ? (
          // Centered in the space left under the filters, like "no summaries yet"
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <SearchXIcon className="mb-3 size-5 text-muted-foreground" />
            <p className="font-medium tracking-tight">
              {dict.history.noResultsTitle}
            </p>
            <p className="mt-1 mb-4 text-sm text-muted-foreground">
              {dict.history.noResultsBody}
            </p>
            <Button variant="outline" size="sm" onClick={onClearFilters}>
              {dict.history.clearFilters}
            </Button>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <HistoryIcon className="mb-3 size-5 text-muted-foreground" />
            <p className="font-medium tracking-tight">
              {dict.history.emptyTitle}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {dict.history.emptyBody}
            </p>
          </div>
        )
      }
      renderItem={(item) => (
        <HistoryRow
          item={item}
          onOpen={(item) => onOpen(item, window.scrollY)}
        />
      )}
    />
  );
}
