import { useRef } from "react";
import type { Session } from "@/lib/auth";
import { useHistory } from "@/lib/queries";
import type { HistoryItem } from "@/lib/summaries";
import { useDebouncedValue } from "@/lib/use-debounced-value";
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
