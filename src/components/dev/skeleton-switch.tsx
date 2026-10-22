import {
  devSkeleton,
  setSkeletonMode,
  skeletonModes,
  useSkeletonMode,
} from "@/lib/dev-skeleton";
import { cn } from "@/lib/utils";

/**
 * Development only: real / skeleton / overlay for every loading state on
 * screen (components/loadable.tsx). Nothing in a build
 */
export function SkeletonSwitch() {
  if (!devSkeleton) return null;
  return <Switch />;
}

function Switch() {
  const mode = useSkeletonMode();
  return (
    <fieldset
      aria-label="Skeleton preview (dev)"
      className="fixed bottom-14 left-1/2 z-50 flex -translate-x-1/2 gap-0.5 rounded-full border bg-popover p-0.5 text-xs shadow-md"
    >
      {skeletonModes.map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={mode === value}
          onClick={() => setSkeletonMode(value)}
          className={cn(
            "rounded-full px-2.5 py-1 transition-colors",
            mode === value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {value}
        </button>
      ))}
    </fieldset>
  );
}
