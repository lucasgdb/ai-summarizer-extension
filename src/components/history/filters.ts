import type { Facet, HistoryFilter, SourceType } from "@/lib/summaries";

/**
 * The type chips. A selection is part of a page, not a kind of content of its
 * own: "Page" covers both, and there's no "Selection" chip
 */
export type TypeChip = Exclude<SourceType, "selection">;

const chipTypes: Record<TypeChip, SourceType[]> = {
  webpage: ["webpage", "selection"],
  pdf: ["pdf"],
  text: ["text"],
};

/** The facets folded into chips, with the counts added up */
export function typeChips(facets: Facet[]) {
  const counts = new Map<TypeChip, number>();
  for (const { value, count } of facets) {
    const chip = value === "selection" ? "webpage" : (value as TypeChip);
    counts.set(chip, (counts.get(chip) ?? 0) + count);
  }
  return [...counts].map(([chip, count]) => ({ chip, count }));
}

export type Period = "all" | "7d" | "30d" | "custom";

/** What the filter bar edits; turned into GET /summaries params by toQuery */
export type FilterState = {
  q: string;
  sourceTypes: TypeChip[];
  host?: string;
  model?: string;
  style?: string;
  period: Period;
  /** Fixed when "Last N days" is picked, so the query key stays stable */
  since?: string;
  /** Custom period, as <input type="date"> values (yyyy-mm-dd, local) */
  fromDate?: string;
  toDate?: string;
};

export const emptyFilter: FilterState = {
  q: "",
  sourceTypes: [],
  period: "all",
};

/** Local midnight of a yyyy-mm-dd, as an ISO instant (the user's time zone) */
function localMidnight(date: string, plusDays = 0) {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  return new Date(year, month - 1, day + plusDays).toISOString();
}

export function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export function toQuery(state: FilterState, q: string): HistoryFilter {
  return {
    q: q.trim() || undefined,
    sourceTypes: state.sourceTypes.length
      ? state.sourceTypes.flatMap((chip) => chipTypes[chip] ?? [chip])
      : undefined,
    host: state.host,
    model: state.model,
    style: state.style,
    from:
      state.period === "custom"
        ? state.fromDate && localMidnight(state.fromDate)
        : state.since,
    // `to` is exclusive: the end of the chosen day is the next midnight
    to:
      state.period === "custom" && state.toDate
        ? localMidnight(state.toDate, 1)
        : undefined,
  };
}

/** Filters behind the "Filters" button (search and type chips are visible) */
export function hiddenFilterCount(state: FilterState) {
  return [
    state.host,
    state.model,
    state.style,
    state.period !== "all" ? state.period : undefined,
  ].filter(Boolean).length;
}

export function isFiltering(state: FilterState) {
  return (
    state.q.trim() !== "" ||
    state.sourceTypes.length > 0 ||
    hiddenFilterCount(state) > 0
  );
}
