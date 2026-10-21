import type { ComponentProps, ReactElement } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * A tooltip on the element itself, in place of the native `title` (which
 * looks like the OS, not the panel, and waits a second and a half). For a
 * disabled control use BlockedReason: it can't take the pointer
 */
export function Hint({
  label,
  side,
  children,
}: {
  /** Nothing to say: the element as is */
  label: string | null | undefined;
  side?: ComponentProps<typeof TooltipContent>["side"];
  children: ReactElement;
}) {
  if (!label) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}
