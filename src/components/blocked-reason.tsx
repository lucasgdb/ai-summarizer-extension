import type { ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Says why a control is disabled, on hover and on focus. A disabled button
 * gets no pointer events, so the tooltip hangs on a focusable wrapper
 */
export function BlockedReason({
  reason,
  children,
}: {
  /** null: not blocked, the control as is */
  reason: string | null;
  children: ReactNode;
}) {
  if (!reason) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          // biome-ignore lint/a11y/noNoninteractiveTabindex: the reason must be reachable by keyboard too
          tabIndex={0}
          className="inline-flex rounded-md focus-visible:outline-2 focus-visible:outline-ring"
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}
