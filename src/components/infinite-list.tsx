import type { UseInfiniteQueryResult } from "@tanstack/react-query";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { WifiOffIcon } from "lucide-react";
import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Loadable } from "@/components/loadable";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { apiUrl } from "@/lib/api";
import { isOffline } from "@/lib/queries";
import { useDictionary } from "@/lib/use-locale";

/**
 * A cursor-paginated list, virtualized against the window (the panel scrolls
 * as a whole, under the sticky header). One extra row at the end loads the next
 * page when it scrolls into view.
 */
export function InfiniteList<T>({
  query,
  getKey,
  renderItem,
  estimateSize,
  initialOffset = 0,
  loading = false,
  skeleton,
  empty,
  errorTitle,
}: {
  query: UseInfiniteQueryResult<T[]>;
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  /**
   * A row's height in px before it's measured. Exact is best: the first paint
   * uses it, and any difference moves the page when the real size lands
   */
  estimateSize: (item: T) => number;
  /** Window scroll to restore, e.g. when coming back from a row */
  initialOffset?: number;
  /** Show the skeleton anyway, e.g. while a search is still being typed */
  loading?: boolean;
  skeleton: ReactNode;
  empty: ReactNode;
  errorTitle: string;
}) {
  // Function-level, not module-level: the React Compiler honors both, but
  // the bundler drops (and warns about) directives at the top of a module.
  // TanStack Virtual mutates its instance; compiled, rows would go stale
  "use no memo";

  const dict = useDictionary();
  const items = query.data ?? [];

  const listRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  // Pages are cached, so the list is already as tall as when it was left
  useLayoutEffect(() => {
    if (initialOffset) window.scrollTo(0, initialOffset);
  }, [initialOffset]);
  // Whatever sits above can change height (filter chips arriving with their
  // facets): keep the virtualizer's idea of where the list starts in step
  useLayoutEffect(() => {
    const top = listRef.current
      ? listRef.current.getBoundingClientRect().top + window.scrollY
      : 0;
    if (top !== scrollMargin) setScrollMargin(top);
  });

  const virtualizer = useWindowVirtualizer({
    count: query.hasNextPage ? items.length + 1 : items.length,
    estimateSize: (index) => {
      const item = items[index];
      // The extra last row: "Loading more…" (py-4 + one line)
      return item === undefined ? 52 : estimateSize(item);
    },
    overscan: 6,
    scrollMargin,
    initialOffset,
    getItemKey: (index) => {
      const item = items[index];
      return item === undefined ? "next-page" : getKey(item);
    },
  });
  const rows = virtualizer.getVirtualItems();
  const lastIndex = rows.at(-1)?.index ?? -1;

  const {
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
  } = query;
  useEffect(() => {
    if (
      lastIndex >= items.length &&
      hasNextPage &&
      !isFetchingNextPage &&
      !isFetchNextPageError
    ) {
      fetchNextPage();
    }
  }, [
    lastIndex,
    items.length,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
  ]);

  if (query.isPending || loading) {
    return (
      <div ref={listRef} aria-busy="true">
        {skeleton}
      </div>
    );
  }

  if (query.isError && items.length === 0) {
    return (
      <Notice
        variant="destructive"
        icon={WifiOffIcon}
        title={errorTitle}
        actions={
          <Button onClick={() => query.refetch()}>{dict.tryAgain}</Button>
        }
      >
        {isOffline(query.error)
          ? dict.summaryErrors.offline.body(apiUrl)
          : undefined}
      </Notice>
    );
  }

  if (items.length === 0) return empty;

  // Loaded: the dev switch can still show the skeleton, or over the rows
  return (
    <Loadable loading={false} skeleton={skeleton}>
      <div
        ref={listRef}
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {rows.map((row) => {
          const item = items[row.index];
          return (
            <div
              key={row.key}
              data-index={row.index}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 w-full"
              style={{
                transform: `translateY(${row.start - virtualizer.options.scrollMargin}px)`,
              }}
            >
              {item !== undefined ? (
                renderItem(item)
              ) : isFetchNextPageError ? (
                <div className="flex justify-center py-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => fetchNextPage()}
                  >
                    {dict.tryAgain}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                  <Spinner />
                  {dict.history.loadingMore}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Loadable>
  );
}
