import { cn } from "cn";
import { Loader2Icon } from "lucide-react";

/**
 * Hidden from screen readers by default: it sits next to words that already
 * say what's happening ("Generating…"), or in a button with its own name.
 * Pass `label` (translated) when the spinner is the only signal
 */
function Spinner({
  className,
  label,
  ...props
}: React.ComponentProps<"svg"> & { label?: string }) {
  return (
    <Loader2Icon
      data-slot="spinner"
      {...(label
        ? { role: "status", "aria-label": label }
        : { "aria-hidden": true })}
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };
