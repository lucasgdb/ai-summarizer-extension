import { cn } from "@/lib/utils";

/**
 * A skeleton that sits inside a line of text (a number, a name): a <span>, so
 * it's valid inside <p>, <button> and labels, and sized to the font.
 */
export function TextSkeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block h-[0.85em] animate-pulse rounded-sm bg-muted align-[-0.1em]",
        className,
      )}
    />
  );
}
