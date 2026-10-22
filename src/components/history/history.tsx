import { useEffect, useRef } from "react";
import type { Session } from "@/lib/auth";
import { useHistory } from "@/lib/queries";
import type { HistoryItem } from "@/lib/summaries";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useDictionary } from "@/lib/use-locale";
import { emptyFilter, type FilterState, isFiltering, toQuery } from "./filters";
import { HistoryDetail } from "./history-detail";
import { HistoryFilters } from "./history-filters";
import { HistoryList } from "./history-list";

/** The history section: the filtered list, or one summary opened from it */
export function History({
  session,
  open,
  onOpenChange,
  filter,
  onFilterChange,
}: {
  session: Session;
  open: HistoryItem | null;
  onOpenChange: (item: HistoryItem | null) => void;
  /** Kept by the App, so it survives opening a summary and coming back */
  filter: FilterState;
  onFilterChange: (filter: FilterState) => void;
}) {
  // Where the list was scrolled, to land back on the same row
  const listScroll = useRef(0);
  // Searching as you type, but one request per pause
  const q = useDebouncedValue(filter.q, 500);
  // Typed but not searched yet: the list on screen is for the old words, so
  // it gives way to the skeleton now instead of when the request starts
  const searching = filter.q.trim() !== q.trim();
  const query = toQuery(filter, q);
  // The list's own query (shared, no extra request): is it loading?
  const list = useHistory(session, query);
  const listLoading = searching || list.isPending;
  const dict = useDictionary();

  // Back from a summary: focus returns to the row that opened it (once the
  // list has drawn it again), not to the top of the page
  const opened = useRef<string | null>(null);
  useEffect(() => {
    if (open) {
      opened.current = open.id;
      return;
    }
    const id = opened.current;
    if (!id) return;
    opened.current = null;
    let frames = 0;
    let frame = 0;
    const tryFocus = () => {
      const row = document.querySelector<HTMLElement>(
        `[data-summary-id="${CSS.escape(id)}"]`,
      );
      if (row) row.focus({ preventScroll: true });
      else if (frames++ < 30) frame = requestAnimationFrame(tryFocus);
    };
    tryFocus();
    return () => cancelAnimationFrame(frame);
  }, [open]);

  if (open) {
    return (
      <HistoryDetail
        key={open.id}
        session={session}
        item={open}
        onBack={() => onOpenChange(null)}
      />
    );
  }

  return (
    <>
      <h1 className="sr-only">{dict.nav.history}</h1>
      <HistoryFilters
        session={session}
        listLoading={listLoading}
        value={filter}
        onChange={(next) => {
          // A new filter is a new list: start at its top
          listScroll.current = 0;
          onFilterChange(next);
        }}
      />
      <HistoryList
        session={session}
        filter={query}
        filtering={isFiltering(filter)}
        searching={searching}
        onClearFilters={() => onFilterChange(emptyFilter)}
        initialOffset={listScroll.current}
        onOpen={(item, scrollY) => {
          listScroll.current = scrollY;
          window.scrollTo(0, 0);
          onOpenChange(item);
        }}
      />
    </>
  );
}
