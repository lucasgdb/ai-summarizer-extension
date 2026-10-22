import { type CSSProperties, createContext, type ReactNode, use } from "react";
import { devSkeleton, useSkeletonMode } from "@/lib/dev-skeleton";
import { cn } from "@/lib/utils";

/**
 * A loading state: `skeleton` while `loading`, then `children`. The pattern
 * for every skeleton in the panel, so the dev switch (lib/dev-skeleton.ts)
 * can show any of them on demand, or over the data that replaces it. In a
 * build it is exactly `loading ? skeleton : children`, nothing around them
 */
export function Loadable({
  loading,
  skeleton,
  children,
  inline = false,
  className,
}: {
  loading: boolean;
  /** null: nothing to compare (the switch leaves this one alone) */
  skeleton: ReactNode;
  children: ReactNode;
  /** Inside a line of text (a number, a name): a span, not a div */
  inline?: boolean;
  /** For the overlay's box (dev only), e.g. "flex flex-1 flex-col" */
  className?: string;
}) {
  if (loading) return skeleton;
  if (!devSkeleton) return children;
  return (
    <DevLoadable skeleton={skeleton} inline={inline} className={className}>
      {children}
    </DevLoadable>
  );
}

/**
 * Inside a box whose skeleton already covers it in overlay mode: the
 * loading states nested in it don't draw their shapes a second time
 */
const Overlaid = createContext(false);

// Only the skeleton's shapes, in translucent red: its own text and buttons
// would just double the real ones
// (hidden as a whole, text included; visibility comes back on the shapes)
const layer =
  "pointer-events-none invisible absolute inset-0 [&_[data-slot=skeleton]]:visible";
const red = { "--skeleton": "oklch(0.63 0.24 25 / 45%)" } as CSSProperties;

function DevLoadable({
  skeleton,
  children,
  inline,
  className,
}: {
  skeleton: ReactNode;
  children: ReactNode;
  inline: boolean;
  className?: string;
}) {
  const mode = useSkeletonMode();
  const overlaid = use(Overlaid);
  if (skeleton === null || mode === "real") return children;
  if (overlaid && mode === "overlay") return children;
  if (mode === "skeleton") return skeleton;
  const Box = inline ? "span" : "div";
  return (
    <Box className={cn("relative", className)}>
      <Overlaid value={true}>{children}</Overlaid>
      <Box
        aria-hidden="true"
        className={cn(layer, !inline && "flex flex-col")}
        style={red}
      >
        {skeleton}
      </Box>
    </Box>
  );
}

/**
 * Whether the loading state is on screen: while `loading`, and also while
 * the dev switch forces the skeletons (so a control that waits for the data
 * looks the way it does during a real load). Just `loading` in a build
 */
export function useLoadingShown(loading: boolean) {
  const mode = useSkeletonMode();
  return loading || (devSkeleton && mode === "skeleton");
}

const Loading = createContext(false);

/**
 * Marks an area as still loading for the controls inside it (useInLoading):
 * the buttons that act on data that isn't there yet stay disabled
 */
export function LoadingScope({
  loading,
  children,
}: {
  loading: boolean;
  children: ReactNode;
}) {
  return <Loading value={loading}>{children}</Loading>;
}

/** Inside a LoadingScope that's loading */
export function useInLoading() {
  return use(Loading);
}
