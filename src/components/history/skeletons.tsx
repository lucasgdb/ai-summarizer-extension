import { SearchIcon, SlidersHorizontalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useDictionary } from "@/lib/use-locale";

// Small and shared: used by the history (lazy chunk) and by its fallback in the
// first bundle, so both look the same and nothing jumps when the code arrives

/** The search box and "Filters" are ours: shown as they are, just disabled */
export function FilterBarLoading({ q = "" }: { q?: string }) {
  const dict = useDictionary();

  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          disabled
          aria-label={dict.history.search}
          placeholder={dict.history.search}
          value={q}
          readOnly
          className="pr-8 pl-8"
        />
      </div>
      <Button variant="outline" className="shrink-0" disabled>
        <SlidersHorizontalIcon data-icon="inline-start" />
        {dict.history.filters}
      </Button>
    </div>
  );
}

/** "Type" is ours; the chips (and their counts) come from the facets */
export function TypeChipsSkeleton() {
  const dict = useDictionary();

  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-hidden="true">
      <span className="mr-1 text-xs font-medium text-muted-foreground">
        {dict.history.type}
      </span>
      {["w-16", "w-20", "w-14"].map((width) => (
        <Skeleton key={width} className={`h-7 rounded-full ${width}`} />
      ))}
    </div>
  );
}

/**
 * Lines up with HistoryRow: same paddings and line heights, a title of varied
 * width, two preview lines, and the meta line in its pieces (date · site ·
 * model · effort · languages) with the separators that are always there
 */
function HistoryRowSkeleton({ title, host }: { title: string; host: string }) {
  return (
    <div className="py-2.5" aria-hidden="true">
      <div className="flex h-6 items-center">
        <Skeleton className={`h-4 ${title}`} />
      </div>
      {/* Two preview lines of 20px, like the line-clamp-2 text: the first
          full width, the second cut short. Widths are explicit: in a flex row
          a bar without one shrinks to nothing */}
      <div className="mt-0.5">
        <div className="flex h-5 items-center">
          <Skeleton className="h-3.5 w-full" />
        </div>
        <div className="flex h-5 items-center">
          <Skeleton className="h-3.5 w-4/5" />
        </div>
      </div>
      <div className="mt-1.5 flex h-4 items-center gap-1.5 text-xs text-muted-foreground">
        <Skeleton className="h-3 w-10" />
        <span>·</span>
        <Skeleton className={`h-3 ${host}`} />
        <span>·</span>
        <Skeleton className="h-3 w-16" />
        <span>·</span>
        <Skeleton className="h-3 w-10" />
      </div>
    </div>
  );
}

// Roughly a panel's height of rows, varied so it reads as a list
const rows = [
  { title: "w-3/4", host: "w-20" },
  { title: "w-1/2", host: "w-24" },
  { title: "w-2/3", host: "w-16" },
  { title: "w-3/5", host: "w-20" },
  { title: "w-4/5", host: "w-14" },
  { title: "w-2/5", host: "w-24" },
];

export function HistoryRowsSkeleton() {
  return rows.map((row) => <HistoryRowSkeleton key={row.title} {...row} />);
}

/** The whole history screen before its code has arrived */
export function HistoryFallback() {
  return (
    <div aria-busy="true">
      <div className="mb-4 space-y-3">
        <FilterBarLoading />
        <TypeChipsSkeleton />
      </div>
      <HistoryRowsSkeleton />
    </div>
  );
}
