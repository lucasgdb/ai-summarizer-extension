import { Badge } from "@/components/ui/badge";
import type { SummaryRecord } from "@/lib/summaries";
import { useDictionary } from "@/lib/use-locale";
import { cn } from "@/lib/utils";

/**
 * The kind of file a summary was made from: its extension ("TXT", "MD",
 * "PDF"), or "PDF" for one served without ".pdf". Whether the whole file or a
 * selection was summarized doesn't show; an ordinary page gets nothing.
 */
export function SourceBadge({
  summary,
  className,
}: {
  summary: Pick<SummaryRecord, "source_type" | "file_extension">;
  className?: string;
}) {
  const dict = useDictionary();
  const label = summary.file_extension
    ? summary.file_extension.toUpperCase()
    : summary.source_type === "pdf"
      ? dict.history.types.pdf
      : null;
  if (!label) return null;

  return (
    <Badge
      variant="outline"
      className={cn("h-4 shrink-0 px-1.5 text-[0.625rem]", className)}
    >
      {label}
    </Badge>
  );
}
