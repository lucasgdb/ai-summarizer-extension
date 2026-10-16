import { SearchIcon, SlidersHorizontalIcon, XIcon } from "lucide-react";
import { useId } from "react";
import { ToggleChip } from "@/components/toggle-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Session } from "@/lib/auth";
import { formatNumber, getDictionary } from "@/lib/i18n";
import { useFacets, useOptions } from "@/lib/queries";
import type { Facet } from "@/lib/summaries";
import { useLocale } from "@/lib/use-locale";
import {
  daysAgo,
  emptyFilter,
  type FilterState,
  hiddenFilterCount,
  isFiltering,
  type Period,
  type TypeChip,
  typeChips,
} from "./filters";
import { FilterBarLoading, TypeChipsSkeleton } from "./skeletons";

// Radix Select can't hold "", so "no filter" needs a value of its own
const any = "__any";

function FacetSelect({
  id,
  label,
  value,
  facets,
  labelFor,
  onChange,
}: {
  id: string;
  label: string;
  value: string | undefined;
  facets: Facet[];
  labelFor: (value: string) => string;
  onChange: (value: string | undefined) => void;
}) {
  const locale = useLocale();
  const dict = getDictionary(locale);

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        value={value ?? any}
        onValueChange={(next) => onChange(next === any ? undefined : next)}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={any}>{dict.history.any}</SelectItem>
          {facets.map((facet) => (
            <SelectItem key={facet.value} value={facet.value}>
              <span className="flex w-full items-center justify-between gap-3">
                <span className="truncate">{labelFor(facet.value)}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatNumber(locale, facet.count)}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

/**
 * Search, content-type chips and the rest behind "Filters". Built from
 * GET /summaries/facets: a filter shows up only when the history has more than
 * one value for it.
 */
export function HistoryFilters({
  session,
  value,
  onChange,
  listLoading = false,
}: {
  session: Session;
  value: FilterState;
  onChange: (value: FilterState) => void;
  /** The list is loading (a search, a filter): the type row turns skeleton too,
   * as on the first load, while search and "Filters" stay usable */
  listLoading?: boolean;
}) {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const id = useId();
  const facetsQuery = useFacets(session);
  const facets = facetsQuery.data;
  const models = useOptions().data?.models;

  const update = (change: Partial<FilterState>) =>
    onChange({ ...value, ...change });
  const chips = typeChips(facets?.source_types ?? []);
  // Always there once the history has something, with "All" selected, even
  // with a single type: a stable row (that the first-load skeleton matches)
  const showTypes = chips.some(({ count }) => count > 0);
  const hidden = hiddenFilterCount(value);

  function toggleType(type: TypeChip) {
    update({
      sourceTypes: value.sourceTypes.includes(type)
        ? value.sourceTypes.filter((selected) => selected !== type)
        : [...value.sourceTypes, type],
    });
  }

  function choosePeriod(period: Period) {
    update({
      period,
      since:
        period === "7d"
          ? daysAgo(7)
          : period === "30d"
            ? daysAgo(30)
            : undefined,
    });
  }

  // First load: our controls stay where they are (disabled), the chips that
  // depend on the facets are skeletons
  if (facetsQuery.isPending) {
    return (
      <div className="mb-4 space-y-3" aria-busy="true">
        <FilterBarLoading q={value.q} />
        <TypeChipsSkeleton />
      </div>
    );
  }

  return (
    <div className="mb-4 space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label={dict.history.search}
            placeholder={dict.history.search}
            maxLength={100}
            value={value.q}
            onChange={(event) => update({ q: event.target.value })}
            className="pr-8 pl-8 [&::-webkit-search-cancel-button]:hidden"
          />
          {value.q && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={dict.history.clearFilters}
              className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground"
              onClick={() => update({ q: "" })}
            >
              <XIcon />
            </Button>
          )}
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="shrink-0">
              <SlidersHorizontalIcon data-icon="inline-start" />
              {dict.history.filters}
              {hidden > 0 && (
                <Badge className="h-4 min-w-4 px-1 tabular-nums">
                  {hidden}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72">
            <FieldGroup className="gap-4">
              {facets && facets.hosts.length > 1 && (
                <FacetSelect
                  id={`${id}-host`}
                  label={dict.history.site}
                  value={value.host}
                  facets={facets.hosts}
                  labelFor={(host) => host}
                  onChange={(host) => update({ host })}
                />
              )}
              {facets && facets.models.length > 1 && (
                <FacetSelect
                  id={`${id}-model`}
                  label={dict.options.model}
                  value={value.model}
                  facets={facets.models}
                  labelFor={(model) =>
                    models?.find((option) => option.id === model)?.name ?? model
                  }
                  onChange={(model) => update({ model })}
                />
              )}
              {facets && facets.styles.length > 1 && (
                <FacetSelect
                  id={`${id}-style`}
                  label={dict.options.style}
                  value={value.style}
                  facets={facets.styles}
                  labelFor={(style) =>
                    dict.options.styles[style]?.label ?? style
                  }
                  onChange={(style) => update({ style })}
                />
              )}

              <Field>
                <FieldLabel htmlFor={`${id}-period`}>
                  {dict.history.period}
                </FieldLabel>
                <Select
                  value={value.period}
                  onValueChange={(period) => choosePeriod(period as Period)}
                >
                  <SelectTrigger id={`${id}-period`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["all", "7d", "30d", "custom"] as const).map((period) => (
                      <SelectItem key={period} value={period}>
                        {dict.history.periods[period]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              {value.period === "custom" && (
                <div className="grid grid-cols-2 gap-3">
                  <Field>
                    <FieldLabel htmlFor={`${id}-from`}>
                      {dict.history.from}
                    </FieldLabel>
                    <Input
                      id={`${id}-from`}
                      type="date"
                      value={value.fromDate ?? ""}
                      max={value.toDate}
                      onChange={(event) =>
                        update({ fromDate: event.target.value || undefined })
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${id}-to`}>
                      {dict.history.to}
                    </FieldLabel>
                    <Input
                      id={`${id}-to`}
                      type="date"
                      value={value.toDate ?? ""}
                      min={value.fromDate}
                      onChange={(event) =>
                        update({ toDate: event.target.value || undefined })
                      }
                    />
                  </Field>
                </div>
              )}

              {isFiltering(value) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="-mx-2 self-start text-muted-foreground"
                  onClick={() => onChange(emptyFilter)}
                >
                  {dict.history.clearFilters}
                </Button>
              )}
            </FieldGroup>
          </PopoverContent>
        </Popover>
      </div>

      {listLoading ? (
        <TypeChipsSkeleton />
      ) : (
        showTypes && (
          // Chips with an "All" that starts selected: seeing one filled in makes
          // it obvious the others can be picked too
          <fieldset className="flex flex-wrap items-center gap-1.5">
            <legend className="float-left mr-1 text-xs font-medium text-muted-foreground">
              {dict.history.type}
            </legend>
            <ToggleChip
              label={dict.history.allTypes}
              count={chips.reduce((sum, { count }) => sum + count, 0)}
              pressed={value.sourceTypes.length === 0}
              onClick={() => update({ sourceTypes: [] })}
            />
            {chips.map(({ chip, count }) => (
              <ToggleChip
                key={chip}
                label={dict.history.types[chip] ?? chip}
                count={count}
                pressed={value.sourceTypes.includes(chip)}
                onClick={() => toggleType(chip)}
              />
            ))}
          </fieldset>
        )
      )}
    </div>
  );
}
