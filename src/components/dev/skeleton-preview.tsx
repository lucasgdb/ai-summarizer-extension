import { type CSSProperties, type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";

type Mode = "real" | "skeleton" | "overlay";

const modes: Mode[] = ["real", "skeleton", "overlay"];

/**
 * Development only (`pnpm dev`, mode "development"; a build renders `real`
 * as is): a switch
 * between the screen with its data, its loading skeleton, and the skeleton
 * laid over the data (only its shapes, in translucent red), to line
 * the two up to the pixel
 */
export function SkeletonPreview(props: {
  real: ReactNode;
  skeleton: ReactNode;
}) {
  if (import.meta.env.MODE !== "development") return props.real;
  return <Preview {...props} />;
}

function Preview({ real, skeleton }: { real: ReactNode; skeleton: ReactNode }) {
  const [mode, setMode] = useState<Mode>(() => {
    try {
      const saved = sessionStorage.getItem("skeleton-preview");
      return modes.includes(saved as Mode) ? (saved as Mode) : "real";
    } catch {
      return "real";
    }
  });

  function choose(next: Mode) {
    setMode(next);
    try {
      sessionStorage.setItem("skeleton-preview", next);
    } catch {}
  }

  return (
    <>
      {mode === "skeleton" ? (
        skeleton
      ) : mode === "overlay" ? (
        <div className="relative flex flex-1 flex-col">
          {real}
          <div
            aria-hidden="true"
            // Everything hidden but the skeleton's shapes: its own text and
            // buttons would just double the real ones
            className="pointer-events-none absolute inset-0 flex flex-col [&_*]:invisible [&_[data-slot=skeleton]]:visible"
            style={
              { "--skeleton": "oklch(0.63 0.24 25 / 45%)" } as CSSProperties
            }
          >
            {skeleton}
          </div>
        </div>
      ) : (
        real
      )}
      <fieldset
        aria-label="Skeleton preview (dev)"
        className="fixed bottom-14 left-1/2 z-50 flex -translate-x-1/2 gap-0.5 rounded-full border bg-popover p-0.5 text-xs shadow-md"
      >
        {modes.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => choose(value)}
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
    </>
  );
}
