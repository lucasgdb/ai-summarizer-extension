import { TriangleAlertIcon } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { Notice } from "@/components/notice";
import { SummaryView } from "@/components/summary-view";
import { TranslatableSummary } from "@/components/translatable-summary";
import { Button } from "@/components/ui/button";
import type { Session } from "@/lib/auth";
import { isNotFound, useDeleteSummary, useSummary } from "@/lib/queries";
import type { HistoryItem } from "@/lib/summaries";
import { useDictionary } from "@/lib/use-locale";

export function HistoryDetail({
  session,
  item,
  onBack,
}: {
  session: Session;
  item: HistoryItem;
  onBack: () => void;
}) {
  const dict = useDictionary();
  const summary = useSummary(session, item.id, item);
  const remove = useDeleteSummary(session);

  return (
    <div className="space-y-5">
      <BackButton onClick={onBack}>{dict.history.back}</BackButton>

      {summary.isError ? (
        <Notice
          variant="destructive"
          icon={TriangleAlertIcon}
          title={
            isNotFound(summary.error)
              ? dict.history.notFound
              : dict.history.loadSummaryError
          }
          actions={
            !isNotFound(summary.error) && (
              <Button onClick={() => summary.refetch()}>{dict.tryAgain}</Button>
            )
          }
        />
      ) : (
        summary.data &&
        (summary.isPlaceholderData ? (
          // Only the history row so far: translations come with the summary
          <SummaryView summary={summary.data} />
        ) : (
          <TranslatableSummary
            session={session}
            summary={summary.data}
            deletingSummary={remove.isPending}
            onGone={onBack}
            onDeleteSummary={() =>
              remove.mutate(item.id, { onSuccess: onBack })
            }
          />
        ))
      )}

      {remove.isError && (
        <p role="alert" className="text-sm text-destructive">
          {dict.history.deleteError}
        </p>
      )}
    </div>
  );
}
